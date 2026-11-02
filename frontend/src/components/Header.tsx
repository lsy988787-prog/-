import { Link, useMatch, useNavigate } from 'react-router-dom'
import { fetchCourses } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useProgress } from '../lib/progress'

export default function Header() {
  const match = useMatch('/course/:courseId/*')
  const currentId = match?.params.courseId ?? ''
  const navigate = useNavigate()
  const { progress } = useProgress()
  const courses = useAsync(fetchCourses, [])

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <img src="/favicon.svg" alt="" width={24} height={24} />
        <span>AI 学习平台</span>
      </Link>
      {courses.status === 'ok' && courses.data.length > 0 && (
        <label className="subject-switch">
          <span className="visually-hidden">切换科目</span>
          <select
            value={currentId}
            onChange={(e) => {
              const id = e.target.value
              if (!id) return navigate('/')
              const last = progress.lastByCourse[id]
              navigate(last ? `/course/${id}/${last}` : `/course/${id}`)
            }}
          >
            <option value="">选择科目…</option>
            {courses.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subject} · {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
    </header>
  )
}
