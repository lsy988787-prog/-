import { useCallback, useEffect, useRef, useState } from 'react'
import ModelSettingsForm from '../../components/ModelSettingsForm'
import RichText from '../../components/RichText'
import { fetchChatConfig, loadSettings, saveSettings, type ChatConfig, type ModelSettings } from '../../lib/chat'
import { STAGES, streamReaderChat, type Block, type Stage } from '../../lib/reader'

const LEVELS = ['追问', '指方向', '讲难点', '讲透']
const STARTERS: Record<Stage, string[]> = {
  question: ['这篇论文要解决什么问题？我先说说我的理解。', '这一段和研究问题有什么关系？'],
  method: ['这段方法的关键一步是什么？', '这里用了哪些假设？'],
  result: ['这段结果能支撑作者的结论吗？', '和别的方法相比好在哪里？'],
  limitation: ['这个方法在什么情况下会失效？', '还有哪些地方值得怀疑？'],
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
  ref?: string // 提问时对应的段落，如 "2 Sensitivity Model · 第 3 段"
}
interface Saved {
  messages: Msg[]
  hintLevel: number
}

const KEY = (id: string) => `ai-reader-chat-v1:${id}`
function load(id: string): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY(id)) ?? 'null')
    if (Array.isArray(s?.messages)) return { messages: s.messages, hintLevel: Number(s.hintLevel) || 0 }
  } catch {
    // 忽略
  }
  return { messages: [], hintLevel: 0 }
}

export interface AskRequest {
  text: string
  nonce: number
  mode: 'tutor' | 'ask'
  send: boolean // false 时只填进输入框，让读者补全问题
}

interface Props {
  paperId: string
  block: Block | null
  blockRef: string
  stage: Stage
  onStage: (s: Stage) => void
  ask: AskRequest | null
  open: boolean
  onClose: () => void
}

// 右栏导师：苏格拉底式精读（绑定当前段落）和划词提问共用一个对话，保存在本机浏览器。
export default function ReaderPanel({ paperId, block, blockRef, stage, onStage, ask, open, onClose }: Props) {
  const [saved, setSaved] = useState<Saved>(() => load(paperId))
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<ModelSettings>(loadSettings)
  const [config, setConfig] = useState<ChatConfig | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastAsk = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      if (saved.messages.length) localStorage.setItem(KEY(paperId), JSON.stringify({ ...saved, messages: saved.messages.slice(-60) }))
      else localStorage.removeItem(KEY(paperId))
    } catch {
      // 忽略
    }
  }, [paperId, saved])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [saved.messages, streaming])

  useEffect(() => {
    if (showSettings && !config) fetchChatConfig().then(setConfig, () => undefined)
  }, [showSettings, config])

  const send = useCallback(
    async (text: string, mode: 'tutor' | 'ask', hintLevel = saved.hintLevel) => {
      const content = text.trim()
      if (!content || busy) return
      const prev = saved.messages
      const messages: Msg[] = [...prev, { role: 'user', content, ref: block ? blockRef : undefined }]
      setSaved({ messages, hintLevel })
      setInput('')
      setError('')
      setBusy(true)
      setStreaming('')
      const ctrl = new AbortController()
      abortRef.current = ctrl
      let reply = ''
      try {
        await streamReaderChat(
          paperId,
          { blockId: block?.id ?? null, mode, stage, hintLevel, messages: messages.map(({ role, content }) => ({ role, content })) },
          { onDelta: (t) => setStreaming((reply += t)), onDone: () => undefined },
          ctrl.signal,
        )
        setSaved({ messages: [...messages, { role: 'assistant', content: reply }], hintLevel })
      } catch (e) {
        if (ctrl.signal.aborted) return
        setSaved({ messages: prev, hintLevel: saved.hintLevel })
        setInput(content)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!ctrl.signal.aborted) {
          setBusy(false)
          setStreaming('')
        }
      }
    },
    [busy, saved, block, blockRef, paperId, stage],
  )

  // 从原文划词发来的提问
  useEffect(() => {
    if (ask && ask.nonce !== lastAsk.current && !busy) {
      lastAsk.current = ask.nonce
      if (ask.send) send(ask.text, ask.mode)
      else {
        setInput(ask.text)
        inputRef.current?.focus()
      }
    }
  }, [ask, busy, send])

  const hint = () => {
    const level = Math.min(saved.hintLevel + 1, 3)
    send(level === 3 ? '我还是没读懂，请把这段完整讲一遍。' : '我卡住了，能再给点提示吗？', 'tutor', level)
  }

  return (
    <aside className={`reader-panel ${open ? 'open' : ''}`} aria-label="精读导师">
      <header className="tutor-head">
        <strong>精读导师</strong>
        <div className="tutor-head-actions">
          <button className="link-button" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            模型设置
          </button>
          {saved.messages.length > 0 && (
            <button
              className="link-button"
              onClick={() => {
                abortRef.current?.abort()
                setBusy(false)
                setStreaming('')
                setSaved({ messages: [], hintLevel: 0 })
              }}
            >
              新对话
            </button>
          )}
          <button className="icon-button reader-close" onClick={onClose} aria-label="收起导师">
            ✕
          </button>
        </div>
      </header>
      {showSettings && (
        <ModelSettingsForm
          config={config}
          settings={settings}
          onSave={(s) => {
            setSettings(s)
            saveSettings(s)
            setShowSettings(false)
            setError('')
          }}
        />
      )}
      <div className="stage-tabs" role="tablist" aria-label="精读目标">
        {STAGES.map((s) => (
          <button key={s.id} role="tab" aria-selected={stage === s.id} className={stage === s.id ? 'active' : ''} onClick={() => onStage(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="current-block small muted">{block ? `当前段落：${blockRef}` : '点左侧任意一段，导师就围绕那一段提问。'}</p>

      <div className="tutor-list" ref={listRef} aria-live="polite">
        {saved.messages.length === 0 && !busy && (
          <div className="tutor-intro">
            <p>我不会替你翻译全文，而是陪你一段一段读懂。选一个问题开始，或者先用自己的话说说这段在讲什么：</p>
            {STARTERS[stage].map((q) => (
              <button key={q} className="starter" onClick={() => send(q, 'tutor')} disabled={!block}>
                {q}
              </button>
            ))}
          </div>
        )}
        {saved.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.ref && m.role === 'user' && <p className="bubble-ref">{m.ref}</p>}
            {m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}
          </div>
        ))}
        {busy && <div className="bubble assistant">{streaming ? <RichText text={streaming} /> : <p className="muted">正在思考…</p>}</div>}
      </div>

      {error && (
        <p className="notice error tutor-notice" role="alert">
          {error}
        </p>
      )}
      <div className="tutor-foot">
        <div className="tutor-meta small muted">
          <span>提示等级：{LEVELS[saved.hintLevel]}（{saved.hintLevel + 1}/4）</span>
          <span>{settings.mode === 'byok' ? '使用自己的密钥' : '平台模型'}</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input, 'tutor')
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(input, 'tutor')
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="说说你的理解或问题（Enter 发送）"
            aria-label="给精读导师的消息"
          />
          <div className="actions">
            <button className="button primary" type="submit" disabled={busy || !input.trim()}>
              发送
            </button>
            <button className="button" type="button" onClick={hint} disabled={busy || saved.messages.length === 0 || saved.hintLevel >= 3}>
              再给点提示
            </button>
            {busy && (
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  abortRef.current?.abort()
                  setBusy(false)
                  setStreaming('')
                  setSaved((s) => ({ ...s, messages: s.messages.slice(0, -1) }))
                }}
              >
                停止
              </button>
            )}
          </div>
        </form>
      </div>
    </aside>
  )
}
