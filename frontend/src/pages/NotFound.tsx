import { Link } from 'react-router-dom'

export default function NotFound({ message = '页面不存在。' }: { message?: string }) {
  return (
    <main className="page narrow">
      <p className="notice">{message}</p>
      <Link to="/">回到首页</Link>
    </main>
  )
}
