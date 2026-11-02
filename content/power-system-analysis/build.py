"""生成 power-system-analysis.json，并做结构检查（ID 唯一、前置存在且无环、章节计数）。"""
import json
import sys
from pathlib import Path

from common import CONCEPTS
import ch1, ch2, ch3, ch4, ch5  # noqa: F401  导入即注册知识点

OUT = Path(sys.argv[1])

CHAPTERS = [
    ("ch1-intro", "认识电力系统", "电力系统的组成、电压等级、负荷、电能质量与中性点接地方式。"),
    ("ch2-components", "元件与统一建模", "线路、变压器、发电机、负荷的参数与等值电路，标幺制与 dq0 变换。"),
    ("ch3-power-flow", "从网络模型到潮流", "导纳矩阵、开式网络潮流、牛顿法、P-Q 分解法、直流潮流与调频调压。"),
    ("ch4-faults", "从故障到序网络", "三相短路暂态与实用计算、对称分量法、序网络与不对称故障。"),
    ("ch5-traction-harmonics", "牵引供电与谐波", "交流与直流牵引供电系统、负序问题与谐波。"),
]

course = {
    "schemaVersion": "1.1",
    "id": "power-system-analysis-swjtu-inspired",
    "title": "电力系统分析",
    "subject": "电气工程",
    "level": "大学",
    "source": "preset",
    "language": "zh-CN",
    "description": "以中国大学 MOOC 西南交通大学《电力系统分析》公开课程主题为蓝本组织的原创教学内容，覆盖电力系统基础、元件建模、潮流计算、短路故障与牵引供电。",
    "contentVersion": "0.3.0-draft",
    "generatedOn": "2026-10-25",
    "reviewStatus": "pending",
    "license": {"code": "MIT", "content": "CC BY 4.0"},
    "sourceRefs": [
        {"title": "中国大学 MOOC：西南交通大学《电力系统分析》", "url": "https://www.icourse163.org/course/SWJTU-1465999174",
         "note": "仅参考课程主题组织，不含视频、课件或教材原文；课时编号映射待按公开大纲补充。"},
        {"title": "王晓茹、高仕斌主编《电力系统分析》第二版，高等教育出版社", "url": "", "note": "该课程页面列出的参考教材。"},
    ],
    "chapters": [],
}

ids = [c["id"] for c in CONCEPTS]
assert len(ids) == len(set(ids)), "知识点 ID 重复"
idset = set(ids)
for c in CONCEPTS:
    for p in c["prerequisites"]:
        assert p in idset, f"{c['id']} 的前置 {p} 不存在"
        assert p != c["id"]

# 环检测
graph = {c["id"]: c["prerequisites"] for c in CONCEPTS}
state = {}
def visit(n, stack):
    if state.get(n) == 1:
        raise AssertionError("前置关系成环：" + " → ".join(stack + [n]))
    if state.get(n) == 2:
        return
    state[n] = 1
    for p in graph[n]:
        visit(p, stack + [n])
    state[n] = 2
for n in graph:
    visit(n, [])

for cid, title, desc in CHAPTERS:
    concepts = [c for c in CONCEPTS if c["chapterId"] == cid]
    for c in concepts:
        c["sourceRefs"] = [{"title": "西南交通大学《电力系统分析》（中国大学 MOOC）对应章节主题", "url": "https://www.icourse163.org/course/SWJTU-1465999174", "lessonCodes": []}]
        assert c["keyFormulas"] and c["workedExample"]["steps"] and c["misconceptions"] and c["practice"]
    course["chapters"].append({"id": cid, "order": len(course["chapters"]) + 1, "title": title, "description": desc, "concepts": concepts})

counts = [len(ch["concepts"]) for ch in course["chapters"]]
assert counts == [6, 12, 7, 10, 4], counts
calcs = sorted({c["visualization"]["calculator"] for c in CONCEPTS if c["visualization"]})
course["calculators"] = calcs

OUT.write_text(json.dumps(course, ensure_ascii=False, indent=2), encoding="utf-8")
print("知识点", len(CONCEPTS), "各章", counts, "公式", sum(len(c["keyFormulas"]) for c in CONCEPTS),
      "可视化知识点", sum(1 for c in CONCEPTS if c["visualization"]), "计算器", len(calcs))
