"""课程内容的公共构造函数。字段沿用知序 0.2.0 交接文档第 7 节描述的 1.1 结构。"""

CONCEPTS = []


def F(latex, display, variables, conditions=""):
    """一条关键公式。variables: [(符号, 含义, 单位)]"""
    return {
        "latex": latex,
        "display": display,
        "variables": [{"symbol": s, "meaning": m, "unit": u} for s, m, u in variables],
        "conditions": conditions,
    }


def V(calculator, params, assumptions, output):
    """可视化：白名单计算器 ID + 参数。params: [(id, 名称, 单位, min, max, step, default)]"""
    return {
        "calculator": calculator,
        "params": [
            {"id": i, "label": l, "unit": u, "min": a, "max": b, "step": s, "default": d}
            for i, l, u, a, b, s, d in params
        ],
        "output": output,
        "assumptions": assumptions,
    }


def K(cid, chapter, title, prerequisites, summary, explanation, formulas, example,
      misconceptions, practice, guidance, visualization=None):
    problem, steps, answer = example
    q, a, e = practice
    CONCEPTS.append({
        "id": cid,
        "chapterId": chapter,
        "order": sum(1 for c in CONCEPTS if c["chapterId"] == chapter) + 1,
        "title": title,
        "prerequisites": prerequisites,
        "summary": summary,
        "explanation": explanation,
        "keyFormulas": formulas,
        "workedExample": {"problem": problem, "steps": steps, "answer": answer},
        "misconceptions": [{"wrong": w, "correct": c} for w, c in misconceptions],
        "visualization": visualization,
        "images": [],
        "practice": [{"question": q, "answer": a, "explanation": e}],
        "aiGuidance": {
            "guidingQuestions": guidance,
            "constraints": [
                "先让学生说出自己的理解，再逐步提示，不直接给出完整答案。",
                "数值结论以计算器或课程给定答案为准，不自行心算。",
                "说明所用近似和适用条件，教学参数不作为工程整定依据。",
            ],
        },
        "sourceRefs": [],
        "reviewStatus": "pending",
    })
