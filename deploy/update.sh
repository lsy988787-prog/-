#!/usr/bin/env bash
# 更新到最新代码并重启：bash deploy/update.sh
# 改了 .env 之后也运行它，让新配置生效。学习记录在学生浏览器里，论文在数据卷里，更新不会丢。
set -euo pipefail
cd "$(dirname "$0")/.."
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> 拉取最新代码"
  git pull --ff-only
fi
echo "==> 重新构建并重启"
docker compose up -d --build
docker image prune -f >/dev/null
echo "==> 当前状态"
docker compose ps
