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
