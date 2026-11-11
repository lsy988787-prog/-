import type { Concept, Course } from './types'

export function flatConcepts(course: Course): Concept[] {
  return course.chapters.flatMap((ch) => ch.concepts)
}

export function findConcept(course: Course, id: string): Concept | undefined {
  return flatConcepts(course).find((c) => c.id === id)
}

export function chapterOf(course: Course, concept: Concept) {
  return course.chapters.find((ch) => ch.id === concept.chapterId)!
}

// 搜索标题、简介和讲解正文
export function matches(concept: Concept, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [concept.title, concept.summary, concept.explanation].some((t) => t.toLowerCase().includes(q))
}

/** 推荐下一个该学的知识点：按课程顺序，第一个还没掌握、且前置知识都已掌握的；都卡住时退回第一个没掌握的。 */
export function recommendNext(course: Course, isMastered: (conceptId: string) => boolean): Concept | undefined {
  const pending = flatConcepts(course).filter((c) => !isMastered(c.id))
  return pending.find((c) => c.prerequisites.every((p) => isMastered(p) || !findConcept(course, p))) ?? pending[0]
}
