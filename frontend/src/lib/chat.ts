// AI 导师：模型设置、匿名使用者 ID、流式对话请求。
// 密钥（BYOK）只存在这台设备的浏览器里，每次提问时随请求发给本站服务端转发，服务端不保存。

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Provider {
  id: string
  label: string
  models: string[]
}

export interface ChatConfig {
  platformAvailable: boolean
  dailyLimit: number
  remaining: number
  providers: Provider[]
}

export type ModelSettings = { mode: 'platform' } | { mode: 'byok'; provider: string; model: string; apiKey: string }

const SETTINGS_KEY = 'ai-learning-model-v1'
const CLIENT_KEY = 'ai-learning-client-id'

export function loadSettings(): ModelSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (s?.mode === 'byok' && s.provider && s.model && typeof s.apiKey === 'string') return s
  } catch {
    // 忽略损坏的设置
  }
  return { mode: 'platform' }
}

export function saveSettings(s: ModelSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // 无法写入时只在本次页面有效
  }
}

let memoryClientId: string | null = null
export function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CLIENT_KEY, id)
    }
    return id
  } catch {
    memoryClientId ??= crypto.randomUUID()
    return memoryClientId
  }
}

export async function fetchChatConfig(): Promise<ChatConfig> {
  const res = await fetch('/api/chat/config', { headers: { 'X-Client-Id': clientId() } })
  if (!res.ok) throw new Error(`读取 AI 导师设置失败（${res.status}）`)
  return res.json()
}

export interface ChatRequest {
  courseId: string
  conceptId: string
  messages: ChatMessage[]
  hintLevel: number
  settings: ModelSettings
}

export interface ChatHandlers {
  onDelta: (text: string) => void
  onDone: (remaining: number | null) => void
}

/** 发送一轮对话并逐段回调。出错时抛出带中文说明的 Error。 */
export async function streamChat(req: ChatRequest, handlers: ChatHandlers, signal?: AbortSignal) {
  const { settings, ...rest } = req
  const body = {
    ...rest,
    byok: settings.mode === 'byok' ? { provider: settings.provider, model: settings.model, apiKey: settings.apiKey } : null,
  }
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId() },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    const detail = typeof data?.detail === 'string' ? data.detail : `AI 导师暂时无法回答（${res.status}）`
    throw new Error(detail)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let finished = false
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let cut: number
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      if (!raw.startsWith('data: ')) continue
      const ev = JSON.parse(raw.slice(6))
      if (ev.error) throw new Error(ev.error)
      if (typeof ev.delta === 'string') handlers.onDelta(ev.delta)
      if (ev.done) {
        finished = true
        handlers.onDone(ev.remaining ?? null)
      }
    }
  }
  if (!finished) throw new Error('连接中断，回答可能不完整。')
}
