"""AI 导师对话接口。

POST /api/chat        流式返回（text/event-stream），每个事件是一行 JSON：
                      {"delta": "..."} 逐段文字；{"done": true, "remaining": n} 结束；{"error": "..."} 出错。
GET  /api/chat/config 前端用来决定显示什么：平台额度是否可用、今天还剩几条、可选的服务商。

对话历史由前端保存并每次带上，服务端不存对话内容。
"""

from __future__ import annotations

import json
import re
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .llm import PROVIDERS, ModelError, byok_config, platform_config, stream_chat
from .quota import DailyQuota
from .tutor import MAX_LEVEL, build_messages

MAX_HISTORY = 20  # 只把最近 20 条消息发给模型，控制费用
CLIENT_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class Byok(BaseModel):
    provider: str
    model: str
    apiKey: str = Field(min_length=1, max_length=512)


class ChatRequest(BaseModel):
    courseId: str
    conceptId: str
    messages: list[ChatMessage] = Field(min_length=1, max_length=200)
    hintLevel: int = Field(default=0, ge=0, le=MAX_LEVEL)
    byok: Byok | None = None


def who(request: Request, client_id: str | None) -> str:
    if client_id and CLIENT_ID.match(client_id):
        return "c:" + client_id
    return "ip:" + (request.client.host if request.client else "unknown")


def sse(obj: dict) -> str:
    return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"


def make_router(quota: DailyQuota) -> APIRouter:
    router = APIRouter()

    @router.get("/api/chat/config")
    def chat_config(request: Request, x_client_id: Annotated[str | None, Header()] = None):
        return {
            "platformAvailable": platform_config() is not None,
            "dailyLimit": quota.limit,
            "remaining": quota.remaining(who(request, x_client_id)),
            "providers": [{"id": p.id, "label": p.label, "models": list(p.models)} for p in PROVIDERS.values()],
        }

    @router.post("/api/chat")
    async def chat(body: ChatRequest, request: Request, x_client_id: Annotated[str | None, Header()] = None):
        registry = request.app.state.registry
        course = registry.courses.get(body.courseId)
        if course is None:
            raise HTTPException(404, f"课程不存在：{body.courseId}")
        concept = next(
            (c for ch in course["chapters"] for c in ch["concepts"] if c["id"] == body.conceptId), None
        )
        if concept is None:
            raise HTTPException(404, f"知识点不存在：{body.conceptId}")
        if body.messages[-1].role != "user":
            raise HTTPException(422, "最后一条消息应当来自学生")

        if body.byok:
            try:
                config = byok_config(body.byok.provider, body.byok.model, body.byok.apiKey)
            except ValueError as e:
                raise HTTPException(422, str(e)) from e
        else:
            config = platform_config()
            if config is None:
                raise HTTPException(503, "平台 AI 导师还没有配置模型密钥。可以在设置里改用自己的密钥，或联系管理员。")

        user = who(request, x_client_id)
        if not config.byok and not quota.take(user):
            raise HTTPException(429, f"今天的 {quota.limit} 条免费额度已用完，明天再来，或在设置里改用自己的密钥。")

        history = [m.model_dump() for m in body.messages[-MAX_HISTORY:]]
        if history[0]["role"] != "user":  # 截断后保证从学生的话开始
            history = history[1:]
        messages = build_messages(course, concept, history, body.hintLevel)
        client: httpx.AsyncClient = request.app.state.http

        async def events():
            try:
                async for text in stream_chat(config, messages, client):
                    yield sse({"delta": text})
            except ModelError as e:
                if not config.byok:
                    quota.refund(user)
                yield sse({"error": str(e)})
                return
            remaining = None if config.byok else quota.remaining(user)
            yield sse({"done": True, "remaining": remaining})

        return StreamingResponse(
            events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        )

    return router
