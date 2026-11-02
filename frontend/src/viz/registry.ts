// 计算器白名单：课程 JSON 的 visualization.calculator 只能取这里的 ID。
import * as basic from './calcBasics'
import * as analysis from './calcAnalysis'
import type { Calculator } from './types'

export const CALCULATORS: Record<string, Calculator> = {
  'rated-voltage-chain': basic.ratedVoltageChain,
  'load-factor': basic.loadFactor,
  'ungrounded-capacitive-current': basic.ungroundedCapacitiveCurrent,
  'complex-power-triangle': basic.complexPowerTriangle,
  'line-parameters': basic.lineParameters,
  'line-pi': basic.linePi,
  'long-line': basic.longLine,
  'line-voltage-drop': basic.lineVoltageDrop,
  'transformer-params': basic.transformerParams,
  'off-nominal-pi': basic.offNominalPi,
  'power-angle': basic.powerAngle,
  'zip-load': basic.zipLoad,
  'per-unit-convert': basic.perUnitConvert,
  'dq-transform': basic.dqTransform,
  'ybus-builder': analysis.ybusBuilder,
  'radial-two-step': analysis.radialTwoStep,
  'nr-two-bus': analysis.nrTwoBus,
  'dc-flow-3bus': analysis.dcFlow3Bus,
  'frequency-response': analysis.frequencyResponse,
  'short-circuit-waveform': analysis.shortCircuitWaveform,
  'generator-sc-envelope': analysis.generatorScEnvelope,
  'sc-three-phase': analysis.scThreePhase,
  'sequence-decomposition': analysis.sequenceDecomposition,
  'unbalanced-fault': analysis.unbalancedFault,
  'traction-unbalance': analysis.tractionUnbalance,
  'harmonic-spectrum': analysis.harmonicSpectrum,
  'dc-traction-two-substations': analysis.dcTractionTwoSubstations,
}
