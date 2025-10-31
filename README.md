# CFBlog

基于 Cloudflare Workers + D1 + R2 构建的现代化无头博客系统。

## 项目简介

CFBlog 是一个类似 WordPress 的无头博客系统，使用 Cloudflare 生态系统构建，具有高性能、低成本、全球分发的特点。

### 技术栈

**后端 (API)**
- Cloudflare Workers - 无服务器计算平台
- Hono - 快速轻量的 Web 框架
- D1 - Cloudflare 的 SQLite 数据库
- R2 - Cloudflare 对象存储
- TypeScript - 类型安全的开发体验
- bcryptjs - 密码加密
- jose - JWT 认证

**前端**
- Vue 3 - 渐进式 JavaScript 框架
- TypeScript - 类型安全
- Vue Router - 路由管理
- Pinia - 状态管理
- Vite - 快速的构建工具
- Markdown-it - Markdown 渲染
- Highlight.js - 代码高亮

## 功能特性

### 内容管理
- ✅ 文章管理（创建、编辑、删除、发布）
- ✅ 分类和标签系统
- ✅ Markdown 编辑器支持
- ✅ 文章摘要和置顶功能
- ✅ 特色图片支持（URL 或媒体库）
- ✅ 文章状态管理（草稿、发布、待审核、私密、回收站）
- ✅ 页面和文章类型支持
- ✅ 评论系统
- ✅ 浏览计数

### 媒体管理
- ✅ 图片上传到 R2 存储
- ✅ 媒体库管理
- ✅ 图片元数据（标题、描述、替代文本）
- ✅ 支持多种文件格式

### 用户系统
- ✅ 用户注册和登录
- ✅ JWT 认证
- ✅ 角色权限系统（管理员、编辑、作者、投稿者、订阅者）
- ✅ 用户资料管理
- ✅ 头像和个人简介

### 友情链接
- ✅ 链接分类管理
- ✅ 友情链接管理
- ✅ 链接排序和可见性控制
- ✅ 头像支持

### 系统设置
- ✅ 站点基础设置（标题、描述、关键词）
- ✅ SEO 配置
- ✅ 自定义页脚文本
- ✅ ICP 备案信息

## 项目结构

```
cfblog/
├── src/                    # 后端源码
│   ├── index.ts           # Workers 入口文件
├── schema.sql             # 完整数据库架构（已整合所有迁移）
├── wrangler.toml          # Cloudflare Workers 配置
├── package.json
└── README.md

```

## 快速开始

### 前置要求

- Node.js 20.19.0+ 或 22.12.0+
- npm 或 yarn
- Cloudflare 账号
- Wrangler CLI

### 安装

1. **克隆项目**
```bash
git clone <repository-url>
cd cfblog
```

2. **安装后端依赖**
```bash
npm install
```

### 配置

1. **配置 Wrangler**

编辑 `wrangler.toml` 文件：

```toml
name = "cfblog"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "cfblog-db"
database_id = "your-database-id-here"  # 替换为你的 D1 数据库 ID

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "cfblog-media"           # 替换为你的 R2 存储桶名称

# Workers AI binding
[ai]
binding = "AI"

[vars]
JWT_SECRET = "your-jwt-secret-here"    # 替换为安全的密钥
```

2. **创建 Cloudflare 资源**

```bash
# 创建 D1 数据库
wrangler d1 create cfblog-db

# 创建 R2 存储桶
wrangler r2 bucket create cfblog-media
```

3. **初始化数据库**

使用整合后的 schema.sql 初始化数据库：

```bash
wrangler d1 execute cfblog-db --file=./schema.sql --remote
```

**重要说明：**
- `schema.sql` 已经包含了所有表结构、索引和默认数据
- 之前的迁移文件（migrations/ 目录）已整合到 schema.sql 中
- 对于新数据库，只需运行一次 schema.sql 即可
- 包含的内容：
  - 所有基础表（users, posts, categories, tags, comments, media, links 等）
  - site_settings 表（系统设置）
  - featured_media_id 和 featured_image_url 字段
  - 所有索引
  - 默认数据（分类、链接分类、系统设置）

### 开发

**启动后端开发服务器**
```bash
npm run dev
```
后端 API 将运行在 http://127.0.0.1:8787

## API 文档

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 文章管理

- `GET /api/posts` - 获取文章列表
- `GET /api/posts/:id` - 获取文章详情
- `POST /api/posts` - 创建文章（需要认证）
- `PUT /api/posts/:id` - 更新文章（需要认证）
- `DELETE /api/posts/:id` - 删除文章（需要认证）

### 分类管理

- `GET /api/categories` - 获取分类列表
- `GET /api/categories/:id` - 获取分类详情
- `POST /api/categories` - 创建分类（需要认证）
- `PUT /api/categories/:id` - 更新分类（需要认证）
- `DELETE /api/categories/:id` - 删除分类（需要认证）

### 标签管理

- `GET /api/tags` - 获取标签列表
- `GET /api/tags/:id` - 获取标签详情

### 媒体管理

- `GET /api/media` - 获取媒体列表
- `POST /api/media/upload` - 上传媒体文件（需要认证）
- `DELETE /api/media/:id` - 删除媒体文件（需要认证）

### 评论管理

- `GET /api/comments` - 获取评论列表
- `POST /api/comments` - 发表评论
- `PUT /api/comments/:id` - 更新评论（需要认证）
- `DELETE /api/comments/:id` - 删除评论（需要认证）

### 友情链接

- `GET /api/links` - 获取链接列表
- `GET /api/link-categories` - 获取链接分类

### 系统设置

- `GET /api/settings` - 获取系统设置
- `PUT /api/settings` - 更新系统设置（需要认证）

## 注意事项

1. **数据库初始化**：首次部署时必须运行 `schema.sql` 初始化数据库
2. **安全配置**：生产环境务必修改 `JWT_SECRET` 为安全的随机字符串
3. **CORS 配置**：根据前端部署域名调整 CORS 设置
4. **媒体存储**：R2 存储桶需要配置公开访问或使用自定义域名
5. **迁移文件**：`migrations/` 目录中的文件已整合到 `schema.sql`，新部署无需单独执行

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如有问题，请提交 Issue 或联系维护者。
