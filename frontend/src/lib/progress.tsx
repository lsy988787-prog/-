// 学习记录：已掌握、疑问、上次学习位置。先存浏览器 localStorage，以后接账号后同步到服务端。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const STORAGE_KEY = 'ai-learning-progress-v1'

export interface Question { text: string; at: string }
export interface Progress {
  version: 1
  mastered: Record<string, string[]> // courseId -> conceptIds
  questions: Record<string, Question[]> // `${courseId}:${conceptId}` -> 疑问列表
  lastVisited: { courseId: string; conceptId: string } | null
  lastByCourse: Record<string, string> // courseId -> conceptId
}

const empty = (): Progress => ({ version: 1, mastered: {}, questions: {}, lastVisited: null, lastByCourse: {} })

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const data = JSON.parse(raw)
    return data?.version === 1 ? { ...empty(), ...data } : empty()
  } catch {
    return empty()
  }
}

interface ProgressApi {
  progress: Progress
  isMastered: (courseId: string, conceptId: string) => boolean
  toggleMastered: (courseId: string, conceptId: string) => void
  addQuestion: (courseId: string, conceptId: string, text: string) => void
  removeQuestion: (courseId: string, conceptId: string, index: number) => void
  visit: (courseId: string, conceptId: string) => void
}

const Ctx = createContext<ProgressApi | null>(null)

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
    } catch {
      // 隐私模式等情况下无法写入，学习记录只保留在本次页面中
    }
  }, [progress])

  const isMastered = useCallback(
    (courseId: string, conceptId: string) => progress.mastered[courseId]?.includes(conceptId) ?? false,
    [progress],
  )

  const toggleMastered = useCallback((courseId: string, conceptId: string) => {
    setProgress((p) => {
      const list = p.mastered[courseId] ?? []
      const next = list.includes(conceptId) ? list.filter((id) => id !== conceptId) : [...list, conceptId]
      return { ...p, mastered: { ...p.mastered, [courseId]: next } }
    })
  }, [])

  const addQuestion = useCallback((courseId: string, conceptId: string, text: string) => {
    const key = `${courseId}:${conceptId}`
    setProgress((p) => ({
      ...p,
      questions: { ...p.questions, [key]: [...(p.questions[key] ?? []), { text, at: new Date().toISOString() }] },
    }))
  }, [])

  const removeQuestion = useCallback((courseId: string, conceptId: string, index: number) => {
    const key = `${courseId}:${conceptId}`
    setProgress((p) => ({
      ...p,
      questions: { ...p.questions, [key]: (p.questions[key] ?? []).filter((_, i) => i !== index) },
    }))
  }, [])

  const visit = useCallback((courseId: string, conceptId: string) => {
    setProgress((p) =>
      p.lastVisited?.courseId === courseId && p.lastVisited.conceptId === conceptId
        ? p
        : { ...p, lastVisited: { courseId, conceptId }, lastByCourse: { ...p.lastByCourse, [courseId]: conceptId } },
    )
  }, [])

  const api = useMemo(
    () => ({ progress, isMastered, toggleMastered, addQuestion, removeQuestion, visit }),
    [progress, isMastered, toggleMastered, addQuestion, removeQuestion, visit],
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useProgress(): ProgressApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useProgress 必须在 ProgressProvider 内使用')
  return api
}

export function exportProgress(progress: Progress) {
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `学习记录-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
