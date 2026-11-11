import { Link } from 'react-router-dom'
import { chapterOf, findConcept, flatConcepts, recommendNext } from '../lib/course'
import { useProgress } from '../lib/progress'
import { useCourse } from './CourseLayout'

export default function CourseOverview() {
  const course = useCourse()
  const { isMastered, progress } = useProgress()
  const all = flatConcepts(course)
  const done = all.filter((c) => isMastered(course.id, c.id)).length
  const next = recommendNext(course, (id) => isMastered(course.id, id))
  const lastId = progress.lastByCourse[course.id]
  const last = lastId && lastId !== next?.id ? findConcept(course, lastId) : undefined

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
      {next ? (
        <section className="today">
          <p className="eyebrow">今天学这个 · 已掌握 {done} / {all.length}</p>
          <h2>{next.title}</h2>
          <p>{next.summary}</p>
          <p className="small muted">
            第 {chapterOf(course, next).order} 章 {chapterOf(course, next).title} · 大约 15 分钟。AI 导师会先提问，你只要回答。
          </p>
          <div className="actions">
            <Link className="button primary" to={`/course/${course.id}/${next.id}?start=1`}>
              开始学习
            </Link>
            {last && (
              <Link className="link-button" to={`/course/${course.id}/${last.id}`}>
                回到上次看的：{last.title}
              </Link>
            )}
          </div>
        </section>
      ) : (
        <p className="notice">这门课的 {all.length} 个知识点你都掌握了，可以随时回来复习。</p>
      )}

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
