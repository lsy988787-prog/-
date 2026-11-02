#!/usr/bin/env bash
# 首次部署：在服务器的仓库目录里运行  bash deploy/install.sh
# 做的事：检查 Docker → 生成 .env（含随机读文献口令）→ 构建并启动 → 等待健康检查通过。
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m错误：%s\033[0m\n' "$*" >&2; exit 1; }

say "检查 Docker"
if ! command -v docker >/dev/null 2>&1; then
  die "没有安装 Docker。Ubuntu 上可运行：curl -fsSL https://get.docker.com | sudo sh -s -- --mirror Aliyun
然后重新运行本脚本。详见 docs/DEPLOY.md 第 2 步。"
fi
docker compose version >/dev/null 2>&1 || die "需要 Docker Compose v2（docker compose 命令）。"
docker info >/dev/null 2>&1 || die "无法连接 Docker，请用 sudo 运行，或把当前用户加入 docker 组。"

say "准备配置文件 .env"
if [ ! -f .env ]; then
  cp .env.example .env
  token=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  sed -i "s/^READER_TOKEN=.*/READER_TOKEN=${token}/" .env
  chmod 600 .env
  echo "已生成 .env，读文献访问口令：${token}"
  echo "（口令保存在 .env 里，之后可以用 grep READER_TOKEN .env 查看）"
else
  echo ".env 已存在，保留原配置。"
fi
if ! grep -q '^MODEL_API_KEY=.\+' .env; then
  echo "提示：.env 里的 MODEL_API_KEY 还没填，平台 AI 导师会显示“暂未开通”。填好后运行 bash deploy/update.sh 即可生效。"
fi

say "构建镜像并启动（第一次大约 3～10 分钟）"
docker compose up -d --build

say "等待服务就绪"
for _ in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)
  [ "$status" = healthy ] && break
  sleep 2
done
[ "${status:-}" = healthy ] || { docker compose logs --tail 50 app; die "服务没有正常启动，请查看上面的日志。"; }

site=$(grep '^SITE_ADDRESS=' .env | cut -d= -f2-)
if [ -z "$site" ] || [ "${site#:}" != "$site" ]; then
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  url="http://${ip:-服务器IP}"
else
  url="https://${site}"
fi
say "部署完成"
echo "学习网站：${url}"
echo "读文献：  ${url}/papers"
echo "查看日志：docker compose logs -f app"
