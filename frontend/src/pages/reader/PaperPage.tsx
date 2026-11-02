import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RichText from '../../components/RichText'
import { ReaderError, getPaper, getToken, pdfUrl, translate, type Block, type Paper, type Stage } from '../../lib/reader'
import GlossaryDialog from './GlossaryDialog'
import ReaderPanel, { type AskRequest } from './ReaderPanel'
import TokenGate from './TokenGate'

type Tr = { status: 'loading' } | { status: 'ok'; text: string } | { status: 'error'; text: string }
interface Selection {
  text: string
  x: number
  y: number
  blockId: string | null
  result?: Tr
}

const TYPE_LABEL: Record<Block['type'], string> = { paragraph: '', formula: '公式', caption: '图表', reference: '文献', note: '注' }

export default function PaperPage() {
  const { paperId = '' } = useParams()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [reload, setReload] = useState(0)
  const [current, setCurrent] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('question')
  const [tr, setTr] = useState<Record<string, Tr>>({})
  const [sel, setSel] = useState<Selection | null>(null)
  const [ask, setAsk] = useState<AskRequest | null>(null)
  const [glossary, setGlossary] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const articleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPaper(null)
    setError(null)
    getPaper(paperId).then(
      (p) => {
        setPaper(p)
        // 默认从摘要（或第一个正文段落）开始，跳过作者与单位
        const body = p.sections.filter((s) => s.title !== '作者与单位')
        const first = body.flatMap((s) => s.blocks).find((b) => b.type === 'paragraph')
        setCurrent(first?.id ?? null)
      },
      (e: ReaderError) => setError({ status: e.status, message: e.message }),
    )
  }, [paperId, reload])

  const index = useMemo(() => {
    const map = new Map<string, { block: Block; ref: string }>()
    paper?.sections.forEach((s) => {
      let n = 0
      s.blocks.forEach((b) => {
        n += 1
        map.set(b.id, { block: b, ref: `${s.title} · 第 ${n} 段` })
      })
    })
    return map
  }, [paper])

  const doTranslate = useCallback(
    async (b: Block) => {
      setTr((t) => ({ ...t, [b.id]: { status: 'loading' } }))
      try {
        const r = await translate(paperId, b.text)
        setTr((t) => ({ ...t, [b.id]: { status: 'ok', text: r.translation } }))
      } catch (e) {
        setTr((t) => ({ ...t, [b.id]: { status: 'error', text: e instanceof Error ? e.message : String(e) } }))
      }
    },
    [paperId],
  )

  // 划词：在原文里选中文字时弹出小工具条（鼠标和触屏都支持）
  useEffect(() => {
    let timer = 0
    const onChange = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const s = window.getSelection()
        const text = s?.toString().trim() ?? ''
        if (!s || !text || s.rangeCount === 0 || !articleRef.current?.contains(s.anchorNode)) {
          setSel((cur) => (cur?.result ? cur : null))
          return
        }
        const rect = s.getRangeAt(0).getBoundingClientRect()
        const host = (s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement)?.closest('[data-block]')
        setSel({ text: text.slice(0, 1500), x: rect.left + rect.width / 2, y: rect.bottom, blockId: host?.getAttribute('data-block') ?? null })
      }, 250)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!sel) return
    const close = () => setSel(null)
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [sel])

  const askAbout = (question: string, blockId: string | null, mode: 'tutor' | 'ask' = 'ask', send = true) => {
    if (blockId) setCurrent(blockId)
    setAsk({ text: question, nonce: Date.now(), mode, send })
    setPanelOpen(true)
    setSel(null)
    window.getSelection()?.removeAllRanges()
  }

  const openPdf = async () => {
    const res = await fetch(pdfUrl(paperId), { headers: { 'X-Reader-Token': getToken() } })
    if (!res.ok) return
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener')
  }

  if (error?.status === 401 || error?.status === 503) return <TokenGate error={error.message} onSaved={() => setReload((n) => n + 1)} />
  if (error) return <main className="page"><p className="notice error">{error.message}</p><Link to="/papers">← 返回论文列表</Link></main>
  if (!paper) return <main className="page"><p className="muted">加载中…</p></main>

  const cur = current ? index.get(current) : undefined

  return (
    <div className="reader-layout">
      <main className="reader-article">
        <p className="eyebrow">
          <Link to="/papers">← 我的论文</Link>
        </p>
        <h1 className="paper-title">{paper.title}</h1>
        <div className="actions reader-tools">
          <label className="section-jump">
            <span className="visually-hidden">跳到章节</span>
            <select
              value=""
              onChange={(e) => document.getElementById(`sec-${e.target.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <option value="">跳到章节…</option>
              {paper.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <button className="button" onClick={() => setGlossary('')}>
            术语表
          </button>
          <button className="button" onClick={openPdf}>
            看原 PDF
          </button>
        </div>
        <p className="small muted">点一段设为当前段落，导师会围绕它提问；选中文字可以翻译、解释或加入术语表。排版来自自动解析，公式和表格请对照原 PDF。</p>

        <div ref={articleRef}>
          {paper.sections.map((s) => (
            <section key={s.id} id={`sec-${s.id}`} className="paper-section">
              <h2>{s.title}</h2>
              {s.blocks.map((b) => {
                const t = tr[b.id]
                const active = b.id === current
                return (
                  <div key={b.id} data-block={b.id} className={`paper-block ${b.type} ${active ? 'active' : ''}`} onClick={() => !window.getSelection()?.toString() && setCurrent(b.id)}>
                    {TYPE_LABEL[b.type] && <span className="block-tag">{TYPE_LABEL[b.type]}</span>}
                    <p lang="en">{b.text}</p>
                    {t && (
                      <div className={`translation ${t.status}`} lang="zh-CN">
                        {t.status === 'loading' ? <p className="muted">翻译中…</p> : t.status === 'error' ? <p>{t.text}</p> : <RichText text={t.text} />}
                      </div>
                    )}
                    {active && b.type !== 'reference' && (
                      <div className="block-actions" onClick={(e) => e.stopPropagation()}>
                        {t?.status === 'ok' && (
                          <button className="link-button" onClick={() => doTranslate(b)} title="术语表改过后，可以按新译法重译">
                            重新翻译
                          </button>
                        )}
                        {t?.status === 'ok' ? (
                          <button className="link-button" onClick={() =>
                              setTr((all) => {
                                const next = { ...all }
                                delete next[b.id]
                                return next
                              })
                            }>
                            收起译文
                          </button>
                        ) : (
                          <button className="link-button" onClick={() => doTranslate(b)} disabled={t?.status === 'loading'}>
                            翻译这段
                          </button>
                        )}
                        <button className="link-button" onClick={() => askAbout('我们来精读这一段，请先问我一个问题。', b.id, 'tutor')}>
                          精读这段
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </main>

      <ReaderPanel
        paperId={paper.id}
        block={cur?.block ?? null}
        blockRef={cur?.ref ?? ''}
        stage={stage}
        onStage={setStage}
        ask={ask}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
      {!panelOpen && (
        <button className="tutor-fab reader-fab" onClick={() => setPanelOpen(true)}>
          精读导师
        </button>
      )}

      {sel && (
        <div className="sel-pop" style={{ left: Math.min(Math.max(sel.x, 140), window.innerWidth - 140), top: Math.min(Math.max(sel.y + 8, 64), window.innerHeight - 80) }} onMouseDown={(e) => e.preventDefault()}>
          {sel.result ? (
            <div className="sel-result">
              {sel.result.status === 'loading' ? <p className="muted">翻译中…</p> : <RichText text={sel.result.text} />}
              <button className="link-button" onClick={() => setSel(null)}>
                关闭
              </button>
            </div>
          ) : (
            <div className="sel-actions">
              <button
                onClick={async () => {
                  const text = sel.text
                  setSel((s) => s && { ...s, result: { status: 'loading' } })
                  try {
                    const r = await translate(paperId, text)
                    setSel((s) => s && s.text === text ? { ...s, result: { status: 'ok', text: r.translation } } : s)
                  } catch (e) {
                    setSel((s) => s && { ...s, result: { status: 'error', text: e instanceof Error ? e.message : String(e) } })
                  }
                }}
              >
                翻译
              </button>
              <button onClick={() => askAbout(`请解释这句话在说什么：「${sel.text}」`, sel.blockId)}>解释</button>
              <button onClick={() => askAbout(`关于「${sel.text}」，我想问：`, sel.blockId, 'ask', false)}>问导师</button>
              {sel.text.length <= 60 && (
                <button
                  onClick={() => {
                    setGlossary(sel.text)
                    setSel(null)
                  }}
                >
                  加入术语表
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {glossary !== null && <GlossaryDialog prefill={glossary} onClose={() => setGlossary(null)} />}
    </div>
  )
}
