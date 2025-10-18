// Cloudflare Pages 部署时的 Worker 脚本
// 用于在运行时注入环境变量到 config.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 如果请求的是 config.js，注入环境变量
    if (url.pathname === '/config.js') {
      const API_URL = env.API_URL || 'https://your-worker.workers.dev';
      const APP_URL = env.APP_URL || url.origin;

      const configContent = `// 自动配置 - 通过 Cloudflare Pages 环境变量注入
window.APP_CONFIG = {
    apiUrl: '${API_URL}',
    appUrl: '${APP_URL}'
};`;

      return new Response(configContent, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // 其他请求直接返回静态资源
    return env.ASSETS.fetch(request);
  }
};
