// 第 1–2 章：基础概念与元件建模
import { DEG, OMEGA, SQRT3, c, cpol, curve, fmt, range, rect, scale, sub } from './math'
import type { Calculator, Series, Vector } from './types'

export const ratedVoltageChain: Calculator = ({ UN1, UN2, k2 }) => {
  const UGN = 1.05 * UN1
  const U1N = UGN // 升压变压器一次侧直接接发电机，额定电压取发电机额定电压
  const U2N = UN2 * (1 + k2 / 100)
  const warnings = UN2 <= UN1 ? ['二次侧电压不高于一次侧时就不是升压变压器了，请检查两侧网络电压。'] : []
  return {
    values: [
      { label: '发电机额定电压 U_GN', value: fmt(UGN), unit: 'kV', key: true },
      { label: '变压器一次侧额定电压（接发电机）', value: fmt(U1N), unit: 'kV' },
      { label: '变压器二次侧额定电压', value: fmt(U2N), unit: 'kV' },
      { label: '额定变比', value: `${fmt(U1N)}/${fmt(U2N)}`, unit: 'kV', key: true },
    ],
    warnings,
    charts: [
      {
        kind: 'bars',
        title: '沿送电方向的额定电压',
        yLabel: 'kV',
        bars: [
          { label: '一次侧网络', value: UN1 },
          { label: '发电机', value: UGN, highlight: true },
          { label: '变压器一次', value: U1N, highlight: true },
          { label: '变压器二次', value: U2N, highlight: true },
          { label: '二次侧网络', value: UN2 },
        ],
      },
    ],
  }
}

export const loadFactor: Calculator = ({ W, Pmax }) => {
  const energy = W * 1e4 // MWh
  const Tmax = energy / Pmax
  const Pav = energy / 8760
  const kL = Pav / Pmax
  const warnings = Tmax > 8760 ? ['T_max 超过 8760 h：年用电量大于"全年满负荷"电量，这组参数不可能出现。'] : []
  return {
    values: [
      { label: '最大负荷利用小时数 T_max', value: fmt(Tmax), unit: 'h', key: true },
      { label: '年平均负荷 P_av', value: fmt(Pav), unit: 'MW' },
      { label: '年负荷率 k_L', value: fmt(kL, 3), key: true },
    ],
    warnings,
    charts: [
      {
        kind: 'xy',
        title: '同样的电量，两种等效画法（面积相等）',
        xLabel: '时间 / h',
        yLabel: '负荷 / MW',
        series: [
          { name: '按最大负荷运行 T_max 小时', points: [[0, Pmax], [Math.min(Tmax, 8760), Pmax], [Math.min(Tmax, 8760), 0]] },
          { name: '全年按平均负荷运行', points: [[0, Pav], [8760, Pav], [8760, 0]], dashed: true },
        ],
        yMin: 0,
        yMax: Pmax * 1.15,
      },
    ],
  }
}

export const ungroundedCapacitiveCurrent: Calculator = ({ UN, C }) => {
  const Uph = UN / SQRT3 // kV
  const IC = 3 * OMEGA * C * 1e-6 * Uph * 1e3
  const Ua = cpol(Uph, 90)
  const Ub = cpol(Uph, -30)
  const Uc = cpol(Uph, 210)
  // A 相金属性接地后，中性点对地电压变为 −U_a，各相对地电压 = 原相电压 − U_a
  const shift = scale(Ua, -1)
  const before: Vector[] = [
    { label: 'U_A', re: Ua.re, im: Ua.im, series: 0 },
    { label: 'U_B', re: Ub.re, im: Ub.im, series: 1 },
    { label: 'U_C', re: Uc.re, im: Uc.im, series: 2 },
  ]
  const Ub2 = sub(Ub, Ua)
  const Uc2 = sub(Uc, Ua)
  const after: Vector[] = [
    { label: "U_B'", re: Ub2.re, im: Ub2.im, series: 1 },
    { label: "U_C'", re: Uc2.re, im: Uc2.im, series: 2 },
    { label: 'U_N', re: shift.re, im: shift.im, series: 3 },
  ]
  return {
    values: [
      { label: '接地电容电流 I_C', value: fmt(IC, 3), unit: 'A', key: true },
      { label: '正常相电压', value: fmt(Uph, 3), unit: 'kV' },
      { label: '非故障相对地电压', value: fmt(SQRT3 * Uph, 3), unit: 'kV', key: true },
      { label: '中性点对地电压', value: fmt(Uph, 3), unit: 'kV' },
    ],
    warnings: IC > 30 ? ['接地电流较大，电弧可能难以自行熄灭，实际系统会考虑经消弧线圈接地。'] : [],
    charts: [
      {
        kind: 'phasor',
        title: '对地电压相量（A 相接地前后）',
        unit: 'kV',
        groups: [
          { title: '正常运行', vectors: before },
          { title: 'A 相金属性接地后', vectors: after },
        ],
      },
    ],
  }
}

export const complexPowerTriangle: Calculator = ({ P, pf, UL }) => {
  const S = P / pf
  const Q = Math.sqrt(Math.max(0, S * S - P * P))
  const I = (S / (SQRT3 * UL)) * 1000
  return {
    values: [
      { label: '视在功率 S', value: fmt(S), unit: 'MVA', key: true },
      { label: '无功功率 Q', value: fmt(Q), unit: 'Mvar', key: true },
      { label: '功率因数角 φ', value: fmt(Math.acos(pf) / DEG, 3), unit: '°' },
      { label: '线电流 I', value: fmt(I), unit: 'A', key: true },
    ],
    charts: [
      {
        kind: 'phasor',
        title: '功率三角形',
        unit: 'MVA / MW / Mvar',
        groups: [
          {
            title: 'S = P + jQ',
            vectors: [
              { label: 'P', re: P, im: 0, series: 0, labelSide: 'right' },
              { label: 'jQ', re: 0, im: Q, from: [P, 0], series: 1, labelSide: 'right' },
              { label: 'S', re: P, im: Q, series: 2, labelSide: 'left' },
            ],
          },
        ],
      },
    ],
  }
}

const RHO_AL = 31.5

export const lineParameters: Calculator = ({ S, d, D }) => {
  const r = d / 2 // mm
  const Ds = 0.81 * r
  const Dm = (k: number) => Math.cbrt(2) * k * 1000 // 水平排列：D、D、2D，mm
  const x1 = (k: number) => 0.1445 * Math.log10(Dm(k) / Ds)
  const b1 = (k: number) => (7.58 / Math.log10(Dm(k) / r)) // ×10⁻⁶ S/km
  const xs = range(1, 15, 70)
  return {
    values: [
      { label: '几何均距 D_m', value: fmt(Dm(D) / 1000, 3), unit: 'm' },
      { label: '电阻 r₁', value: fmt(RHO_AL / S, 3), unit: 'Ω/km', key: true },
      { label: '电抗 x₁', value: fmt(x1(D), 3), unit: 'Ω/km', key: true },
      { label: '电纳 b₁', value: `${fmt(b1(D), 3)}×10⁻⁶`, unit: 'S/km', key: true },
    ],
    charts: [
      {
        kind: 'xy',
        title: '电抗 x₁ 随相间距离变化（对数关系，变化很缓）',
        xLabel: '相间距离 D / m',
        yLabel: 'x₁ / (Ω/km)',
        series: [{ name: 'x₁', points: curve(xs, x1) }],
        markers: [{ x: D, y: x1(D), label: fmt(x1(D), 3) }],
      },
      {
        kind: 'xy',
        title: '电纳 b₁ 随相间距离变化',
        xLabel: '相间距离 D / m',
        yLabel: 'b₁ / (10⁻⁶ S/km)',
        series: [{ name: 'b₁', points: curve(xs, b1) }],
        markers: [{ x: D, y: b1(D), label: fmt(b1(D), 3) }],
      },
    ],
  }
}

export const linePi: Calculator = ({ l, U, x1, b1 }) => {
  const X = x1 * l
  const B = b1 * 1e-6 * l
  const QB = (U * U * B) // Mvar
  const ls = range(10, 300, 58)
  return {
    values: [
      { label: '串联电抗 X = x₁l', value: fmt(X), unit: 'Ω', key: true },
      { label: '每端并联电纳 B/2', value: `${fmt((B / 2) * 1e4, 4)}×10⁻⁴`, unit: 'S', key: true },
      { label: '充电功率 Q_B ≈ U²B', value: fmt(QB, 3), unit: 'Mvar', key: true },
    ],
    charts: [
      {
        kind: 'xy',
        title: `充电功率随线路长度增加（${fmt(U)} kV）`,
        xLabel: '线路长度 l / km',
        yLabel: 'Q_B / Mvar',
        series: [{ name: 'Q_B', points: curve(ls, (x) => U * U * b1 * 1e-6 * x) }],
        markers: [{ x: l, y: QB, label: fmt(QB, 3) }],
        yMin: 0,
      },
    ],
  }
}

export const longLine: Calculator = ({ x1, b1, l, U }) => {
  const b = b1 * 1e-6
  const Zc = Math.sqrt(x1 / b)
  const beta = Math.sqrt(x1 * b) // rad/km
  const Xexact = (len: number) => Zc * Math.sin(beta * len)
  const Bhalf = (len: number) => Math.tan((beta * len) / 2) / Zc
  const PN = (U * U) / Zc
  const ls = range(100, 1500, 70)
  const warnings: string[] = []
  if (beta * l > Math.PI / 2) warnings.push('线路已超过四分之一波长（50 Hz 约 1500 km），集中参数完全不可用。')
  return {
    values: [
      { label: '波阻抗 Z_c', value: fmt(Zc), unit: 'Ω', key: true },
      { label: '自然功率 P_N', value: fmt(PN), unit: 'MW', key: true },
      { label: '相位常数 β', value: fmt((beta / DEG) * 100, 3), unit: '°/100 km' },
      { label: "精确串联电抗 X'", value: fmt(Xexact(l)), unit: 'Ω', key: true },
      { label: '集中参数串联电抗 x₁l', value: fmt(x1 * l), unit: 'Ω' },
      { label: "精确 B'/2", value: `${fmt(Bhalf(l) * 1e4, 4)}×10⁻⁴`, unit: 'S' },
      { label: '集中参数 b₁l/2', value: `${fmt((b * l * 1e4) / 2, 4)}×10⁻⁴`, unit: 'S' },
    ],
    warnings,
    charts: [
      {
        kind: 'xy',
        title: '串联电抗：精确值与集中参数的差距随长度变大',
        xLabel: '线路长度 l / km',
        yLabel: '串联电抗 / Ω',
        series: [
          { name: "精确 X' = Z_c sin βl", points: curve(ls, Xexact) },
          { name: '集中参数 x₁l', points: curve(ls, (x) => x1 * x), dashed: true },
        ],
        markers: [{ x: l, y: Xexact(l), label: fmt(Xexact(l)) }],
        yMin: 0,
      },
    ],
  }
}

export const lineVoltageDrop: Calculator = ({ P, Q, R, X, U2 }) => {
  const dU = (P * R + Q * X) / U2
  const du = (P * X - Q * R) / U2
  const U1 = Math.hypot(U2 + dU, du)
  const k = (P * P + Q * Q) / (U2 * U2)
  return {
    values: [
      { label: '电压降落纵分量 ΔU', value: fmt(dU), unit: 'kV' },
      { label: '电压降落横分量 δU', value: fmt(du), unit: 'kV' },
      { label: '首端电压 U₁', value: fmt(U1), unit: 'kV', key: true },
      { label: '首末端相角差 δ', value: fmt(Math.atan2(du, U2 + dU) / DEG, 3), unit: '°' },
      { label: '功率损耗 ΔS', value: rect(c(k * R, k * X), 3), unit: 'MVA', key: true },
    ],
    warnings: Q < 0 && dU < 0 ? ['末端发出容性无功较多，ΔU 为负：首端电压反而低于末端（线路末端电压升高）。'] : [],
    charts: [
      {
        kind: 'phasor',
        title: '电压相量图（末端电压为参考）',
        unit: 'kV',
        groups: [
          {
            title: 'U₁ 与 U₂',
            vectors: [
              { label: 'U₂', re: U2, im: 0, series: 0, labelSide: 'right' },
              { label: 'U₁', re: U2 + dU, im: du, series: 3, labelSide: 'left' },
            ],
          },
          {
            title: '电压降落三角形（放大）',
            vectors: [
              { label: 'ΔU', re: dU, im: 0, series: 1, labelSide: 'right' },
              { label: 'jδU', re: 0, im: du, from: [dU, 0], series: 2, labelSide: du >= 0 ? 'right' : 'left' },
              { label: 'U₁ − U₂', re: dU, im: du, series: 3, labelSide: du >= 0 ? 'left' : 'right' },
            ],
          },
        ],
      },
    ],
  }
}

export const transformerParams: Calculator = ({ SN, UN, Pk, Uk, P0, I0 }) => {
  const RT = (Pk * UN * UN) / (1000 * SN * SN)
  const XT = (Uk * UN * UN) / (100 * SN)
  const GT = P0 / (1000 * UN * UN)
  const BT = (I0 * SN) / (100 * UN * UN)
  return {
    values: [
      { label: '电阻 R_T', value: fmt(RT, 3), unit: 'Ω', key: true },
      { label: '电抗 X_T', value: fmt(XT, 3), unit: 'Ω', key: true },
      { label: '电导 G_T', value: fmt(GT, 3), unit: 'S', key: true },
      { label: '电纳 B_T', value: fmt(BT, 3), unit: 'S', key: true },
      { label: 'X_T / R_T', value: fmt(XT / RT, 3) },
    ],
    charts: [],
  }
}

export const offNominalPi: Calculator = ({ XT, k }) => {
  const yT = -1 / XT // 导纳的虚部（纯电抗）
  const series = yT / k
  const iSide = ((1 - k) * yT) / (k * k)
  const jSide = ((k - 1) * yT) / k
  return {
    values: [
      { label: '串联支路 y_T/k', value: rect(c(0, series)), unit: 'pu', key: true },
      { label: 'i 侧并联 (1−k)y_T/k²', value: rect(c(0, iSide)), unit: 'pu', key: true },
      { label: 'j 侧并联 (k−1)y_T/k', value: rect(c(0, jSide)), unit: 'pu', key: true },
      { label: 'k = 1 时', value: '两条并联支路为 0，只剩 y_T' },
    ],
    charts: [
      {
        kind: 'bars',
        title: '并联支路电纳（正为容性，负为感性）',
        yLabel: '电纳 / pu',
        bars: [
          { label: 'i 侧', value: iSide, highlight: true },
          { label: 'j 侧', value: jSide, highlight: true },
        ],
      },
    ],
  }
}

export const powerAngle: Calculator = ({ Eq, U, Xd, Xq }) => {
  const P = (d: number) => ((Eq * U) / Xd) * Math.sin(d * DEG) + ((U * U) / 2) * (1 / Xq - 1 / Xd) * Math.sin(2 * d * DEG)
  const ds = range(0, 180, 180)
  let best = 0
  for (const d of ds) if (P(d) > P(best)) best = d
  const salient = Math.abs(Xq - Xd) > 1e-9
  const series: Series[] = [{ name: salient ? '凸极机 P(δ)' : '隐极机 P(δ)', points: curve(ds, P) }]
  if (salient) series.push({ name: '只计基波项 E_qU sinδ / X_d', points: curve(ds, (d) => ((Eq * U) / Xd) * Math.sin(d * DEG)), dashed: true })
  return {
    values: [
      { label: '功率极限 P_max', value: fmt(P(best), 3), unit: 'pu', key: true },
      { label: '极限功角 δ_max', value: fmt(best), unit: '°', key: true },
      { label: '机型', value: salient ? '凸极机（含磁阻功率）' : '隐极机（X_q = X_d）' },
    ],
    warnings: Xq > Xd ? ['一般 X_q ≤ X_d，这组参数不符合常见同步电机。'] : [],
    charts: [
      {
        kind: 'xy',
        title: '功角特性',
        xLabel: '功角 δ / °',
        yLabel: '电磁功率 P / pu',
        series,
        markers: [{ x: best, y: P(best), label: `P_max ${fmt(P(best), 3)}` }],
        yMin: 0,
      },
    ],
  }
}

export const zipLoad: Calculator = ({ P0, a, b, U }) => {
  const cc = 1 - a - b
  const Us = range(0.7, 1.1, 40)
  const zip = (u: number) => P0 * (a * u * u + b * u + cc)
  return {
    values: [
      { label: '恒功率比例 c = 1 − a − b', value: fmt(cc, 3), key: true },
      { label: 'ZIP 模型功率', value: fmt(zip(U), 4), unit: 'MW', key: true },
      { label: '恒阻抗模型功率', value: fmt(P0 * U * U, 4), unit: 'MW' },
      { label: '恒电流模型功率', value: fmt(P0 * U, 4), unit: 'MW' },
      { label: '恒功率模型功率', value: fmt(P0, 4), unit: 'MW' },
    ],
    warnings: cc < -1e-9 ? ['a + b 超过 1，c 为负，这不是合理的 ZIP 组合。'] : [],
    charts: [
      {
        kind: 'xy',
        title: '负荷功率随电压变化',
        xLabel: '电压 U / pu',
        yLabel: 'P / MW',
        series: [
          { name: 'ZIP', points: curve(Us, zip) },
          { name: '恒阻抗', points: curve(Us, (u) => P0 * u * u), dashed: true },
          { name: '恒电流', points: curve(Us, (u) => P0 * u), dashed: true },
          { name: '恒功率', points: curve(Us, () => P0), dashed: true },
        ],
        markers: [{ x: U, y: zip(U), label: fmt(zip(U), 3) }],
      },
    ],
  }
}

export const perUnitConvert: Calculator = ({ Z, SN, UN, SB, UB }) => {
  const Znew = Z * (SB / SN) * (UN / UB) ** 2
  const ZB = (UB * UB) / SB
  const IB = SB / (SQRT3 * UB)
  return {
    values: [
      { label: '新基准下标幺值', value: fmt(Znew), unit: 'pu', key: true },
      { label: '有名值', value: fmt(Znew * ZB), unit: 'Ω', key: true },
      { label: '新基准阻抗 Z_B', value: fmt(ZB), unit: 'Ω' },
      { label: '新基准电流 I_B', value: fmt(IB), unit: 'kA' },
      { label: '原基准下有名值（核对）', value: fmt(Z * ((UN * UN) / SN)), unit: 'Ω' },
    ],
    charts: [],
  }
}

export const dqTransform: Calculator = ({ Im, phi, theta0 }) => {
  const T = 0.02
  const ts = range(0, T, 120)
  const w = OMEGA
  const phase = (t: number, k: number) => Im * Math.cos(w * t + phi * DEG - (k * 2 * Math.PI) / 3)
  const dq = (t: number) => {
    const th = w * t + theta0 * DEG
    const [ia, ib, ic] = [0, 1, 2].map((k) => phase(t, k))
    const d = (2 / 3) * (ia * Math.cos(th) + ib * Math.cos(th - (2 * Math.PI) / 3) + ic * Math.cos(th + (2 * Math.PI) / 3))
    const q = -(2 / 3) * (ia * Math.sin(th) + ib * Math.sin(th - (2 * Math.PI) / 3) + ic * Math.sin(th + (2 * Math.PI) / 3))
    return { d, q, z: (ia + ib + ic) / 3 }
  }
  const v = dq(0)
  const ms = (t: number) => t * 1000
  return {
    values: [
      { label: 'i_d', value: fmt(v.d, 4), unit: 'A', key: true },
      { label: 'i_q', value: fmt(v.q, 4), unit: 'A', key: true },
      { label: 'i_0', value: fmt(Math.abs(v.z) < 1e-9 ? 0 : v.z, 4), unit: 'A' },
      { label: '√(i_d² + i_q²)', value: fmt(Math.hypot(v.d, v.q), 4), unit: 'A' },
    ],
    charts: [
      {
        kind: 'xy',
        title: 'abc 坐标下是正弦，dq 坐标下是常数',
        xLabel: '时间 t / ms',
        yLabel: '电流 / A',
        series: [
          { name: 'i_a', points: ts.map((t) => [ms(t), phase(t, 0)]) },
          { name: 'i_b', points: ts.map((t) => [ms(t), phase(t, 1)]) },
          { name: 'i_d', points: ts.map((t) => [ms(t), dq(t).d]), dashed: true },
          { name: 'i_q', points: ts.map((t) => [ms(t), dq(t).q]), dashed: true },
        ],
        yMin: -Im * 1.1,
        yMax: Im * 1.1,
      },
    ],
  }
}
