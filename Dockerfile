# AI 学习平台：一个镜像同时包含前端构建产物和后端服务。
# 国内服务器构建慢时，可传入镜像源：
#   docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#                        --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# ---------- 第一阶段：构建前端 ----------
FROM node:22-slim AS web
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 第二阶段：后端运行环境 ----------
FROM python:3.13-slim
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app/backend

# 依赖版本以 uv.lock 为准：先导出成 requirements.txt，再用 pip 安装（便于使用国内镜像源）
COPY backend/pyproject.toml backend/uv.lock ./
RUN pip install -i "$PIP_INDEX_URL" uv \
 && uv export --frozen --no-dev --no-hashes --no-emit-project -o /tmp/requirements.txt \
 && pip install -i "$PIP_INDEX_URL" -r /tmp/requirements.txt \
 && pip uninstall -y uv && rm /tmp/requirements.txt

COPY backend/app ./app
COPY courses /app/courses
COPY --from=web /src/frontend/dist /app/frontend/dist

# 以普通用户运行；论文数据放在 /data/papers（docker-compose 挂成数据卷）
RUN useradd --system --uid 1000 --home /app app \
 && mkdir -p /data/papers && chown -R app /data
USER app

ENV COURSES_DIR=/app/courses \
    FRONTEND_DIST=/app/frontend/dist \
    PAPERS_DIR=/data/papers
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

# 只开 1 个 worker：每日免费额度的计数在进程内存里，多 worker 会各算各的。
# --proxy-headers：经 Caddy 转发时取到学生的真实 IP（容器端口不对外暴露，只有 Caddy 能访问）。
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
