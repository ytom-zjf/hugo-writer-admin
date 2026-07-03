# Writer Admin

单用户 Hugo 写作后台，专门管理 `content/posts/<slug>/index.md` 这种 page bundle 文章。

它负责：

- 浏览器里创建和编辑 Markdown 文章
- 维护 TOML front matter
- 上传图片到文章 bundle 目录
- 服务内 Markdown 预览
- 直接 commit 并 push 到 GitHub，沿用现有 Cloudflare 自动部署链路

## 目录定位

当前实现放在你的 Hugo 仓库子目录 `writer-admin/` 下，便于直接开发和联调。

如果后续要严格符合“独立仓库”部署方式，可以把这个目录整体拆出去，不依赖 Hugo 站点内部代码。

## API 文档

完整接口文档见 [API.md](./API.md)。

其中包含：

- 登录与 session cookie 说明
- 全部 API 路由、请求体、响应体
- 字段校验规则
- `curl` 调用示例
- 发布流程与常见错误格式

## 环境变量

应用本身直接读取服务端环境变量，也就是 `process.env`。

这意味着：

- `GITHUB_TOKEN` 不必须写在 `.env`
- `ADMIN_PASSWORD`、`REPO_URL`、`GIT_AUTHOR_NAME`、`GIT_AUTHOR_EMAIL` 也都不必须写在 `.env`
- 只要进程启动时这些变量已经存在，应用就能正常读取

当前必需变量：

```bash
ADMIN_PASSWORD=change-me
REPO_URL=https://github.com/ytom-zjf/my-hugo.git
REPO_BRANCH=main
GITHUB_TOKEN=ghp_xxx
GIT_AUTHOR_NAME=YTOM Writer Admin
GIT_AUTHOR_EMAIL=you@example.com
DATA_DIR=./data
SESSION_TTL_HOURS=168
SITE_TIMEZONE_OFFSET=+08:00
```

说明：

- `REPO_URL` 指向你的博客 Git 仓库
- `GITHUB_TOKEN` 需要有该仓库的读写权限
- `DATA_DIR` 会保存 SQLite、session 和博客仓库工作副本
- 博客仓库会被 clone 到 `DATA_DIR/repo`
- 默认 `DATA_DIR=./data`，所以本地默认仓库路径是 `writer-admin/data/repo`

### 变量注入方式

你可以任选下面任意一种方式。

#### 1. 使用 `.env`

这是最省事的方式，尤其适合当前仓库里的 `docker compose` 配置。

```bash
cp .env.example .env
```

然后把真实值填进去，再启动应用。

#### 2. 直接用 shell 环境变量启动

适合本地开发，或者你不想把 token 写进 `.env` 文件。

```bash
export ADMIN_PASSWORD='your-password'
export REPO_URL='https://github.com/ytom-zjf/my-hugo.git'
export REPO_BRANCH='main'
export GITHUB_TOKEN='ghp_xxx'
export GIT_AUTHOR_NAME='YTOM Writer Admin'
export GIT_AUTHOR_EMAIL='you@example.com'
export DATA_DIR='./data'
export SESSION_TTL_HOURS='168'
export SITE_TIMEZONE_OFFSET='+08:00'

npm run dev
```

这种方式下，应用会直接从当前 shell 的环境变量读取配置，不需要 `.env`。

#### 3. 通过 systemd、容器平台或宿主机注入

如果你后面把它部署到 VPS、NAS 或其他平台，也可以：

- 在 `systemd` 的 `Environment=` 或 `EnvironmentFile=` 里注入
- 在 `docker run -e ...` 里注入
- 在 PaaS / 面板 / 容器平台的环境变量配置页里注入

核心原则只有一个：启动 `writer-admin` 进程时，变量已经存在即可。

### 关于 Docker Compose

当前项目里的 [compose.yaml](./compose.yaml) 使用了：

```yaml
env_file:
  - .env
```

这表示：

- 应用代码本身并不强制要求 `.env`
- 但当前这份 `compose.yaml` 默认会从 `.env` 把变量传进容器
- 所以如果你直接执行 `docker compose up --build -d`，最简单的做法仍然是准备一个 `.env`

如果你以后想完全不使用 `.env`，可以自己改 `compose.yaml`，或者改用 `docker run -e ...` 的方式启动。

## 本地运行

```bash
npm install
npm run dev
```

默认访问：`http://localhost:3000`

如果你不使用 `.env`，请先在当前 shell 里 `export` 上面的必需变量，再执行 `npm run dev`。

## Docker 部署

```bash
cp .env.example .env
docker compose up --build -d
```

默认映射 `3000` 端口，并将 `/app/data` 持久化到 Docker volume。

补充说明：

- 容器内 `DATA_DIR` 默认解析为 `/app/data`
- 所以容器内仓库工作副本路径默认是 `/app/data/repo`
- 容器内 SQLite 默认路径是 `/app/data/writer-admin.sqlite`

## 工作流

1. 登录后台
2. 新建文章并保存草稿
3. 上传图片，自动插入 `./image.png` 相对路径
4. 点击“发布到 GitHub”
5. 服务执行 `pull --rebase --autostash`、`commit`、`push`
6. GitHub 新提交继续触发你现有的 Cloudflare 部署

## 已知边界

- 现有文章默认不支持改 slug
- 预览是服务内 Markdown 渲染，不等同于 Stack 主题最终效果
- 删除文章会直接 commit 并 push，不走额外确认分支
