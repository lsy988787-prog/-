import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import MathBlock from '../components/MathBlock'
import TutorPanel from '../components/TutorPanel'
import { chapterOf, findConcept, flatConcepts } from '../lib/course'
import { useProgress } from '../lib/progress'
import type { Concept, Practice } from '../lib/types'
import { useCourse } from './CourseLayout'
import NotFound from './NotFound'

export default function ConceptPage() {
  const course = useCourse()
  const { conceptId = '' } = useParams()
  const concept = findConcept(course, conceptId)
  const { visit } = useProgress()
  const [tutor, setTutor] = useState({ open: false, draft: '' })
  const openTutor = (draft = '') => setTutor({ open: true, draft })
  const closeTutor = useCallback(() => setTutor({ open: false, draft: '' }), [])

  useEffect(() => {
    if (concept) visit(course.id, concept.id)
  }, [course.id, concept, visit])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [conceptId])

  if (!concept) return <NotFound message="这个知识点不存在，可能已被移动或改名。" />

  const all = flatConcepts(course)
  const index = all.indexOf(concept)
  const prev = all[index - 1]
  const next = all[index + 1]
  const chapter = chapterOf(course, concept)

  return (
    <>
      <main className="page concept" key={concept.id}>
        <p className="eyebrow">
          第 {chapter.order} 章 {chapter.title} · {concept.order}/{chapter.concepts.length}
        </p>
        <h1>{concept.title}</h1>
        <p className="lead">{concept.summary}</p>

        <Prerequisites ids={concept.prerequisites} />

        <section>
          <h2>讲解</h2>
          <p className="prose">{concept.explanation}</p>
        </section>

        {concept.keyFormulas.length > 0 && (
          <section>
            <h2>关键公式</h2>
            {concept.keyFormulas.map((f, i) => (
              <div className="formula" key={i}>
                <MathBlock latex={f.latex} fallback={f.display} />
                {f.variables.length > 0 && (
                  <dl className="variables">
                    {f.variables.map((v) => (
                      <div key={v.symbol}>
                        <dt>{v.symbol}</dt>
                        <dd>
                          {v.meaning}
                          {v.unit && v.unit !== '—' && <span className="unit">（{v.unit}）</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {f.conditions && <p className="conditions">适用条件：{f.conditions}</p>}
              </div>
            ))}
          </section>
        )}

        {concept.visualization && (
          <section className="viz-placeholder">
            <h2>参数实验</h2>
            <p className="muted">交互图示正在制作中。上线后可以拖动下面这些参数，观察{concept.visualization.output ?? '结果'}的变化。</p>
            <ul className="param-list">
              {concept.visualization.params.map((p) => (
                <li key={p.id}>
                  {p.label}：{p.min} ~ {p.max} {p.unit !== '—' ? p.unit : ''}（默认 {p.default}）
                </li>
              ))}
            </ul>
            {concept.visualization.assumptions && <p className="conditions">假设：{concept.visualization.assumptions}</p>}
          </section>
        )}

        <WorkedExample concept={concept} />

        {concept.misconceptions.length > 0 && (
          <section>
            <h2>常见误区</h2>
            <ul className="misconceptions">
              {concept.misconceptions.map((m, i) => (
                <li key={i}>
                  <p className="wrong">✗ {m.wrong}</p>
                  <p className="right">✓ {m.correct}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {concept.practice.map((p, i) => (
          <PracticeCard key={i} practice={p} n={i + 1} />
        ))}

        <Questions concept={concept} onAsk={openTutor} />
        <MasteryBar concept={concept} />

        <nav className="pager">
          {prev ? <Link to={`/course/${course.id}/${prev.id}`}>← {prev.title}</Link> : <span />}
          {next ? <Link to={`/course/${course.id}/${next.id}`}>{next.title} →</Link> : <span />}
        </nav>
      </main>
      {!tutor.open && (
        <button className="tutor-fab" onClick={() => openTutor()}>
          问 AI 导师
        </button>
      )}
      <TutorPanel courseId={course.id} concept={concept} open={tutor.open} draft={tutor.draft} onClose={closeTutor} />
    </>
  )
}

function Prerequisites({ ids }: { ids: string[] }) {
  const course = useCourse()
  const { isMastered } = useProgress()
  if (ids.length === 0) return null
  return (
    <div className="prereqs">
      <span className="muted">先学过：</span>
      {ids.map((id) => {
        const c = findConcept(course, id)
        if (!c) return null
        const done = isMastered(course.id, id)
        return (
          <Link key={id} to={`/course/${course.id}/${id}`} className={`chip ${done ? 'done' : ''}`}>
            {done ? '✓ ' : ''}
            {c.title}
          </Link>
        )
      })}
    </div>
  )
}

// 例题：先自己想，再逐步展开解答
function WorkedExample({ concept }: { concept: Concept }) {
  const [shown, setShown] = useState(0)
  const { problem, steps, answer } = concept.workedExample
  const all = shown >= steps.length
  return (
    <section className="example">
      <h2>例题</h2>
      <p className="prose">{problem}</p>
      {shown > 0 && (
        <ol className="steps">
          {steps.slice(0, shown).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {all && <p className="answer">答案：{answer}</p>}
      <div className="actions">
        {!all && (
          <button className="button" onClick={() => setShown((n) => n + 1)}>
            {shown === 0 ? '先自己想想，再看第一步' : `看下一步（${shown}/${steps.length}）`}
          </button>
        )}
        {!all && shown > 0 && (
          <button className="link-button" onClick={() => setShown(steps.length)}>
            直接看全部
          </button>
        )}
        {shown > 0 && (
          <button className="link-button" onClick={() => setShown(0)}>
            收起
          </button>
        )}
      </div>
    </section>
  )
}

function PracticeCard({ practice, n }: { practice: Practice; n: number }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="practice">
      <h2>自测 {n}</h2>
      <p className="prose">{practice.question}</p>
      {open ? (
        <div className="answer-box">
          <p className="answer">参考答案：{practice.answer}</p>
          {practice.explanation && <p className="prose">{practice.explanation}</p>}
        </div>
      ) : (
        <button className="button" onClick={() => setOpen(true)}>
          写下答案后，看参考答案
        </button>
      )}
    </section>
  )
}

function Questions({ concept, onAsk }: { concept: Concept; onAsk: (text: string) => void }) {
  const course = useCourse()
  const { progress, addQuestion, removeQuestion } = useProgress()
  const [text, setText] = useState('')
  const list = progress.questions[`${course.id}:${concept.id}`] ?? []
  return (
    <section className="questions">
      <h2>我的疑问</h2>
      {list.length > 0 && (
        <ul>
          {list.map((q, i) => (
            <li key={q.at}>
              <span>{q.text}</span>
              <span className="question-actions">
                <button className="link-button" onClick={() => onAsk(q.text)}>
                  问 AI
                </button>
                <button className="link-button" onClick={() => removeQuestion(course.id, concept.id, i)} aria-label="删除这条疑问">
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          addQuestion(course.id, concept.id, text.trim())
          setText('')
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="哪里没想通？写下来，之后可以拿去问 AI 导师或老师。"
          rows={2}
        />
        <button className="button" type="submit" disabled={!text.trim()}>
          记下疑问
        </button>
      </form>
    </section>
  )
}

function MasteryBar({ concept }: { concept: Concept }) {
  const course = useCourse()
  const { isMastered, toggleMastered } = useProgress()
  const done = isMastered(course.id, concept.id)
  return (
    <div className={`mastery ${done ? 'done' : ''}`}>
      <span>{done ? '你已标记掌握这个知识点。' : '能独立做出例题和自测了吗？'}</span>
      <button className={`button ${done ? '' : 'primary'}`} onClick={() => toggleMastered(course.id, concept.id)}>
        {done ? '取消掌握' : '标记为已掌握'}
      </button>
    </div>
  )
}
