// 交互图示的数据结构。计算器是纯函数：输入滑块参数，输出数值结果和图表描述，由通用组件绘制。
// 课程数据只能通过 ID 引用这里注册过的计算器，不能携带可执行代码。

export type Params = Record<string, number>

export interface Value {
  label: string
  value: string
  unit?: string
  key?: boolean // 重点结果，加粗显示
}

export interface Series {
  name: string
  points: [number, number][]
  dashed?: boolean
}

export interface Marker {
  x: number
  y: number
  label?: string
}

export interface XYChart {
  kind: 'xy'
  title: string
  xLabel: string
  yLabel: string
  series: Series[]
  markers?: Marker[]
  hLines?: { y: number; label: string }[]
  vLines?: { x: number; label: string }[]
  yMin?: number
  yMax?: number
}

export interface Vector {
  label: string
  re: number
  im: number
  from?: [number, number] // 起点，默认原点；用于画三角形、相量相加
  series?: number // 颜色槽位 0..3
  labelSide?: 'left' | 'right' // 设置后标签放在相量中点的左侧或右侧（沿相量方向看），避免与相邻相量的标签重叠
}

export interface PhasorChart {
  kind: 'phasor'
  title: string
  groups: { title: string; vectors: Vector[] }[]
  unit?: string
}

export interface BarChart {
  kind: 'bars'
  title: string
  yLabel: string
  bars: { label: string; value: number; highlight?: boolean }[]
  hLines?: { y: number; label: string }[]
}

export interface TableChart {
  kind: 'table'
  title: string
  headers: string[]
  rows: string[][]
}

export interface NetworkChart {
  kind: 'network'
  title: string
  nodes: { id: string; label: string; x: number; y: number; sub?: string }[]
  edges: { from: string; to: string; label: string; flow?: number }[] // flow > 0 表示 from → to
}

export type Chart = XYChart | PhasorChart | BarChart | TableChart | NetworkChart

export interface CalcResult {
  values: Value[]
  charts: Chart[]
  warnings?: string[]
}

export type Calculator = (p: Params) => CalcResult
