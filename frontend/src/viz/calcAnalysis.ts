// 第 3–5 章：潮流、调频、短路、不对称故障、电能质量与牵引供电
import { A, A2, DEG, OMEGA, SQRT3, abs, add, c, curve, div, fmt, mul, neg, polar, range, rect, scale, type C } from './math'
import type { Calculator, Chart, Vector } from './types'

const TRIANGLE = [
  { id: '1', label: '1', x: 0.5, y: 0.12 },
  { id: '2', label: '2', x: 0.12, y: 0.85 },
  { id: '3', label: '3', x: 0.88, y: 0.85 },
]

export const ybusBuilder: Calculator = ({ x12, x13, x23 }) => {
  const y = { '12': 1 / x12, '13': 1 / x13, '23': 1 / x23 }
  const B = [
    [-(y['12'] + y['13']), y['12'], y['13']],
    [y['12'], -(y['12'] + y['23']), y['23']],
    [y['13'], y['23'], -(y['13'] + y['23'])],
  ]
  return {
    values: [
      { label: 'Y₁₁', value: rect(c(0, B[0][0])), unit: 'pu', key: true },
      { label: 'Y₂₂', value: rect(c(0, B[1][1])), unit: 'pu', key: true },
      { label: 'Y₃₃', value: rect(c(0, B[2][2])), unit: 'pu', key: true },
      { label: '每行之和', value: '0（无对地支路时成立）' },
    ],
    charts: [
      {
        kind: 'table',
        title: '节点导纳矩阵 Y（pu）',
        headers: ['', '1', '2', '3'],
        rows: B.map((row, i) => [String(i + 1), ...row.map((b) => rect(c(0, b)))]),
      },
      {
        kind: 'network',
        title: '网络与支路导纳',
        nodes: TRIANGLE,
        edges: [
          { from: '1', to: '2', label: `y = ${rect(c(0, -y['12']), 3)}` },
          { from: '1', to: '3', label: `y = ${rect(c(0, -y['13']), 3)}` },
          { from: '2', to: '3', label: `y = ${rect(c(0, -y['23']), 3)}` },
        ],
      },
    ],
  }
}

export const radialTwoStep: Calculator = ({ P, Q, R, X, U1 }) => {
  const UN = 110
  const solve = (q: number) => {
    const k = (P * P + q * q) / (UN * UN)
    const P1 = P + k * R
    const Q1 = q + k * X
    const dU = (P1 * R + Q1 * X) / U1
    const du = (P1 * X - Q1 * R) / U1
    return { P1, Q1, U2: Math.hypot(U1 - dU, du) }
  }
  const s = solve(Q)
  const qs = range(-20, 40, 60)
  return {
    values: [
      { label: '第一步：首端功率 S₁', value: rect(c(s.P1, s.Q1), 4), unit: 'MVA', key: true },
      { label: '功率损耗 ΔS', value: rect(c(s.P1 - P, s.Q1 - Q), 3), unit: 'MVA' },
      { label: '第二步：末端电压 U₂', value: fmt(s.U2), unit: 'kV', key: true },
      { label: '电压损耗 U₁ − U₂', value: fmt(U1 - s.U2, 3), unit: 'kV' },
    ],
    charts: [
      {
        kind: 'xy',
        title: '末端电压随末端无功变化（无功是压降的主要来源）',
        xLabel: '末端无功 Q / Mvar',
        yLabel: 'U₂ / kV',
        series: [{ name: 'U₂', points: curve(qs, (q) => solve(q).U2) }],
        markers: [{ x: Q, y: s.U2, label: fmt(s.U2) }],
        hLines: [{ y: UN, label: '额定 110 kV' }],
      },
    ],
  }
}

/** 两节点牛顿法：节点 1 平衡 1∠0，线路 jX，节点 2 为 PQ 负荷。返回每次迭代记录。 */
export function newtonTwoBus(P: number, Q: number, X: number, maxIter = 10, tol = 1e-6) {
  let th = 0
  let U = 1
  const rows: { k: number; th: number; U: number; mis: number }[] = []
  for (let k = 0; k <= maxIter; k++) {
    const Pc = (U / X) * Math.sin(th)
    const Qc = (U * U) / X - (U / X) * Math.cos(th)
    const dP = -P - Pc
    const dQ = -Q - Qc
    const mis = Math.max(Math.abs(dP), Math.abs(dQ))
    rows.push({ k, th, U, mis })
    if (mis < tol) return { converged: true, rows }
    if (!Number.isFinite(mis) || U <= 0.05) break
    const H = (U / X) * Math.cos(th)
    const N = Math.sin(th) / X
    const M = (U / X) * Math.sin(th)
    const L = (2 * U) / X - Math.cos(th) / X
    const det = H * L - N * M
    if (Math.abs(det) < 1e-12) break
    th += (L * dP - N * dQ) / det
    U += (-M * dP + H * dQ) / det
  }
  return { converged: false, rows }
}

export const nrTwoBus: Calculator = ({ P, Q, X }) => {
  const { converged, rows } = newtonTwoBus(P, Q, X)
  const last = rows[rows.length - 1]
  const Plim = 1 / (2 * X)
  return {
    values: converged
      ? [
          { label: 'θ₂', value: fmt(last.th / DEG, 4), unit: '°', key: true },
          { label: 'U₂', value: fmt(last.U, 5), unit: 'pu', key: true },
          { label: '迭代次数', value: String(last.k), key: true },
        ]
      : [{ label: '结果', value: '不收敛', key: true }],
    warnings: converged ? [] : [`牛顿法不收敛：负荷超出了线路的传输能力（Q = 0 时极限约 P = 1/(2X) = ${fmt(Plim, 3)} pu），潮流无解。`],
    charts: [
      {
        kind: 'xy',
        title: '最大不平衡量（对数坐标）：牛顿法二次收敛',
        xLabel: '迭代次数',
        yLabel: 'lg 最大不平衡量',
        series: [{ name: 'lg|ΔP, ΔQ|max', points: rows.map((r) => [r.k, Math.log10(Math.max(r.mis, 1e-16))]) }],
        hLines: [{ y: -6, label: '收敛判据 10⁻⁶' }],
      },
      {
        kind: 'table',
        title: '迭代过程',
        headers: ['k', 'θ₂ / °', 'U₂ / pu', '最大不平衡量'],
        rows: rows.map((r) => [String(r.k), fmt(r.th / DEG, 5), fmt(r.U, 5), fmt(r.mis, 3)]),
      },
    ],
  }
}

export const dcFlow3Bus: Calculator = ({ P2, P3, x12, x13, x23 }) => {
  const b11 = 1 / x12 + 1 / x23
  const b12 = -1 / x23
  const b22 = 1 / x13 + 1 / x23
  const det = b11 * b22 - b12 * b12
  const th2 = (b22 * P2 - b12 * P3) / det
  const th3 = (-b12 * P2 + b11 * P3) / det
  const f12 = (0 - th2) / x12
  const f13 = (0 - th3) / x13
  const f23 = (th2 - th3) / x23
  const P1 = -(P2 + P3)
  return {
    values: [
      { label: 'θ₂', value: fmt(th2 / DEG, 4), unit: '°' },
      { label: 'θ₃', value: fmt(th3 / DEG, 4), unit: '°' },
      { label: 'P₁₂', value: fmt(f12, 3), unit: 'pu', key: true },
      { label: 'P₁₃', value: fmt(f13, 3), unit: 'pu', key: true },
      { label: 'P₂₃', value: fmt(f23, 3), unit: 'pu', key: true },
      { label: '平衡节点注入 P₁', value: fmt(P1, 3), unit: 'pu' },
    ],
    charts: [
      {
        kind: 'network',
        title: '支路潮流（箭头为有功方向）',
        nodes: [
          { ...TRIANGLE[0], sub: `P = ${fmt(P1, 3)}，θ = 0` },
          { ...TRIANGLE[1], sub: `P = ${fmt(P2, 3)}，θ = ${fmt(th2 / DEG, 3)}°` },
          { ...TRIANGLE[2], sub: `P = ${fmt(P3, 3)}，θ = ${fmt(th3 / DEG, 3)}°` },
        ],
        edges: [
          { from: '1', to: '2', label: fmt(Math.abs(f12), 3), flow: f12 },
          { from: '1', to: '3', label: fmt(Math.abs(f13), 3), flow: f13 },
          { from: '2', to: '3', label: fmt(Math.abs(f23), 3), flow: f23 },
        ],
      },
    ],
  }
}

export const frequencyResponse: Calculator = ({ dPL, dPG, KG, KLs, PL }) => {
  const KL = (KLs * PL) / 50
  const K = KG + KL
  if (K <= 0) {
    return {
      values: [{ label: '频率偏差', value: '无法确定', key: true }],
      warnings: ['K_G 和 K_L 都为 0 时，系统没有任何频率调节能力，负荷一变化频率就无法稳定。'],
      charts: [],
    }
  }
  const df = -(dPL - dPG) / K
  const span = Math.max(Math.abs(df) * 1.6, 0.2)
  const fs = range(50 - span, 50 + span * 0.4, 60)
  const gen = (f: number, extra: number) => PL + extra + KG * (50 - f)
  const load = (f: number, extra: number) => PL + extra + KL * (f - 50)
  return {
    values: [
      { label: '负荷单位调节功率 K_L', value: fmt(KL, 4), unit: 'MW/Hz' },
      { label: '系统单位调节功率 K_G + K_L', value: fmt(K, 4), unit: 'MW/Hz' },
      { label: '频率偏差 Δf', value: fmt(df, 3), unit: 'Hz', key: true },
      { label: '新稳态频率', value: fmt(50 + df, 5), unit: 'Hz', key: true },
      { label: '发电机增发（一次调频）', value: fmt(-KG * df, 4), unit: 'MW' },
      { label: '负荷自然减少', value: fmt(-KL * df, 4), unit: 'MW' },
    ],
    warnings: Math.abs(df) > 0.2 ? ['频率偏差超过 ±0.2 Hz，实际电网需要二次调频或切负荷。'] : [],
    charts: [
      {
        kind: 'xy',
        title: '发电机与负荷静特性：交点即稳态运行点',
        xLabel: '频率 f / Hz',
        yLabel: '功率 / MW',
        series: [
          { name: dPG > 0 ? '发电机（二次调频后）' : '发电机', points: curve(fs, (f) => gen(f, dPG)) },
          { name: '负荷（增加后）', points: curve(fs, (f) => load(f, dPL)) },
          ...(dPG > 0 ? [{ name: '发电机（原）', points: curve(fs, (f) => gen(f, 0)), dashed: true }] : []),
          { name: '负荷（原）', points: curve(fs, (f) => load(f, 0)), dashed: true },
        ],
        markers: [
          { x: 50, y: PL, label: '原运行点' },
          { x: 50 + df, y: load(50 + df, dPL), label: `${fmt(50 + df, 5)} Hz` },
        ],
      },
    ],
  }
}

export const shortCircuitWaveform: Calculator = ({ Ip, Ta, alpha }) => {
  const ta = Ta / 1000
  const phi = Math.atan(OMEGA * ta) // 短路回路阻抗角
  const Im = Math.SQRT2 * Ip
  const per = (t: number) => Im * Math.sin(OMEGA * t + alpha * DEG - phi)
  const ape = (t: number) => -Im * Math.sin(alpha * DEG - phi) * Math.exp(-t / ta)
  const ts = range(0, 0.1, 400)
  let peak = 0
  for (const t of ts) peak = Math.max(peak, Math.abs(per(t) + ape(t)))
  const kM = 1 + Math.exp(-0.01 / ta)
  const ms = (t: number) => t * 1000
  return {
    values: [
      { label: '冲击系数 k_M = 1 + e^(−0.01/T_a)', value: fmt(kM, 3), key: true },
      { label: '冲击电流 i_M（最严重情况）', value: fmt(kM * Im, 3), unit: 'kA', key: true },
      { label: '冲击电流有效值 I_M', value: fmt(Ip * Math.sqrt(1 + 2 * (kM - 1) ** 2), 3), unit: 'kA' },
      { label: '当前相角下的电流最大瞬时值', value: fmt(peak, 3), unit: 'kA' },
      { label: '短路回路阻抗角 φ', value: fmt(phi / DEG, 3), unit: '°' },
    ],
    charts: [
      {
        kind: 'xy',
        title: '短路电流 = 周期分量 + 衰减的非周期分量',
        xLabel: '时间 t / ms',
        yLabel: '电流 / kA',
        series: [
          { name: '全电流', points: ts.map((t) => [ms(t), per(t) + ape(t)]) },
          { name: '周期分量', points: ts.map((t) => [ms(t), per(t)]), dashed: true },
          { name: '非周期分量', points: ts.map((t) => [ms(t), ape(t)]), dashed: true },
        ],
        hLines: [{ y: kM * Im, label: 'i_M' }],
      },
    ],
  }
}

export const generatorScEnvelope: Calculator = ({ Xdpp, Xdp, Xd, Tdpp, Tdp }) => {
  const I2 = 1 / Xdpp
  const I1 = 1 / Xdp
  const I0 = 1 / Xd
  const env = (t: number) => (I2 - I1) * Math.exp(-t / Tdpp) + (I1 - I0) * Math.exp(-t / Tdp) + I0
  const IN = 100 / (SQRT3 * 10.5) // 以 100 MVA、10.5 kV 发电机为例
  const tEnd = Math.max(4 * Tdp, 0.5)
  const ts = range(0, tEnd, 200)
  const warnings = Xdpp < Xdp && Xdp < Xd ? [] : ['一般有 X″_d < X′_d < X_d，这组参数顺序不合常理。']
  return {
    values: [
      { label: "次暂态电流 I″ = 1/X″_d", value: `${fmt(I2, 4)} pu ≈ ${fmt(I2 * IN, 3)} kA`, key: true },
      { label: "暂态电流 I′ = 1/X′_d", value: `${fmt(I1, 4)} pu ≈ ${fmt(I1 * IN, 3)} kA`, key: true },
      { label: '稳态电流 I∞ = 1/X_d', value: `${fmt(I0, 4)} pu ≈ ${fmt(I0 * IN, 3)} kA`, key: true },
      { label: 'kA 换算基准', value: '100 MVA、10.5 kV 发电机，额定电流 5.50 kA' },
    ],
    warnings,
    charts: [
      {
        kind: 'xy',
        title: '周期分量有效值包络线',
        xLabel: '时间 t / s',
        yLabel: '电流 / pu',
        series: [{ name: '包络线', points: curve(ts, env) }],
        hLines: [
          { y: I1, label: "I′" },
          { y: I0, label: 'I∞' },
        ],
        markers: [{ x: 0, y: I2, label: `I″ ${fmt(I2, 3)}` }],
        yMin: 0,
      },
    ],
  }
}

export const scThreePhase: Calculator = ({ Xg, Xt, l, x1, Uav }) => {
  const SB = 100
  const at = (len: number) => {
    const XL = (x1 * len * SB) / (Uav * Uav)
    const Xs = Xg + Xt + XL
    const Ipu = 1 / Xs
    return { XL, Xs, Ipu, I: (Ipu * SB) / (SQRT3 * Uav) }
  }
  const r = at(l)
  const ls = range(0, 200, 80)
  return {
    values: [
      { label: '线路电抗标幺值', value: fmt(r.XL, 4), unit: 'pu' },
      { label: '总电抗 X_Σ', value: fmt(r.Xs, 4), unit: 'pu' },
      { label: "起始次暂态电流 I″", value: fmt(r.I, 4), unit: 'kA', key: true },
      { label: '短路容量 S_k', value: fmt(r.Ipu * SB, 4), unit: 'MVA', key: true },
      { label: '冲击电流 i_M = 2.55 I″', value: fmt(2.55 * r.I, 4), unit: 'kA', key: true },
    ],
    charts: [
      {
        kind: 'xy',
        title: '短路点离电源越远，短路电流越小',
        xLabel: '短路点到母线的线路长度 / km',
        yLabel: "I″ / kA",
        series: [{ name: "I″", points: curve(ls, (x) => at(x).I) }],
        markers: [{ x: l, y: r.I, label: fmt(r.I, 3) }],
        yMin: 0,
      },
    ],
  }
}

export const sequenceDecomposition: Calculator = ({ Ia, Ib, Ic, phb, phc }) => {
  const a = c(Ia, 0)
  const b = { re: Ib * Math.cos(phb * DEG), im: Ib * Math.sin(phb * DEG) }
  const cc = { re: Ic * Math.cos(phc * DEG), im: Ic * Math.sin(phc * DEG) }
  const a1 = scale(add(a, mul(A, b), mul(A2, cc)), 1 / 3)
  const a2 = scale(add(a, mul(A2, b), mul(A, cc)), 1 / 3)
  const a0 = scale(add(a, b, cc), 1 / 3)
  const v = (label: string, z: C, series: number): Vector => ({ label, re: z.re, im: z.im, series })
  return {
    values: [
      { label: '正序 I_a1', value: polar(a1), unit: 'pu', key: true },
      { label: '负序 I_a2', value: polar(a2), unit: 'pu', key: true },
      { label: '零序 I_a0', value: polar(a0), unit: 'pu', key: true },
      { label: '不平衡度 |I₂|/|I₁|', value: abs(a1) > 1e-9 ? `${fmt((abs(a2) / abs(a1)) * 100, 3)}%` : '—' },
    ],
    charts: [
      {
        kind: 'phasor',
        title: '三相相量与三组对称分量',
        unit: 'pu',
        groups: [
          { title: '原三相', vectors: [v('a', a, 0), v('b', b, 1), v('c', cc, 2)] },
          { title: '正序（a→b→c 顺时针）', vectors: [v('a1', a1, 0), v('b1', mul(A2, a1), 1), v('c1', mul(A, a1), 2)] },
          { title: '负序（a→c→b）', vectors: [v('a2', a2, 0), v('b2', mul(A, a2), 1), v('c2', mul(A2, a2), 2)] },
          { title: '零序（三相同相）', vectors: [v('a0', a0, 0), v('b0', a0, 1), v('c0', a0, 2)] },
        ],
      },
    ],
  }
}

const FAULT_NAMES = ['单相接地', '两相短路', '两相接地', '三相短路']

/** 各类短路的序电流和相电流（a 相为特殊相；纯电抗网络，过渡阻抗为纯电阻 Zf） */
export function faultCurrents(type: number, X1: number, X2: number, X0: number, Zf = 0) {
  const Z1 = c(0, X1)
  const Z2 = c(0, X2)
  const Z0 = c(0, X0)
  const zf = c(Zf, 0)
  const one = c(1, 0)
  let I1: C
  let I2: C
  let I0: C
  if (type === 1) {
    I1 = div(one, add(Z1, Z2, Z0, scale(zf, 3)))
    I2 = I1
    I0 = I1
  } else if (type === 2) {
    I1 = div(one, add(Z1, Z2, zf))
    I2 = neg(I1)
    I0 = c(0)
  } else if (type === 3) {
    const Z0f = add(Z0, scale(zf, 3))
    const par = div(mul(Z2, Z0f), add(Z2, Z0f))
    I1 = div(one, add(Z1, par))
    I2 = neg(div(mul(I1, Z0f), add(Z2, Z0f)))
    I0 = neg(div(mul(I1, Z2), add(Z2, Z0f)))
  } else {
    I1 = div(one, add(Z1, zf))
    I2 = c(0)
    I0 = c(0)
  }
  const Ia = add(I1, I2, I0)
  const Ib = add(mul(A2, I1), mul(A, I2), I0)
  const Ic = add(mul(A, I1), mul(A2, I2), I0)
  // 故障电流：单相接地取 a 相，其余取 b 相（两相、两相接地的故障相；三相各相相等）
  const If = type === 1 ? abs(Ia) : abs(Ib)
  return { I1, I2, I0, Ia, Ib, Ic, If }
}

export const unbalancedFault: Calculator = (p) => {
  const { X1, X2, X0 } = p
  const Zf = p.Zf ?? 0
  const all = [1, 2, 3, 4].map((t) => faultCurrents(t, X1, X2, X0, Zf).If)
  const bars: Chart = {
    kind: 'bars',
    title: '四种短路的故障电流对比',
    yLabel: '故障电流 / pu',
    bars: FAULT_NAMES.map((label, i) => ({ label, value: all[i], highlight: p.type === undefined || p.type === i + 1 })),
  }

  if (p.type === undefined) {
    // 正序等效定则：看零序电抗变化时四种短路电流的相对大小
    const xs = range(0.05, 2, 78)
    return {
      values: FAULT_NAMES.map((label, i) => ({ label, value: fmt(all[i], 3), unit: 'pu', key: true })),
      charts: [
        bars,
        {
          kind: 'xy',
          title: '故障电流随零序电抗变化（X₀ 小时单相接地最严重）',
          xLabel: 'X₀Σ / pu',
          yLabel: '故障电流 / pu',
          series: FAULT_NAMES.map((name, i) => ({ name, points: curve(xs, (x) => faultCurrents(i + 1, X1, X2, x).If), dashed: i === 3 || i === 1 })),
          vLines: [{ x: X0, label: `X₀ = ${fmt(X0, 3)}` }],
          yMin: 0,
        },
      ],
    }
  }

  const type = Math.min(4, Math.max(1, Math.round(p.type)))
  const r = faultCurrents(type, X1, X2, X0, Zf)
  const vec = (label: string, z: C, series: number): Vector => ({ label, re: z.re, im: z.im, series })
  return {
    values: [
      { label: '故障类型', value: FAULT_NAMES[type - 1], key: true },
      { label: '正序电流 I_a1', value: polar(r.I1), unit: 'pu' },
      { label: '负序电流 I_a2', value: polar(r.I2), unit: 'pu' },
      { label: '零序电流 I_a0', value: polar(r.I0), unit: 'pu' },
      { label: '故障相电流', value: fmt(r.If, 3), unit: 'pu', key: true },
      { label: '与三相短路之比', value: fmt(r.If / all[3], 3) },
    ],
    charts: [
      {
        kind: 'phasor',
        title: '序电流与相电流相量',
        unit: 'pu',
        groups: [
          { title: 'a 相序电流', vectors: [vec('I_a1', r.I1, 0), vec('I_a2', r.I2, 1), vec('I_a0', r.I0, 2)] },
          { title: '三相电流', vectors: [vec('I_a', r.Ia, 0), vec('I_b', r.Ib, 1), vec('I_c', r.Ic, 2)] },
        ],
      },
      bars,
    ],
  }
}

export const tractionUnbalance: Calculator = ({ SL, Sk }) => {
  const eps = (SL / Sk) * 100
  const ks = range(200, 10000, 98)
  return {
    values: [
      { label: '负序电压不平衡度 ε_U', value: fmt(eps, 3), unit: '%', key: true },
      { label: '对照 GB/T 15543 正常限值 2%', value: eps <= 2 ? '满足' : '超标', key: true },
      { label: '满足 2% 所需最小短路容量', value: fmt(SL / 0.02, 4), unit: 'MVA' },
    ],
    warnings: eps > 2 ? ['超过 2%：可考虑接入更高电压等级（短路容量更大）、换相连接或平衡变压器。'] : [],
    charts: [
      {
        kind: 'xy',
        title: '接入点短路容量越大，不平衡度越小',
        xLabel: '接入点短路容量 S_k / MVA',
        yLabel: 'ε_U / %',
        series: [{ name: 'ε_U', points: curve(ks, (k) => (SL / k) * 100) }],
        markers: [{ x: Sk, y: eps, label: `${fmt(eps, 3)}%` }],
        hLines: [
          { y: 2, label: '正常限值 2%' },
          { y: 4, label: '短时限值 4%' },
        ],
        yMin: 0,
        yMax: Math.max(6, Math.min(eps * 1.3, 20)),
      },
    ],
  }
}

export const harmonicSpectrum: Calculator = ({ h5, h7, h11, Sk, Qc }) => {
  const thd = Math.sqrt(h5 * h5 + h7 * h7 + h11 * h11)
  const hr = Math.sqrt(Sk / Qc)
  const near = [5, 7, 11].find((h) => Math.abs(hr - h) < 0.5)
  const ts = range(0, 20, 300)
  const w = (t: number) => {
    const x = (2 * Math.PI * t) / 20
    return Math.sin(x) + (h5 / 100) * Math.sin(5 * x) + (h7 / 100) * Math.sin(7 * x) + (h11 / 100) * Math.sin(11 * x)
  }
  const warnings: string[] = []
  if (near) warnings.push(`谐振次数 ${fmt(hr, 3)} 接近 ${near} 次特征谐波，电容器会放大谐波，需要串联电抗器。`)
  if (thd > 4) warnings.push('电压总谐波畸变率超过 4%（GB/T 14549 对 10 kV 电网的限值，以现行标准为准）。')
  return {
    values: [
      { label: '电压总谐波畸变率 THD', value: fmt(thd, 3), unit: '%', key: true },
      { label: '并联谐振次数 h_r ≈ √(S_k/Q_C)', value: fmt(hr, 3), key: true },
    ],
    warnings,
    charts: [
      {
        kind: 'xy',
        title: '合成电压波形（一个工频周期）',
        xLabel: '时间 t / ms',
        yLabel: '电压 / pu',
        series: [
          { name: '含谐波', points: curve(ts, w) },
          { name: '纯基波', points: curve(ts, (t) => Math.sin((2 * Math.PI * t) / 20)), dashed: true },
        ],
      },
      {
        kind: 'bars',
        title: '谐波含有率',
        yLabel: '含有率 / %',
        bars: [
          { label: '5 次', value: h5, highlight: near === 5 },
          { label: '7 次', value: h7, highlight: near === 7 },
          { label: '11 次', value: h11, highlight: near === 11 },
        ],
        hLines: [{ y: 3.2, label: '奇次限值 3.2%' }],
      },
    ],
  }
}

export const dcTractionTwoSubstations: Calculator = ({ U0, P, L, x, r }) => {
  const pos = Math.min(Math.max(x, 0), L)
  const solve = (xx: number) => {
    const Rl = r * xx
    const Rr = r * (L - xx)
    const Req = Rl + Rr > 0 ? (Rl * Rr) / (Rl + Rr) : 0
    const disc = U0 * U0 - 4 * P * 1e6 * Req
    if (disc < 0) return null
    const U = (U0 + Math.sqrt(disc)) / 2
    return { U, I: (P * 1e6) / U, Il: Rl > 0 ? (U0 - U) / Rl : 0, Ir: Rr > 0 ? (U0 - U) / Rr : 0 }
  }
  const s = solve(pos)
  const warnings: string[] = []
  if (x > L) warnings.push('列车位置超出了两座变电所之间的区间，已按右侧变电所处计算。')
  if (!s) {
    return {
      values: [{ label: '列车电压', value: '无解', key: true }],
      warnings: [...warnings, '列车功率超过这一位置的最大可供功率（U₀² < 4PR_eq），网压崩溃。'],
      charts: [],
    }
  }
  const xs = range(0, L, 60)
  return {
    values: [
      { label: '列车电压', value: fmt(s.U), unit: 'V', key: true },
      { label: '列车电流', value: fmt(s.I), unit: 'A', key: true },
      { label: '左侧变电所供电', value: fmt(s.Il), unit: 'A' },
      { label: '右侧变电所供电', value: fmt(s.Ir), unit: 'A' },
      { label: '网压降', value: fmt(U0 - s.U, 3), unit: 'V' },
    ],
    warnings,
    charts: [
      {
        kind: 'xy',
        title: '网压沿线分布',
        xLabel: '距左侧变电所 / km',
        yLabel: '电压 / V',
        series: [
          { name: '当前位置下的网压', points: [[0, U0], [pos, s.U], [L, U0]] },
          { name: '列车在各位置时的电压', points: curve(xs, (xx) => solve(xx)?.U ?? NaN), dashed: true },
        ],
        markers: [{ x: pos, y: s.U, label: `${fmt(s.U)} V` }],
      },
    ],
  }
}
