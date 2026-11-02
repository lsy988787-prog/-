import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { fetchCourse } from '../lib/api'
import { matches } from '../lib/course'
import { useProgress } from '../lib/progress'
import type { Course } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import NotFound from './NotFound'

export function useCourse() {
  return useOutletContext<Course>()
}

export default function CourseLayout() {
  const { courseId = '' } = useParams()
  const state = useAsync(() => fetchCourse(courseId), [courseId])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { isMastered } = useProgress()

  // 手机上选完知识点后自动收起目录
  useEffect(() => setOpen(false), [location.pathname])

  if (state.status === 'loading') return <main className="page muted">正在加载课程…</main>
  if (state.status === 'error') return <NotFound message={`课程加载失败：${state.error}`} />
  const course = state.data

  return (
    <div className="course-layout">
      <button className="toc-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="toc">
        {open ? '收起目录' : '课程目录'}
      </button>
      <aside id="toc" className={`toc ${open ? 'open' : ''}`}>
        <NavLink end to={`/course/${course.id}`} className="toc-course">
          {course.title}
        </NavLink>
        <input
          type="search"
          className="toc-search"
          placeholder="搜索知识点"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索知识点"
        />
        <nav>
          {course.chapters.map((ch) => {
            const shown = ch.concepts.filter((c) => matches(c, query))
            if (shown.length === 0) return null
            return (
              <section key={ch.id}>
                <h3>
                  {ch.order}. {ch.title}
                </h3>
                <ol>
                  {shown.map((c) => (
                    <li key={c.id}>
                      <NavLink to={`/course/${course.id}/${c.id}`}>
                        <span className={`dot ${isMastered(course.id, c.id) ? 'done' : ''}`} aria-hidden />
                        <span>{c.title}</span>
                        {isMastered(course.id, c.id) && <span className="visually-hidden">（已掌握）</span>}
                      </NavLink>
                    </li>
                  ))}
                </ol>
              </section>
            )
          })}
        </nav>
      </aside>
      <div className="course-main">
        <Outlet context={course} />
      </div>
    </div>
  )
}
