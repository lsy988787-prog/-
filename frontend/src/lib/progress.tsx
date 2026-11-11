// 学习记录：已掌握、疑问、上次学习位置。先存浏览器 localStorage，以后接账号后同步到服务端。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { localDay, nextReview, parseReviewId, reviewId, type ReviewEntry } from './quiz'

export const STORAGE_KEY = 'ai-learning-progress-v1'

export interface Question { text: string; at: string }
export interface Progress {
  version: 1
  mastered: Record<string, string[]> // courseId -> conceptIds
  questions: Record<string, Question[]> // `${courseId}:${conceptId}` -> 疑问列表
  lastVisited: { courseId: string; conceptId: string } | null
  lastByCourse: Record<string, string> // courseId -> conceptId
  visited: Record<string, string[]> // courseId -> 打开过的 conceptIds
  quiz: Record<string, { correct: number; total: number; at: string }> // `${courseId}:${conceptId}` -> 最近一次小测
  review: Record<string, ReviewEntry> // reviewId -> 复习安排（只放答错过的题）
}

export type ConceptStatus = 'new' | 'learning' | 'mastered' | 'review'

const empty = (): Progress => ({
  version: 1, mastered: {}, questions: {}, lastVisited: null, lastByCourse: {}, visited: {}, quiz: {}, review: {},
})

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
  status: (courseId: string, conceptId: string) => ConceptStatus
  /** 记录一次节末小测；全对时自动标记掌握，答错的题进入复习队列。 */
  recordQuiz: (courseId: string, conceptId: string, results: { key: string; correct: boolean }[]) => void
  recordReview: (id: string, correct: boolean) => void
  dueReviews: (courseId: string, today?: string) => string[]
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
    setProgress((p) => {
      if (p.lastVisited?.courseId === courseId && p.lastVisited.conceptId === conceptId) return p
      const seen = p.visited[courseId] ?? []
      return {
        ...p,
        lastVisited: { courseId, conceptId },
        lastByCourse: { ...p.lastByCourse, [courseId]: conceptId },
        visited: seen.includes(conceptId) ? p.visited : { ...p.visited, [courseId]: [...seen, conceptId] },
      }
    })
  }, [])

  const status = useCallback(
    (courseId: string, conceptId: string): ConceptStatus => {
      const prefix = reviewId(courseId, conceptId, '')
      if (Object.keys(progress.review).some((id) => id.startsWith(prefix))) return 'review'
      if (progress.mastered[courseId]?.includes(conceptId)) return 'mastered'
      if (progress.visited[courseId]?.includes(conceptId) || progress.quiz[`${courseId}:${conceptId}`]) return 'learning'
      return 'new'
    },
    [progress],
  )

  const recordQuiz = useCallback((courseId: string, conceptId: string, results: { key: string; correct: boolean }[]) => {
    const today = localDay()
    setProgress((p) => {
      const review = { ...p.review }
      for (const r of results) {
        const id = reviewId(courseId, conceptId, r.key)
        if (!r.correct) review[id] = nextReview(undefined, false, today)!
      }
      const correct = results.filter((r) => r.correct).length
      const list = p.mastered[courseId] ?? []
      const allRight = correct === results.length && results.length > 0
      return {
        ...p,
        review,
        quiz: { ...p.quiz, [`${courseId}:${conceptId}`]: { correct, total: results.length, at: new Date().toISOString() } },
        mastered: allRight && !list.includes(conceptId) ? { ...p.mastered, [courseId]: [...list, conceptId] } : p.mastered,
      }
    })
  }, [])

  const recordReview = useCallback((id: string, correct: boolean) => {
    setProgress((p) => {
      const review = { ...p.review }
      const next = nextReview(review[id], correct, localDay())
      if (next) review[id] = next
      else delete review[id]
      return { ...p, review }
    })
  }, [])

  const dueReviews = useCallback(
    (courseId: string, today = localDay()) =>
      Object.entries(progress.review)
        .filter(([id, e]) => parseReviewId(id).courseId === courseId && e.due <= today)
        .sort(([, a], [, b]) => a.due.localeCompare(b.due))
        .map(([id]) => id),
    [progress],
  )

  const api = useMemo(
    () => ({ progress, isMastered, toggleMastered, addQuestion, removeQuestion, visit, status, recordQuiz, recordReview, dueReviews }),
    [progress, isMastered, toggleMastered, addQuestion, removeQuestion, visit, status, recordQuiz, recordReview, dueReviews],
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
