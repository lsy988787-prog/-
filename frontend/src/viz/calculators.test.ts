// 用课程例题的数字核对每个计算器；并检查课程里引用的计算器都已注册、默认参数下不报错。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { newtonTwoBus } from './calcAnalysis'
import { CALCULATORS } from './registry'
import type { CalcResult, Params } from './types'

const course = JSON.parse(readFileSync(new URL('../../../courses/power-system-analysis.json', import.meta.url), 'utf-8'))

/** 取某个结果（按标签前缀匹配）解析成数字 */
function val(r: CalcResult, prefix: string): number {
  const v = r.values.find((x) => x.label.startsWith(prefix))
  if (!v) throw new Error(`没有结果：${prefix}；已有 ${r.values.map((x) => x.label).join('、')}`)
  const m = v.value.replace('−', '-').match(/-?\d+(\.\d+)?(×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?/)
  if (!m) throw new Error(`无法解析 ${v.value}`)
  let n = parseFloat(m[0])
  if (m[3]) {
    const map: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
    n *= 10 ** Number(m[3].split('').map((ch) => map[ch]).join(''))
  }
  return n
}

const run = (id: string, p: Params) => CALCULATORS[id](p)
const close = (a: number, b: number, rel = 0.005) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-9)

describe('课程引用的计算器', () => {
  const vizs: { concept: string; calculator: string; params: { id: string; default: number; min: number; max: number }[] }[] = []
  for (const ch of course.chapters)
    for (const k of ch.concepts) if (k.visualization) vizs.push({ concept: k.id, ...k.visualization })

  it('全部在白名单里，且课程的 calculators 列表与之一致', () => {
    for (const v of vizs) expect(CALCULATORS, v.concept).toHaveProperty([v.calculator])
    expect(new Set(course.calculators)).toEqual(new Set(vizs.map((v) => v.calculator)))
  })

  it.each(vizs.map((v) => [v.concept, v] as const))('%s 在默认值和参数两端都能算出有限结果', (_, v) => {
    const at = (pick: (p: { default: number; min: number; max: number }) => number) =>
      Object.fromEntries(v.params.map((p) => [p.id, pick(p)]))
    for (const params of [at((p) => p.default), at((p) => p.min), at((p) => p.max)]) {
      const r = run(v.calculator, params)
      expect(r.values.length).toBeGreaterThan(0)
      for (const chart of r.charts)
        if (chart.kind === 'xy') for (const s of chart.series) for (const [x, y] of s.points) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    }
  })
})

describe('与课程例题答案一致', () => {
  it('额定电压', () => {
    const r = run('rated-voltage-chain', { UN1: 10, UN2: 110, k2: 10 })
    close(val(r, '发电机额定电压'), 10.5)
    expect(r.values.find((v) => v.label === '额定变比')!.value).toBe('10.5/121')
  })
  it('负荷率', () => {
    const r = run('load-factor', { W: 25, Pmax: 50 })
    close(val(r, '最大负荷利用小时数'), 5000)
    close(val(r, '年负荷率'), 0.571, 0.002)
  })
  it('接地电容电流', () => {
    const r = run('ungrounded-capacitive-current', { UN: 10, C: 2 })
    close(val(r, '接地电容电流'), 10.9, 0.01)
    close(val(r, '非故障相对地电压'), 10)
  })
  it('功率三角形', () => {
    const r = run('complex-power-triangle', { P: 2, pf: 0.8, UL: 10 })
    close(val(r, '视在功率'), 2.5)
    close(val(r, '无功功率'), 1.5)
    close(val(r, '线电流'), 144.3)
  })
  it('线路参数', () => {
    const r = run('line-parameters', { S: 185, d: 19, D: 4 })
    close(val(r, '电阻'), 0.17, 0.01)
    close(val(r, '电抗'), 0.407)
    close(val(r, '电纳'), 2.78e-6)
  })
  it('π 型等值', () => {
    const r = run('line-pi', { l: 100, U: 110, x1: 0.41, b1: 2.8 })
    close(val(r, '串联电抗'), 41)
    close(val(r, '每端并联电纳'), 1.4e-4)
    close(val(r, '充电功率'), 3.39)
  })
  it('长线路', () => {
    const r = run('long-line', { x1: 0.28, b1: 4.0, l: 600, U: 500 })
    close(val(r, '波阻抗'), 264.6)
    close(val(r, '自然功率'), 945)
    close(val(r, '精确串联电抗'), 156.9)
    close(val(r, '集中参数串联电抗'), 168)
  })
  it('电压降落', () => {
    const r = run('line-voltage-drop', { P: 20, Q: 15, R: 10, X: 20, U2: 110 })
    close(val(r, '首端电压'), 114.6)
    close(val(r, '功率损耗'), 0.517, 0.01)
  })
  it('变压器参数', () => {
    const r = run('transformer-params', { SN: 31.5, UN: 110, Pk: 148, Uk: 10.5, P0: 38.5, I0: 0.8 })
    close(val(r, '电阻'), 1.8, 0.01)
    close(val(r, '电抗'), 40.3)
    close(val(r, '电导'), 3.18e-6)
    close(val(r, '电纳'), 2.08e-5)
  })
  it('非标准变比 π 型', () => {
    const r = run('off-nominal-pi', { XT: 0.1, k: 1.05 })
    expect(r.values[0].value).toBe('−j9.524')
    expect(r.values[1].value).toBe('j0.4535')
    expect(r.values[2].value).toBe('−j0.4762')
  })
  it('功角特性', () => {
    const r = run('power-angle', { Eq: 1.86, U: 1, Xd: 1.2, Xq: 1.2 })
    close(val(r, '功率极限'), 1.55)
    close(val(r, '极限功角'), 90)
  })
  it('ZIP 负荷', () => {
    const r = run('zip-load', { P0: 10, a: 0.3, b: 0.3, U: 0.95 })
    close(val(r, 'ZIP'), 9.56)
    close(val(r, '恒阻抗'), 9.03, 0.001)
  })
  it('标幺值换算', () => {
    const r = run('per-unit-convert', { Z: 0.125, SN: 50, UN: 10.5, SB: 100, UB: 10.5 })
    close(val(r, '新基准下标幺值'), 0.25)
    close(val(r, '有名值'), 0.276, 0.002)
  })
  it('dq0 变换', () => {
    const r = run('dq-transform', { Im: 100, phi: -30, theta0: 0 })
    close(val(r, 'i_d'), 86.6)
    close(val(r, 'i_q'), -50)
    expect(val(r, 'i_0')).toBe(0)
  })
  it('节点导纳矩阵', () => {
    const r = run('ybus-builder', { x12: 0.1, x13: 0.2, x23: 0.25 })
    const table = r.charts.find((ch) => ch.kind === 'table')!
    expect(table.kind === 'table' && table.rows).toEqual([
      ['1', '−j15', 'j10', 'j5'],
      ['2', 'j10', '−j14', 'j4'],
      ['3', 'j5', 'j4', '−j9'],
    ])
  })
  it('辐射网两步法', () => {
    close(val(run('radial-two-step', { P: 20, Q: 15, R: 10, X: 20, U1: 116 }), '第二步'), 111.5)
  })
  it('牛顿法', () => {
    const r = run('nr-two-bus', { P: 0.5, Q: 0, X: 0.1 })
    close(val(r, 'θ₂'), -2.87)
    close(val(r, 'U₂'), 0.9987, 0.0002)
    expect(val(r, '迭代次数')).toBe(3)
    expect(newtonTwoBus(4, 0, 0.5).converged).toBe(false)
  })
  it('直流潮流', () => {
    const r = run('dc-flow-3bus', { P2: 1, P3: -1.5, x12: 0.1, x13: 0.2, x23: 0.25 })
    close(val(r, 'P₁₂'), -0.273, 0.002)
    close(val(r, 'P₁₃'), 0.773)
    close(val(r, 'P₂₃'), 0.727)
  })
  it('频率调整', () => {
    const base = { dPL: 100, KG: 600, KLs: 1.5, PL: 3000 }
    close(val(run('frequency-response', { ...base, dPG: 0 }), '频率偏差'), -0.145)
    close(val(run('frequency-response', { ...base, dPG: 60 }), '频率偏差'), -0.058, 0.01)
  })
  it('无限大电源短路', () => {
    const r = run('short-circuit-waveform', { Ip: 10, Ta: 45, alpha: 0 })
    close(val(r, '冲击系数'), 1.8, 0.002)
    close(val(r, '冲击电流 i_M'), 25.5)
    close(val(r, '冲击电流有效值'), 15.1)
    // α = 0 且回路接近纯电感时，实际最大瞬时值接近 i_M
    close(val(r, '当前相角下'), 25.5, 0.01)
  })
  it('发电机机端短路', () => {
    const r = run('generator-sc-envelope', { Xdpp: 0.15, Xdp: 0.25, Xd: 1.2, Tdpp: 0.03, Tdp: 1 })
    expect(r.values[0].value).toContain('36.7 kA')
    expect(r.values[1].value).toContain('22 kA')
    expect(r.values[2].value).toContain('4.58 kA')
  })
  it('三相短路实用计算', () => {
    const r = run('sc-three-phase', { Xg: 0.2, Xt: 0.105, l: 50, x1: 0.4, Uav: 115 })
    close(val(r, '起始次暂态电流'), 1.1, 0.002)
    close(val(r, '短路容量'), 219, 0.002)
    close(val(r, '冲击电流'), 2.81, 0.002)
  })
  it('对称分量', () => {
    const r = run('sequence-decomposition', { Ia: 1, Ib: 0, Ic: 0, phb: -120, phc: 120 })
    for (const k of ['正序', '负序', '零序']) expect(r.values.find((v) => v.label.startsWith(k))!.value).toBe('0.333∠0°')
    const balanced = run('sequence-decomposition', { Ia: 1, Ib: 1, Ic: 1, phb: -120, phc: 120 })
    expect(balanced.values[1].value).toBe('0')
  })
  it('不对称故障与正序等效定则', () => {
    const base = { X1: 0.4, X2: 0.4, X0: 0.3 }
    close(val(run('unbalanced-fault', { ...base, Zf: 0, type: 1 }), '故障相电流'), 2.73, 0.002)
    const r = run('unbalanced-fault', base)
    close(val(r, '单相接地'), 2.73, 0.002)
    close(val(r, '两相接地'), 2.63, 0.002)
    close(val(r, '三相短路'), 2.5)
    close(val(r, '两相短路'), 2.17, 0.002)
    // 过渡电阻使单相接地电流减小
    expect(val(run('unbalanced-fault', { ...base, Zf: 0.2, type: 1 }), '故障相电流')).toBeLessThan(2.73)
  })
  it('牵引负序', () => {
    close(val(run('traction-unbalance', { SL: 20, Sk: 2000 }), '负序电压不平衡度'), 1)
    close(val(run('traction-unbalance', { SL: 20, Sk: 800 }), '负序电压不平衡度'), 2.5)
  })
  it('谐波', () => {
    const r = run('harmonic-spectrum', { h5: 4, h7: 3, h11: 1.5, Sk: 200, Qc: 8 })
    close(val(r, '电压总谐波畸变率'), 5.22, 0.002)
    close(val(r, '并联谐振次数'), 5)
    expect(r.warnings?.join('')).toContain('串联电抗器')
  })
  it('直流牵引双边供电', () => {
    const r = run('dc-traction-two-substations', { U0: 1500, P: 2, L: 2, x: 1, r: 0.04 })
    close(val(r, '列车电压'), 1473, 0.001)
    close(val(r, '列车电流'), 1358, 0.001)
    expect(run('dc-traction-two-substations', { U0: 600, P: 6, L: 5, x: 2.5, r: 0.1 }).values[0].value).toBe('无解')
  })
})
