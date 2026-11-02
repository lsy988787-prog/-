import { useState, type ReactNode } from 'react'
import { getToken, setToken } from '../../lib/reader'

// 读文献只给负责人自己用：第一次进入时输入服务器上设置的访问口令（READER_TOKEN），保存在本机浏览器。
export default function TokenGate({ error, onSaved, children }: { error?: string; onSaved: () => void; children?: ReactNode }) {
  const [value, setValue] = useState(getToken())
  return (
    <main className="page narrow">
      <h1>读文献</h1>
      <p className="lead">这个模块只给你自己用。请输入服务器上设置的访问口令（环境变量 READER_TOKEN）。</p>
      {error && <p className="notice error">{error}</p>}
      <form
        className="token-form"
        onSubmit={(e) => {
          e.preventDefault()
          setToken(value.trim())
          onSaved()
        }}
      >
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="访问口令" autoComplete="current-password" aria-label="访问口令" />
        <button className="button primary" type="submit" disabled={!value.trim()}>
          进入
        </button>
      </form>
      {children}
    </main>
  )
}
