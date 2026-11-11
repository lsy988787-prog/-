import { describe, expect, it } from 'vitest'
import { recommendNext } from './course'
import type { Concept, Course } from './types'

const concept = (id: string, prerequisites: string[] = []) => ({ id, prerequisites }) as unknown as Concept
const course = {
  chapters: [
    { id: 'c1', concepts: [concept('a'), concept('b', ['a']), concept('c', ['x'])] },
    { id: 'c2', concepts: [concept('d', ['b', 'c'])] },
  ],
} as unknown as Course

describe('recommendNext', () => {
  it('从第一个没掌握的开始', () => {
    expect(recommendNext(course, () => false)?.id).toBe('a')
  })
  it('跳过前置知识还没学完的知识点', () => {
    const mastered = new Set(['a'])
    expect(recommendNext(course, (id) => mastered.has(id))?.id).toBe('b')
    const m2 = new Set(['a', 'b'])
    expect(recommendNext(course, (id) => m2.has(id))?.id).toBe('c') // 课程里不存在的前置知识不挡路
  })
  it('跳过已掌握的', () => {
    const m = new Set(['a', 'c'])
    expect(recommendNext(course, (id) => m.has(id))?.id).toBe('b')
  })
  it('全部掌握时没有推荐', () => {
    expect(recommendNext(course, () => true)).toBeUndefined()
  })
})
