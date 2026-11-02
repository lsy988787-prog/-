import { useId, useMemo, useRef, useState } from 'react'
import { fmt } from './math'
import type { BarChart, Chart, NetworkChart, PhasorChart, TableChart, Vector, XYChart } from './types'

// 通用 SVG 图表。颜色用 CSS 变量 --s1..--s4（按固定顺序分配给系列），文字一律用正文颜色。
const W = 560
const H = 300
const M = { l: 56, r: 16, t: 14, b: 40 }

export default function ChartView({ chart }: { chart: Chart }) {
  return (
    <figure className="chart">
      <figcaption>{chart.title}</figcaption>
      {chart.kind === 'xy' && <XY chart={chart} />}
      {chart.kind === 'phasor' && <Phasors chart={chart} />}
      {chart.kind === 'bars' && <Bars chart={chart} />}
      {chart.kind === 'table' && <Table chart={chart} />}
      {chart.kind === 'network' && <Network chart={chart} />}
    </figure>
  )
}

/** 取整齐的刻度 */
function ticks(min: number, max: number, n = 5): number[] {
  const span = max - min || 1
  const step0 = span / n
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return out
}

function Legend({ items }: { items: { name: string; dashed?: boolean; i: number }[] }) {
  if (items.length < 2) return null
  return (
    <ul className="legend">
      {items.map((s) => (
        <li key={s.name}>
          <svg width="22" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="21" y2="5" className={`stroke-s${(s.i % 4) + 1}`} strokeWidth="2" strokeDasharray={s.dashed ? '5 3' : undefined} />
          </svg>
          {s.name}
        </li>
      ))}
    </ul>
  )
}

function XY({ chart }: { chart: XYChart }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const clipId = useId()
  const [hover, setHover] = useState<number | null>(null)
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const pts = chart.series.flatMap((s) => s.points)
    const xs = pts.map((p) => p[0])
    const ys = [...pts.map((p) => p[1]), ...(chart.markers ?? []).map((m) => m.y), ...(chart.hLines ?? []).map((h) => h.y)]
    let lo = chart.yMin ?? Math.min(...ys)
    let hi = chart.yMax ?? Math.max(...ys)
    if (hi - lo < 1e-9) {
      lo -= Math.abs(lo) * 0.1 + 1
      hi += Math.abs(hi) * 0.1 + 1
    } else {
      const pad = (hi - lo) * 0.08
      if (chart.yMin === undefined) lo -= pad
      if (chart.yMax === undefined) hi += pad
    }
    return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: lo, yMax: hi }
  }, [chart])
  const sx = (x: number) => M.l + ((x - xMin) / (xMax - xMin || 1)) * (W - M.l - M.r)
  const sy = (y: number) => M.t + (1 - (y - yMin) / (yMax - yMin)) * (H - M.t - M.b)
  const clampY = (y: number) => Math.min(Math.max(y, yMin), yMax)
  const xt = ticks(xMin, xMax)
  const yt = ticks(yMin, yMax)
  const hoverX = hover === null ? null : xMin + hover * (xMax - xMin)

  const onMove = (e: React.PointerEvent) => {
    const box = svgRef.current!.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const f = (px - M.l) / (W - M.l - M.r)
    setHover(f >= 0 && f <= 1 ? f : null)
  }
  const nearest = (pts: [number, number][], x: number) => pts.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b), pts[0])

  return (
    <>
      <Legend items={chart.series.map((s, i) => ({ name: s.name, dashed: s.dashed, i }))} />
      <div className="chart-box">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className="grid" />
              <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className="tick">
                {fmt(v, 3)}
              </text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={`x${v}`} x={sx(v)} y={H - M.b + 16} textAnchor="middle" className="tick">
              {fmt(v, 3)}
            </text>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="axis" />
          {yMin < 0 && yMax > 0 && <line x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} className="axis" />}
          <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" className="axis-label">
            {chart.xLabel}
          </text>
          <text x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>
            {chart.yLabel}
          </text>
          <clipPath id={clipId}>
            <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
          </clipPath>
          {chart.hLines?.map((h) =>
            h.y >= yMin && h.y <= yMax ? (
              <g key={h.label}>
                <line x1={M.l} x2={W - M.r} y1={sy(h.y)} y2={sy(h.y)} className="ref-line" />
                <text x={W - M.r - 4} y={sy(h.y) - 4} textAnchor="end" className="ref-label">
                  {h.label}
                </text>
              </g>
            ) : null,
          )}
          {chart.vLines?.map((v) => (
            <g key={v.label}>
              <line x1={sx(v.x)} x2={sx(v.x)} y1={M.t} y2={H - M.b} className="ref-line" />
              <text x={sx(v.x) + 4} y={M.t + 12} className="ref-label">
                {v.label}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${clipId})`}>
            {chart.series.map((s, i) => (
              <polyline
                key={s.name}
                points={s.points.map(([x, y]) => `${sx(x)},${sy(clampY(y))}`).join(' ')}
                className={`series stroke-s${(i % 4) + 1}`}
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
            ))}
          </g>
          {chart.markers?.map((m) => (
            <g key={`${m.x}-${m.y}-${m.label}`}>
              <circle cx={sx(m.x)} cy={sy(clampY(m.y))} r={5} className="marker" />
              {m.label && (
                <text x={sx(m.x) + (sx(m.x) > W * 0.75 ? -8 : 8)} y={sy(clampY(m.y)) - 8} textAnchor={sx(m.x) > W * 0.75 ? 'end' : 'start'} className="marker-label">
                  {m.label}
                </text>
              )}
            </g>
          ))}
          {hoverX !== null && <line x1={sx(hoverX)} x2={sx(hoverX)} y1={M.t} y2={H - M.b} className="crosshair" />}
        </svg>
        {hoverX !== null && (
          <div className="tooltip" style={{ left: `${(sx(hoverX) / W) * 100}%` }}>
            <div className="muted">
              {chart.xLabel.split(' / ')[0]} = {fmt(hoverX, 4)}
            </div>
            {chart.series.map((s, i) => {
              const p = nearest(s.points, hoverX)
              return p ? (
                <div key={s.name}>
                  <span className={`swatch bg-s${(i % 4) + 1}`} />
                  {s.name}：{fmt(p[1], 4)}
                </div>
              ) : null
            })}
          </div>
        )}
      </div>
    </>
  )
}

function Phasors({ chart }: { chart: PhasorChart }) {
  const uid = useId()
  return (
    <div className="phasor-grid" data-count={chart.groups.length}>
      {chart.groups.map((g, gi) => {
        const ends = g.vectors.flatMap((v) => {
          const [x0, y0] = v.from ?? [0, 0]
          return [
            [x0, y0],
            [x0 + v.re, y0 + v.im],
          ]
        })
        const R = Math.max(1e-9, ...ends.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) * 1.15
        const S = 120
        const px = (x: number) => S + (x / R) * (S - 14)
        const py = (y: number) => S - (y / R) * (S - 14)
        return (
          <div key={g.title} className="phasor">
            <svg viewBox={`0 0 ${2 * S} ${2 * S}`} role="img" aria-label={`${g.title}：${g.vectors.map((v) => `${v.label} ${fmt(Math.hypot(v.re, v.im), 3)}`).join('，')}`}>
              <defs>
                {[1, 2, 3, 4].map((i) => (
                  <marker key={i} id={`${uid}-${gi}-a${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" className={`fill-s${i}`} />
                  </marker>
                ))}
              </defs>
              <line x1={10} x2={2 * S - 10} y1={S} y2={S} className="axis" />
              <line x1={S} x2={S} y1={10} y2={2 * S - 10} className="axis" />
              {mergeOverlaps(g.vectors).map((v) => {
                const [x0, y0] = v.from ?? [0, 0]
                const k = ((v.series ?? 0) % 4) + 1
                const len = Math.hypot(v.re, v.im)
                if (len / R < 1e-6) return null
                const x1 = px(x0 + v.re)
                const y1 = py(y0 + v.im)
                let label = <text x={x1 + (x1 >= S ? 4 : -4)} y={y1 + (y1 <= S ? -4 : 14)} textAnchor={x1 >= S ? 'start' : 'end'} className="marker-label">{v.label}</text>
                if (v.labelSide) {
                  // 屏幕坐标下的单位法向量：沿相量方向看的左侧或右侧
                  const dx = x1 - px(x0)
                  const dy = y1 - py(y0)
                  const n = Math.hypot(dx, dy) || 1
                  const sgn = v.labelSide === 'left' ? 1 : -1
                  const nx = (sgn * dy) / n
                  const ny = (-sgn * dx) / n
                  const lx = (px(x0) + x1) / 2 + nx * 12
                  const ly = (py(y0) + y1) / 2 + ny * 12 + 4
                  label = <text x={lx} y={ly} textAnchor={Math.abs(nx) < 0.3 ? 'middle' : nx > 0 ? 'start' : 'end'} className="marker-label">{v.label}</text>
                }
                return (
                  <g key={v.label}>
                    <line x1={px(x0)} y1={py(y0)} x2={x1} y2={y1} className={`series stroke-s${k}`} markerEnd={`url(#${uid}-${gi}-a${k})`} />
                    {label}
                  </g>
                )
              })}
            </svg>
            <p className="small muted">{g.title}</p>
          </div>
        )
      })}
    </div>
  )
}

/** 起点终点都重合的相量只画一次，标签合并成 "a = b"，避免互相遮住 */
function mergeOverlaps(vs: Vector[]): Vector[] {
  const out: Vector[] = []
  const key = (v: Vector) => [v.from?.[0] ?? 0, v.from?.[1] ?? 0, v.re, v.im].map((n) => n.toFixed(6)).join(',')
  for (const v of vs) {
    const same = out.find((o) => key(o) === key(v))
    if (same) same.label = `${same.label} = ${v.label}`
    else out.push({ ...v })
  }
  return out
}

function Bars({ chart }: { chart: BarChart }) {
  const vals = [...chart.bars.map((b) => b.value), ...(chart.hLines ?? []).map((h) => h.y), 0]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals) * 1.12 || 1
  const sy = (y: number) => M.t + (1 - (y - lo) / (hi - lo || 1)) * (H - M.t - M.b)
  const n = chart.bars.length
  const slot = (W - M.l - M.r) / n
  const bw = Math.min(56, slot * 0.6)
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.title}：${chart.bars.map((b) => `${b.label} ${fmt(b.value, 3)}`).join('，')}`}>
        {ticks(lo, hi).map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className="tick">
              {fmt(v, 3)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} className="axis" />
        <text x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>
          {chart.yLabel}
        </text>
        {chart.bars.map((b, i) => {
          const x = M.l + slot * i + (slot - bw) / 2
          const top = sy(Math.max(b.value, 0))
          const h = Math.abs(sy(b.value) - sy(0))
          return (
            <g key={b.label}>
              <title>{`${b.label}：${fmt(b.value, 4)}`}</title>
              <rect x={x} y={top} width={bw} height={Math.max(h, 1)} rx={3} className={b.highlight === false ? 'bar muted-bar' : 'bar'} />
              <text x={x + bw / 2} y={b.value >= 0 ? top - 6 : sy(b.value) + 14} textAnchor="middle" className="marker-label">
                {fmt(b.value, 3)}
              </text>
              <text x={x + bw / 2} y={H - M.b + 16} textAnchor="middle" className="tick">
                {b.label}
              </text>
            </g>
          )
        })}
        {chart.hLines?.map((h) => (
          <g key={h.label}>
            <line x1={M.l} x2={W - M.r} y1={sy(h.y)} y2={sy(h.y)} className="ref-line" />
            <text x={W - M.r - 4} y={sy(h.y) - 4} textAnchor="end" className="ref-label">
              {h.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function Table({ chart }: { chart: TableChart }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {chart.headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (j === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Network({ chart }: { chart: NetworkChart }) {
  const NW = 440
  const NH = 280
  const arrowId = useId()
  const pos = Object.fromEntries(chart.nodes.map((n) => [n.id, { x: n.x * NW, y: n.y * NH }]))
  return (
    <div className="chart-box network">
      <svg viewBox={`0 0 ${NW} ${NH + 30}`} role="img" aria-label={chart.title}>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-s1" />
          </marker>
        </defs>
        {chart.edges.map((e) => {
          const a = pos[e.from]
          const b = pos[e.to]
          const [s, t] = (e.flow ?? 1) >= 0 ? [a, b] : [b, a]
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          return (
            <g key={`${e.from}-${e.to}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="branch" />
              {e.flow !== undefined && Math.abs(e.flow) > 1e-9 && (
                <line x1={s.x + (t.x - s.x) * 0.38} y1={s.y + (t.y - s.y) * 0.38} x2={s.x + (t.x - s.x) * 0.52} y2={s.y + (t.y - s.y) * 0.52} className="series stroke-s1" markerEnd={`url(#${arrowId})`} />
              )}
              <text x={mx} y={my + (my > NH * 0.7 ? 22 : -10)} textAnchor="middle" className="marker-label edge-label" dx={a.y === b.y ? 0 : mx < NW / 2 ? -14 : 14}>
                {e.label}
              </text>
            </g>
          )
        })}
        {chart.nodes.map((n) => {
          const p = pos[n.id]
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={15} className="node" />
              <text x={p.x} y={p.y + 5} textAnchor="middle" className="node-label">
                {n.label}
              </text>
              {n.sub && (
                <text x={p.x} y={p.y + (n.y < 0.5 ? -22 : 32)} textAnchor="middle" className="tick">
                  {n.sub}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
