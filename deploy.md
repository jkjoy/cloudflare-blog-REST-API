# GitHub Actions 部署

本项目通过 `.github/workflows/deploy.yml` 将公开前台、Vue 管理后台和 API 一起部署到 Cloudflare Workers。工作流会同步远端 D1 结构、部署 Worker，并确保生产环境存在 `JWT_SECRET`。

## 部署前准备

GitHub Actions 不会自动创建 Cloudflare 资源。首次部署前需要在目标 Cloudflare 账号中准备：

- D1 数据库，默认名称为 `cfblog-db`
- R2 存储桶，默认名称为 `cfblog-media`
- KV 命名空间，绑定名称为 `CACHE`
- Workers AI 访问能力

可以使用 Wrangler 创建主要资源：

```bash
npx wrangler d1 create cfblog-db
npx wrangler r2 bucket create cfblog-media
npx wrangler kv namespace create CACHE
```

创建完成后，检查 `wrangler.toml`：

- `name` 是要部署的 Worker 名称
- D1 的 `database_id` 属于目标账号
- R2 的 `bucket_name` 与已创建的存储桶一致
- KV 的 `id` 与已创建的命名空间一致

仓库中的资源 ID 只适用于其原始 Cloudflare 账号。Fork 或部署到其他账号时必须替换。

## 创建 Cloudflare API Token

在 Cloudflare Dashboard 的 API Tokens 页面创建 Token。可以从 `Edit Cloudflare Workers` 模板开始，并确保 Token 对目标账号至少具备以下能力：

- 部署和更新 Workers Scripts
- 读取、更新目标 D1 数据库
- 使用 `wrangler.toml` 中引用的 Workers 绑定

将 Token 的资源范围限制到实际部署使用的账号。若使用自定义域名或额外 Cloudflare 服务，再按实际绑定补充权限。

## 配置 GitHub Secrets

进入 GitHub 仓库：

`Settings -> Secrets and variables -> Actions -> New repository secret`

添加以下 Repository Secrets：

| Secret | 必需 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | 上一步创建的 Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | Cloudflare Dashboard 中的 Account ID |
| `JWT_SECRET` | 首次配置时是 | 用于后台登录令牌签名的高强度随机值 |

生成 `JWT_SECRET`：

```bash
openssl rand -hex 32
```

只把命令输出的随机值保存到 GitHub Secret，不要把它写入仓库、工作流文件或 `wrangler.toml`。

## 触发部署

工作流支持两种触发方式：

1. 推送到 `main` 分支时自动运行。
2. 在 GitHub 仓库的 `Actions -> Deploy Worker -> Run workflow` 中手动运行。

手动运行时可以设置 `apply_migrations`：

- `true`：部署前执行远端 D1 结构对账，默认值。
- `false`：跳过 D1 结构对账，仅部署 Worker。

推送到 `main` 时始终执行 D1 结构对账，不能通过该选项跳过。

## 工作流执行顺序

每次部署依次执行：

1. 检出代码并安装 Node.js 22。
2. 通过 `npm ci` 安装锁定版本的依赖。
3. 按触发条件运行 `scripts/reconcile-remote-d1.mjs`。
4. 构建 Vue 管理后台并部署 Cloudflare Worker。
5. 检查远端 Worker 是否已经存在 `JWT_SECRET`。

D1 对账会先应用 `schema.sql` 中可重复执行的基础结构，再检查兼容迁移需要的表、字段、索引和设置项。已有结构会跳过，缺少的结构才会补齐。

`JWT_SECRET` 的处理规则：

- 远端已经存在：输出 `JWT_SECRET already exists; skipping.`，不会覆盖现有值。
- 远端不存在且 GitHub Secret 已配置：写入 Worker Secret。
- 远端不存在且 GitHub Secret 为空：工作流报错并结束。

Secret 检查位于 Worker 部署之后，因此首次部署时 Worker 会先被创建，随后再写入 `JWT_SECRET`。只有整个工作流成功结束后，部署才算配置完整。

## JWT_SECRET 轮换

工作流不会覆盖已经存在的远端 `JWT_SECRET`。仅修改 GitHub Repository Secret 不会完成轮换。

需要轮换时，在可信任的本地环境执行：

```bash
openssl rand -hex 32
npx wrangler secret put JWT_SECRET
```

然后把同一个新值更新到 GitHub Repository Secret。轮换后，使用旧密钥签发的后台登录令牌会失效，管理员需要重新登录。

## 其他生产环境 Secret

邮件通知使用的 `RESEND_API_KEY` 当前不由 GitHub Actions 自动管理。需要时单独执行：

```bash
npx wrangler secret put RESEND_API_KEY
```

Turnstile Site Key 和 Secret Key 通过后台设置页保存，不属于 Worker Secret。

## 部署后检查

工作流成功后建议检查：

- 站点首页可以正常打开
- `/wp-admin` 可以登录并访问管理页面
- 新建或编辑内容时 D1 写入正常
- 媒体上传可以写入 R2
- GitHub Actions 日志中没有 D1 对账失败或缺少 `JWT_SECRET` 的错误

可以只查看远端 Secret 名称，不会显示 Secret 值：

```bash
npx wrangler secret list
```

## 常见问题

### JWT_SECRET is missing from both the Worker and GitHub Actions secrets

远端 Worker 尚未配置该 Secret，且 GitHub 中的 `JWT_SECRET` 为空。添加 Repository Secret 后重新运行工作流。

### Authentication error 或 API Token 权限不足

确认 `CLOUDFLARE_API_TOKEN` 未过期、资源范围包含目标账号，并允许部署 Workers 和更新 D1。

### D1 database not found

确认 `wrangler.toml` 中的 `database_name`、`database_id` 和 `CLOUDFLARE_ACCOUNT_ID` 属于同一个账号。

### R2 或 KV 绑定失败

工作流不会创建绑定资源。先在 Cloudflare 中创建资源，再更新 `wrangler.toml` 中的名称或 ID。

### 需要重跑但不想执行迁移

从 GitHub Actions 页面手动运行工作流，并将 `apply_migrations` 设置为 `false`。推送到 `main` 的自动部署仍会执行对账。
