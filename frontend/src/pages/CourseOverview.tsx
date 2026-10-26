import { Link } from 'react-router-dom'
import { flatConcepts } from '../lib/course'
import { useProgress } from '../lib/progress'
import { useCourse } from './CourseLayout'

export default function CourseOverview() {
  const course = useCourse()
  const { isMastered, progress } = useProgress()
  const all = flatConcepts(course)
  const done = all.filter((c) => isMastered(course.id, c.id)).length
  const next = all.find((c) => !isMastered(course.id, c.id))
  const last = progress.lastByCourse[course.id]

  return (
    <main className="page">
      <p className="eyebrow">
        {course.level} · {course.subject}
      </p>
      <h1>{course.title}</h1>
      {course.description && <p className="lead">{course.description}</p>}
      {course.reviewStatus !== 'teacher-reviewed' && (
        <p className="notice">本课程内容为教学草稿，正在由教师审校中，如发现错误欢迎记下疑问。</p>
      )}
      <div className="actions">
        {last ? (
          <Link className="button primary" to={`/course/${course.id}/${last}`}>
            继续学习
          </Link>
        ) : (
          next && (
            <Link className="button primary" to={`/course/${course.id}/${next.id}`}>
              从第一个知识点开始
            </Link>
          )
        )}
        <span className="muted">
          已掌握 {done} / {all.length}
        </span>
      </div>

      {course.chapters.map((ch) => (
        <section key={ch.id} className="chapter-block">
          <h2>
            第 {ch.order} 章 {ch.title}
          </h2>
          {ch.description && <p className="muted">{ch.description}</p>}
          <ul className="concept-list">
            {ch.concepts.map((c) => (
              <li key={c.id}>
                <Link to={`/course/${course.id}/${c.id}`}>
                  <span className={`dot ${isMastered(course.id, c.id) ? 'done' : ''}`} aria-hidden />
                  <strong>{c.title}</strong>
                  <span className="muted">{c.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
