import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QuizQuestion } from '../components/Quiz'
import { findConcept } from '../lib/course'
import { useProgress } from '../lib/progress'
import { buildQuiz, parseReviewId } from '../lib/quiz'
import { useCourse } from './CourseLayout'

// 今日复习：之前答错、今天到期的题。答对一次就推迟（3 天、7 天），连对 3 次移出队列；答错从明天重新开始。
export default function ReviewPage() {
  const course = useCourse()
  const { dueReviews, recordReview } = useProgress()
  // 进入页面时定下今天要复习的题，答题过程中列表不跳动
  const [ids] = useState(() => dueReviews(course.id))
  const [done, setDone] = useState<Record<string, boolean>>({})

  const items = ids.flatMap((id) => {
    const { conceptId, key } = parseReviewId(id)
    const concept = findConcept(course, conceptId)
    const item = concept && buildQuiz(concept).find((it) => it.key === key)
    return concept && item ? [{ id, concept, item }] : []
  })
  const finished = Object.keys(done).length
  const right = Object.values(done).filter(Boolean).length

  return (
    <main className="page">
      <p className="eyebrow">{course.title}</p>
      <h1>今日复习</h1>
      {items.length === 0 ? (
        <p className="notice">今天没有要复习的题。小测里答错的题会在第二天出现在这里。</p>
      ) : (
        <>
          <p className="lead">
            {items.length} 道之前答错的题。答对的会隔几天再出现一次，连续答对 3 次就算真正掌握。
          </p>
          {items.map(({ id, concept, item }, i) => (
            <section key={id} className="quiz review-item">
              <p className="small muted">
                来自 <Link to={`/course/${course.id}/${concept.id}`}>{concept.title}</Link>
              </p>
              <QuizQuestion
                item={item}
                n={i + 1}
                onAnswer={(c) => {
                  recordReview(id, c)
                  setDone((d) => ({ ...d, [id]: c }))
                }}
              />
            </section>
          ))}
          {finished === items.length && (
            <div className="quiz-summary right" role="status">
              <strong>今天的复习完成了。</strong> 答对 {right}/{items.length}，答错的题明天会再出现。
              <Link to={`/course/${course.id}`}>回到课程</Link>
            </div>
          )}
        </>
      )}
    </main>
  )
}
