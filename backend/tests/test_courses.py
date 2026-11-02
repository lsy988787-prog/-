import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.courses import load_courses
from app.main import create_app

COURSES = Path(__file__).resolve().parents[2] / "courses"


@pytest.fixture
def course_dir(tmp_path: Path) -> Path:
    shutil.copy(COURSES / "course.schema.json", tmp_path)
    shutil.copy(COURSES / "power-system-analysis.json", tmp_path)
    return tmp_path


def edit(course_dir: Path, fn) -> None:
    p = course_dir / "power-system-analysis.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    fn(data)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def test_bundled_courses_load_cleanly():
    registry = load_courses(COURSES)
    assert registry.errors == []
    course = registry.courses["power-system-analysis-swjtu-inspired"]
    assert [len(ch["concepts"]) for ch in course["chapters"]] == [6, 12, 7, 10, 4]


def test_schema_error_names_file_and_field(course_dir):
    edit(course_dir, lambda d: d["chapters"][1]["concepts"][2].pop("summary"))
    registry = load_courses(course_dir)
    assert registry.courses == {}
    [err] = registry.errors
    assert err.file == "power-system-analysis.json"
    assert err.path == "$.chapters[1].concepts[2]"
    assert "summary" in err.message


def test_missing_prerequisite_is_rejected(course_dir):
    edit(course_dir, lambda d: d["chapters"][0]["concepts"][0]["prerequisites"].append("no-such-concept"))
    registry = load_courses(course_dir)
    assert registry.courses == {}
    assert "no-such-concept" in registry.errors[0].message


def test_prerequisite_cycle_is_rejected(course_dir):
    # ps-composition 本来是 ps-voltage-levels 的前置，反向再加一条形成环
    edit(course_dir, lambda d: d["chapters"][0]["concepts"][0]["prerequisites"].append("ps-voltage-levels"))
    registry = load_courses(course_dir)
    assert registry.courses == {}
    assert any("成环" in e.message for e in registry.errors)


def test_broken_json_does_not_block_other_courses(course_dir):
    (course_dir / "broken.json").write_text("{ not json", encoding="utf-8")
    registry = load_courses(course_dir)
    assert "power-system-analysis-swjtu-inspired" in registry.courses
    assert registry.errors[0].file == "broken.json"


def test_api_lists_and_returns_courses():
    client = TestClient(create_app(COURSES))
    assert client.get("/api/health").json()["courses"] == 1
    listing = client.get("/api/courses").json()
    assert listing["courses"][0]["conceptCount"] == 39
    assert client.get("/api/courses/power-system-analysis-swjtu-inspired").json()["title"] == "电力系统分析"
    assert client.get("/api/courses/nope").status_code == 404
