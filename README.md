# Writer Admin

单用户 Hugo 写作后台，专门管理 `content/posts/<slug>/index.md` 这种 page bundle 文章。

它负责：

- 浏览器里创建和编辑 Markdown 文章
- 维护 TOML front matter
- 上传图片到文章 bundle 目录
- 服务内 Markdown 预览

## API 文档

完整接口文档见 [API.md](./API.md)。

其中包含：

- 登录与 session cookie 说明
- 全部 API 路由、请求体、响应体
- 字段校验规则
- `curl` 调用示例
- 发布流程与常见错误格式

## 配置文件

应用统一读取项目根目录的 `config.yaml`。WEB“配置管理”页面也会写回这同一个 YAML 文件，配置只有这一份来源。

首次启动前先准备配置文件：

```bash
cp config.example.yaml config.yaml
```

然后把真实值填进去：

```yaml
auth:
  adminPassword: change-me
  sessionTtlHours: 168
storage:
  dataDir: ./data
repository:
  url: https://github.com/ytom-zjf/my-hugo.git
  branch: main
  githubToken: ghp_xxx
network:
  socksProxy: ""
git:
  authorName: YTOM Writer Admin
  authorEmail: you@example.com
site:
  timezoneOffset: "+08:00"
```

说明：

- `auth.adminPassword` 用于登录后台；通过 WEB 配置页保存后会写成 scrypt 哈希，旧的明文配置仍可兼容登录并自动迁移
- `repository.url` 指向你的博客 Git 仓库
- `repository.githubToken` 需要有该仓库的读写权限
- `network.socksProxy` 可选，用于 GitHub 访问加速，例如 `socks5://127.0.0.1:1080`
- `storage.dataDir` 会保存 SQLite、session 和博客仓库工作副本
- 博客仓库会被 clone 到 `storage.dataDir/repo`
- 默认示例使用 `storage.dataDir: ./data`，所以本地默认仓库路径是 `writer-admin/data/repo`
- `config.yaml` 已加入 `.gitignore`，不要把真实密码和 token 提交到仓库

### 关于 Docker Compose

当前 [compose.yaml](./compose.yaml) 会把宿主机的 `./config.yaml` 挂载到容器内 `/app/config.yaml`。因此 Docker 启动前也需要先准备 `config.yaml`。

## 本地运行

```bash
npm install
npm run dev
```

默认访问：`http://localhost:3000`

## Docker 部署

```bash
cp config.example.yaml config.yaml
docker compose up --build -d
```

默认映射 `3000` 端口，并将 `/app/data` 持久化到 Docker volume。

补充说明：

- Docker 部署时建议在 `config.yaml` 中使用 `storage.dataDir: /app/data`
- 容器内仓库工作副本路径是 `/app/data/repo`
- 容器内 SQLite 路径是 `/app/data/writer-admin.sqlite`

## 工作流

1. 登录后台
2. 文章列表默认读取本地工作副本，不会每次访问都连接 GitHub
3. 需要拉取远端更新时，点击“同步仓库”
4. 新建文章并保存草稿
5. 上传图片，自动插入 `./image.png` 相对路径
6. 点击“发布到 GitHub”
7. 服务先检查远端是否有新提交；如果远端已更新，会要求先同步仓库
8. 保存文章时会校验页面加载时的文件 revision，避免旧页面覆盖新内容
9. 远端未领先时，服务执行 `pull --rebase --autostash`、`commit`、`push`

## 已知边界

- 现有文章默认不支持改 slug
- 预览是服务内 Markdown 渲染，不等同于 Stack 主题最终效果
- 删除文章会直接 commit 并 push，不走额外确认分支
