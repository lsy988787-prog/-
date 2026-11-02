"""读文献模块测试：PDF 解析、口令、导入、按需翻译缓存、术语表、精读对话。模型和 arXiv 都用模拟。"""

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.papers import arxiv_pdf_url
from app.pdfparse import parse_pdf

COURSES = Path(__file__).resolve().parents[2] / "courses"
SAMPLE = Path(__file__).parent / "fixtures" / "sample-paper.pdf"
TOKEN = {"X-Reader-Token": "test-token"}


def test_parse_sample_paper_structure():
    p = parse_pdf(SAMPLE)
    assert p["title"] == "Voltage Sensitivity of Distribution Feeders with Inverter Based Resources"
    titles = [s["title"] for s in p["sections"]]
    assert titles == ["作者与单位", "Abstract", "1 Introduction", "2 Sensitivity Model", "3 Case Study", "4 Conclusion", "References"]
    assert p["abstract"].startswith("This paper studies how the voltage")
    blocks = {s["title"]: s["blocks"] for s in p["sections"]}
    kinds = [b["type"] for b in blocks["2 Sensitivity Model"]]
    assert "formula" in kinds and "caption" in kinds
    assert all(b["type"] == "reference" for b in blocks["References"])
    texts = " ".join(b["text"] for s in p["sections"] for b in s["blocks"])
    assert "Example Transactions on Power Distribution" not in texts  # 页眉已去掉
    # 跨栏被拆开的段落已合并：不会有以小写字母开头的段落
    assert not any(b["type"] == "paragraph" and b["text"][0].islower() for s in p["sections"] for b in s["blocks"])


@pytest.mark.parametrize("raw,url", [
    ("1706.03762", "https://arxiv.org/pdf/1706.03762"),
    ("https://arxiv.org/abs/1706.03762v5", "https://arxiv.org/pdf/1706.03762v5"),
    ("arxiv.org/pdf/2101.00001.pdf", "https://arxiv.org/pdf/2101.00001"),
    ("https://export.arxiv.org/abs/hep-th/9901001", "https://arxiv.org/pdf/hep-th/9901001"),
])
def test_arxiv_urls(raw, url):
    assert arxiv_pdf_url(raw) == url


@pytest.mark.parametrize("raw", ["https://evil.example.com/1706.03762", "http://127.0.0.1/abs/1706.03762", "not a paper"])
def test_arxiv_rejects_other_hosts(raw):
    with pytest.raises(ValueError):
        arxiv_pdf_url(raw)


class Fake:
    """同时模拟 arXiv 和模型服务"""

    def __init__(self):
        self.model_requests: list[dict] = []
        self.arxiv_redirect = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "arxiv.org":
            if self.arxiv_redirect:
                return httpx.Response(302, headers={"location": self.arxiv_redirect})
            if "9999.99999" in request.url.path:
                return httpx.Response(404)
            return httpx.Response(200, content=SAMPLE.read_bytes(), headers={"content-type": "application/pdf"})
        if request.url.host == "evil.example.com":
            return httpx.Response(200, content=SAMPLE.read_bytes())
        body = json.loads(request.content)
        self.model_requests.append(body)
        reply = "译文：馈线电压灵敏度" if "学术翻译" in body["messages"][0]["content"] else "你觉得这一段的核心假设是什么？"
        chunk = "data: " + json.dumps({"choices": [{"delta": {"content": reply}}]}, ensure_ascii=False)
        return httpx.Response(200, content=f"{chunk}\n\ndata: [DONE]\n\n".encode(), headers={"content-type": "text/event-stream"})


@pytest.fixture
def fake():
    return Fake()


@pytest.fixture
def client(fake, tmp_path, monkeypatch):
    monkeypatch.setenv("READER_TOKEN", "test-token")
    monkeypatch.setenv("MODEL_API_KEY", "sk-test")
    app = create_app(COURSES, transport=httpx.MockTransport(fake), papers_dir=tmp_path / "papers")
    with TestClient(app) as c:
        yield c


def upload(client):
    resp = client.post("/api/papers", files={"file": ("sample.pdf", SAMPLE.read_bytes(), "application/pdf")}, headers=TOKEN)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_token_required(client, monkeypatch):
    assert client.get("/api/papers").status_code == 401
    assert client.get("/api/papers", headers={"X-Reader-Token": "wrong"}).status_code == 401
    assert client.get("/api/papers", headers=TOKEN).status_code == 200
    monkeypatch.delenv("READER_TOKEN")
    assert client.get("/api/papers", headers=TOKEN).status_code == 503


def test_upload_list_get_pdf_delete(client):
    paper = upload(client)
    assert paper["title"].startswith("Voltage Sensitivity")
    listed = client.get("/api/papers", headers=TOKEN).json()["papers"]
    assert [p["id"] for p in listed] == [paper["id"]] and listed[0]["filename"] == "sample.pdf"
    assert client.get(f"/api/papers/{paper['id']}", headers=TOKEN).json()["sections"] == paper["sections"]
    pdf = client.get(f"/api/papers/{paper['id']}/pdf", headers=TOKEN)
    assert pdf.headers["content-type"] == "application/pdf" and pdf.content.startswith(b"%PDF")
    assert client.delete(f"/api/papers/{paper['id']}", headers=TOKEN).status_code == 200
    assert client.get(f"/api/papers/{paper['id']}", headers=TOKEN).status_code == 404
    assert client.get("/api/papers/NOT-AN-ID", headers=TOKEN).status_code == 404


def test_rejects_non_pdf(client):
    resp = client.post("/api/papers", files={"file": ("x.pdf", b"hello", "application/pdf")}, headers=TOKEN)
    assert resp.status_code == 422 and "PDF" in resp.json()["detail"]


def test_arxiv_import(client, fake):
    resp = client.post("/api/papers/arxiv", json={"url": "https://arxiv.org/abs/2101.00001"}, headers=TOKEN)
    assert resp.status_code == 200 and resp.json()["source"] == "https://arxiv.org/pdf/2101.00001"
    assert client.post("/api/papers/arxiv", json={"url": "9999.99999"}, headers=TOKEN).status_code == 404
    assert client.post("/api/papers/arxiv", json={"url": "https://evil.example.com/x.pdf"}, headers=TOKEN).status_code == 422
    fake.arxiv_redirect = "https://evil.example.com/x.pdf"
    resp = client.post("/api/papers/arxiv", json={"url": "1706.03762"}, headers=TOKEN)
    assert resp.status_code == 422 and "其他网站" in resp.json()["detail"]


def test_translate_is_cached_and_uses_glossary(client, fake):
    paper = upload(client)
    url = f"/api/papers/{paper['id']}/translate"
    text = "We derive a simple sensitivity expression from the voltage drop formula."
    first = client.post(url, json={"text": text}, headers=TOKEN).json()
    second = client.post(url, json={"text": text}, headers=TOKEN).json()
    assert first == {"translation": "译文：馈线电压灵敏度", "cached": False}
    assert second["cached"] is True and len(fake.model_requests) == 1

    items = client.put("/api/glossary", json=[{"en": "power flow", "zh": "潮流"}, {"en": "Power Flow", "zh": "潮流计算"}, {"en": "", "zh": "x"}], headers=TOKEN).json()["items"]
    assert items == [{"en": "Power Flow", "zh": "潮流计算"}]
    third = client.post(url, json={"text": text}, headers=TOKEN).json()
    assert third["cached"] is False  # 术语表变了，重新翻译
    assert "Power Flow → 潮流计算" in fake.model_requests[-1]["messages"][0]["content"]


def test_tutor_chat_binds_current_paragraph(client, fake):
    paper = upload(client)
    sec = next(s for s in paper["sections"] if s["title"] == "2 Sensitivity Model")
    block = sec["blocks"][1]
    body = {"blockId": block["id"], "stage": "method", "hintLevel": 0, "messages": [{"role": "user", "content": "这段在说什么？"}]}
    resp = client.post(f"/api/papers/{paper['id']}/chat", json=body, headers=TOKEN)
    events = [json.loads(line[6:]) for line in resp.text.splitlines() if line.startswith("data: ")]
    assert events[0] == {"delta": "你觉得这一段的核心假设是什么？"} and events[-1]["done"] is True
    system = fake.model_requests[-1]["messages"][0]["content"]
    assert "苏格拉底" in system and "【当前段落】" + block["text"][:50] in system
    assert "当前章节：2 Sensitivity Model" in system and "方法：" in system and "L0" in system
    assert paper["title"] in system

    body.update(mode="ask", messages=[{"role": "user", "content": "解释：sensitivity coefficient"}])
    client.post(f"/api/papers/{paper['id']}/chat", json=body, headers=TOKEN)
    assert "阅读助手" in fake.model_requests[-1]["messages"][0]["content"]

    body["blockId"] = "nope"
    assert client.post(f"/api/papers/{paper['id']}/chat", json=body, headers=TOKEN).status_code == 404


def test_no_model_key(client, monkeypatch):
    paper = upload(client)
    monkeypatch.delenv("MODEL_API_KEY")
    resp = client.post(f"/api/papers/{paper['id']}/translate", json={"text": "hello"}, headers=TOKEN)
    assert resp.status_code == 503
