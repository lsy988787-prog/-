import { useMemo, useState } from 'react'
import type { Visualization } from '../lib/types'
import ChartView from './Charts'
import { CALCULATORS } from './registry'
import type { Params } from './types'

const defaults = (v: Visualization): Params => Object.fromEntries(v.params.map((p) => [p.id, p.default]))

// 参数实验：拖动滑块，结果和图表即时更新。计算器只能是白名单里的 ID。
export default function VizPanel({ viz }: { viz: Visualization }) {
  const [params, setParams] = useState<Params>(() => defaults(viz))
  const calc = CALCULATORS[viz.calculator]
  const result = useMemo(() => (calc ? calc(params) : null), [calc, params])

  if (!calc || !result) {
    return (
      <section className="viz">
        <h2>参数实验</h2>
        <p className="notice">这个图示（{viz.calculator}）还没有实现。</p>
      </section>
    )
  }

  const changed = viz.params.some((p) => params[p.id] !== p.default)
  return (
    <section className="viz">
      <div className="viz-head">
        <h2>参数实验</h2>
        {changed && (
          <button className="link-button" onClick={() => setParams(defaults(viz))}>
            恢复例题参数
          </button>
        )}
      </div>
      <div className="viz-body">
        <div className="viz-controls">
          {viz.params.map((p) => {
            const value = params[p.id]
            const unit = p.unit && p.unit !== '—' ? p.unit : ''
            return (
              <label key={p.id} className="slider">
                <span className="slider-label">
                  {p.label}
                  <span className="slider-value">
                    <input
                      type="number"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={value}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (e.target.value !== '' && Number.isFinite(n)) setParams((s) => ({ ...s, [p.id]: Math.min(p.max, Math.max(p.min, n)) }))
                      }}
                      aria-label={`${p.label}数值`}
                    />
                    {unit}
                  </span>
                </span>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={value}
                  onChange={(e) => setParams((s) => ({ ...s, [p.id]: Number(e.target.value) }))}
                  aria-label={p.label}
                />
              </label>
            )
          })}
        </div>
        <dl className="viz-results">
          {result.values.map((v) => (
            <div key={v.label} className={v.key ? 'key' : ''}>
              <dt>{v.label}</dt>
              <dd>
                {v.value}
                {v.unit && <span className="unit"> {v.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {result.warnings?.map((w) => (
        <p key={w} className="notice viz-warning" role="status">
          ⚠ {w}
        </p>
      ))}
      <div className="viz-charts">
        {result.charts.map((c) => (
          <ChartView key={c.title} chart={c} />
        ))}
      </div>
      {viz.assumptions && <p className="conditions">假设：{viz.assumptions}</p>}
    </section>
  )
}
