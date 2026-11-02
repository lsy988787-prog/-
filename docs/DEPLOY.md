# 部署上线步骤

目标：把网站部署到一台云服务器（或学校服务器），在学校里先小范围试点。
整套服务用 Docker 运行：一个容器跑网站（前端 + 后端），一个 Caddy 容器负责对外访问和 HTTPS 证书。

预计用时：服务器和密钥准备好之后，部署本身约 30 分钟。

---

## 1. 准备三样东西

### 1.1 服务器

| 项目 | 建议 |
| --- | --- |
| 配置 | 2 核 CPU、4 GB 内存、40 GB 硬盘起步；几十人同时在线够用 |
| 系统 | Ubuntu 22.04 或 24.04 |
| 来源 | 阿里云 / 腾讯云的轻量应用服务器，或者请学校网络中心分一台校内虚拟机 |
| 端口 | 在云控制台的“防火墙 / 安全组”里放行 **22**（SSH）、**80**、**443** |

AI 回答是服务器去调用 DeepSeek，所以服务器要能访问外网（`api.deepseek.com`）。读文献从 arXiv 导入论文时还要能访问 `arxiv.org`。

### 1.2 访问地址：先用 IP，正式推广再用域名

- **先用 IP 试用（最快）**：不需要域名，学生用 `http://服务器IP` 访问。适合第一次课堂试点。
- **用域名 + HTTPS（推荐正式推广时用）**：
  - 中国大陆的服务器用域名对外提供网站，需要先做 **ICP 备案**（在云服务商控制台提交，一般 1～3 周）。
  - 更省事的办法：请学校网络中心分配一个学校的二级域名（如 `learn.xxx.edu.cn`）指向这台服务器，学校域名已经备案。
  - 域名解析到服务器 IP 之后，在配置里填上域名，HTTPS 证书会自动申请和续期，不用手动操作。

> 用 IP + HTTP 时传输不加密。这个阶段请提醒学生**不要在“模型设置”里填自己的 API 密钥**，用平台额度即可；读文献的访问口令也只在可信网络里输入。换成 HTTPS 后就没有这个问题。

### 1.3 DeepSeek API 密钥

1. 登录 DeepSeek 开放平台（platform.deepseek.com），实名认证并充值。
2. 在“API keys”里创建一个密钥，复制下来（只显示一次）。
3. 建议在控制台设置用量提醒。网站每位学生每天默认最多 40 条消息，可以在配置里改。

密钥只填在服务器的 `.env` 文件里。**不要发在聊天里、不要截图、不要提交到 GitHub。**

---

## 2. 在服务器上安装 Docker

SSH 登录服务器后运行（使用阿里云镜像，国内速度快）：

```bash
curl -fsSL https://get.docker.com | sudo sh -s -- --mirror Aliyun
sudo docker compose version     # 能看到版本号就说明装好了
```

国内服务器从 Docker Hub 拉取基础镜像常常很慢或失败，建议配置镜像加速：
在云服务商控制台找到“容器镜像服务 → 镜像加速器”，复制你的专属加速地址，然后：

```bash
sudo mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://你的加速地址"] }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

---

## 3. 获取代码

```bash
sudo git clone https://github.com/lsy988787-prog/-.git /opt/ai-learning
cd /opt/ai-learning
```

如果仓库是私有的，`git clone` 会要求登录：用户名填 GitHub 用户名，密码填一个 GitHub 的 Personal access token（在 GitHub 设置 → Developer settings 里创建，只勾选读取仓库权限）。

---

## 4. 一键部署

```bash
cd /opt/ai-learning
sudo bash deploy/install.sh
```

脚本会：

1. 检查 Docker；
2. 第一次运行时从 `.env.example` 生成配置文件 `.env`，并**自动生成读文献的访问口令**（屏幕上会显示，记下来）；
3. 构建镜像并启动（第一次 3～10 分钟）；
4. 等服务就绪后打印访问地址。

然后填写模型密钥等配置：

```bash
sudo nano .env
```

| 配置项 | 填什么 |
| --- | --- |
| `MODEL_API_KEY` | 1.3 步拿到的 DeepSeek 密钥 |
| `SITE_ADDRESS` | 先用 IP 就保持 `:80`；有域名就填域名，如 `learn.xxx.edu.cn` |
| `DAILY_MESSAGE_LIMIT` | 每位学生每天的免费消息条数，默认 40 |
| `READER_TOKEN` | 读文献访问口令，脚本已自动生成，可以改成你自己的 |
| `NPM_REGISTRY`、`PIP_INDEX_URL` | 国内服务器构建慢时，去掉这两行前面的 `#` |

改完保存，运行一次更新让配置生效：

```bash
sudo bash deploy/update.sh
```

---

## 5. 上线后检查

在电脑和手机上各打开一次网站，逐项确认：

- [ ] 首页能看到“电力系统分析”，点进任意知识点，公式正常显示；
- [ ] 知识点页的“参数实验”可以拖动，图表跟着变化；
- [ ] 点右下角“问 AI 导师”，发一条消息能收到回复，面板底部显示“今日剩余 39/40”；
- [ ] 打开 `/papers`，输入访问口令，上传一篇 PDF 或导入一篇 arXiv 论文，能正常显示；
- [ ] 用了域名的话，地址栏有小锁（HTTPS）。

---

## 6. 日常维护

| 要做的事 | 命令（都在 `/opt/ai-learning` 目录下运行） |
| --- | --- |
| 更新到最新代码 | `sudo bash deploy/update.sh` |
| 改了 `.env` 后生效 | `sudo bash deploy/update.sh` |
| 查看运行状态 | `sudo docker compose ps` |
| 查看网站日志 | `sudo docker compose logs -f app` |
| 重启 | `sudo docker compose restart` |
| 停止 | `sudo docker compose down`（数据不会丢） |
| 备份读文献数据 | `sudo bash deploy/backup.sh` |

**自动备份**：读文献的论文、翻译缓存、术语表保存在 Docker 数据卷里，建议每天自动备份一次：

```bash
sudo crontab -e
# 加一行：每天凌晨 3 点备份，保留最近 14 份
0 3 * * * cd /opt/ai-learning && bash deploy/backup.sh >/dev/null 2>&1
```

备份文件在 `backups/` 目录。恢复某一份：

```bash
sudo docker compose exec -T app sh -c 'tar xzf - -C /data/papers' < backups/papers-日期.tar.gz
```

学生的学习进度和 AI 对话保存在学生自己的浏览器里，服务器上没有，所以不需要备份；换浏览器或清除浏览器数据会丢失，可以提醒学生用首页的“导出学习记录”。

---

## 7. 课堂试点检查清单

- [ ] 提前一天在教室的校园网 / 手机热点下打开网站，确认能访问、AI 能回复；
- [ ] 估算用量：学生人数 × 每人每天条数，确认 DeepSeek 账户余额够用；
- [ ] 告诉学生：AI 导师会先追问、不直接给答案；卡住时点“再给点提示”；AI 可能出错，数值以课程内容和老师讲解为准；
- [ ] 告诉学生：对话内容会发给模型服务商处理，不要输入姓名、学号、手机号等个人信息；
- [ ] 课程内容目前是待审校状态，老师审校完成前，作为辅助材料使用；
- [ ] 收集反馈：哪些知识点讲得不清楚、AI 哪里答错了、哪些图示不好用，回来告诉我修改。

---

## 8. 常见问题

**构建时卡在下载镜像 / 依赖很久，或报 429、timeout**
配置第 2 步的 Docker 镜像加速，并在 `.env` 里打开 `NPM_REGISTRY` 和 `PIP_INDEX_URL` 两行，然后重新运行 `sudo bash deploy/update.sh`。

**网页打不开**
先在服务器上运行 `curl -I http://localhost`。如果服务器上能打开、外面打不开，多半是云控制台的防火墙 / 安全组没有放行 80、443 端口。

**AI 导师显示“平台 AI 导师暂未开通”**
`.env` 里的 `MODEL_API_KEY` 没填或没生效。填好后运行 `sudo bash deploy/update.sh`。

**AI 回复“模型服务拒绝了密钥”或“余额不足”**
检查 DeepSeek 控制台的密钥是否有效、账户余额是否充足。

**填了域名但 HTTPS 证书申请失败**
确认域名已经解析到这台服务器的 IP、80 和 443 端口已放行、域名已备案。查看原因：`sudo docker compose logs caddy`。

**学生说今天的额度用完了**
在 `.env` 里调大 `DAILY_MESSAGE_LIMIT` 后运行 `sudo bash deploy/update.sh`。注意：重启服务会把当天的计数清零。

**读文献提示“需要访问口令”或“口令不对”**
口令在服务器上用 `sudo grep READER_TOKEN /opt/ai-learning/.env` 查看。

---

## 附：文件说明

| 文件 | 作用 |
| --- | --- |
| `Dockerfile` | 构建镜像：先编译前端，再装后端依赖（版本以 `backend/uv.lock` 为准） |
| `docker-compose.yml` | 两个服务：`app`（网站）和 `caddy`（对外访问、HTTPS），以及论文数据卷 |
| `deploy/Caddyfile` | Caddy 配置：反向代理、自动 HTTPS、上传大小限制、安全响应头 |
| `.env.example` | 配置模板；复制成 `.env` 使用，`.env` 不进 Git |
| `deploy/install.sh` | 首次部署 |
| `deploy/update.sh` | 更新代码 / 让新配置生效 |
| `deploy/backup.sh` | 备份读文献数据和 `.env` |
