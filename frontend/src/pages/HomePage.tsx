import { Link } from 'react-router-dom'
import { fetchCourses } from '../lib/api'
import { exportProgress, useProgress } from '../lib/progress'
import { useAsync } from '../lib/useAsync'

const LEVEL_ORDER = ['小学', '初中', '高中', '大学']

export default function HomePage() {
  const courses = useAsync(fetchCourses, [])
  const { progress } = useProgress()
  const last = progress.lastVisited

  return (
    <main className="page">
      <section className="hero">
        <h1>选一门课，开始学</h1>
        <p>每个知识点都有讲解、公式、分步例题和自测。卡住了就记下疑问，AI 导师会一步步追问引导你想明白（即将上线）。</p>
      </section>

      {last && (
        <Link className="continue" to={`/course/${last.courseId}/${last.conceptId}`}>
          继续上次的学习 →
        </Link>
      )}

      {courses.status === 'loading' && <p className="muted">正在加载课程…</p>}
      {courses.status === 'error' && <p className="notice error">课程加载失败：{courses.error}</p>}
      {courses.status === 'ok' && (
        <div className="course-grid">
          {[...courses.data]
            .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level))
            .map((c) => {
              const done = progress.mastered[c.id]?.length ?? 0
              return (
                <Link key={c.id} to={`/course/${c.id}`} className="course-card">
                  <div className="tags">
                    <span className="tag">{c.level}</span>
                    <span className="tag">{c.subject}</span>
                    {c.source === 'upload' && <span className="tag">我的课本</span>}
                  </div>
                  <h2>{c.title}</h2>
                  {c.description && <p>{c.description}</p>}
                  <div className="meter" aria-label={`已掌握 ${done} / ${c.conceptCount}`}>
                    <div style={{ width: `${(done / c.conceptCount) * 100}%` }} />
                  </div>
                  <span className="muted small">
                    {c.chapterCount} 章 · {c.conceptCount} 个知识点 · 已掌握 {done}
                  </span>
                </Link>
              )
            })}
        </div>
      )}

      <footer className="page-footer">
        <span>学习记录只保存在这台设备的浏览器里。</span>
        <button className="link-button" onClick={() => exportProgress(progress)}>
          导出学习记录
        </button>
      </footer>
    </main>
  )
}
