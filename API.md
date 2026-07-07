# Writer Admin API

Writer Admin 的 HTTP API 主要面向本项目自己的前端页面，不是公开多租户 API。

- 基础路径：`/api`
- 默认返回：`application/json`
- 认证方式：登录后由服务端写入 HttpOnly session cookie
- 当前 session cookie 名：`writer_admin_session`
- 除 `POST /api/login` 外，其余接口都应视为需要先登录

WEB 配置接口会把可编辑配置保存到项目根目录的 `config.yaml`。返回配置时不会包含真实 `adminPassword` 或 `githubToken`，只返回是否已设置。

## 认证与会话

登录成功后，服务端会设置一个 HttpOnly cookie，浏览器后续请求会自动带上它。

- Cookie 默认 `SameSite=Lax`
- 生产环境下 cookie 会带 `Secure`
- 会话有效期由 `config.yaml` 中的 `auth.sessionTtlHours` 控制，默认 168 小时

如果你用脚本调用 API，建议用 cookie jar 保存会话：

```bash
curl -c cookie.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}'
```

后续请求复用：

```bash
curl -b cookie.txt http://localhost:3000/api/posts
```

## 通用错误格式

业务错误统一返回：

```json
{
  "error": "错误信息"
}
```

配置缺失时还会额外返回：

```json
{
  "error": "Missing required configuration values: ...",
  "missingKeys": ["repository.githubToken", "repository.url"]
}
```

常见状态码：

| 状态码 | 含义 |
|---|---|
| `200` | 请求成功 |
| `201` | 创建成功 |
| `400` | 参数或请求体非法 |
| `401` | 未登录或密码错误 |
| `404` | 文章或资源不存在 |
| `409` | 资源冲突，例如 slug 已存在 |
| `500` | 服务端异常或配置缺失 |

## 数据模型

### PostSummary

```json
{
  "slug": "hugo-deployment-summary",
  "title": "Hugo 网站部署总结",
  "date": "2026-05-26T11:34:26+08:00",
  "draft": false,
  "tags": ["Hugo", "部署", "Stack"],
  "categories": ["技术"],
  "updatedAt": "2026-07-03T04:12:34.567Z"
}
```

### PostRecord

```json
{
  "slug": "hugo-deployment-summary",
  "title": "Hugo 网站部署总结",
  "date": "2026-05-26T11:34:26+08:00",
  "draft": false,
  "tags": ["Hugo", "部署", "Stack"],
  "categories": ["技术"],
  "updatedAt": "2026-07-03T04:12:34.567Z",
  "body": "Markdown 正文",
  "assets": ["cover.png", "diagram-1.png"]
}
```

### PublishResult

```json
{
  "committed": true,
  "pushed": true
}
```

如果没有新的 staged 变更，发布结果会是：

```json
{
  "committed": false,
  "pushed": false
}
```

## 输入校验规则

文章创建和更新使用同一套字段规则：

| 字段 | 类型 | 规则 |
|---|---|---|
| `title` | `string` | 必填，去掉首尾空格后不能为空 |
| `slug` | `string` | 必填，自动转小写，只允许小写字母、数字、短横线 |
| `date` | `string` | 可选，必须是有效 ISO-8601 时间；省略时服务端按 `site.timezoneOffset` 自动填充 |
| `draft` | `boolean` | 可选，默认 `true` |
| `tags` | `string[]` | 可选，默认空数组；每项会去掉首尾空格并过滤空字符串 |
| `categories` | `string[]` | 可选，默认空数组；规则同上 |
| `body` | `string` | 可选，默认空字符串 |

`slug` 的正则约束：

```txt
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

这意味着合法示例包括：

- `my-first-post`
- `hugo-notes-2026`
- `a1-b2-c3`

不合法示例包括：

- `Hello-World`
- `my_post`
- `中文标题`
- `two--hyphens`

更新已有文章时不支持修改 slug。如果 `PUT /api/posts/:slug` 的请求体里 `slug` 与路径参数不一致，会返回 `400`。

上传资源时文件名也会被规范化：

- 自动转小写
- 仅保留 `a-z`、`0-9`、`.`、`_`、`-`
- 其他字符会替换成 `-`
- 若同名文件已存在，会自动追加 `-1`、`-2` 等后缀

## 路由总览

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/login` | 登录并建立 session |
| `POST` | `/api/logout` | 退出登录并删除 session |
| `GET` | `/api/config` | 获取脱敏后的运行时配置 |
| `PUT` | `/api/config` | 保存 WEB 可编辑配置 |
| `GET` | `/api/repo/status` | 检查本地工作副本与远端分支的差异 |
| `POST` | `/api/repo/sync` | 手动同步远端仓库 |
| `GET` | `/api/posts` | 获取文章列表 |
| `POST` | `/api/posts` | 创建新文章 |
| `GET` | `/api/posts/:slug` | 获取单篇文章详情 |
| `PUT` | `/api/posts/:slug` | 更新文章 |
| `DELETE` | `/api/posts/:slug` | 删除文章并立即 commit/push |
| `POST` | `/api/posts/:slug/assets` | 上传文章资源文件 |
| `GET` | `/api/posts/:slug/assets/:path` | 读取文章资源文件 |
| `POST` | `/api/posts/:slug/publish` | 发布当前工作副本变更 |
| `POST` | `/api/preview` | 渲染 Markdown 预览 HTML |

## 详细接口

### `POST /api/login`

用途：校验密码并设置 session cookie。

请求体：

```json
{
  "password": "your-password"
}
```

成功响应：

```json
{
  "ok": true,
  "redirectTo": "/posts"
}
```

如果仓库配置还不完整，`redirectTo` 会是 `/config`。

失败示例：

```json
{
  "error": "Password is incorrect"
}
```

### `POST /api/logout`

用途：删除当前 session cookie。

请求体：无

成功响应：

```json
{
  "ok": true
}
```

### `GET /api/config`

用途：读取脱敏后的配置。

成功响应：

```json
{
  "config": {
    "dataDir": "/app/data",
    "repoUrl": "https://github.com/example/blog.git",
    "repoBranch": "main",
    "gitAuthorName": "Writer Admin",
    "gitAuthorEmail": "writer@example.com",
    "socksProxy": "socks5://127.0.0.1:1080",
    "sessionTtlHours": 168,
    "siteTimezoneOffset": "+08:00",
    "hasAdminPassword": true,
    "hasGithubToken": true
  }
}
```

### `PUT /api/config`

用途：保存 WEB 可编辑配置。`adminPassword` 和 `githubToken` 留空表示保留当前值。

请求体：

```json
{
  "adminPassword": "",
  "dataDir": "/app/data",
  "repoUrl": "https://github.com/example/blog.git",
  "repoBranch": "main",
  "gitAuthorName": "Writer Admin",
  "gitAuthorEmail": "writer@example.com",
  "githubToken": "",
  "socksProxy": "socks5://127.0.0.1:1080",
  "sessionTtlHours": 168,
  "siteTimezoneOffset": "+08:00"
}
```

成功响应同 `GET /api/config`。

### `POST /api/repo/sync`

用途：手动同步远端仓库。这个接口会访问 GitHub；普通访问 `/posts` 不会自动 pull。

成功响应：

```json
{
  "result": {
    "cloned": false,
    "pulled": true,
    "skipped": false
  }
}
```

如果本地工作副本有未发布更改，会跳过 pull：

```json
{
  "result": {
    "cloned": false,
    "pulled": false,
    "skipped": true,
    "reason": "localChanges"
  }
}
```

### `GET /api/repo/status`

用途：轻量检查本地工作副本与远端分支的差异。这个接口会执行 `git fetch`，编辑页会异步调用它；普通访问 `/posts` 不会调用。

成功响应：

```json
{
  "result": {
    "cloned": false,
    "ahead": 0,
    "behind": 2,
    "hasLocalChanges": false
  }
}
```

字段说明：

- `ahead`：本地 `HEAD` 领先远端分支的提交数
- `behind`：远端分支领先本地 `HEAD` 的提交数
- `hasLocalChanges`：本地工作副本是否有未提交文件变更

### `GET /api/posts`

用途：获取文章列表。

成功响应：

```json
{
  "posts": [
    {
      "slug": "hugo-deployment-summary",
      "title": "Hugo 网站部署总结",
      "date": "2026-05-26T11:34:26+08:00",
      "draft": false,
      "tags": ["Hugo", "部署", "Stack"],
      "categories": ["技术"],
      "updatedAt": "2026-07-03T04:12:34.567Z"
    }
  ]
}
```

说明：

- 本地没有工作副本时会先 clone
- 已有本地工作副本时只读取本地文件，不会自动访问 GitHub
- 需要拉取远端更新时，调用 `POST /api/repo/sync` 或点击页面上的“同步仓库”

### `POST /api/posts`

用途：创建新文章。

请求体：

```json
{
  "title": "新文章标题",
  "slug": "new-post",
  "date": "2026-07-03T12:00:00+08:00",
  "draft": true,
  "tags": ["Hugo", "写作"],
  "categories": ["技术"],
  "body": "# 正文\n"
}
```

成功响应：`201`

```json
{
  "post": {
    "slug": "new-post",
    "title": "新文章标题",
    "date": "2026-07-03T12:00:00+08:00",
    "draft": true,
    "tags": ["Hugo", "写作"],
    "categories": ["技术"],
    "updatedAt": "2026-07-03T04:12:34.567Z",
    "body": "# 正文\n",
    "assets": []
  }
}
```

副作用：

- 创建 `content/posts/<slug>/index.md`
- front matter 使用 TOML `+++`
- 此接口只写本地工作副本，不会自动 push

### `GET /api/posts/:slug`

用途：获取单篇文章详情。

成功响应：

```json
{
  "post": {
    "slug": "hugo-deployment-summary",
    "title": "Hugo 网站部署总结",
    "date": "2026-05-26T11:34:26+08:00",
    "draft": false,
    "tags": ["Hugo", "部署", "Stack"],
    "categories": ["技术"],
    "updatedAt": "2026-07-03T04:12:34.567Z",
    "body": "Markdown 正文",
    "assets": ["cover.png"]
  }
}
```

### `PUT /api/posts/:slug`

用途：更新指定文章。

请求体格式与 `POST /api/posts` 相同，但：

- 路径参数 `:slug` 和请求体里的 `slug` 必须一致
- 不支持借此接口改文章 slug

成功响应：

```json
{
  "post": {
    "slug": "hugo-deployment-summary",
    "title": "更新后的标题",
    "date": "2026-05-26T11:34:26+08:00",
    "draft": false,
    "tags": ["Hugo"],
    "categories": ["技术"],
    "updatedAt": "2026-07-03T04:12:34.567Z",
    "body": "更新后的正文",
    "assets": ["cover.png"]
  }
}
```

副作用：

- 更新本地工作副本中的 `index.md`
- 保留未被 Writer Admin 管理的额外 front matter 字段
- 此接口不自动 push

### `DELETE /api/posts/:slug`

用途：删除文章目录，并立即 commit/push。

请求体：无

成功响应：

```json
{
  "ok": true,
  "publish": {
    "committed": true,
    "pushed": true
  }
}
```

副作用：

- 删除 `content/posts/<slug>/`
- 删除后立即执行发布流程

### `POST /api/posts/:slug/assets`

用途：上传文章 bundle 资源文件。

请求格式：`multipart/form-data`

字段：

| 字段名 | 类型 | 说明 |
|---|---|---|
| `file` | 文件 | 必填 |

`curl` 示例：

```bash
curl -b cookie.txt -X POST http://localhost:3000/api/posts/hugo-deployment-summary/assets \
  -F 'file=@./cover.png'
```

成功响应：`201`

```json
{
  "asset": {
    "fileName": "cover.png",
    "markdownPath": "./cover.png"
  }
}
```

副作用：

- 文件写入 `content/posts/<slug>/`
- 若重名，会自动改名为 `cover-1.png`、`cover-2.png` 等
- 此接口不自动 push

### `GET /api/posts/:slug/assets/:path`

用途：读取已上传的资源文件，主要给后台预览和编辑页面使用。

请求体：无

成功响应：

- 返回二进制文件内容
- `Content-Type` 根据文件后缀自动推断
- `Cache-Control: private, max-age=60`

说明：

- 这是受登录保护的后台文件读取接口
- 它不是博客线上公开静态资源地址

### `POST /api/posts/:slug/publish`

用途：把当前工作副本变更发布到远端仓库。

请求体：无

成功响应：

```json
{
  "publish": {
    "committed": true,
    "pushed": true
  }
}
```

发布流程：

1. `git fetch origin <branch>`
2. 检查本地 `HEAD` 是否落后远端分支
3. 如果远端已有新提交，返回 `409`，提示先同步仓库
4. `git pull --rebase --autostash origin <branch>`
5. `git add --all`
6. 若没有 staged 变更，返回 `committed: false, pushed: false`
7. 有变更时执行 `git commit -m "post: update <slug>"`
8. 执行 `git push origin <branch>`

### `POST /api/preview`

用途：把 Markdown 渲染成 HTML 预览片段。

请求体：

```json
{
  "markdown": "# 标题\n\n正文"
}
```

成功响应：

```json
{
  "html": "<h1>标题</h1><p>正文</p>"
}
```

说明：

- 支持 GFM
- 允许原始 HTML
- 预览结果用于后台编辑页，不保证与最终 Hugo 主题完全一致

## 调用流程示例

### 登录并创建文章

```bash
curl -c cookie.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}'

curl -b cookie.txt -X POST http://localhost:3000/api/posts \
  -H 'Content-Type: application/json' \
  -d '{
    "title":"API 创建的文章",
    "slug":"api-created-post",
    "draft":true,
    "tags":["API","Writer Admin"],
    "categories":["技术"],
    "body":"# Hello\n"
  }'
```

### 上传图片并发布

```bash
curl -b cookie.txt -X POST http://localhost:3000/api/posts/api-created-post/assets \
  -F 'file=@./cover.png'

curl -b cookie.txt -X POST http://localhost:3000/api/posts/api-created-post/publish
```
