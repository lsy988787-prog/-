#!/usr/bin/env bash
# 备份读文献数据（论文、翻译缓存、术语表）和 .env 到 backups/，保留最近 14 份。
# 建议加到 crontab 每天运行：0 3 * * * cd /opt/ai-learning && bash deploy/backup.sh >/dev/null 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
docker compose exec -T app tar czf - -C /data/papers . > "backups/papers-${stamp}.tar.gz"
cp .env "backups/env-${stamp}" && chmod 600 "backups/env-${stamp}"
ls -1t backups/papers-*.tar.gz | tail -n +15 | xargs -r rm --
ls -1t backups/env-* | tail -n +15 | xargs -r rm --
echo "已备份到 backups/papers-${stamp}.tar.gz"
