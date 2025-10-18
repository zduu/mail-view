// 自动配置 - 通过 Cloudflare Pages 环境变量注入
// 本地开发时使用默认配置，生产环境自动替换
window.APP_CONFIG = {
    apiUrl: '%%API_URL%%',
    appUrl: '%%APP_URL%%'
};

// 如果是本地开发环境（未替换占位符）
if (window.APP_CONFIG.apiUrl.startsWith('%%')) {
    window.APP_CONFIG = {
        apiUrl: 'http://localhost:8787',
        appUrl: 'http://localhost:8080'
    };
}
