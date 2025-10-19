# 邮件查看器分发系统

一个基于 Cloudflare 的安全邮件分发查看系统，通过统一管理界面创建和管理邮件分发链接。

## ✨ 核心特性

- **🔒 安全隔离**：分发链接仅包含随机 Token，不暴露任何敏感信息
- **🎯 一键启动**：本地测试只需两个终端，一个端口访问所有功能
- **🎛️ 统一管理**：管理端和查看端集成在同一页面
- **☁️ 云端存储**：配置存储在 Cloudflare KV，支持远程管理
- **👁️ 只读权限**：分发端仅能查看邮件，无任何修改权限
- **⏰ 灵活控制**：支持过期时间、随时禁用/启用、访问统计

## 🚀 快速开始

### 本地测试（单一 Pages）

```bash
cd app
echo "ADMIN_PASSWORD=test123456" > .dev.vars
# 首次运行会使用 app/wrangler.toml（含 KV 绑定与 compatibility_date）
wrangler pages dev .
```

终端会显示本地访问地址（如 http://127.0.0.1:8788）。

默认情况下，前端会使用同源地址作为 API（无需单独启动后端）。
如果看到 “KV 绑定缺失” 错误，请确认 `app/wrangler.toml` 中存在：

```
[[kv_namespaces]]
binding = "MAIL_TOKENS"
id = "MAIL_TOKENS_DEV"
preview_id = "MAIL_TOKENS_DEV"
```

登录时直接输入管理员密码：`test123456`。

#### 局域网访问

获取本机 IP：
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# 示例输出: 192.168.1.100
```

其他设备访问：`http://192.168.1.100:8080`

**注意**：统一部署后，默认 API 为同源，无需修改 `apiUrl`。

---

### 生产部署（已改为单一 Pages 部署）

现在项目已统一为「一个 Cloudflare Pages 即可完成前后端部署」。

#### 1) 在 Cloudflare Pages 创建项目（Git 集成）

1. 推送代码到 GitHub（或你使用的 Git 平台）
2. Dashboard: Workers & Pages → Create application → Pages → Connect to Git
3. 选择仓库后配置：
   - Project name: 任意，例如 `mail-app`
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: 留空
   - Build output directory: 留空
   - Root directory: `app`

#### 2) 绑定环境变量与 KV

在 Pages 项目中配置：Settings → Environment variables & Secrets：

- Secrets：
  - `ADMIN_PASSWORD`（必填）：管理员密码（仅管理端使用）
- Variables（可选）：
  - `APP_URL`：你的 Pages 访问地址（未填写则自动使用当前域名）
  - `API_URL`：API 地址（未填写则自动使用同源地址，推荐留空以统一部署）
- KV Bindings：
  - 绑定一个 KV 命名空间到 `MAIL_TOKENS`（用于存储分发 Token）

部署后如创建分发链接失败或查看邮件报错，请确认：
- 已绑定 `MAIL_TOKENS`（Functions → KV Bindings）
- 已设置 `ADMIN_PASSWORD`（Environment variables & Secrets）
- 创建分发链接时“邮箱 Worker 地址”为完整的 `https://` 开头的域名（示例：`https://mail.example.workers.dev`），不要使用本地地址

完成以上配置后点击 Deploy 即可。前端静态资源和 API（/admin/*、/viewer/*）都由同一个 Pages 站点提供。

#### 3) 自动化

- ✅ 每次推送到 `main` 分支自动部署
- ✅ 预览环境自动生成
- ✅ 可在 Dashboard 查看日志与回滚

**工作原理：**
- `app/_worker.js` 同时提供 API 和静态资源分发
- `config.js` 通过 `_worker.js` 动态注入，默认同源（无需跨域）
- 所有后端逻辑（原 `worker/index.js`）已合并进 `_worker.js`

---

### 本地测试（单一 Workers）

```bash
cd worker
echo "ADMIN_PASSWORD=test123456" > .dev.vars
wrangler dev --local --port 8787
```

打开终端显示的地址（如 http://127.0.0.1:8787），前端与 API 同源提供。

### 生产部署（单一 Workers 部署）

1) 准备 KV（仅一次）：
```bash
cd worker
wrangler kv:namespace create "MAIL_TOKENS"
# 将返回的 id 写入 wrangler.toml 的 kv_namespaces.id
```

2) 设置 Secret：
```bash
wrangler secret put ADMIN_PASSWORD
```

3) 部署：
```bash
wrangler deploy
```

部署后访问 `*.workers.dev` 即可使用。此 Workers 同时提供：
- 静态页面（目录绑定到 ../app）
- API 路由：`/admin/*`、`/viewer/*`

**工作原理：**
- `worker/index.js` 集成静态资源分发与 API
- `wrangler.toml` 使用 `assets.directory = "../app"` 绑定前端目录
- `/config.js` 由 Worker 动态注入，默认同源（无需跨域）

## 📖 使用说明

### 管理控制台

1. **登录** - 输入 Worker API 地址和管理员密码

2. **创建分发链接**
   - 填写邮箱 Worker 地址
   - 选择 API 类型（user/user_api/admin）
   - 填入认证信息（JWT 或 Admin密码）
   - 指定邮箱地址（必填）
   - 添加描述和过期时间（可选）

3. **管理链接**
   - **查看邮件** - 点击直接在当前页面查看
   - **复制链接** - 分享给他人访问
   - **禁用/启用** - 临时控制访问权限
   - **删除** - 永久删除链接

### 邮件查看

1. 切换到"邮件查看"标签
2. 输入 Token ID 或使用分发链接访问
3. 支持搜索、分页、查看详情

### 分发链接格式

```
https://your-app.pages.dev/#/view/abc123xyz...
                            └─ 32位随机Token
```

**特点**：
- Hash 路由，URL 不暴露信息
- 接收者无需登录，直接访问
- 可在任何设备上打开

## 🏗️ 系统架构

```
统一管理界面 (Pages)  Pages Functions(API) + KV      邮箱 Worker
same origin (同源) →   /admin/* 与 /viewer/*   →     mail.workers.dev
                              ↓
                        存储 Token 配置
```

## 📁 目录结构

```
mail/
├── worker/          # Worker API（配置中心）
│   ├── index.js     # Worker 逻辑
│   └── wrangler.toml
│
└── app/             # 统一管理界面
    ├── index.html   # 集成管理端+查看端
    ├── config.js    # 配置文件（自动注入环境变量）
    ├── _worker.js   # Pages Worker（运行时注入配置）
    ├── _headers     # HTTP 安全头
    ├── css/style.css
    └── js/app.js
```

## 🔐 安全性

### Token 机制
- 32位随机字符串，存储在 Cloudflare KV
- 支持过期时间和手动禁用
- 配置与 Token 分离，无法从 Token 反推配置

### 访问控制
- 管理端需要密码认证
- 分发端通过 Token 验证
- 只读权限，无法修改邮件

### 数据安全
- 密码使用 Worker Secret 存储
- HTTPS 加密传输
- 无客户端存储敏感信息

## 🛠️ 故障排除

### Worker 启动失败
- 确保已安装 Wrangler CLI：`npm install -g wrangler`
- 检查 `.dev.vars` 文件是否存在

### 无法登录
- 确认 Worker 已启动（访问 `http://localhost:8787` 应显示 API 信息）
- 检查密码是否正确
- 查看浏览器控制台错误信息

### 邮件加载失败
- 确认邮箱 Worker 地址正确
- 检查认证信息（JWT/Admin密码）有效
- 确保邮箱 Worker 支持 CORS

## 💡 最佳实践

1. **为每个用户创建独立 Token** - 便于追踪和管理
2. **始终指定邮箱地址** - 避免暴露所有邮件
3. **设置合理过期时间** - 临时分享用短期，长期分享定期审查
4. **定期清理无用 Token** - 删除过期和不再使用的链接
5. **使用强管理员密码** - 至少16位，包含大小写字母数字特殊字符

## 💰 成本

使用 Cloudflare 免费计划：
- Worker: 100,000 请求/天
- KV: 100,000 读取/天
- Pages: 无限静态托管

正常使用完全免费。

## 🔧 技术栈

- **后端**: Cloudflare Workers + KV
- **前端**: 原生 HTML5 + CSS3 + JavaScript (ES6+)
- **部署**: Cloudflare Pages
- **路由**: Hash 路由（无需服务器配置）

## 📄 许可证

MIT License

---

## 附录：邮箱 API 接口

本项目兼容以下邮箱 API：

```python
# 用户 API (JWT)
GET https://mail.workers.dev/api/mails
Headers: Authorization: Bearer {JWT_TOKEN}

# 用户 API (Admin密码)
GET https://mail.workers.dev/user_api/mails
Headers: x-admin-auth: {ADMIN_PASSWORD}

# 管理员 API
GET https://mail.workers.dev/admin/mails
Headers: x-admin-auth: {ADMIN_PASSWORD}

# 查询参数
limit=20&offset=0&address=user@example.com&keyword=search
```

## Worker API 端点

**管理端 API** (需要 `x-admin-password` 请求头)
- `POST /admin/tokens` - 创建 Token
- `GET /admin/tokens` - 获取所有 Token
- `PUT /admin/tokens/:id` - 更新 Token
- `DELETE /admin/tokens/:id` - 删除 Token

**分发端 API** (通过 URL 中的 Token)
- `GET /viewer/config/:token` - 获取 Token 配置
- `GET /viewer/mails/:token` - 获取邮件列表


查看邮件 API
通过 邮件 API 查看邮件
这是一个 python 的例子，使用 requests 库查看邮件。


limit = 10
offset = 0
res = requests.get(
    f"https://<你的worker地址>/api/mails?limit={limit}&offset={offset}",
    headers={
        "Authorization": f"Bearer {你的JWT密码}",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了自定义密码
        "Content-Type": "application/json"
    }
)
admin 邮件 API
支持 address filter 和 keyword filter


import requests

url = "https://<你的worker地址>/admin/mails"

querystring = {
    "limit":"20",
    "offset":"0",
    # adress 和 keyword 为可选参数
    "address":"xxxx@awsl.uk",
    "keyword":"xxxx"
}

headers = {"x-admin-auth": "<你的Admin密码>"}

response = requests.get(url, headers=headers, params=querystring)

print(response.json())
user 邮件 API
支持 address filter 和 keyword filter


import requests

url = "https://<你的worker地址>/user_api/mails"

querystring = {
    "limit":"20",
    "offset":"0",
    # adress 和 keyword 为可选参数
    "address":"xxxx@awsl.uk",
    "keyword":"xxxx"
}

headers = {"x-admin-auth": "<你的Admin密码>"}

response = requests.get(url, headers=headers, params=querystring)

print(response.json())
