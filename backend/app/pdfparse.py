"""把论文 PDF 拆成"章节 → 段落块"。

用 pdfminer.six 取出每个文本框的文字、字号和位置，再用简单规则判断：
- 标题：第一页字号最大的文本；
- 章节标题：短、单行，字号明显大于正文，或像 "1 Introduction"、"II. METHOD"、"Abstract" 这样的写法；
- 公式：数学符号多、字母比例低的短文本；
- 图表标题：以 Fig. / Figure / Table 开头；
- 参考文献：References 之后的内容。
页眉页脚（页码、每页重复的短行）会被去掉。规则式解析做不到完美，阅读页同时提供原 PDF 对照。
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import logging

from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTChar, LTTextBox, LTTextLine

logging.getLogger("pdfminer").setLevel(logging.ERROR)

SECTION_WORDS = re.compile(
    r"^(abstract|introduction|related work|background|method(s|ology)?|approach|experiments?|results?|"
    r"discussion|conclusions?|acknowledge?ments?|references|bibliography|appendix|preliminaries|evaluation)\b",
    re.I,
)
NUMBERED = re.compile(r"^((\d+(\.\d+){0,2})|([IVX]{1,4}|[A-H])\.?)\s+[A-Z][^.]{1,80}$")
CAPTION = re.compile(r"^(fig\.|figure|table|tab\.)\s*\d+", re.I)
REFERENCES = re.compile(r"^(references|bibliography)$", re.I)
MATH_CHARS = set("=+−-×·∑∏∫√∂∇≤≥≈≠∞αβγδεθλμπσφωΔΣΩ()[]{}^_/|<>")


@dataclass
class Box:
    text: str
    size: float
    bold: bool
    page: int
    x0: float
    y0: float
    y1: float
    page_h: float
    lines: int


def _clean(text: str) -> str:
    text = text.replace("­", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # 行末连字符断词
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _line_info(line: LTTextLine) -> tuple[float, bool] | None:
    sizes: list[float] = []
    bold = 0
    for ch in line:
        if isinstance(ch, LTChar) and ch.get_text().strip():
            sizes.append(round(ch.size, 1))
            name = ch.fontname.lower()
            bold += "bold" in name or "black" in name
    if not sizes:
        return None
    return Counter(sizes).most_common(1)[0][0], bold > len(sizes) * 0.6


def _boxes(path: Path) -> list[Box]:
    """取出文本框；同一个框里字号变化的地方（如标题紧接作者）拆开。按双栏阅读顺序排序。"""
    boxes: list[Box] = []
    params = LAParams(line_margin=0.5, char_margin=2.0, boxes_flow=0.5)
    for pno, page in enumerate(extract_pages(str(path), laparams=params), start=1):
        found: list[tuple[int, Box]] = []
        for el in page:
            if not isinstance(el, LTTextBox):
                continue
            group: list[tuple[LTTextLine, float, bool]] = []

            def flush() -> None:
                if not group:
                    return
                text = _clean("".join(ln.get_text() for ln, _, _ in group))
                if text:
                    x0 = min(ln.x0 for ln, _, _ in group)
                    x1 = max(ln.x1 for ln, _, _ in group)
                    b = Box(text, group[0][1], group[0][2], pno, x0, min(ln.y0 for ln, _, _ in group),
                            max(ln.y1 for ln, _, _ in group), page.height, len(group))
                    wide = (x1 - x0) > page.width * 0.55
                    column = 0 if wide or x0 < page.width * 0.45 else 1
                    found.append((column, b))
                group.clear()

            for line in el:
                if not isinstance(line, LTTextLine):
                    continue
                info = _line_info(line)
                if info is None:
                    continue
                if group and (abs(info[0] - group[-1][1]) > 0.6 or info[1] != group[-1][2]):
                    flush()
                group.append((line, info[0], info[1]))
            flush()
        found.sort(key=lambda cb: (cb[0], -cb[1].y1))
        boxes.extend(b for _, b in found)
    return boxes


def _is_furniture(b: Box, repeated: set[str], body: float) -> bool:
    edge = b.y1 > b.page_h * 0.94 or b.y0 < b.page_h * 0.06
    if edge and (re.fullmatch(r"[\divxlc\-–— ]+", b.text, re.I) or b.text in repeated or (b.lines == 1 and b.size < body * 0.8)):
        return True
    return b.text in repeated and len(b.text) < 80


def _is_formula(text: str) -> bool:
    if len(text) > 200 or len(text) < 3:
        return False
    letters = sum(ch.isalpha() and ch.isascii() for ch in text)
    math = sum(ch in MATH_CHARS for ch in text)
    words = re.findall(r"[A-Za-z]{4,}", text)
    return math >= 2 and len(words) <= 3 and letters / len(text) < 0.6


def parse_pdf(path: Path) -> dict[str, Any]:
    boxes = _boxes(path)
    if not boxes:
        raise ValueError("PDF 里没有可提取的文字（可能是扫描版图片），暂不支持。")

    weights: Counter[float] = Counter()
    for b in boxes:
        weights[b.size] += len(b.text)
    body = weights.most_common(1)[0][0]

    # 每页重复出现的短行（期刊名、页眉）视为页眉页脚
    pages = max(b.page for b in boxes)
    counts = Counter(b.text for b in boxes if len(b.text) < 80)
    repeated = {t for t, n in counts.items() if pages >= 3 and n >= max(3, pages // 2)}
    boxes = [b for b in boxes if not _is_furniture(b, repeated, body)]

    first = [b for b in boxes if b.page == 1]
    title_box = max(first, key=lambda b: (b.size, b.y1)) if first else None
    title = title_box.text if title_box and title_box.size > body * 1.15 else (first[0].text if first else "未命名论文")

    sections: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    in_refs = False
    counter = 0
    seen_title = False

    def new_section(name: str) -> dict[str, Any]:
        sec = {"id": f"s{len(sections) + 1}", "title": name, "blocks": []}
        sections.append(sec)
        return sec

    for b in boxes:
        if not seen_title and title_box is not None and b is title_box:
            seen_title = True
            continue
        text = b.text
        short = len(text) <= 90 and b.lines <= 2
        heading = short and not CAPTION.match(text) and (
            (b.size >= body * 1.12 and len(text) > 2)
            or (b.bold and (SECTION_WORDS.match(text) or NUMBERED.match(text)))
            or (SECTION_WORDS.match(text) and len(text.split()) <= 4 and b.size >= body)
            or (NUMBERED.match(text) and b.size >= body and len(text.split()) <= 10 and not text.endswith("."))
        )
        # 摘要常写成 "Abstract—..." 或 "Abstract. ..." 和正文连在一起
        m = re.match(r"^(abstract)\s*[—–:.\-]\s*(.+)$", text, re.I)
        if m:
            current = new_section("Abstract")
            text = m.group(2)
        elif heading:
            in_refs = bool(REFERENCES.match(re.sub(r"^[\dIVX.\s]+", "", text)))
            current = new_section(text)
            continue
        if current is None:
            if b.page == 1 and not sections:
                # 标题和摘要之间多是作者、单位，放进"作者与单位"
                current = new_section("作者与单位")
            else:
                current = new_section("正文")
        kind = "reference" if in_refs else "caption" if CAPTION.match(text) else "formula" if _is_formula(text) else "paragraph"
        if kind == "paragraph" and b.size < body * 0.85 and not current["blocks"]:
            kind = "note"  # 脚注、页面小字
        prev = current["blocks"][-1] if current["blocks"] else None
        if (kind == "paragraph" and prev and prev["type"] == "paragraph" and text[:1].islower()
                and not prev["text"].rstrip().endswith((".", "?", "!", ":"))):
            prev["text"] += " " + text  # 跨栏、跨页被拆开的同一段
            continue
        counter += 1
        current["blocks"].append({"id": f"b{counter}", "type": kind, "text": text, "page": b.page})

    # "作者与单位"里如果出现长段落，说明没有识别到摘要标题：改名为"开头"
    sections = [s for s in sections if s["blocks"]]
    for s in sections:
        if s["title"] == "作者与单位" and any(len(b["text"]) > 400 for b in s["blocks"]):
            s["title"] = "开头"

    abstract = next((s for s in sections if s["title"].lower().startswith("abstract")), None)
    return {
        "title": title,
        "pages": pages,
        "abstract": " ".join(b["text"] for b in abstract["blocks"])[:3000] if abstract else "",
        "sections": sections,
    }
