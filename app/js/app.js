// 邮件查看器统一管理应用
class MailApp {
    constructor() {
        this.apiUrl = window.APP_CONFIG.apiUrl;
        this.appUrl = window.APP_CONFIG.appUrl;
        this.adminPassword = '';
        this.currentPage = 'login';
        this.currentToken = null;

        // 邮件查看器状态
        this.mailPage = 0;
        this.mailPageSize = 20;
        this.mailKeyword = '';

        this.init();
    }

    init() {
        this.bindEvents();
        this.checkLogin();
        this.handleRoute();
    }

    bindEvents() {
        // 登录
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // 导航
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const page = e.target.dataset.page;
                this.navigate(page);
            });
        });

        // 退出登录
        document.getElementById('btnLogout').addEventListener('click', () => {
            this.logout();
        });

        // API 类型切换
        document.getElementById('apiType').addEventListener('change', (e) => {
            this.toggleAuthFields(e.target.value);
        });

        // 创建 Token
        document.getElementById('createTokenForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createToken();
        });

        // 刷新 Tokens
        document.getElementById('btnRefreshTokens').addEventListener('click', () => {
            this.loadTokens();
        });

        // Viewer 加载
        document.getElementById('btnLoadViewer').addEventListener('click', () => {
            const token = document.getElementById('viewerTokenInput').value.trim();
            if (token) {
                this.loadMailViewer(token);
            }
        });

        // 模态框
        document.querySelector('.close').addEventListener('click', () => {
            document.getElementById('mailModal').style.display = 'none';
        });

        document.querySelector('.close-token').addEventListener('click', () => {
            document.getElementById('tokenModal').style.display = 'none';
        });

    }

    handleRoute() {
        const hash = window.location.hash;
        if (hash.startsWith('#/view/')) {
            const token = hash.replace('#/view/', '');
            this.navigate('viewer');
            setTimeout(() => {
                document.getElementById('viewerTokenInput').value = token;
                this.loadMailViewer(token);
            }, 100);
        }
    }

    checkLogin() {
        this.adminPassword = localStorage.getItem('adminPassword') || '';
        if (this.adminPassword) {
            this.showApp();
        } else {
            this.showLogin();
        }
    }

    async login() {
        const password = document.getElementById('adminPassword').value;

        const apiUrl = window.APP_CONFIG.apiUrl; // 单一部署默认同源
        this.apiUrl = apiUrl;
        this.adminPassword = password;

        try {
            const response = await this.apiRequest('/admin/tokens', 'GET');
            if (response.success) {
                // 单一部署无需持久化 apiUrl；保持以同源为准
                localStorage.setItem('adminPassword', password);
                window.APP_CONFIG.apiUrl = apiUrl;
                this.showApp();
            }
        } catch (error) {
            alert(`登录失败: ${error.message}`);
        }
    }

    logout() {
        localStorage.removeItem('adminPassword');
        localStorage.removeItem('apiUrl');
        this.adminPassword = '';
        this.showLogin();
    }

    showLogin() {
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('adminPage').style.display = 'none';
        document.getElementById('viewerPage').style.display = 'none';
        document.getElementById('btnLogout').style.display = 'none';
        document.querySelectorAll('.nav-link').forEach(link => {
            link.style.display = 'none';
        });
    }

    showApp() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('btnLogout').style.display = 'block';
        document.querySelectorAll('.nav-link').forEach(link => {
            link.style.display = 'inline-block';
        });
        this.navigate('admin');
    }

    navigate(page) {
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

        if (page === 'admin') {
            document.getElementById('adminPage').style.display = 'block';
            document.querySelector('[data-page="admin"]').classList.add('active');
            this.loadTokens();
        } else if (page === 'viewer') {
            document.getElementById('viewerPage').style.display = 'block';
            document.querySelector('[data-page="viewer"]').classList.add('active');
        }

        this.currentPage = page;
    }

    toggleAuthFields(apiType) {
        const jwtGroup = document.getElementById('jwtTokenGroup');
        const adminAuthGroup = document.getElementById('mailAdminAuthGroup');

        if (apiType === 'user') {
            jwtGroup.style.display = 'block';
            adminAuthGroup.style.display = 'none';
        } else {
            jwtGroup.style.display = 'none';
            adminAuthGroup.style.display = 'block';
        }
    }

    async createToken() {
        // 规范化邮箱 Worker 地址，避免生产报错
        let mailWorkerUrl = document.getElementById('mailWorkerUrl').value.trim();
        if (mailWorkerUrl.startsWith('//')) mailWorkerUrl = 'https:' + mailWorkerUrl;
        if (!/^https?:\/\//i.test(mailWorkerUrl)) mailWorkerUrl = 'https://' + mailWorkerUrl;
        mailWorkerUrl = mailWorkerUrl.replace(/\/$/, '');

        const formData = {
            mailWorkerUrl,
            apiType: document.getElementById('apiType').value,
            jwtToken: document.getElementById('jwtToken').value.trim(),
            adminAuth: document.getElementById('mailAdminAuth').value.trim(),
            emailAddress: document.getElementById('emailAddress').value.trim(),
            description: document.getElementById('description').value.trim(),
            viewerUrl: this.appUrl,
            expiresAt: document.getElementById('expiresAt').value || null
        };

        try {
            const response = await this.apiRequest('/admin/tokens', 'POST', formData);
            if (response.success) {
                alert('分发链接创建成功！');
                this.showTokenDetail(response.token);
                document.getElementById('createTokenForm').reset();
                this.loadTokens();
            }
        } catch (error) {
            alert(`创建失败: ${error.message}`);
        }
    }

    async loadTokens() {
        const tokensList = document.getElementById('tokensList');
        tokensList.innerHTML = '<div class="loading">正在加载...</div>';

        try {
            const response = await this.apiRequest('/admin/tokens', 'GET');
            if (response.success) {
                this.renderTokens(response.tokens);
            }
        } catch (error) {
            tokensList.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
        }
    }

    renderTokens(tokens) {
        const tokensList = document.getElementById('tokensList');

        if (tokens.length === 0) {
            tokensList.innerHTML = '<div class="empty">暂无分发链接</div>';
            return;
        }

        tokensList.innerHTML = tokens.map(token => `
            <div class="token-item ${token.disabled ? 'disabled' : ''}" data-token-id="${token.id}">
                <div class="token-header">
                    <div class="token-email">${this.escapeHtml(token.emailAddress)}</div>
                    <div class="token-actions">
                        <button class="btn-small btn-view" onclick="app.viewMails('${token.id}')">查看邮件</button>
                        <button class="btn-small" onclick="app.copyTokenUrl('${token.id}')">复制链接</button>
                        <button class="btn-small ${token.disabled ? 'btn-success' : 'btn-warning'}"
                                onclick="app.toggleToken('${token.id}', ${!token.disabled})">
                            ${token.disabled ? '启用' : '禁用'}
                        </button>
                        <button class="btn-small btn-danger" onclick="app.deleteToken('${token.id}')">删除</button>
                    </div>
                </div>
                <div class="token-info">
                    <span class="token-desc">${this.escapeHtml(token.description || '无描述')}</span>
                    <span class="token-stats">访问: ${token.accessCount || 0}次</span>
                    <span class="token-date">创建: ${this.formatDate(token.createdAt)}</span>
                    ${token.expiresAt ? `<span class="token-expires">过期: ${this.formatDate(token.expiresAt)}</span>` : ''}
                </div>
            </div>
        `).join('');
    }

    viewMails(tokenId) {
        this.navigate('viewer');
        document.getElementById('viewerTokenInput').value = tokenId;
        this.loadMailViewer(tokenId);
    }

    async copyTokenUrl(tokenId) {
        const url = `${this.appUrl}/#/view/${tokenId}`;
        try {
            await navigator.clipboard.writeText(url);
            alert('链接已复制！\n\n' + url);
        } catch (error) {
            prompt('请手动复制链接：', url);
        }
    }

    async toggleToken(tokenId, disabled) {
        if (!confirm(`确定要${disabled ? '禁用' : '启用'}此链接吗？`)) return;

        try {
            const response = await this.apiRequest(`/admin/tokens/${tokenId}`, 'PUT', { disabled });
            if (response.success) {
                alert('操作成功！');
                this.loadTokens();
            }
        } catch (error) {
            alert(`操作失败: ${error.message}`);
        }
    }

    async deleteToken(tokenId) {
        if (!confirm('确定要删除此链接吗？此操作不可恢复！')) return;

        try {
            const response = await this.apiRequest(`/admin/tokens/${tokenId}`, 'DELETE');
            if (response.success) {
                alert('删除成功！');
                this.loadTokens();
            }
        } catch (error) {
            alert(`删除失败: ${error.message}`);
        }
    }

    showTokenDetail(token) {
        const modal = document.getElementById('tokenModal');
        const detailDiv = document.getElementById('tokenDetail');

        const url = `${this.appUrl}/#/view/${token.id}`;

        detailDiv.innerHTML = `
            <h2>✅ 分发链接已创建</h2>
            <div class="token-detail">
                <div class="detail-row">
                    <label>分发链接:</label>
                    <div class="detail-value">
                        <input type="text" value="${url}" readonly onclick="this.select()">
                        <button class="btn-small" onclick="app.copyText('${url}')">复制</button>
                    </div>
                </div>
                <div class="detail-row">
                    <label>Token ID:</label>
                    <div class="detail-value"><code>${token.id}</code></div>
                </div>
                <div class="detail-row">
                    <label>邮箱地址:</label>
                    <div class="detail-value">${this.escapeHtml(token.emailAddress)}</div>
                </div>
            </div>
            <p class="warning">⚠️ 请妥善保管此链接，任何持有此链接的人都可以查看该邮箱的邮件。</p>
        `;

        modal.style.display = 'block';
    }

    async loadMailViewer(token) {
        this.currentToken = token;
        this.mailPage = 0;
        this.mailKeyword = '';

        const viewerContent = document.getElementById('viewerContent');
        viewerContent.innerHTML = '<div class="loading">正在加载...</div>';

        try {
            const response = await fetch(`${this.apiUrl}/viewer/config/${token}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || '加载失败');
            }

            // 直接在 viewerContent 中渲染邮件查看器
            const emailAddress = data.config.emailAddress;
            const title = data.config.description || '邮件列表';

            viewerContent.innerHTML = `
                <div class="mail-panel">
                    <div class="panel-header">
                        <h3>${this.escapeHtml(title)}</h3>
                        <span class="mail-address">${this.escapeHtml(emailAddress)}</span>
                    </div>

                    <div class="search-bar">
                        <input type="text" id="searchKeyword" placeholder="搜索关键词...">
                        <button class="btn-primary" id="btnSearch">搜索</button>
                        <button class="btn-secondary" id="btnRefreshMails">刷新</button>
                    </div>

                    <div class="mail-info">
                        <span id="mailCount">正在加载...</span>
                    </div>

                    <div class="mail-list" id="mailList">
                        <div class="loading">正在加载邮件...</div>
                    </div>

                    <div class="pagination">
                        <button class="btn-secondary" id="btnPrev" disabled>上一页</button>
                        <span id="pageInfo">第 1 页</span>
                        <button class="btn-secondary" id="btnNext">下一页</button>
                    </div>
                </div>
            `;

            // 重新绑定邮件查看器的事件
            document.getElementById('btnSearch').addEventListener('click', () => this.searchMails());
            document.getElementById('btnRefreshMails').addEventListener('click', () => this.loadMails());
            document.getElementById('btnPrev').addEventListener('click', () => {
                if (this.mailPage > 0) {
                    this.mailPage--;
                    this.loadMails();
                }
            });
            document.getElementById('btnNext').addEventListener('click', () => {
                this.mailPage++;
                this.loadMails();
            });

            this.loadMails();
        } catch (error) {
            viewerContent.innerHTML = `<div class="error-message">${error.message}</div>`;
        }
    }

    async loadMails() {
        if (!this.currentToken) return;

        const mailList = document.getElementById('mailList');
        mailList.innerHTML = '<div class="loading">正在加载邮件...</div>';

        const params = new URLSearchParams({
            limit: this.mailPageSize.toString(),
            offset: (this.mailPage * this.mailPageSize).toString()
        });

        if (this.mailKeyword) {
            params.append('keyword', this.mailKeyword);
        }

        try {
            const response = await fetch(`${this.apiUrl}/viewer/mails/${this.currentToken}?${params}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || '加载失败');
            }

            this.renderMailList(data.results);
            this.updatePagination(data.results.length);
        } catch (error) {
            mailList.innerHTML = `<div class="error-message">${error.message}</div>`;
        }
    }

    searchMails() {
        this.mailKeyword = document.getElementById('searchKeyword').value;
        this.mailPage = 0;
        this.loadMails();
    }

    renderMailList(mails) {
        const mailList = document.getElementById('mailList');

        if (mails.length === 0) {
            mailList.innerHTML = '<div class="empty">没有找到邮件</div>';
            document.getElementById('mailCount').textContent = '显示: 0 封邮件';
            return;
        }

        // 转义 HTML - 使用简单方法避免创建 DOM 元素
        const escapeHtml = (str) => str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        // 批量构建 HTML，减少 DOM 操作
        const mailItems = [];

        for (const mail of mails) {
            // 快速提取邮件头 - 只提取需要显示的字段
            let subject = '';
            let from = '';
            const to = mail.address || '';

            if (mail.raw) {
                // 邮件使用 \r\n 换行，搜索前6000字符（足够包含主要邮件头）
                const headers = mail.raw.substring(0, 6000);

                // 快速匹配 Subject（支持 \r\n 换行）
                let subjectIdx = headers.indexOf('\r\nSubject:');
                if (subjectIdx === -1) subjectIdx = headers.indexOf('\nSubject:');
                if (subjectIdx !== -1) {
                    const start = subjectIdx + (headers[subjectIdx] === '\r' ? 10 : 9);
                    let subjectEnd = headers.indexOf('\r\n', start);
                    if (subjectEnd === -1) subjectEnd = headers.indexOf('\n', start);
                    const subjectLine = headers.substring(start, subjectEnd > 0 ? subjectEnd : undefined).trim();
                    subject = this.decodeMailHeader(subjectLine);
                }

                // 快速匹配 From
                let fromIdx = headers.indexOf('\r\nFrom:');
                if (fromIdx === -1) fromIdx = headers.indexOf('\nFrom:');
                if (fromIdx !== -1) {
                    const start = fromIdx + (headers[fromIdx] === '\r' ? 7 : 6);
                    let fromEnd = headers.indexOf('\r\n', start);
                    if (fromEnd === -1) fromEnd = headers.indexOf('\n', start);
                    const fromLine = headers.substring(start, fromEnd > 0 ? fromEnd : undefined).trim();
                    from = this.decodeMailHeader(fromLine);
                }
            }

            // 提取发件人显示名称
            let displayFrom = from || '未知发件人';
            const nameMatch = from.match(/^(.+?)\s*<(.+?)>$/);
            if (nameMatch) {
                displayFrom = nameMatch[1].trim() || nameMatch[2];
            }

            mailItems.push(`
                <div class="mail-item" data-mail='${JSON.stringify(mail).replace(/'/g, '&#39;')}'>
                    <div class="mail-item-header">
                        <div class="mail-from">${escapeHtml(displayFrom)}</div>
                        <div class="mail-date">${this.formatDate(mail.created_at)}</div>
                    </div>
                    <div class="mail-subject">${escapeHtml(subject || '(无主题)')}</div>
                    <div class="mail-to">
                        <span class="mail-to-label">收件:</span>
                        <span>${escapeHtml(to)}</span>
                    </div>
                </div>
            `);
        }

        mailList.innerHTML = mailItems.join('');

        // 批量添加事件监听器
        document.querySelectorAll('.mail-item').forEach(item => {
            item.addEventListener('click', () => {
                const mail = JSON.parse(item.dataset.mail);
                this.showMailDetail(mail);
            });
        });

        document.getElementById('mailCount').textContent = `显示: ${mails.length} 封邮件`;
    }

    showMailDetail(mail) {
        const detailDiv = document.getElementById('mailDetail');

        // 解析邮件头信息 - 直接从 raw 中提取
        let subject = '';
        let from = '';
        let to = mail.address || ''; // address 是收件人邮箱

        // 从 raw 数据中提取顶层头部（支持折叠行）
        if (mail.raw) {
            const top = this.splitHeaderBody(mail.raw);
            const subjVal = this.getHeaderValue(top.headers, 'Subject');
            const fromVal = this.getHeaderValue(top.headers, 'From');
            const toVal = this.getHeaderValue(top.headers, 'To');
            if (subjVal) subject = this.decodeMailHeader(subjVal);
            if (fromVal) from = this.decodeMailHeader(fromVal);
            if (toVal) to = this.decodeMailHeader(toVal);
        }

        let htmlContent = '';
        let textContent = '';

        if (mail.raw) {
            htmlContent = this.extractAndDecodeMailPart(mail.raw, 'html');
            textContent = this.extractAndDecodeMailPart(mail.raw, 'plain');
        }

        // 基础清洗：移除脚本/无用meta/外链样式，修复常见邮件HTML，降低渲染异常
        if (htmlContent) {
            htmlContent = this.sanitizeEmailHtml(htmlContent);
        }

        detailDiv.innerHTML = `
            <h3>${this.escapeHtml(subject || '(无主题)')}</h3>
            <div class="mail-detail-info">
                <div class="mail-detail-row">
                    <span class="mail-detail-label">发件人:</span>
                    <span class="mail-detail-value">${this.escapeHtml(from || '未知')}</span>
                </div>
                <div class="mail-detail-row">
                    <span class="mail-detail-label">收件人:</span>
                    <span class="mail-detail-value">${this.escapeHtml(to || '未知')}</span>
                </div>
                <div class="mail-detail-row">
                    <span class="mail-detail-label">日期:</span>
                    <span class="mail-detail-value">${this.formatDate(mail.created_at)}</span>
                </div>
            </div>
            <div class="mail-detail-content">
                ${htmlContent ? `<h4>邮件内容 (HTML):</h4><div class="mail-html-content">${htmlContent}</div>` : ''}
                ${textContent ? `<h4>邮件内容 (纯文本):</h4><div class="mail-text-content">${this.escapeHtml(textContent)}</div>` : ''}
                ${!htmlContent && !textContent ? `<h4>原始邮件:</h4><div class="mail-text-content">${this.escapeHtml(mail.raw ? mail.raw.substring(0, 1000) + '...' : '无内容')}</div>` : ''}
            </div>
        `;

        document.getElementById('mailModal').style.display = 'block';
    }

    updatePagination(count) {
        document.getElementById('btnPrev').disabled = this.mailPage === 0;
        document.getElementById('btnNext').disabled = count < this.mailPageSize;
        document.getElementById('pageInfo').textContent = `第 ${this.mailPage + 1} 页`;
    }

    async apiRequest(endpoint, method, body = null) {
        const headers = {
            'Content-Type': 'application/json',
            'x-admin-password': this.adminPassword
        };

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(this.apiUrl + endpoint, options);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    async copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            alert('已复制到剪贴板！');
        } catch (error) {
            alert('复制失败');
        }
    }

    formatDate(dateString) {
        if (!dateString) return '未知';
        try {
            return new Date(dateString).toLocaleString('zh-CN');
        } catch (e) {
            return dateString;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 轻量级邮件 HTML 清洗，避免XSS/错位/控制台报错
    sanitizeEmailHtml(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 移除脚本与潜在危险元素
            doc.querySelectorAll('script, iframe[src^="javascript:"], object, embed').forEach(el => el.remove());

            // 移除 meta viewport 等在嵌入场景下无效且可能报错的标签
            doc.querySelectorAll('meta[name="viewport"], meta[http-equiv], base').forEach(el => el.remove());

            // 移除外链样式，避免加载失败或污染样式；保留内联 style
            doc.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="preconnect"]').forEach(el => el.remove());

            // 清理内联样式中的 @font-face，减少外部字体加载报错
            doc.querySelectorAll('style').forEach(style => {
                try {
                    style.textContent = style.textContent.replace(/@font-face[\s\S]*?\}/gi, '');
                } catch {}
            });

            // 移除 on* 事件属性，降低 XSS 风险
            doc.querySelectorAll('*').forEach(el => {
                [...el.attributes].forEach(attr => {
                    if (/^on/i.test(attr.name)) {
                        el.removeAttribute(attr.name);
                    }
                });
            });

            // 处理图片：懒加载、无 referrer，避免追踪泄露；精简大体积 srcset
            doc.querySelectorAll('img').forEach(img => {
                img.setAttribute('loading', 'lazy');
                img.setAttribute('decoding', 'async');
                img.setAttribute('referrerpolicy', 'no-referrer');
                if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
                // 避免图片过宽撑破
                img.style.maxWidth = img.style.maxWidth || '100%';
                img.style.height = img.style.height || 'auto';
            });

            // 链接新窗口打开并加安全属性
            doc.querySelectorAll('a[href]').forEach(a => {
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer nofollow');
            });

            // 仅注入 body 内容，避免嵌套 html/head 导致的奇怪渲染
            return doc.body ? doc.body.innerHTML : html;
        } catch (e) {
            console.warn('sanitizeEmailHtml failed:', e);
            return html;
        }
    }

    // 将字节转换为指定字符集的字符串（默认 utf-8）
    bytesToString(bytes, charset = 'utf-8') {
        try {
            // 规范化常见别名
            const label = (charset || 'utf-8').toLowerCase().replace(/_/g, '-');
            let enc = label;
            if (label === 'utf8') enc = 'utf-8';
            if (label === 'us-ascii' || label === 'ascii') enc = 'utf-8';
            if (label === 'gb2312') enc = 'gbk'; // 浏览器里 gb2312 映射到 gbk
            const decoder = new TextDecoder(enc, { fatal: false });
            return decoder.decode(bytes);
        } catch {
            // 回退：按 utf-8 解码
            try {
                return new TextDecoder('utf-8').decode(bytes);
            } catch {
                // 最后回退：直接从 charCode 构造（可能出现乱码）
                return Array.from(bytes).map(c => String.fromCharCode(c)).join('');
            }
        }
    }

    // Base64 字符串转 Uint8Array
    base64ToBytes(b64) {
        const clean = (b64 || '').replace(/\s+/g, '');
        try {
            const bin = atob(clean);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) & 0xff;
            return arr;
        } catch {
            return new Uint8Array();
        }
    }

    // Quoted-Printable 解码为字节
    qpToBytes(qp) {
        if (!qp) return new Uint8Array();
        // 软换行 "=\r?\n" 需要移除
        const s = qp.replace(/=\r?\n/g, '');
        const out = [];
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '=' && i + 2 < s.length && /[0-9A-Fa-f]{2}/.test(s.slice(i + 1, i + 3))) {
                out.push(parseInt(s.slice(i + 1, i + 3), 16));
                i += 2;
            } else {
                out.push(s.charCodeAt(i) & 0xff);
            }
        }
        return new Uint8Array(out);
    }

    // 分离头与体：返回 { headers, body, delimLen }
    splitHeaderBody(raw) {
        const idxCR = raw.indexOf('\r\n\r\n');
        if (idxCR !== -1) {
            return { headers: raw.substring(0, idxCR), body: raw.substring(idxCR + 4), delimLen: 4 };
        }
        const idxLF = raw.indexOf('\n\n');
        if (idxLF !== -1) {
            return { headers: raw.substring(0, idxLF), body: raw.substring(idxLF + 2), delimLen: 2 };
        }
        return { headers: raw, body: '', delimLen: 0 };
    }

    // 获取指定头字段（合并折叠行）
    getHeaderValue(headersRaw, name) {
        if (!headersRaw) return '';
        const unfolded = headersRaw.replace(/\r?\n[\t ]+/g, ' ');
        const re = new RegExp('^' + name.replace(/[-/\\^$*+?.()|[\]{}]/g, r => '\\' + r) + ':[\t ]*(.+)$', 'im');
        const m = unfolded.match(re);
        return m ? m[1].trim() : '';
    }

    // 解析 Content-Type 值与参数
    parseContentType(value) {
        const v = (value || '').trim();
        const [typePart, ...paramParts] = v.split(';');
        const [type, sub] = (typePart || '').trim().toLowerCase().split('/');
        const params = {};
        for (const p of paramParts) {
            const m = p.trim().match(/([\w\-]+)\s*=\s*("([^"]*)"|[^;]+)/);
            if (m) params[m[1].toLowerCase()] = (m[3] ?? m[2]).replace(/^"|"$/g, '');
        }
        return { type: type || '', subtype: sub || '', params };
    }

    // 查找下一处边界位置（在 body 内）
    findNextBoundary(body, boundary, fromIndex) {
        const token = `--${boundary}`;
        // 边界通常独占一行，以 CRLF 或 LF 结尾
        let i = body.indexOf('\r\n' + token, fromIndex);
        if (i === -1) i = body.indexOf('\n' + token, fromIndex);
        if (i === -1 && fromIndex === 0 && body.startsWith(token)) return 0; // 兼容无前置换行
        return i;
    }

    // 解析并解码指定 MIME 文本部件（text/plain 或 text/html）
    extractAndDecodeMailPart(raw, desiredSubtype) {
        if (!raw) return '';

        // 先切分顶层头/体，避免把顶层头部当作内容
        const top = this.splitHeaderBody(raw);
        const ctVal = this.getHeaderValue(top.headers, 'Content-Type');
        const cteVal = this.getHeaderValue(top.headers, 'Content-Transfer-Encoding');
        const ct = this.parseContentType(ctVal);

        // 单部件邮件：直接用顶层头解析
        if (ct.type !== 'multipart') {
            if (ct.type === 'text' && ct.subtype === desiredSubtype) {
                const charset = ct.params.charset || 'utf-8';
                let bytes;
                const enc = (cteVal || '').toLowerCase();
                if (enc === 'base64') bytes = this.base64ToBytes(top.body);
                else if (enc === 'quoted-printable') bytes = this.qpToBytes(top.body);
                else bytes = new Uint8Array(Array.from(top.body).map(c => c.charCodeAt(0) & 0xff));
                return this.bytesToString(bytes, charset).trim();
            }
            return '';
        }

        // 多部件：扫描 boundary，定位 text/<desiredSubtype> 部分
        const boundary = ct.params.boundary;
        if (!boundary) return '';

        const body = top.body;
        // 在 body 中查找包含 Content-Type: text/desiredSubtype 的部分头
        const ctRe = new RegExp(`Content-Type:\\s*text/${desiredSubtype}[^\\r\\n]*`, 'i');
        const ctIdx = body.search(ctRe);
        if (ctIdx === -1) return '';

        // 找到该部分头结束（空行）
        let headersEnd = body.indexOf('\r\n\r\n', ctIdx);
        let delimLen = 4;
        if (headersEnd === -1) {
            headersEnd = body.indexOf('\n\n', ctIdx);
            delimLen = 2;
        }
        if (headersEnd === -1) return '';

        const partHeaders = body.substring(ctIdx, headersEnd);
        const partBodyStart = headersEnd + delimLen;

        // 该部分结束于下一个外层 boundary
        const nextBoundary = this.findNextBoundary(body, boundary, partBodyStart);
        const partBody = nextBoundary !== -1 ? body.substring(partBodyStart, nextBoundary) : body.substring(partBodyStart);

        const partCTE = this.getHeaderValue(partHeaders, 'Content-Transfer-Encoding');
        const partCTVal = this.getHeaderValue(partHeaders, 'Content-Type');
        const partCT = this.parseContentType(partCTVal);
        const charset = partCT.params.charset || 'utf-8';

        let bytes;
        const enc = (partCTE || '').toLowerCase();
        if (enc === 'base64') bytes = this.base64ToBytes(partBody);
        else if (enc === 'quoted-printable') bytes = this.qpToBytes(partBody);
        else bytes = new Uint8Array(Array.from(partBody).map(c => c.charCodeAt(0) & 0xff));
        return this.bytesToString(bytes, charset).trim();
    }

    // 保持旧接口，但仅用于兜底（不再用于主要内容解码）
    decodeMailContent(content) {
        // 历史实现：按 QP 直接转字符（可能导致乱码）
        return content
            .replace(/=\r?\n/g, '')
            .replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
            .trim();
    }

    decodeMailHeader(header) {
        if (!header) return '';

        // 合并折叠行：下一行以空格或制表符开头
        header = header.replace(/\r?\n[\t ]+/g, ' ');

        // 解码 MIME 编码的邮件头 (=?charset?encoding?content?=)
        return header.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (match, charset, encoding, content) => {
            try {
                const enc = (encoding || 'B').toUpperCase();
                let bytes = new Uint8Array();
                if (enc === 'B') {
                    bytes = this.base64ToBytes(content);
                } else if (enc === 'Q') {
                    // QP in header uses '_' for space
                    content = content.replace(/_/g, ' ');
                    bytes = this.qpToBytes(content);
                }
                return this.bytesToString(bytes, charset);
            } catch (e) {
                console.error('解码邮件头失败:', e);
                return match;
            }
        }).trim();
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new MailApp();
});
