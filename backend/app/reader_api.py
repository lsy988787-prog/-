"""读文献接口。只给负责人自己用：所有请求都要带 X-Reader-Token，与服务端环境变量 READER_TOKEN 一致。

GET    /api/papers                    论文列表
POST   /api/papers                    上传 PDF（multipart，字段 file）
POST   /api/papers/arxiv              {"url": "..."} 从 arXiv 下载
GET    /api/papers/{id}               解析后的结构
GET    /api/papers/{id}/pdf           原 PDF
DELETE /api/papers/{id}
POST   /api/papers/{id}/translate     {"text": "...", "byok": ...} 按需翻译，按文本缓存
POST   /api/papers/{id}/chat          流式对话：精读（mode=tutor）或划词提问（mode=ask）
GET/PUT /api/glossary                 术语表
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .chat import Byok, ChatMessage, sse
from .llm import ModelConfig, ModelError, byok_config, platform_config, stream_chat
from .papers import MAX_PDF_BYTES, PaperStore, arxiv_pdf_url, find_block
from .reader import STAGES, translate_messages, tutor_messages


def require_reader(x_reader_token: Annotated[str | None, Header()] = None) -> None:
    expected = os.environ.get("READER_TOKEN", "")
    if not expected:
        raise HTTPException(503, "读文献模块未开启：请在服务器环境变量里设置 READER_TOKEN。")
    if not x_reader_token or not secrets.compare_digest(x_reader_token, expected):
        raise HTTPException(401, "需要访问口令。")


def model_for(byok: Byok | None) -> ModelConfig:
    if byok:
        try:
            return byok_config(byok.provider, byok.model, byok.apiKey)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
    config = platform_config()
    if config is None:
        raise HTTPException(503, "还没有配置模型密钥。可以在模型设置里改用自己的密钥。")
    return config


class ArxivRequest(BaseModel):
    url: str = Field(min_length=1, max_length=300)


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=6000)
    byok: Byok | None = None


class ReaderChatRequest(BaseModel):
    blockId: str | None = None
    mode: Literal["tutor", "ask"] = "tutor"
    stage: Literal["question", "method", "result", "limitation"] = "question"
    hintLevel: int = Field(default=0, ge=0, le=3)
    messages: list[ChatMessage] = Field(min_length=1, max_length=200)
    byok: Byok | None = None


class GlossaryItem(BaseModel):
    en: str = Field(max_length=200)
    zh: str = Field(max_length=200)


def make_reader_router(store: PaperStore) -> APIRouter:
    router = APIRouter(prefix="/api", dependencies=[Depends(require_reader)])

    def paper_or_404(paper_id: str):
        try:
            return store.get(paper_id)
        except KeyError:
            raise HTTPException(404, "论文不存在。") from None

    @router.get("/papers")
    def list_papers():
        return {"papers": store.list(), "stages": STAGES}

    @router.post("/papers")
    async def upload(file: Annotated[UploadFile, File()]):
        data = await file.read(MAX_PDF_BYTES + 1)
        try:
            return store.add_pdf(data, source="upload", filename=Path(file.filename or "").name)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e

    @router.post("/papers/arxiv")
    async def from_arxiv(body: ArxivRequest, request: Request):
        try:
            url = arxiv_pdf_url(body.url)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        client: httpx.AsyncClient = request.app.state.http
        try:
            async with client.stream("GET", url, follow_redirects=True) as resp:
                if resp.url.host not in ("arxiv.org", "export.arxiv.org", "www.arxiv.org"):
                    raise HTTPException(422, "arXiv 跳转到了其他网站，已停止下载。")
                if resp.status_code == 404:
                    raise HTTPException(404, "arXiv 上找不到这篇论文。")
                if resp.status_code != 200:
                    raise HTTPException(502, f"arXiv 返回错误（{resp.status_code}），请稍后再试。")
                data = b""
                async for chunk in resp.aiter_bytes():
                    data += chunk
                    if len(data) > MAX_PDF_BYTES:
                        raise HTTPException(422, "PDF 超过 30 MB。")
        except httpx.HTTPError as e:
            raise HTTPException(502, "连接 arXiv 失败，请稍后再试，或下载 PDF 后上传。") from e
        try:
            return store.add_pdf(data, source=url)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e

    @router.get("/papers/{paper_id}")
    def get_paper(paper_id: str):
        return paper_or_404(paper_id)

    @router.get("/papers/{paper_id}/pdf")
    def get_pdf(paper_id: str):
        paper_or_404(paper_id)
        return FileResponse(store.pdf_path(paper_id), media_type="application/pdf")

    @router.delete("/papers/{paper_id}")
    def delete_paper(paper_id: str):
        paper_or_404(paper_id)
        store.delete(paper_id)
        return {"deleted": paper_id}

    @router.get("/glossary")
    def get_glossary():
        return {"items": store.glossary()}

    @router.put("/glossary")
    def put_glossary(items: list[GlossaryItem]):
        return {"items": store.set_glossary([i.model_dump() for i in items])}

    @router.post("/papers/{paper_id}/translate")
    async def translate(paper_id: str, body: TranslateRequest, request: Request):
        paper_or_404(paper_id)
        config = model_for(body.byok)
        glossary = store.glossary()
        key = store.cache_key(body.text.strip(), glossary, config.model)
        cached = store.cached_translation(paper_id, key)
        if cached is not None:
            return {"translation": cached, "cached": True}
        try:
            parts = [t async for t in stream_chat(config, translate_messages(body.text.strip(), glossary), request.app.state.http, temperature=0.2)]
        except ModelError as e:
            raise HTTPException(502, str(e)) from e
        text = "".join(parts).strip()
        if text:
            store.save_translation(paper_id, key, text)
        return {"translation": text, "cached": False}

    @router.post("/papers/{paper_id}/chat")
    async def chat(paper_id: str, body: ReaderChatRequest, request: Request):
        paper = paper_or_404(paper_id)
        if body.blockId and not find_block(paper, body.blockId):
            raise HTTPException(404, "段落不存在。")
        if body.messages[-1].role != "user":
            raise HTTPException(422, "最后一条消息应当来自读者")
        config = model_for(body.byok)
        history = [m.model_dump() for m in body.messages[-20:]]
        if history[0]["role"] != "user":
            history = history[1:]
        messages = tutor_messages(paper, body.blockId, body.stage, body.hintLevel, body.mode, store.glossary(), history)

        async def events():
            try:
                async for text in stream_chat(config, messages, request.app.state.http):
                    yield sse({"delta": text})
            except ModelError as e:
                yield sse({"error": str(e)})
                return
            yield sse({"done": True, "remaining": None})

        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    return router
