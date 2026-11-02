import { useState } from 'react'
import type { ChatConfig, ModelSettings } from '../lib/chat'

// 模型设置：平台额度或自己的 API 密钥（BYOK）。AI 导师和读文献共用。
export default function ModelSettingsForm({ config, settings, onSave }: { config: ChatConfig | null; settings: ModelSettings; onSave: (s: ModelSettings) => void }) {
  const providers = config?.providers ?? []
  const [mode, setMode] = useState(settings.mode)
  const [provider, setProvider] = useState(settings.mode === 'byok' ? settings.provider : 'deepseek')
  const current = providers.find((p) => p.id === provider)
  const [model, setModel] = useState(settings.mode === 'byok' ? settings.model : '')
  const [apiKey, setApiKey] = useState(settings.mode === 'byok' ? settings.apiKey : '')
  const effectiveModel = current?.models.includes(model) ? model : (current?.models[0] ?? '')

  return (
    <form
      className="tutor-settings"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(mode === 'platform' ? { mode } : { mode, provider, model: effectiveModel, apiKey: apiKey.trim() })
      }}
    >
      <label className="radio">
        <input type="radio" name="mode" checked={mode === 'platform'} onChange={() => setMode('platform')} />
        平台免费额度{config && !config.platformAvailable ? '（暂未开通）' : ''}
      </label>
      <label className="radio">
        <input type="radio" name="mode" checked={mode === 'byok'} onChange={() => setMode('byok')} />
        使用自己的 API 密钥
      </label>
      {mode === 'byok' && (
        <div className="byok-fields">
          <label>
            服务商
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            模型
            <select value={effectiveModel} onChange={(e) => setModel(e.target.value)}>
              {current?.models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            API 密钥
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="sk-..." />
          </label>
          <p className="small muted">密钥只保存在这台设备的浏览器里，提问时经本站服务器转发给服务商，服务器不保存。公用电脑上用完请清除。</p>
        </div>
      )}
      <div className="actions">
        <button className="button primary" type="submit" disabled={mode === 'byok' && (!apiKey.trim() || !effectiveModel)}>
          保存
        </button>
        {settings.mode === 'byok' && (
          <button className="link-button" type="button" onClick={() => onSave({ mode: 'platform' })}>
            清除我的密钥
          </button>
        )}
      </div>
    </form>
  )
}
