import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchChatConfig, loadSettings, saveSettings, streamChat, type ChatConfig, type ChatMessage, type ModelSettings } from '../lib/chat'
import type { Concept } from '../lib/types'
import RichText from './RichText'

const LEVELS = ['追问', '指方向', '给一步', '讲透']
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

  const send = useCallback(
    async (text: string, hintLevel: number) => {
      const content = text.trim()
      if (!content || busy) return
      const messages: ChatMessage[] = [...saved.messages, { role: 'user', content }]
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
        setInput(content)
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

  const askHint = () => {
    const level = Math.min(saved.hintLevel + 1, LEVELS.length - 1)
    send(level === 3 ? '我还是想不出来，请完整讲一遍。' : '我卡住了，能再给点提示吗？', level)
  }

  const reset = () => {
    abortRef.current?.abort()
    setSaved({ messages: [], hintLevel: 0 })
    setBusy(false)
    setStreaming('')
    setError('')
  }

  if (!open) return null

  const starters = concept.aiGuidance?.guidingQuestions ?? []
  const noModel = settings.mode === 'platform' && config && !config.platformAvailable
  const quotaOut = settings.mode === 'platform' && config && config.remaining === 0

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
          {saved.messages.length > 0 && (
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
        {saved.messages.length === 0 && !busy && (
          <div className="tutor-intro">
            <p>我不会直接告诉你答案，而是通过提问帮你自己想明白。先说说你对“{concept.title}”的理解，或者从下面挑一个问题开始：</p>
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
        {busy && <div className="bubble assistant">{streaming ? <RichText text={streaming} /> : <p className="muted">正在思考…</p>}</div>}
      </div>

      {error && (
        <p className="notice error tutor-notice" role="alert">
          {error}
        </p>
      )}
      {!error && noModel && <p className="notice tutor-notice">平台 AI 导师暂未开通。可以在“模型设置”里填写自己的 API 密钥使用。</p>}
      {!error && !noModel && quotaOut && <p className="notice tutor-notice">今天的免费额度已用完，明天再来，或在“模型设置”里改用自己的密钥。</p>}

      <div className="tutor-foot">
        <div className="tutor-meta small muted">
          <span title="点“再给点提示”会逐级多讲一些">
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
            placeholder="写下你的想法或问题（Enter 发送，Shift+Enter 换行）"
            aria-label="给 AI 导师的消息"
          />
          <div className="actions">
            <button className="button primary" type="submit" disabled={busy || !input.trim()}>
              发送
            </button>
            <button
              className="button"
              type="button"
              onClick={askHint}
              disabled={busy || saved.messages.length === 0 || saved.hintLevel >= LEVELS.length - 1}
            >
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
        <p className="small muted tutor-disclaimer">AI 可能出错，数值和结论请以课程内容和老师讲解为准。</p>
      </div>
    </aside>
  )
}

function ModelSettingsForm({ config, settings, onSave }: { config: ChatConfig | null; settings: ModelSettings; onSave: (s: ModelSettings) => void }) {
  const providers = config?.providers ?? []
  const [mode, setMode] = useState(settings.mode)
  const [provider, setProvider] = useState(settings.mode === 'byok' ? settings.provider : 'deepseek')
  const current = providers.find((p) => p.id === provider)
  const [model, setModel] = useState(settings.mode === 'byok' ? settings.model : '')
  const [apiKey, setApiKey] = useState(settings.mode === 'byok' ? settings.apiKey : '')
  const effectiveModel = current?.models.includes(model) ? model : (current?.models[0] ?? '')

  return (
    <form
      className="tutor-settings"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(mode === 'platform' ? { mode } : { mode, provider, model: effectiveModel, apiKey: apiKey.trim() })
      }}
    >
      <label className="radio">
        <input type="radio" name="mode" checked={mode === 'platform'} onChange={() => setMode('platform')} />
        平台免费额度{config && !config.platformAvailable ? '（暂未开通）' : ''}
      </label>
      <label className="radio">
        <input type="radio" name="mode" checked={mode === 'byok'} onChange={() => setMode('byok')} />
        使用自己的 API 密钥
      </label>
      {mode === 'byok' && (
        <div className="byok-fields">
          <label>
            服务商
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            模型
            <select value={effectiveModel} onChange={(e) => setModel(e.target.value)}>
              {current?.models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            API 密钥
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="sk-..." />
          </label>
          <p className="small muted">密钥只保存在这台设备的浏览器里，提问时经本站服务器转发给服务商，服务器不保存。公用电脑上用完请清除。</p>
        </div>
      )}
      <div className="actions">
        <button className="button primary" type="submit" disabled={mode === 'byok' && (!apiKey.trim() || !effectiveModel)}>
          保存
        </button>
        {settings.mode === 'byok' && (
          <button className="link-button" type="button" onClick={() => onSave({ mode: 'platform' })}>
            清除我的密钥
          </button>
        )}
      </div>
    </form>
  )
}
