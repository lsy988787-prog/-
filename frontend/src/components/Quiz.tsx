import { useEffect, useMemo, useState } from 'react'
import { useProgress } from '../lib/progress'
import { buildQuiz, type QuizItem } from '../lib/quiz'
import type { Concept } from '../lib/types'

interface QuestionProps {
  item: QuizItem
  n?: number
  onAnswer: (correct: boolean) => void
  onAskTutor?: (text: string) => void
}

// 一道题：判断题点“对/错”立即判分；简答题先自己想，看参考答案后自己判断对错
export function QuizQuestion({ item, n, onAnswer, onAskTutor }: QuestionProps) {
  const [result, setResult] = useState<boolean | null>(null)
  const [revealed, setRevealed] = useState(false)
  const answer = (correct: boolean) => {
    if (result !== null) return
    setResult(correct)
    onAnswer(correct)
  }
  const label = n ? `${n}. ` : ''

  if (item.kind === 'judge') {
    return (
      <div className={`quiz-q ${result === null ? '' : result ? 'right' : 'wrong'}`}>
        <p className="quiz-kind">判断题</p>
        <p className="prose">
          {label}这句话对吗？“{item.statement}”
        </p>
        <div className="actions">
          {[true, false].map((v) => (
            <button key={String(v)} className="button" onClick={() => answer(v === item.isTrue)} disabled={result !== null}>
              {v ? '对' : '错'}
            </button>
          ))}
        </div>
        {result !== null && (
          <Feedback correct={result} onAskTutor={onAskTutor} question={`判断题“${item.statement}”`}>
            这句话是{item.isTrue ? '对' : '错'}的。{item.explanation}
          </Feedback>
        )}
      </div>
    )
  }

  return (
    <div className={`quiz-q ${result === null ? '' : result ? 'right' : 'wrong'}`}>
      <p className="quiz-kind">简答题 · 先自己想一想或算一算</p>
      <p className="prose">
        {label}
        {item.question}
      </p>
      {!revealed ? (
        <button className="button" onClick={() => setRevealed(true)}>
          想好了，看参考答案
        </button>
      ) : (
        <>
          <div className="answer-box">
            <p className="answer">参考答案：{item.answer}</p>
            {item.explanation && <p className="prose">{item.explanation}</p>}
          </div>
          {result === null ? (
            <div className="actions">
              <span>你做对了吗？</span>
              <button className="button" onClick={() => answer(true)}>
                做对了
              </button>
              <button className="button" onClick={() => answer(false)}>
                没做对
              </button>
            </div>
          ) : (
            <Feedback correct={result} onAskTutor={onAskTutor} question={`这道题“${item.question}”`} />
          )}
        </>
      )}
    </div>
  )
}

function Feedback({
  correct,
  children,
  onAskTutor,
  question,
}: {
  correct: boolean
  children?: React.ReactNode
  onAskTutor?: (text: string) => void
  question: string
}) {
  return (
    <div className={`quiz-feedback ${correct ? 'right' : 'wrong'}`} role="status">
      <strong>{correct ? '✓ 答对了' : '✗ 答错了，已加入复习队列'}</strong>
      {children && <span> {children}</span>}
      {!correct && onAskTutor && (
        <button className="link-button" onClick={() => onAskTutor(`我做错了${question}，能帮我弄明白错在哪吗？`)}>
          让导师帮我弄明白
        </button>
      )}
    </div>
  )
}

// 节末小测：做完自动判分，全对自动标记掌握，答错的题按 1、3、7 天安排复习
export default function Quiz({ courseId, concept, onAskTutor }: { courseId: string; concept: Concept; onAskTutor: (text: string) => void }) {
  const items = useMemo(() => buildQuiz(concept), [concept])
  const { progress, recordQuiz } = useProgress()
  const [round, setRound] = useState(0)
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const last = progress.quiz[`${courseId}:${concept.id}`]
  const done = items.length > 0 && items.every((it) => it.key in answers)

  useEffect(() => {
    if (done) recordQuiz(courseId, concept.id, items.map((it) => ({ key: it.key, correct: answers[it.key] })))
    // 只在刚做完时记录一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  if (items.length === 0) return null
  const correct = items.filter((it) => answers[it.key]).length

  return (
    <section className="quiz" aria-label="节末小测">
      <h2>节末小测（{items.length} 题）</h2>
      {!done && last && (
        <p className="small muted">
          上次成绩 {last.correct}/{last.total}。再做一遍可以检查自己是不是真的懂了。
        </p>
      )}
      {items.map((it, i) => (
        <QuizQuestion
          key={`${round}-${it.key}`}
          item={it}
          n={i + 1}
          onAnswer={(c) => setAnswers((a) => ({ ...a, [it.key]: c }))}
          onAskTutor={onAskTutor}
        />
      ))}
      {done && (
        <div className={`quiz-summary ${correct === items.length ? 'right' : ''}`} role="status">
          <strong>
            {correct}/{items.length} 题答对。
          </strong>{' '}
          {correct === items.length
            ? '全对，已经把这个知识点标记为掌握。'
            : `答错的 ${items.length - correct} 道题明天会出现在复习里。`}
          <button
            className="link-button"
            onClick={() => {
              setAnswers({})
              setRound((r) => r + 1)
            }}
          >
            重做一遍
          </button>
        </div>
      )}
    </section>
  )
}
