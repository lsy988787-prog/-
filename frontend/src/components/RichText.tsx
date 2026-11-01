import katex from 'katex'
import { Fragment, useMemo, type ReactNode } from 'react'

// 渲染 AI 回复：按空行分段，支持 $...$ / $$...$$ / \(...\) / \[...\] 公式和 **加粗**。
// 不解析 HTML，模型输出里的标签按普通文字显示。
const MATH = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g

function renderMath(src: string): ReactNode {
  const display = src.startsWith('$$') || src.startsWith('\\[')
  const body = display ? src.slice(2, -2) : src.startsWith('\\(') ? src.slice(2, -2) : src.slice(1, -1)
  try {
    const html = katex.renderToString(body, { displayMode: display, throwOnError: true, strict: false })
    return <span className={display ? 'rt-math-display' : 'rt-math'} dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    return <code>{src}</code>
  }
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}

export default function RichText({ text }: { text: string }) {
  const nodes = useMemo(
    () =>
      text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((para, i) => (
          <p key={i}>
            {para.split(MATH).map((seg, j) => (j % 2 === 1 ? <Fragment key={j}>{renderMath(seg)}</Fragment> : <Fragment key={j}>{renderInline(seg)}</Fragment>))}
          </p>
        )),
    [text],
  )
  return <div className="rich-text">{nodes}</div>
}
