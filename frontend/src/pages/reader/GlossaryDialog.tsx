import { useEffect, useState } from 'react'
import { getGlossary, saveGlossary, type GlossaryItem } from '../../lib/reader'

// 术语表：定下的译法在之后的翻译和对话里一直沿用。
export default function GlossaryDialog({ prefill, onClose }: { prefill: string; onClose: () => void }) {
  const [items, setItems] = useState<GlossaryItem[] | null>(null)
  const [en, setEn] = useState(prefill)
  const [zh, setZh] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getGlossary().then(setItems, (e) => setError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (next: GlossaryItem[]) => {
    setError('')
    try {
      setItems(await saveGlossary(next))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="术语表" onClick={(e) => e.stopPropagation()}>
        <header className="tutor-head">
          <strong>术语表</strong>
          <button className="icon-button" onClick={onClose} aria-label="关闭术语表">
            ✕
          </button>
        </header>
        <div className="dialog-body">
          <p className="small muted">定下的译法会用在之后的所有翻译和导师对话里。修改术语表后，相关段落再点翻译会按新译法重译。</p>
          <form
            className="glossary-add"
            onSubmit={(e) => {
              e.preventDefault()
              if (!en.trim() || !zh.trim() || !items) return
              save([...items, { en: en.trim(), zh: zh.trim() }])
              setEn('')
              setZh('')
            }}
          >
            <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="英文，如 power flow" aria-label="英文术语" />
            <input value={zh} onChange={(e) => setZh(e.target.value)} placeholder="中文，如 潮流" aria-label="中文译法" autoFocus={!!prefill} />
            <button className="button primary" type="submit" disabled={!en.trim() || !zh.trim() || !items}>
              添加
            </button>
          </form>
          {error && <p className="notice error">{error}</p>}
          {items === null ? (
            <p className="muted">加载中…</p>
          ) : items.length === 0 ? (
            <p className="muted">还没有术语。</p>
          ) : (
            <table className="data-table glossary-table">
              <tbody>
                {items.map((it) => (
                  <tr key={it.en}>
                    <td>{it.en}</td>
                    <td>{it.zh}</td>
                    <td>
                      <button className="link-button" onClick={() => save(items.filter((x) => x.en !== it.en))} aria-label={`删除 ${it.en}`}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
