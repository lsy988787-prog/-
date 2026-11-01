"""模型适配层：兼容 OpenAI Chat Completions 协议的流式调用。

默认 DeepSeek。平台密钥只从服务端环境变量 MODEL_API_KEY 读取；用户自带密钥（BYOK）
随单次请求传入、只用于转发这一次请求，服务端不保存、不写日志。

为防止服务端被当成任意地址的代理，用户自带密钥时只能从下面的白名单里选服务商。
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    base_url: str
    models: tuple[str, ...]


PROVIDERS: dict[str, Provider] = {
    p.id: p
    for p in (
        Provider("deepseek", "DeepSeek", "https://api.deepseek.com", ("deepseek-chat", "deepseek-reasoner")),
        Provider("qwen", "通义千问（阿里云百炼）", "https://dashscope.aliyuncs.com/compatible-mode/v1", ("qwen-plus", "qwen-max", "qwen-turbo")),
        Provider("moonshot", "Kimi（月之暗面）", "https://api.moonshot.cn/v1", ("moonshot-v1-8k", "moonshot-v1-32k")),
        Provider("zhipu", "智谱 GLM", "https://open.bigmodel.cn/api/paas/v4", ("glm-4-plus", "glm-4-flash")),
        Provider("openai", "OpenAI", "https://api.openai.com/v1", ("gpt-4o-mini", "gpt-4o")),
    )
}


@dataclass(frozen=True)
class ModelConfig:
    api_key: str
    base_url: str
    model: str
    byok: bool = False


class ModelError(Exception):
    """模型服务返回错误。message 是可以直接展示给学生的中文说明，不含密钥。"""


def platform_config() -> ModelConfig | None:
    key = os.environ.get("MODEL_API_KEY", "").strip()
    if not key:
        return None
    return ModelConfig(
        api_key=key,
        base_url=os.environ.get("MODEL_BASE_URL", "https://api.deepseek.com").rstrip("/"),
        model=os.environ.get("MODEL_NAME", "deepseek-chat"),
    )


def byok_config(provider_id: str, model: str, api_key: str) -> ModelConfig:
    provider = PROVIDERS.get(provider_id)
    if provider is None:
        raise ValueError(f"不支持的模型服务商：{provider_id}")
    if model not in provider.models:
        raise ValueError(f"{provider.label} 不支持模型 {model}")
    if not api_key.strip():
        raise ValueError("请填写 API 密钥")
    return ModelConfig(api_key=api_key.strip(), base_url=provider.base_url, model=model, byok=True)


_STATUS_HINTS = {
    401: "模型服务拒绝了密钥，请检查密钥是否正确。",
    402: "模型账户余额不足。",
    403: "模型服务拒绝访问，请检查密钥权限。",
    429: "模型服务繁忙或触发限流，请稍后再试。",
}


async def stream_chat(
    config: ModelConfig,
    messages: list[dict[str, str]],
    client: httpx.AsyncClient,
    temperature: float = 0.4,
) -> AsyncIterator[str]:
    """逐段产出模型回复文本。"""
    url = f"{config.base_url}/chat/completions"
    payload = {"model": config.model, "messages": messages, "stream": True, "temperature": temperature}
    headers = {"Authorization": f"Bearer {config.api_key}", "Accept": "text/event-stream"}
    try:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                await resp.aread()
                hint = _STATUS_HINTS.get(resp.status_code, f"模型服务返回错误（{resp.status_code}）。")
                raise ModelError(hint)
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                for choice in chunk.get("choices") or []:
                    text = (choice.get("delta") or {}).get("content")
                    if text:
                        yield text
    except httpx.TimeoutException as e:
        raise ModelError("模型响应超时，请稍后再试。") from e
    except httpx.HTTPError as e:
        raise ModelError("连接模型服务失败，请稍后再试。") from e
