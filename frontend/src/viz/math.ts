// 计算器用到的小工具：数字格式化、复数运算、取样。

export const SQRT3 = Math.sqrt(3)
export const DEG = Math.PI / 180
export const OMEGA = 2 * Math.PI * 50

/** 按有效数字格式化，去掉多余的 0；很大或很小的数用 ×10ⁿ 表示。 */
export function fmt(x: number, digits = 4): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const abs = Math.abs(x)
  if (abs >= 1e6 || abs < 1e-3) {
    const exp = Math.floor(Math.log10(abs))
    const mant = x / 10 ** exp
    return `${trim(mant.toPrecision(digits))}×10${sup(exp)}`
  }
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(abs)))
  return trim(x.toFixed(Math.min(decimals, 6)))
}

function trim(s: string) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

const SUP: Record<string, string> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
function sup(n: number) {
  return String(n)
    .split('')
    .map((c) => SUP[c])
    .join('')
}

/** 复数的极坐标写法，例如 3.33∠-30° */
export function polar(c: C, digits = 3) {
  const m = abs(c)
  if (m < 1e-12) return '0'
  return `${fmt(m, digits)}∠${fmt(Math.atan2(c.im, c.re) / DEG, 3)}°`
}

/** 纯虚数或复数的直角坐标写法 */
export function rect(c: C, digits = 4) {
  const re = Math.abs(c.re) < 1e-12 ? 0 : c.re
  const im = Math.abs(c.im) < 1e-12 ? 0 : c.im
  if (re === 0 && im === 0) return '0'
  if (re === 0) return `${im < 0 ? '−' : ''}j${fmt(Math.abs(im), digits)}`
  if (im === 0) return fmt(re, digits)
  return `${fmt(re, digits)} ${im < 0 ? '−' : '+'} j${fmt(Math.abs(im), digits)}`
}

export interface C {
  re: number
  im: number
}
export const c = (re: number, im = 0): C => ({ re, im })
export const cpol = (m: number, deg: number): C => ({ re: m * Math.cos(deg * DEG), im: m * Math.sin(deg * DEG) })
export const add = (...xs: C[]): C => xs.reduce((s, x) => ({ re: s.re + x.re, im: s.im + x.im }), c(0))
export const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im })
export const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
export const scale = (a: C, k: number): C => ({ re: a.re * k, im: a.im * k })
export const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
export const abs = (a: C) => Math.hypot(a.re, a.im)
export const neg = (a: C): C => ({ re: -a.re, im: -a.im })
/** 旋转因子 a = 1∠120° */
export const A = cpol(1, 120)
export const A2 = cpol(1, 240)

/** 在 [a, b] 上等距取 n+1 个点 */
export function range(a: number, b: number, n = 80): number[] {
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
}

export const curve = (xs: number[], f: (x: number) => number): [number, number][] =>
  xs.map((x) => [x, f(x)] as [number, number]).filter(([, y]) => Number.isFinite(y))
