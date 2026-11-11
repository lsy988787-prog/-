import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchChatConfig, loadSettings, saveSettings, streamChat, type ChatConfig, type ChatMessage, type ModelSettings } from '../lib/chat'
import type { Concept } from '../lib/types'
import ModelSettingsForm from './ModelSettingsForm'
import RichText from './RichText'

const LEVELS = ['追问', '指方向', '给一步', '讲透']
const TOP = LEVELS.length - 1

// 快捷回答：学生不用自己组织语言。“我不懂”最多升到“给一步”，只有主动点“给个提示”才会讲透。
interface Quick {
  label: (level: number) => string
  text: (level: number) => string
  next: (level: number) => number
  disabled?: (level: number) => boolean
}
const QUICK: Quick[] = [
  { label: () => '我不懂', text: () => '我不太懂，能换个更简单的说法吗？', next: (l) => Math.max(l, Math.min(l + 1, TOP - 1)) },
  {
    label: (l) => (l === TOP - 1 ? '看完整讲解' : '给个提示'),
    text: (l) => (l === TOP - 1 ? '我还是想不出来，请完整讲一遍。' : '我卡住了，能给个提示吗？'),
    next: (l) => Math.min(l + 1, TOP),
    disabled: (l) => l >= TOP,
  },
  { label: () => '换个例子', text: () => '能换个例子说明吗？', next: (l) => l },
]
const HISTORY_PREFIX = 'ai-tutor-v1:'
const MAX_SAVED = 40

interface Saved {
  messages: ChatMessage[]
  hintLevel: number
}

function loadSaved(key: string): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(HISTORY_PREFIX + key) ?? 'null')
    if (Array.isArray(s?.messages)) return { messages: s.messages, hintLevel: Number(s.hintLevel) || 0 }
  } catch {
    // 忽略
  }
  return { messages: [], hintLevel: 0 }
}

interface Props {
  courseId: string
  concept: Concept
  open: boolean
  draft: string
  onClose: () => void
}

// AI 导师面板：桌面端在右侧，手机上占满屏幕。每个知识点的对话分别保存在本机浏览器。
export default function TutorPanel({ courseId, concept, open, draft, onClose }: Props) {
  const key = `${courseId}:${concept.id}`
  const [saved, setSaved] = useState<Saved>(() => loadSaved(key))
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [config, setConfig] = useState<ChatConfig | null>(null)
  const [settings, setSettings] = useState<ModelSettings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const startedRef = useRef(new Set<string>())

  // 换知识点时切换到该知识点的对话
  useEffect(() => {
    abortRef.current?.abort()
    setSaved(loadSaved(key))
    setStreaming('')
    setError('')
    setBusy(false)
  }, [key])

  useEffect(() => {
    try {
      if (saved.messages.length === 0) localStorage.removeItem(HISTORY_PREFIX + key)
      else localStorage.setItem(HISTORY_PREFIX + key, JSON.stringify({ ...saved, messages: saved.messages.slice(-MAX_SAVED) }))
    } catch {
      // 无法保存时对话只保留在本次页面
    }
  }, [key, saved])

  useEffect(() => {
    if (!open) return
    fetchChatConfig().then(setConfig, () => setConfig(null))
    if (draft) setInput(draft)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open, draft])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [saved.messages, streaming])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 发一轮对话。text 为空表示让导师先开口（对话还没开始时）。
  const send = useCallback(
    async (text: string, hintLevel: number) => {
      const content = text.trim()
      if (busy || (!content && saved.messages.length > 0)) return
      const messages: ChatMessage[] = content ? [...saved.messages, { role: 'user', content }] : []
      setSaved({ messages, hintLevel })
      setInput('')
      setError('')
      setBusy(true)
      setStreaming('')
      const ctrl = new AbortController()
      abortRef.current = ctrl
      let reply = ''
      try {
        await streamChat(
          { courseId, conceptId: concept.id, messages, hintLevel, settings },
          {
            onDelta: (t) => {
              reply += t
              setStreaming(reply)
            },
            onDone: (remaining) => {
              if (remaining !== null) setConfig((c) => (c ? { ...c, remaining } : c))
            },
          },
          ctrl.signal,
        )
        setSaved({ messages: [...messages, { role: 'assistant', content: reply }], hintLevel })
      } catch (e) {
        if (ctrl.signal.aborted) return
        // 失败时撤回这条提问，放回输入框，方便重发
        setSaved({ messages: saved.messages, hintLevel: saved.hintLevel })
        if (content) setInput(content)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!ctrl.signal.aborted) {
          setBusy(false)
          setStreaming('')
        }
      }
    },
    [busy, saved, courseId, concept.id, settings],
  )

  const noModel = settings.mode === 'platform' && config !== null && !config.platformAvailable
  const quotaOut = settings.mode === 'platform' && config !== null && config.remaining === 0
  const empty = saved.messages.length === 0

  // 打开一个还没开始的对话时，导师先开口提第一个问题；学生带着自己的问题进来时不抢话
  useEffect(() => {
    if (!open || !empty || busy || draft || !config || noModel || quotaOut || startedRef.current.has(key)) return
    startedRef.current.add(key)
    send('', 0)
  }, [open, empty, busy, draft, config, noModel, quotaOut, key, send])

  const reset = () => {
    startedRef.current.delete(key)
    abortRef.current?.abort()
    setSaved({ messages: [], hintLevel: 0 })
    setBusy(false)
    setStreaming('')
    setError('')
  }

  if (!open) return null

  const starters = concept.aiGuidance?.guidingQuestions ?? []

  return (
    <aside className="tutor" role="dialog" aria-label="AI 导师">
      <header className="tutor-head">
        <div>
          <strong>AI 导师</strong>
          <span className="muted small"> · {concept.title}</span>
        </div>
        <div className="tutor-head-actions">
          <button className="link-button" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            模型设置
          </button>
          {!empty && (
            <button className="link-button" onClick={reset}>
              新对话
            </button>
          )}
          <button className="icon-button" onClick={onClose} aria-label="关闭 AI 导师">
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

      <div className="tutor-list" ref={listRef} aria-live="polite">
        {empty && !busy && (
          <div className="tutor-intro">
            <p>我不会直接告诉你答案，而是一步步提问，帮你自己想明白。你只要回答我的问题就行，说错了也没关系。</p>
            {!noModel && !quotaOut && (
              <button className="button primary" onClick={() => send('', 0)}>
                开始，请导师先提问
              </button>
            )}
            {starters.length > 0 && <p className="small muted">也可以从这些问题开始：</p>}
            {starters.map((q) => (
              <button key={q} className="starter" onClick={() => send(q, 0)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
        )}
        {saved.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}
          </div>
        ))}
        {busy && (
          <div className="bubble assistant">
            {streaming ? <RichText text={streaming} /> : <p className="muted">{empty ? '导师正在准备第一个问题…' : '正在思考…'}</p>}
          </div>
        )}
      </div>

      {error && (
        <p className="notice error tutor-notice" role="alert">
          {error}
        </p>
      )}
      {!error && noModel && <p className="notice tutor-notice">平台 AI 导师暂未开通。可以在“模型设置”里填写自己的 API 密钥使用。</p>}
      {!error && !noModel && quotaOut && <p className="notice tutor-notice">今天的免费额度已用完，明天再来，或在“模型设置”里改用自己的密钥。</p>}

      <div className="tutor-foot">
        {!empty && (
          <div className="quick-replies" role="group" aria-label="快捷回答">
            {QUICK.map((q, i) => (
              <button
                key={i}
                className="quick"
                type="button"
                onClick={() => send(q.text(saved.hintLevel), q.next(saved.hintLevel))}
                disabled={busy || q.disabled?.(saved.hintLevel)}
              >
                {q.label(saved.hintLevel)}
              </button>
            ))}
          </div>
        )}
        <div className="tutor-meta small muted">
          <span title="点“我不懂”或“给个提示”会逐级多讲一些">
            提示等级：{LEVELS[saved.hintLevel]}（{saved.hintLevel + 1}/4）
          </span>
          {settings.mode === 'platform' && config?.platformAvailable && (
            <span>
              今日剩余 {config.remaining}/{config.dailyLimit}
            </span>
          )}
          {settings.mode === 'byok' && <span>使用自己的密钥</span>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input, saved.hintLevel)
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(input, saved.hintLevel)
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={empty ? '也可以直接写下你的问题' : '回答导师的问题，说错了也没关系（Enter 发送）'}
            aria-label="给 AI 导师的消息"
          />
          <div className="actions">
            <button className="button primary" type="submit" disabled={busy || !input.trim()}>
              发送
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
        <p className="small muted tutor-disclaimer">AI 可能出错，数值和结论请以课程内容和老师讲解为准。</p>
      </div>
    </aside>
  )
}
