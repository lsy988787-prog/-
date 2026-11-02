import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发时把 /api 转发给本地 FastAPI（默认 8000 端口）
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
