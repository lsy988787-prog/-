"""读文献的提示词：按需翻译、划词问 AI、苏格拉底式精读。"""

from __future__ import annotations

from typing import Any

from .papers import find_block

STAGES = {
    "question": "研究问题：这篇论文要解决什么问题？为什么重要？前人的做法缺什么？",
    "method": "方法：作者怎么做的？关键假设、模型和推导步骤是什么？为什么这样设计？",
    "result": "结果：实验或算例得到了什么？数据能不能支撑结论？和基线比怎么样？",
    "limitation": "局限：方法在什么条件下会失效？有哪些假设值得怀疑？还能怎么改进？",
}

LEVELS = {
    0: "提示等级 L0（追问）：不要直接解释，用一两个问题引导读者先用自己的话说出这段在讲什么、卡在哪里。",
    1: "提示等级 L1（指方向）：指出读懂这段需要抓住的关键词、前文概念或公式，但不要替读者总结。",
    2: "提示等级 L2（给一步）：解释这段最难的一处（一句话、一个公式或一个假设），其余请读者自己完成。",
    3: "提示等级 L3（讲透）：完整讲清这段的意思和它在全文中的作用，最后请读者用一句话复述。",
}


def glossary_text(glossary: list[dict[str, str]]) -> str:
    if not glossary:
        return ""
    return "术语表（必须按此翻译这些术语）：\n" + "\n".join(f"- {g['en']} → {g['zh']}" for g in glossary)


def translate_messages(text: str, glossary: list[dict[str, str]]) -> list[dict[str, str]]:
    system = "\n\n".join(filter(None, [
        "你是电气工程领域的学术翻译。把用户给出的英文论文片段译成准确、通顺的简体中文。\n"
        "要求：只输出译文，不加解释；公式、变量名、引用编号（如 [12]）、图表编号原样保留；"
        "专业术语首次出现时可在中文后括注英文。",
        glossary_text(glossary),
    ]))
    return [{"role": "system", "content": system}, {"role": "user", "content": text}]


def paper_context(paper: dict[str, Any], block_id: str | None) -> str:
    outline = "；".join(s["title"] for s in paper["sections"])
    parts = [f"论文标题：{paper['title']}", f"章节目录：{outline}"]
    if paper.get("abstract"):
        parts.append(f"摘要：{paper['abstract'][:2000]}")
    found = find_block(paper, block_id) if block_id else None
    if found:
        sec, block, i = found
        before = sec["blocks"][max(0, i - 1):i]
        after = sec["blocks"][i + 1:i + 2]
        parts.append(f"当前章节：{sec['title']}")
        if before:
            parts.append("上一段：" + before[0]["text"][:1500])
        parts.append("【当前段落】" + block["text"][:4000])
        if after:
            parts.append("下一段：" + after[0]["text"][:1500])
    return "\n\n".join(parts)


def tutor_messages(
    paper: dict[str, Any], block_id: str | None, stage: str, level: int, mode: str,
    glossary: list[dict[str, str]], history: list[dict[str, str]],
) -> list[dict[str, str]]:
    if mode == "ask":
        role = (
            "你是读者的论文阅读助手。读者在论文里选中了一段文字并提了问题，请结合下面的论文资料，"
            "用简体中文直接、准确地回答：先说这句话/术语/公式是什么意思，再说它在这段和全文中的作用。"
            "不确定的地方直接说不确定，不编造论文里没有的数据或结论。回答一般不超过 250 字，"
            "最后可以留一个帮助读者检验理解的小问题。"
        )
    else:
        role = (
            "你是苏格拉底式的论文精读导师，陪读者读懂一篇英文论文。原则：\n"
            "1. 以提问引导为主，一次只推进一小步，先让读者说出自己的理解，再判断对错并说明原因。\n"
            "2. 围绕【当前段落】和当前精读目标提问，必要时联系全文结构。\n"
            "3. 不替读者做全文翻译；读者要求翻译时，只译关键的一两句。\n"
            "4. 以论文资料为准，不确定就直接说，不编造数据、结论或出处。\n"
            "5. 用简体中文，语气友好、简洁，每次回复一般不超过 250 字，结尾通常留一个具体问题。\n"
            f"当前精读目标：{STAGES.get(stage, STAGES['question'])}\n"
            f"{LEVELS[max(0, min(3, level))]}"
        )
    system = "\n\n".join(filter(None, [
        role,
        "数学公式用 $...$ 或 $$...$$ 的 LaTeX 写法。",
        glossary_text(glossary),
        "===== 论文资料（仅供参考，不要整段照抄） =====\n" + paper_context(paper, block_id),
    ]))
    return [{"role": "system", "content": system}, *history]
