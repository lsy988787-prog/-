import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReaderError, deletePaper, importArxiv, listPapers, uploadPaper, type PaperSummary } from '../../lib/reader'
import TokenGate from './TokenGate'

type State = { status: 'loading' } | { status: 'locked'; error?: string } | { status: 'error'; error: string } | { status: 'ok'; papers: PaperSummary[] }

export default function PapersPage() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [arxiv, setArxiv] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const load = useCallback(() => {
    setState({ status: 'loading' })
    listPapers().then(
      (papers) => setState({ status: 'ok', papers }),
      (e: ReaderError) => setState(e.status === 401 ? { status: 'locked', error: '口令不对，请重新输入。' } : e.status === 503 ? { status: 'error', error: e.message } : { status: 'error', error: e.message }),
    )
  }, [])

  useEffect(load, [load])

  const run = async (label: string, job: () => Promise<{ id: string }>) => {
    setBusy(label)
    setError('')
    try {
      const paper = await job()
      navigate(`/papers/${paper.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  if (state.status === 'locked') return <TokenGate error={state.error} onSaved={load} />
  if (state.status === 'loading') return <main className="page"><p className="muted">加载中…</p></main>
  if (state.status === 'error')
    return (
      <TokenGate onSaved={load}>
        <p className="notice error">{state.error}</p>
      </TokenGate>
    )

  return (
    <main className="page">
      <h1>读文献</h1>
      <p className="lead">导入一篇英文论文，按段落精读：需要时才翻译，选中句子可以直接问 AI，右侧导师会按“研究问题 → 方法 → 结果 → 局限”带你读。</p>

      <section className="import-box">
        <div className="import-row">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) run('正在解析 PDF…', () => uploadPaper(f))
          }} />
          <button className="button primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            上传 PDF
          </button>
          <span className="muted">或</span>
          <form
            className="arxiv-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (arxiv.trim()) run('正在从 arXiv 下载…', () => importArxiv(arxiv.trim()))
            }}
          >
            <input value={arxiv} onChange={(e) => setArxiv(e.target.value)} placeholder="arXiv 链接或编号，如 1706.03762" aria-label="arXiv 链接或编号" />
            <button className="button" type="submit" disabled={!!busy || !arxiv.trim()}>
              导入
            </button>
          </form>
        </div>
        {busy && <p className="muted">{busy}</p>}
        {error && <p className="notice error">{error}</p>}
        <p className="small muted">论文只保存在本站服务器上，只有你能看到。扫描版（图片）PDF 暂不支持。</p>
      </section>

      <section>
        <h2>我的论文</h2>
        {state.papers.length === 0 ? (
          <p className="muted">还没有论文，先导入一篇吧。</p>
        ) : (
          <ul className="paper-list">
            {state.papers.map((p) => (
              <li key={p.id}>
                <Link to={`/papers/${p.id}`}>{p.title}</Link>
                <span className="small muted">
                  {p.pages} 页 · {p.blocks} 段 · {p.source === 'upload' ? p.filename || '上传' : 'arXiv'} · {p.addedAt.slice(0, 10)}
                </span>
                <button
                  className="link-button"
                  onClick={async () => {
                    if (!confirm(`删除《${p.title}》？翻译缓存也会一起删除。`)) return
                    await deletePaper(p.id).catch((e) => setError(e.message))
                    load()
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
