// 节末小测：判断题由“常见误区”自动生成（自动判分），简答题来自课程自测题（看参考答案后自己判对错）。
import type { Concept } from './types'

export type QuizItem =
  | { key: string; kind: 'judge'; statement: string; isTrue: boolean; explanation: string }
  | { key: string; kind: 'self'; question: string; answer: string; explanation?: string }

// 简单稳定的字符串哈希：同一题每次都抽到同一种说法，复习时不会变
function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return h
}

export function buildQuiz(concept: Concept): QuizItem[] {
  const judges: QuizItem[] = concept.misconceptions.map((m, i) => {
    const isTrue = hash(`${concept.id}#${i}`) % 2 === 0
    return {
      key: `m${i}`,
      kind: 'judge',
      statement: isTrue ? m.correct : m.wrong,
      isTrue,
      explanation: isTrue ? m.correct : `这是常见误区。${m.correct}`,
    }
  })
  const selfs: QuizItem[] = concept.practice.map((p, i) => ({
    key: `p${i}`,
    kind: 'self',
    question: p.question,
    answer: p.answer,
    explanation: p.explanation,
  }))
  return [...judges, ...selfs]
}

// 复习间隔（天）：答错后 1 天再来，之后答对一次就拉长，连对 3 次移出复习队列
export const REVIEW_INTERVALS = [1, 3, 7]

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(y, m - 1, d + n)
  return localDay(t)
}

export function localDay(t = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

export interface ReviewEntry {
  due: string // YYYY-MM-DD
  step: number // 已连续答对的次数
}

/** 复习题答完后的新状态；返回 null 表示已经掌握，移出队列。 */
export function nextReview(entry: ReviewEntry | undefined, correct: boolean, today: string): ReviewEntry | null {
  if (!correct) return { due: addDays(today, REVIEW_INTERVALS[0]), step: 0 }
  const step = (entry?.step ?? 0) + 1
  if (step >= REVIEW_INTERVALS.length) return null
  return { due: addDays(today, REVIEW_INTERVALS[step]), step }
}

export const reviewId = (courseId: string, conceptId: string, key: string) => `${courseId}|${conceptId}|${key}`
export function parseReviewId(id: string) {
  const [courseId, conceptId, key] = id.split('|')
  return { courseId, conceptId, key }
}
