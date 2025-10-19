# CFBlog - WordPress-like Headless Blog System

基于 Cloudflare Workers + D1 + R2 的无头博客后台系统，完全兼容 WordPress REST API 格式。

## 特性

- **WordPress 风格的 REST API** - 完全兼容 WordPress REST API v2 格式
- **无服务器架构** - 使用 Cloudflare Workers，无需管理服务器
- **D1 数据库** - Cloudflare 的 SQLite 数据库，提供快速的全球访问
- **R2 存储** - 媒体文件存储在 Cloudflare R2（兼容 S3）
- **JWT 认证** - 安全的基于令牌的认证系统
- **WordPress 风格管理界面** - 熟悉的后台管理体验
- **角色权限系统** - 支持多种用户角色（管理员、编辑、作者等）
- **分类和标签** - 完整的内容分类系统
- **媒体管理** - 图片和文件上传管理

## 技术栈

- **运行时**: Cloudflare Workers
- **框架**: Hono.js
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare R2
- **认证**: JWT (jose)
- **密码加密**: bcryptjs
- **语言**: TypeScript

## 项目结构

```
cfblog/
├── src/
│   ├── index.ts              # 主入口文件
│   ├── types.ts              # TypeScript 类型定义
│   ├── utils.ts              # 工具函数
│   ├── auth.ts               # 认证中间件
│   └── routes/
│       ├── posts.ts          # 文章 API
│       ├── categories.ts     # 分类 API
│       ├── tags.ts           # 标签 API
│       ├── media.ts          # 媒体 API
│       └── users.ts          # 用户 API
├── schema.sql                # 数据库架构
├── package.json
├── tsconfig.json
└── wrangler.toml            # Cloudflare 配置
```

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
# 创建 D1 数据库
npx wrangler d1 create cfblog-db

# 记录输出的 database_id，更新 wrangler.toml 中的 database_id
```

### 3. 创建 R2 存储桶

```bash
# 创建 R2 bucket
npx wrangler r2 bucket create cfblog-media
```

### 4. 更新配置

编辑 `wrangler.toml`，更新以下配置：

```toml
[[d1_databases]]
binding = "DB"
database_name = "cfblog-db"
database_id = "your-database-id-here"  # 替换为你的数据库 ID

[vars]
JWT_SECRET = "your-secret-key-here"     # 替换为强密码
ADMIN_EMAIL = "admin@example.com"       # 替换为你的邮箱
SITE_NAME = "My Blog"                   # 替换为你的网站名称
SITE_URL = "https://yourdomain.com"     # 替换为你的域名
```

### 5. 初始化数据库

```bash
# 执行数据库架构
npx wrangler d1 execute cfblog-db --file=./schema.sql
```

### 6. 本地开发

```bash
npm run dev
```

访问 http://localhost:8787

### 7. 部署到 Cloudflare

```bash
npm run deploy
```

## API 端点

### 认证

- `POST /wp-json/wp/v2/users/login` - 用户登录
- `POST /wp-json/wp/v2/users/register` - 用户注册
- `GET /wp-json/wp/v2/users/me` - 获取当前用户

### 文章

- `GET /wp-json/wp/v2/posts` - 列出文章
- `GET /wp-json/wp/v2/posts/:id` - 获取单篇文章
- `POST /wp-json/wp/v2/posts` - 创建文章（需要认证）
- `PUT /wp-json/wp/v2/posts/:id` - 更新文章（需要认证）
- `DELETE /wp-json/wp/v2/posts/:id` - 删除文章（需要认证）

### 分类

- `GET /wp-json/wp/v2/categories` - 列出分类
- `GET /wp-json/wp/v2/categories/:id` - 获取单个分类
- `POST /wp-json/wp/v2/categories` - 创建分类（需要认证）
- `PUT /wp-json/wp/v2/categories/:id` - 更新分类（需要认证）
- `DELETE /wp-json/wp/v2/categories/:id` - 删除分类（需要认证）

### 标签

- `GET /wp-json/wp/v2/tags` - 列出标签
- `GET /wp-json/wp/v2/tags/:id` - 获取单个标签
- `POST /wp-json/wp/v2/tags` - 创建标签（需要认证）
- `PUT /wp-json/wp/v2/tags/:id` - 更新标签（需要认证）
- `DELETE /wp-json/wp/v2/tags/:id` - 删除标签（需要认证）

### 媒体

- `GET /wp-json/wp/v2/media` - 列出媒体（需要认证）
- `GET /wp-json/wp/v2/media/:id` - 获取单个媒体
- `POST /wp-json/wp/v2/media` - 上传媒体（需要认证）
- `PUT /wp-json/wp/v2/media/:id` - 更新媒体（需要认证）
- `DELETE /wp-json/wp/v2/media/:id` - 删除媒体（需要认证）

### 用户

- `GET /wp-json/wp/v2/users` - 列出用户
- `GET /wp-json/wp/v2/users/:id` - 获取单个用户
- `POST /wp-json/wp/v2/users` - 创建用户（管理员）
- `PUT /wp-json/wp/v2/users/:id` - 更新用户（需要认证）
- `DELETE /wp-json/wp/v2/users/:id` - 删除用户（管理员）

## 使用示例

### 登录

```bash
curl -X POST https://your-domain.com/wp-json/wp/v2/users/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### 创建文章

```bash
curl -X POST https://your-domain.com/wp-json/wp/v2/posts \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "title": "Hello World",
    "content": "This is my first post!",
    "status": "publish",
    "categories": [1],
    "tags": []
  }'
```

### 上传媒体

```bash
curl -X POST https://your-domain.com/wp-json/wp/v2/media \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "file=@image.jpg" \\
  -F "title=My Image" \\
  -F "alt_text=An example image"
```

## 后台管理界面

访问 `/wp-admin` 进入后台管理界面。

**首次使用**：
- 首次访问会显示登录/注册界面
- 创建你的管理员账号（填写用户名、邮箱、密码）
- **第一个注册的用户自动成为管理员！**
- 之后的用户需要由管理员创建，默认为 subscriber 角色

**后续登录**：
- 直接使用你创建的账号登录即可

## 用户角色

系统支持以下用户角色：

- **administrator** - 完全控制权限
- **editor** - 可以发布和管理所有文章
- **author** - 可以发布和管理自己的文章
- **contributor** - 可以撰写和管理自己的文章，但不能发布
- **subscriber** - 只能查看内容

## 安全建议

1. 修改默认管理员密码
2. 使用强 JWT_SECRET
3. 启用 HTTPS（Cloudflare 默认提供）
4. 定期更新依赖
5. 限制注册功能（如果不需要公开注册）
6. 配置 R2 bucket 的访问策略

## 开发指南

### 添加新的 API 端点

1. 在 `src/routes/` 目录创建新文件
2. 使用 Hono 定义路由
3. 在 `src/index.ts` 中挂载路由

### 扩展数据库

1. 创建新的 SQL 迁移文件
2. 使用 `wrangler d1 execute` 执行迁移
3. 更新 TypeScript 类型定义

## 性能优化

- 使用 Cloudflare 的全球边缘网络
- D1 数据库查询优化（索引）
- R2 媒体文件 CDN 缓存
- API 响应缓存（可选）

## 故障排除

### 数据库连接失败

检查 `wrangler.toml` 中的 `database_id` 是否正确。

### 媒体上传失败

确保 R2 bucket 已创建且绑定名称正确。

### JWT 令牌无效

检查 `JWT_SECRET` 环境变量是否设置。

## 路线图

- [ ] 评论系统
- [ ] 完整的后台管理界面
- [ ] 文章修订历史
- [ ] 自定义字段支持
- [ ] RSS 订阅
- [ ] 站点地图生成
- [ ] SEO 优化
- [ ] 多语言支持

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如有问题，请创建 Issue 或联系维护者。
