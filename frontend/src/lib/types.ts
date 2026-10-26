// 与 courses/course.schema.json 对应的类型
export interface Variable { symbol: string; meaning: string; unit: string }
export interface Formula { latex: string; display: string; variables: Variable[]; conditions?: string }
export interface VizParam { id: string; label: string; unit: string; min: number; max: number; step: number; default: number }
export interface Visualization { calculator: string; params: VizParam[]; output?: string; assumptions?: string }
export interface Practice { question: string; answer: string; explanation?: string }

export interface Concept {
  id: string
  chapterId: string
  order: number
  title: string
  prerequisites: string[]
  summary: string
  explanation: string
  keyFormulas: Formula[]
  workedExample: { problem: string; steps: string[]; answer: string }
  misconceptions: { wrong: string; correct: string }[]
  visualization: Visualization | null
  practice: Practice[]
  aiGuidance?: { guidingQuestions?: string[]; constraints?: string[] }
  reviewStatus: string
}

export interface Chapter { id: string; order: number; title: string; description?: string; concepts: Concept[] }

export interface Course {
  id: string
  title: string
  subject: string
  level: string
  source: 'preset' | 'upload'
  description?: string
  reviewStatus?: string
  contentVersion?: string
  chapters: Chapter[]
}

export interface CourseSummary {
  id: string
  title: string
  subject: string
  level: string
  source: 'preset' | 'upload'
  description?: string
  reviewStatus?: string
  chapterCount: number
  conceptCount: number
}
