import { describe, expect, it } from 'vitest'
import { addDays, buildQuiz, nextReview, parseReviewId, reviewId } from './quiz'
import type { Concept } from './types'

const concept = {
  id: 'line-parameters',
  misconceptions: [
    { wrong: '错说法一', correct: '对说法一' },
    { wrong: '错说法二', correct: '对说法二' },
  ],
  practice: [{ question: '算一算', answer: '42', explanation: '因为' }],
} as unknown as Concept

describe('buildQuiz', () => {
  it('两道判断题来自误区，一道简答题来自自测', () => {
    const q = buildQuiz(concept)
    expect(q.map((x) => x.kind)).toEqual(['judge', 'judge', 'self'])
    for (const [i, it] of q.slice(0, 2).entries()) {
      if (it.kind !== 'judge') throw new Error()
      const m = concept.misconceptions[i]
      expect(it.statement).toBe(it.isTrue ? m.correct : m.wrong)
      expect(it.explanation).toContain(m.correct)
    }
  })
  it('同一知识点每次生成相同的题', () => {
    expect(buildQuiz(concept)).toEqual(buildQuiz(concept))
  })
})

describe('复习安排', () => {
  it('跨月加天数', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05')
  })
  it('答错明天再来，答对依次推迟 3、7 天，连对 3 次移出', () => {
    const t = '2026-11-12'
    const e0 = nextReview(undefined, false, t)!
    expect(e0).toEqual({ due: '2026-11-13', step: 0 })
    const e1 = nextReview(e0, true, '2026-11-13')!
    expect(e1).toEqual({ due: '2026-11-16', step: 1 })
    const e2 = nextReview(e1, true, '2026-11-16')!
    expect(e2).toEqual({ due: '2026-11-23', step: 2 })
    expect(nextReview(e2, true, '2026-11-23')).toBeNull()
    expect(nextReview(e2, false, '2026-11-23')).toEqual({ due: '2026-11-24', step: 0 })
  })
  it('复习 ID 可以拆回来', () => {
    expect(parseReviewId(reviewId('c', 'k', 'm1'))).toEqual({ courseId: 'c', conceptId: 'k', key: 'm1' })
  })
})
