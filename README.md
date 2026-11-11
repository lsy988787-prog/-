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

## 部署上线

用 Docker 一键部署到服务器，步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)：

```bash
sudo bash deploy/install.sh
```

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

课程首页的“今天学这个”会推荐下一个该学的知识点（前置知识已掌握、自己还没掌握的第一个），点“开始学习”后
AI 导师先开口提第一个问题，学生只需回答，不用自己写提示词。对话中有三个快捷回答：“我不懂”“给个提示”“换个例子”。
前两个会逐级多讲一些（追问 → 指方向 → 给一步 → 讲透），其中“我不懂”最多升到“给一步”，只有学生主动点
“看完整讲解”才会给出答案；在此之前即使学生直接要答案，导师也只拆小问题、不给最终答案。

## 知识点地图、节末小测与复习

- 课程首页的知识点地图按章列出所有知识点，用颜色区分未学、学习中、已掌握、待复习；前置知识还没掌握的显示为虚线框。
- 每个知识点末尾有节末小测：判断题由课程 JSON 的 `misconceptions` 自动生成（每条随机取错误或正确的说法，按知识点 ID 固定），
  简答题来自 `practice`，学生看参考答案后自己判断对错。全对自动标记掌握。
- 答错的题进入复习队列，1 天后出现在“今日复习”；答对后依次推迟 3 天、7 天，连续答对 3 次移出队列，答错从头开始。
- 这些记录和其他学习记录一样只存在浏览器 localStorage 里。对话历史保存在学生自己的浏览器里，服务端不保存对话内容。

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

## 读文献（个人用）

导航栏的“读文献”（第一次请直接打开 `/papers`）：上传 PDF 或填 arXiv 链接，论文被拆成章节和段落。

- 点一段设为当前段落，右侧“精读导师”围绕这一段，按“研究问题 → 方法 → 结果 → 局限”提问；
- 不做全文翻译：点“翻译这段”或选中一句再点“翻译”才翻，结果按文本缓存在服务器上，不重复花钱；
- 选中文字还可以“解释”“问导师”“加入术语表”；术语表里定下的译法会用在之后所有翻译和对话里。

这个模块只给负责人自己用，必须在服务器设置访问口令，第一次进入时在页面上输入：

| 变量 | 说明 |
| --- | --- |
| `READER_TOKEN` | 访问口令。不设置时读文献模块关闭 |
| `PAPERS_DIR` | 论文、翻译缓存和术语表的保存目录，默认 `backend/data/papers`（不进 Git） |

PDF 解析用 pdfminer.six 按字号和位置规则拆分（`backend/app/pdfparse.py`），扫描版 PDF 不支持；
公式和表格以原 PDF 为准，阅读页有“看原 PDF”按钮。

## 测试

```bash
cd backend && uv run pytest     # 课程结构校验、接口和 AI 导师测试（模拟模型，不消耗额度）
cd frontend && npm test         # 计算器单元测试：用课程例题答案核对每个交互图示
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

## 交互图示（参数实验）

知识点的 `visualization.calculator` 指向 `frontend/src/viz/registry.ts` 里注册的计算器 ID（白名单）。
计算器是纯函数（`calcBasics.ts`、`calcAnalysis.ts`）：输入滑块参数，输出结果数值、提示和图表描述，
由通用组件 `Charts.tsx` 画成曲线、相量图、柱状图、网络图或表格。新增一个图示的步骤：

1. 在 `calcBasics.ts` 或 `calcAnalysis.ts` 写计算函数，并在 `registry.ts` 注册 ID；
2. 在课程内容脚本里给知识点加 `visualization`（参数范围、默认值取例题数据），重新生成 JSON；
3. 在 `calculators.test.ts` 加一条用例题答案核对的测试。测试会检查课程引用的计算器都已注册，且参数取默认值和两端时不出错。

## 约定

- 课程数据里只能引用白名单计算器 ID，不能包含可执行代码。
- 模型密钥只放在服务端环境变量，不写进代码和文档。
- 程序 MIT；原创教学内容 CC BY 4.0。不复制未获授权的视频、教材或课件。
