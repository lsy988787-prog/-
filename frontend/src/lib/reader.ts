// 读文献：访问口令、论文接口、按需翻译、术语表、精读对话。
import { byokPayload, loadSettings, streamSSE, type ChatHandlers, type ChatMessage } from './chat'

const TOKEN_KEY = 'ai-reader-token'

export interface Block {
  id: string
  type: 'paragraph' | 'formula' | 'caption' | 'reference' | 'note'
  text: string
  page: number
}
export interface Section {
  id: string
  title: string
  blocks: Block[]
}
export interface Paper {
  id: string
  title: string
  pages: number
  source: string
  filename: string
  addedAt: string
  abstract: string
  sections: Section[]
}
export type PaperSummary = Pick<Paper, 'id' | 'title' | 'pages' | 'source' | 'filename' | 'addedAt'> & { blocks: number }
export interface GlossaryItem {
  en: string
  zh: string
}
export type Stage = 'question' | 'method' | 'result' | 'limitation'
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'question', label: '研究问题' },
  { id: 'method', label: '方法' },
  { id: 'result', label: '结果' },
  { id: 'limitation', label: '局限' },
]

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
export function setToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 无法保存时只在本次页面有效
  }
}

export class ReaderError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('X-Reader-Token', getToken())
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ReaderError(typeof data?.detail === 'string' ? data.detail : `请求失败（${res.status}）`, res.status)
  }
  return res.json() as Promise<T>
}

export const listPapers = () => call<{ papers: PaperSummary[] }>('/api/papers').then((r) => r.papers)
export const getPaper = (id: string) => call<Paper>(`/api/papers/${encodeURIComponent(id)}`)
export const deletePaper = (id: string) => call(`/api/papers/${encodeURIComponent(id)}`, { method: 'DELETE' })
export function uploadPaper(file: File) {
  const form = new FormData()
  form.append('file', file)
  return call<Paper>('/api/papers', { method: 'POST', body: form })
}
export const importArxiv = (url: string) => call<Paper>('/api/papers/arxiv', { method: 'POST', body: JSON.stringify({ url }) })
export const getGlossary = () => call<{ items: GlossaryItem[] }>('/api/glossary').then((r) => r.items)
export const saveGlossary = (items: GlossaryItem[]) =>
  call<{ items: GlossaryItem[] }>('/api/glossary', { method: 'PUT', body: JSON.stringify(items) }).then((r) => r.items)
export const translate = (paperId: string, text: string) =>
  call<{ translation: string; cached: boolean }>(`/api/papers/${encodeURIComponent(paperId)}/translate`, {
    method: 'POST',
    body: JSON.stringify({ text, byok: byokPayload(loadSettings()) }),
  })

export function pdfUrl(paperId: string) {
  return `/api/papers/${encodeURIComponent(paperId)}/pdf`
}

export interface ReaderChat {
  blockId: string | null
  mode: 'tutor' | 'ask'
  stage: Stage
  hintLevel: number
  messages: ChatMessage[]
}

export function streamReaderChat(paperId: string, req: ReaderChat, handlers: ChatHandlers, signal?: AbortSignal) {
  return streamSSE(
    `/api/papers/${encodeURIComponent(paperId)}/chat`,
    { ...req, byok: byokPayload(loadSettings()) },
    handlers,
    signal,
    { 'X-Reader-Token': getToken() },
  )
}
