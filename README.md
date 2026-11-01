# AI 对话式学习平台

用 AI 对话学课程的网站：选一门课（网站预置或自己上传的课本），按知识点学习讲解、公式、分步例题和自测，
卡住时由 AI 导师用苏格拉底式追问引导。首个示例课程是《电力系统分析》（5 章 39 个知识点）。

产品设计文档：https://claude.ai/artifact/YQY91UbyYqjVr9LdJX5Vqs

## 目录

| 路径 | 内容 |
| --- | --- |
| `backend/` | Python FastAPI 后端：课程加载与校验、接口；生产环境同时托管前端 |
| `frontend/` | React + TypeScript + Vite 前端 |
| `courses/` | 课程包 JSON 和结构约束 `course.schema.json`，每个 JSON 文件是一门课 |
| `content/power-system-analysis/` | 电力系统分析课程内容的生成脚本（改内容改这里，再生成 JSON） |

## 本地运行

需要 Python 3.12+、[uv](https://docs.astral.sh/uv/)、Node.js 20+。

```bash
# 后端（端口 8000）
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 前端开发服务器（另开一个终端，端口 5173，/api 自动转发到 8000）
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173 。

只想用一个端口试用：先在 `frontend/` 下 `npm run build`，再启动后端，打开 http://localhost:8000 即可，后端会托管构建好的前端。

## AI 导师（模型配置）

每个知识点页面右下角有“问 AI 导师”。导师按课程资料出题追问，学生点“再给点提示”时逐级多讲一些
（追问 → 指方向 → 给一步 → 讲透）。对话历史保存在学生自己的浏览器里，服务端不保存对话内容。

平台额度通过后端环境变量配置（不要写进代码或提交到仓库）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MODEL_API_KEY` | 无 | 平台模型密钥。不设置时平台额度不可用，学生仍可用自己的密钥 |
| `MODEL_BASE_URL` | `https://api.deepseek.com` | 兼容 OpenAI Chat Completions 协议的接口地址 |
| `MODEL_NAME` | `deepseek-chat` | 模型名 |
| `DAILY_MESSAGE_LIMIT` | `40` | 每位学生每天的免费消息条数（按浏览器匿名 ID 计，重启清零） |

```bash
cd backend
MODEL_API_KEY=你的密钥 uv run uvicorn app.main:app --port 8000
```

学生也可以在导师面板的“模型设置”里填自己的密钥（BYOK），不占平台额度。可选服务商限于
`backend/app/llm.py` 里的白名单（DeepSeek、通义千问、Kimi、智谱、OpenAI），密钥只存在学生浏览器里，
由服务端转发、不保存。

## 测试

```bash
cd backend && uv run pytest     # 课程结构校验、接口和 AI 导师测试（模拟模型，不消耗额度）
cd frontend && npm run build    # 类型检查 + 构建
```

## 修改课程内容

电力系统分析的内容写在 `content/power-system-analysis/ch1.py`~`ch5.py` 中。修改后重新生成：

```bash
cd content/power-system-analysis
python3 build.py ../../courses/power-system-analysis.json        # 生成课程 JSON 并检查 ID、前置关系
python3 review_xlsx.py ../../courses/power-system-analysis.json 审校表.xlsx   # 生成教师审校表（需要 openpyxl）
```

不要直接改 JSON 再重新生成，否则直接改动会被覆盖。知识点 ID 一旦发布就不要改，学习记录靠它定位。

新增一门课：在 `courses/` 放一个符合 `course.schema.json` 的 JSON 文件，重启后端即可在首页看到。
任何一门课程有结构错误都会被拒绝加载，日志和 `/api/courses` 会指出文件和字段位置，不影响其他课程。

## 约定

- 课程数据里只能引用白名单计算器 ID，不能包含可执行代码。
- 模型密钥只放在服务端环境变量，不写进代码和文档。
- 程序 MIT；原创教学内容 CC BY 4.0。不复制未获授权的视频、教材或课件。
