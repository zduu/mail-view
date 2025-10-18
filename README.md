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

### 本地测试

#### 1. 启动 Worker API（终端1）

```bash
cd worker
echo "ADMIN_PASSWORD=test123456" > .dev.vars
wrangler dev --local --port 8787
```

#### 2. 启动管理界面（终端2）

```bash
cd app
python3 -m http.server 8080
```

#### 3. 访问系统

浏览器打开：`http://localhost:8080`

**登录信息**：
- API 地址：`http://localhost:8787`
- 管理员密码：`test123456`

#### 局域网访问

获取本机 IP：
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# 示例输出: 192.168.1.100
```

其他设备访问：`http://192.168.1.100:8080`

**注意**：需在 `app/index.html` 中修改 `window.APP_CONFIG.apiUrl` 为 `http://192.168.1.100:8787`

---

### 生产部署

#### 1. 部署 Worker API

```bash
cd worker

# 创建 KV 命名空间
wrangler kv:namespace create "MAIL_TOKENS"
# 记录返回的 KV ID，填入 wrangler.toml

# 设置管理员密码
wrangler secret put ADMIN_PASSWORD

# 部署
wrangler deploy
```

#### 2. 部署管理界面

**Cloudflare Pages GitHub 集成部署（推荐）**

✨ **零代码修改，自动部署** - 无需手动修改配置文件，通过环境变量自动注入

1. **推送代码到 GitHub**
   ```bash
   # 初始化 git 仓库（如果还没有）
   git init
   git add .
   git commit -m "Initial commit"

   # 创建 GitHub 仓库并推送
   git remote add origin https://github.com/zduu/mail-view.git
   git branch -M main
   git push -u origin main
   ```

2. **在 Cloudflare Pages 创建项目**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 进入 **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**
   - 选择 GitHub 账号并授权
   - 选择你的仓库

3. **配置构建设置**
   - **Project name**: `mail-app`（或自定义名称）
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: 留空
   - **Build output directory**: 留空（直接部署 app 目录）
   - **Root directory**: `app`

4. **配置环境变量（必需）**

   在 **Settings** > **Environment variables** 中添加：

   | 变量名 | 值 | 说明 |
   |--------|---|------|
   | `API_URL` | `https://your-worker.workers.dev` | 你的 Worker API 地址 |
   | `APP_URL` | `https://mail-app.pages.dev` | 你的 Pages 应用地址 |

   **重要提示**：
   - `API_URL` 填写步骤1中部署的 Worker 地址
   - `APP_URL` 首次部署时可先留空，部署完成后获取实际地址再填入并重新部署

5. **完成部署**
   - 点击 **Save and Deploy**
   - 等待部署完成（约30秒-2分钟）
   - 获取 Pages URL（如 `https://mail-app.pages.dev`）
   - 如果步骤4中 `APP_URL` 为空，现在回填实际地址并重新部署

6. **自动部署**
   - ✅ 每次推送到 `main` 分支自动触发部署
   - ✅ Pull Request 自动生成预览环境
   - ✅ 可在 Dashboard 查看部署历史和日志
   - ✅ 支持版本回滚

**工作原理：**
- `app/_worker.js` 在运行时动态生成 `config.js`
- 环境变量 `API_URL` 和 `APP_URL` 自动注入到配置中
- 本地开发时自动使用 localhost 配置
- 无需修改任何代码即可部署到生产环境

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
统一管理界面 (app)     Worker API + KV      邮箱 Worker
http://localhost:8080 → :8787/admin/* → :8787/viewer/* → mail.workers.dev
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