import type { Course, CourseSummary } from './types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `请求失败（${res.status}）`)
  }
  return res.json() as Promise<T>
}

export const fetchCourses = () => getJson<{ courses: CourseSummary[] }>('/api/courses').then((r) => r.courses)

const cache = new Map<string, Promise<Course>>()
export function fetchCourse(id: string): Promise<Course> {
  if (!cache.has(id)) {
    const p = getJson<Course>(`/api/courses/${encodeURIComponent(id)}`)
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return cache.get(id)!
}
