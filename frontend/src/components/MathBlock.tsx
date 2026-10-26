import katex from 'katex'
import { useMemo } from 'react'

// 渲染一条 LaTeX 公式；渲染失败时退回课程里的离线文本，保证没有排版器也能读
export default function MathBlock({ latex, fallback }: { latex: string; fallback: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { displayMode: true, throwOnError: true, strict: false })
    } catch {
      return null
    }
  }, [latex])
  if (html === null) return <div className="formula-fallback">{fallback}</div>
  return <div className="formula-math" aria-label={fallback} dangerouslySetInnerHTML={{ __html: html }} />
}
