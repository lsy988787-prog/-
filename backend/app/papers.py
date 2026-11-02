"""论文库：导入（上传 PDF 或 arXiv 链接）、存储、术语表、翻译缓存。

只给负责人自己用：数据存在服务器本地目录 PAPERS_DIR（默认 backend/data/papers，不进 Git），
不对外公开。目录结构：
  <PAPERS_DIR>/glossary.json            术语表 [{"en": "power flow", "zh": "潮流"}]
  <PAPERS_DIR>/<paperId>/paper.pdf      原文
  <PAPERS_DIR>/<paperId>/paper.json     解析结果（章节 → 段落块）
  <PAPERS_DIR>/<paperId>/translations.json  翻译缓存 {hash: 译文}
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .pdfparse import parse_pdf

ARXIV_ID = re.compile(r"(?:arxiv\.org/(?:abs|pdf|html)/)?(?P<id>(\d{4}\.\d{4,5}|[a-z\-]+(\.[A-Z]{2})?/\d{7})(v\d+)?)(\.pdf)?/?$", re.I)
PAPER_ID = re.compile(r"^[a-z0-9]{12}$")
MAX_PDF_BYTES = 30 * 1024 * 1024


def arxiv_pdf_url(text: str) -> str:
    """把 arXiv 链接或编号规范成 PDF 下载地址；不是 arXiv 的地址一律拒绝（防止服务端替人访问任意网址）。"""
    t = text.strip()
    t = re.sub(r"^https?://(www\.|export\.)?", "", t)
    if t.startswith("arxiv.org/") or re.match(r"^[\w.\-/]+$", t):
        m = ARXIV_ID.search(t)
        if m and (t.startswith("arxiv.org/") or t == m.group(0)):
            return f"https://arxiv.org/pdf/{m.group('id')}"
    raise ValueError("只支持 arXiv 链接或编号，例如 https://arxiv.org/abs/1706.03762 或 1706.03762")


class PaperStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    # ---------- 论文 ----------
    def _dir(self, paper_id: str) -> Path:
        if not PAPER_ID.match(paper_id):
            raise KeyError(paper_id)
        d = self.root / paper_id
        if not (d / "paper.json").exists():
            raise KeyError(paper_id)
        return d

    def add_pdf(self, data: bytes, source: str, filename: str = "") -> dict[str, Any]:
        if len(data) > MAX_PDF_BYTES:
            raise ValueError("PDF 超过 30 MB。")
        if not data.startswith(b"%PDF"):
            raise ValueError("这不是 PDF 文件。")
        paper_id = secrets.token_hex(6)
        d = self.root / paper_id
        d.mkdir()
        try:
            (d / "paper.pdf").write_bytes(data)
            parsed = parse_pdf(d / "paper.pdf")
        except Exception as e:
            shutil.rmtree(d, ignore_errors=True)
            if isinstance(e, ValueError):
                raise
            raise ValueError("无法解析这个 PDF，可能已加密或已损坏。") from e
        paper = {
            "id": paper_id,
            "source": source,
            "filename": filename,
            "addedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            **parsed,
        }
        (d / "paper.json").write_text(json.dumps(paper, ensure_ascii=False), encoding="utf-8")
        return paper

    def get(self, paper_id: str) -> dict[str, Any]:
        return json.loads((self._dir(paper_id) / "paper.json").read_text(encoding="utf-8"))

    def pdf_path(self, paper_id: str) -> Path:
        return self._dir(paper_id) / "paper.pdf"

    def list(self) -> list[dict[str, Any]]:
        out = []
        for d in self.root.iterdir():
            f = d / "paper.json"
            if d.is_dir() and f.exists():
                p = json.loads(f.read_text(encoding="utf-8"))
                out.append({k: p.get(k) for k in ("id", "title", "pages", "source", "filename", "addedAt")}
                           | {"blocks": sum(len(s["blocks"]) for s in p["sections"])})
        return sorted(out, key=lambda p: p["addedAt"] or "", reverse=True)

    def delete(self, paper_id: str) -> None:
        shutil.rmtree(self._dir(paper_id))

    # ---------- 术语表 ----------
    def glossary(self) -> list[dict[str, str]]:
        f = self.root / "glossary.json"
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []

    def set_glossary(self, items: list[dict[str, str]]) -> list[dict[str, str]]:
        clean: dict[str, dict[str, str]] = {}
        for it in items:
            en, zh = it.get("en", "").strip(), it.get("zh", "").strip()
            if en and zh:
                clean[en.lower()] = {"en": en, "zh": zh}  # 同一英文术语只留最后一条
        out = sorted(clean.values(), key=lambda x: x["en"].lower())
        with self._lock:
            (self.root / "glossary.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        return out

    # ---------- 翻译缓存 ----------
    @staticmethod
    def cache_key(text: str, glossary: list[dict[str, str]], model: str) -> str:
        # 术语表或模型变了，旧译文就不再命中
        g = json.dumps(glossary, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(f"{model}\n{g}\n{text}".encode()).hexdigest()[:24]

    def cached_translation(self, paper_id: str, key: str) -> str | None:
        f = self._dir(paper_id) / "translations.json"
        return json.loads(f.read_text(encoding="utf-8")).get(key) if f.exists() else None

    def save_translation(self, paper_id: str, key: str, text: str) -> None:
        f = self._dir(paper_id) / "translations.json"
        with self._lock:
            data = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
            data[key] = text
            f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def find_block(paper: dict[str, Any], block_id: str) -> tuple[dict[str, Any], dict[str, Any], int] | None:
    for sec in paper["sections"]:
        for i, b in enumerate(sec["blocks"]):
            if b["id"] == block_id:
                return sec, b, i
    return None
