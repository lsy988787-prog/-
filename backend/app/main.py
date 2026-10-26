"""FastAPI 入口：课程接口，生产环境下同时托管前端构建产物。"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .courses import load_courses

ROOT = Path(__file__).resolve().parents[2]
COURSES_DIR = Path(os.environ.get("COURSES_DIR", ROOT / "courses"))
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", ROOT / "frontend" / "dist"))

log = logging.getLogger("ai_learning")


def create_app(courses_dir: Path = COURSES_DIR) -> FastAPI:
    registry = load_courses(courses_dir)
    for err in registry.errors:
        log.error("课程未加载：%s", err)

    app = FastAPI(title="AI 对话式学习平台")
    app.state.registry = registry

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
