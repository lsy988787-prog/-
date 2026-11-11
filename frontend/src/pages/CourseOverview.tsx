import { Link } from 'react-router-dom'
import { chapterOf, findConcept, flatConcepts, recommendNext } from '../lib/course'
import { useProgress, type ConceptStatus } from '../lib/progress'

const STATUS_LABEL: Record<ConceptStatus, string> = { new: '未学', learning: '学习中', mastered: '已掌握', review: '待复习' }
import { useCourse } from './CourseLayout'

export default function CourseOverview() {
  const course = useCourse()
  const { isMastered, progress, status, dueReviews } = useProgress()
  const due = dueReviews(course.id).length
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
      {due > 0 && (
        <Link className="review-banner" to={`/course/${course.id}/review`}>
          <strong>今天有 {due} 道题要复习</strong>
          <span>之前答错的题，几分钟就能做完 →</span>
        </Link>
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

      <h2 className="map-title">知识点地图</h2>
      <ul className="map-legend" aria-label="图例">
        {(Object.keys(STATUS_LABEL) as ConceptStatus[]).map((st) => (
          <li key={st}>
            <span className={`dot ${st}`} aria-hidden /> {STATUS_LABEL[st]}
          </li>
        ))}
        <li className="muted">虚线框：前置知识还没掌握</li>
      </ul>
      {course.chapters.map((ch) => {
        const mastered = ch.concepts.filter((c) => isMastered(course.id, c.id)).length
        return (
          <section key={ch.id} className="chapter-block">
            <h3 className="map-chapter">
              第 {ch.order} 章 {ch.title}
              <span className="muted small">
                {' '}
                {mastered}/{ch.concepts.length}
              </span>
            </h3>
            <ol className="concept-map">
              {ch.concepts.map((c) => {
                const st = status(course.id, c.id)
                const missing = c.prerequisites.filter((p) => !isMastered(course.id, p)).map((p) => findConcept(course, p)?.title).filter(Boolean)
                const locked = st === 'new' && missing.length > 0
                return (
                  <li key={c.id}>
                    <Link
                      to={`/course/${course.id}/${c.id}`}
                      className={`map-node ${st} ${locked ? 'locked' : ''} ${c.id === next?.id ? 'next' : ''}`}
                      title={locked ? `建议先学：${missing.join('、')}` : c.summary}
                    >
                      <span className={`dot ${st}`} aria-hidden />
                      <span>{c.title}</span>
                      <span className="visually-hidden">（{STATUS_LABEL[st]}）</span>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </main>
  )
}
