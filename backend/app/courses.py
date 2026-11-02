"""课程包的加载与校验。

课程目录下每个 *.json（course.schema.json 除外）是一门课程。加载时先做 JSON Schema 校验，
再做 Schema 表达不了的语义检查（ID 唯一、前置知识存在且无环、chapterId 一致）。
任何一门课程有错都会被拒绝加载，并报出文件名和字段位置。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

SCHEMA_FILE = "course.schema.json"


@dataclass
class CourseError:
    file: str
    path: str
    message: str

    def __str__(self) -> str:
        return f"{self.file} {self.path}: {self.message}"


@dataclass
class CourseRegistry:
    courses: dict[str, dict[str, Any]] = field(default_factory=dict)
    errors: list[CourseError] = field(default_factory=list)

    def summaries(self) -> list[dict[str, Any]]:
        return [summarize(c) for c in self.courses.values()]


def summarize(course: dict[str, Any]) -> dict[str, Any]:
    keys = ("id", "title", "subject", "level", "source", "description", "reviewStatus", "contentVersion")
    out = {k: course.get(k) for k in keys}
    out["chapterCount"] = len(course["chapters"])
    out["conceptCount"] = sum(len(ch["concepts"]) for ch in course["chapters"])
    return out


def _json_path(parts) -> str:
    path = "$"
    for p in parts:
        path += f"[{p}]" if isinstance(p, int) else f".{p}"
    return path


def check_semantics(course: dict[str, Any], file: str) -> list[CourseError]:
    errors: list[CourseError] = []
    seen_chapters: set[str] = set()
    concepts: dict[str, list[str]] = {}
    for i, ch in enumerate(course["chapters"]):
        if ch["id"] in seen_chapters:
            errors.append(CourseError(file, f"$.chapters[{i}].id", f"章节 ID 重复：{ch['id']}"))
        seen_chapters.add(ch["id"])
        for j, c in enumerate(ch["concepts"]):
            where = f"$.chapters[{i}].concepts[{j}]"
            if c["id"] in concepts:
                errors.append(CourseError(file, f"{where}.id", f"知识点 ID 重复：{c['id']}"))
            if c["chapterId"] != ch["id"]:
                errors.append(CourseError(file, f"{where}.chapterId", f"应为 {ch['id']}，实际为 {c['chapterId']}"))
            concepts[c["id"]] = c["prerequisites"]

    for cid, prereqs in concepts.items():
        for p in prereqs:
            if p not in concepts:
                errors.append(CourseError(file, f"concept {cid}.prerequisites", f"前置知识点不存在：{p}"))
    if errors:
        return errors

    # 前置关系必须无环（DFS 三色标记）
    state: dict[str, int] = {}

    def visit(node: str, trail: list[str]) -> None:
        if state.get(node) == 2:
            return
        if state.get(node) == 1:
            loop = trail[trail.index(node):] + [node]
            errors.append(CourseError(file, f"concept {node}.prerequisites", "前置关系成环：" + " → ".join(loop)))
            return
        state[node] = 1
        for p in concepts[node]:
            visit(p, trail + [node])
        state[node] = 2

    for cid in concepts:
        visit(cid, [])
    return errors


def load_courses(directory: Path) -> CourseRegistry:
    registry = CourseRegistry()
    schema = json.loads((directory / SCHEMA_FILE).read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    for path in sorted(directory.glob("*.json")):
        if path.name == SCHEMA_FILE:
            continue
        try:
            course = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            registry.errors.append(CourseError(path.name, f"line {e.lineno}", f"JSON 格式错误：{e.msg}"))
            continue

        errors = [CourseError(path.name, _json_path(e.absolute_path), e.message)
                  for e in sorted(validator.iter_errors(course), key=lambda e: list(e.absolute_path))]
        if not errors:
            errors = check_semantics(course, path.name)
        if not errors and course["id"] in registry.courses:
            errors = [CourseError(path.name, "$.id", f"课程 ID 与其他文件重复：{course['id']}")]
        if errors:
            registry.errors.extend(errors)
            continue
        registry.courses[course["id"]] = course
    return registry
