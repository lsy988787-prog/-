"""FastAPI 入口：课程接口，生产环境下同时托管前端构建产物。"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .chat import make_router
from .courses import load_courses
from .quota import DailyQuota

ROOT = Path(__file__).resolve().parents[2]
COURSES_DIR = Path(os.environ.get("COURSES_DIR", ROOT / "courses"))
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", ROOT / "frontend" / "dist"))

log = logging.getLogger("ai_learning")


def create_app(
    courses_dir: Path = COURSES_DIR,
    transport: httpx.AsyncBaseTransport | None = None,
    daily_limit: int | None = None,
) -> FastAPI:
    """transport 只在测试里传入，用来模拟模型服务。"""
    registry = load_courses(courses_dir)
    for err in registry.errors:
        log.error("课程未加载：%s", err)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        timeout = httpx.Timeout(60.0, connect=10.0)
        async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
            app.state.http = client
            yield

    app = FastAPI(title="AI 对话式学习平台", lifespan=lifespan)
    app.state.registry = registry
    limit = daily_limit if daily_limit is not None else int(os.environ.get("DAILY_MESSAGE_LIMIT", "40"))
    app.include_router(make_router(DailyQuota(limit)))

    @app.get("/api/health")
    def health():
        return {"status": "ok", "courses": len(registry.courses), "courseErrors": len(registry.errors)}

    @app.get("/api/courses")
    def list_courses():
        return {"courses": registry.summaries(), "errors": [vars(e) for e in registry.errors]}

    @app.get("/api/courses/{course_id}")
    def get_course(course_id: str):
        course = registry.courses.get(course_id)
        if course is None:
            raise HTTPException(status_code=404, detail=f"课程不存在：{course_id}")
        return course

    if FRONTEND_DIST.is_dir():
        app.mount("/", SpaStaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    return app


class SpaStaticFiles(StaticFiles):
    """前端是单页应用：/course/... 这类路径没有对应文件时返回 index.html，由前端路由处理。"""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code != 404 or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


app = create_app()
