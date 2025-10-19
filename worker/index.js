/**
 * 单一 Workers 部署脚本：
 * - 同域提供静态页面与 API（/admin/*, /viewer/*）
 * - 动态注入 /config.js（默认同源 API）
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    try {
      // 后端 API
      if (path.startsWith('/admin/')) {
        return await handleAdminAPI(request, env, path);
      }
      if (path.startsWith('/viewer/')) {
        return await handleViewerAPI(request, env, path);
      }

      // 前端配置注入
      if (path === '/config.js') {
        const API_URL = env.API_URL || url.origin;
        const APP_URL = env.APP_URL || url.origin;
        const configContent = `// 自动配置（Workers）
window.APP_CONFIG = { apiUrl: '${API_URL}', appUrl: '${APP_URL}' };`;
        return new Response(configContent, {
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      // 静态资源（绑定 assets.directory = ../app）
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Worker 错误:', error);
      return jsonResponse({ error: error.message, stack: error.stack }, 500);
    }
  }
};

/**
 * 处理管理端 API
 */
async function handleAdminAPI(request, env, path) {
  // 验证管理员密码（Workers Secret: ADMIN_PASSWORD）
  const adminPassword = request.headers.get('x-admin-password');
  if (!adminPassword || adminPassword !== env.ADMIN_PASSWORD) {
    return jsonResponse({ error: '管理员认证失败' }, 401);
  }

  // 创建分发 Token
  if (path === '/admin/tokens' && request.method === 'POST') {
    const body = await request.json();
    const token = await createToken(env, body);
    return jsonResponse({ success: true, token });
  }

  // 获取所有 Token
  if (path === '/admin/tokens' && request.method === 'GET') {
    const tokens = await getAllTokens(env);
    return jsonResponse({ success: true, tokens });
  }

  // 删除 Token
  if (path.startsWith('/admin/tokens/') && request.method === 'DELETE') {
    const tokenId = path.split('/').pop();
    await deleteToken(env, tokenId);
    return jsonResponse({ success: true, message: 'Token 已删除' });
  }

  // 更新 Token
  if (path.startsWith('/admin/tokens/') && request.method === 'PUT') {
    const tokenId = path.split('/').pop();
    const body = await request.json();
    await updateToken(env, tokenId, body);
    return jsonResponse({ success: true, message: 'Token 已更新' });
  }

  return jsonResponse({ error: '未找到的管理端路径' }, 404);
}

/**
 * 处理分发端 API
 */
async function handleViewerAPI(request, env, path) {
  const url = new URL(request.url);
  // 获取 Token 配置
  if (path.startsWith('/viewer/config/')) {
    const tokenId = path.split('/').pop();
    const config = await getTokenConfig(env, tokenId);

    if (!config) {
      return jsonResponse({ error: 'Token 无效或已过期' }, 404);
    }

    // 检查是否过期
    if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
      return jsonResponse({ error: 'Token 已过期' }, 403);
    }

    // 检查是否被禁用
    if (config.disabled) {
      return jsonResponse({ error: 'Token 已被禁用' }, 403);
    }

    // 返回配置（不包含敏感信息的元数据）
    return jsonResponse({
      success: true,
      config: {
        emailAddress: config.emailAddress,
        description: config.description
      }
    });
  }

  // 代理邮件请求
  if (path.startsWith('/viewer/mails/')) {
    const tokenId = path.split('/')[3];
    const config = await getTokenConfig(env, tokenId);

    if (!config || config.disabled) {
      return jsonResponse({ error: 'Token 无效' }, 403);
    }

    if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
      return jsonResponse({ error: 'Token 已过期' }, 403);
    }

    // 代理请求到邮箱 Worker
    const mails = await proxyMailRequest(config, url);
    return jsonResponse({ success: true, results: mails });
  }

  return jsonResponse({ error: '未找到的查看端路径' }, 404);
}

/**
 * 创建分发 Token
 */
async function createToken(env, data) {
  const tokenId = generateToken();
  const tokenData = {
    id: tokenId,
    emailAddress: data.emailAddress,
    description: data.description || '',
    mailWorkerUrl: data.mailWorkerUrl,
    apiType: data.apiType, // 'user', 'user_api', 'admin'
    jwtToken: data.jwtToken || '',
    adminAuth: data.adminAuth || '',
    customAuth: data.customAuth || '',
    createdAt: new Date().toISOString(),
    expiresAt: data.expiresAt || null,
    disabled: false,
    accessCount: 0
  };

  await env.MAIL_TOKENS.put(`token:${tokenId}`, JSON.stringify(tokenData));
  await addToTokenList(env, tokenId);

  return {
    id: tokenId,
    url: `${data.viewerUrl || 'https://your-viewer.pages.dev'}/#/view/${tokenId}`,
    emailAddress: data.emailAddress,
    createdAt: tokenData.createdAt
  };
}

/**
 * 获取所有 Token
 */
async function getAllTokens(env) {
  const listKey = 'token:list';
  const listData = await env.MAIL_TOKENS.get(listKey);
  const tokenIds = listData ? JSON.parse(listData) : [];

  const tokens = [];
  for (const tokenId of tokenIds) {
    const data = await env.MAIL_TOKENS.get(`token:${tokenId}`);
    if (data) {
      const tokenData = JSON.parse(data);
      tokens.push({
        id: tokenData.id,
        emailAddress: tokenData.emailAddress,
        description: tokenData.description,
        createdAt: tokenData.createdAt,
        expiresAt: tokenData.expiresAt,
        disabled: tokenData.disabled,
        accessCount: tokenData.accessCount
      });
    }
  }

  return tokens;
}

/**
 * 删除 Token
 */
async function deleteToken(env, tokenId) {
  await env.MAIL_TOKENS.delete(`token:${tokenId}`);
  await removeFromTokenList(env, tokenId);
}

/**
 * 更新 Token
 */
async function updateToken(env, tokenId, updates) {
  const data = await env.MAIL_TOKENS.get(`token:${tokenId}`);
  if (!data) {
    throw new Error('Token 不存在');
  }

  const tokenData = JSON.parse(data);
  Object.assign(tokenData, updates);

  await env.MAIL_TOKENS.put(`token:${tokenId}`, JSON.stringify(tokenData));
}

/**
 * 获取 Token 配置
 */
async function getTokenConfig(env, tokenId) {
  const data = await env.MAIL_TOKENS.get(`token:${tokenId}`);
  if (!data) return null;

  const config = JSON.parse(data);

  // 增加访问计数
  config.accessCount = (config.accessCount || 0) + 1;
  await env.MAIL_TOKENS.put(`token:${tokenId}`, JSON.stringify(config));

  return config;
}

/**
 * 代理邮件请求
 */
async function proxyMailRequest(config, url) {
  const { mailWorkerUrl, apiType, emailAddress, jwtToken, adminAuth, customAuth } = config;

  // 构建 API 端点
  let endpoint;
  switch (apiType) {
    case 'admin':
      endpoint = '/admin/mails';
      break;
    case 'user_api':
      endpoint = '/user_api/mails';
      break;
    case 'user':
    default:
      endpoint = '/api/mails';
      break;
  }

  // 构建查询参数
  const params = new URLSearchParams();
  params.append('limit', url.searchParams.get('limit') || '20');
  params.append('offset', url.searchParams.get('offset') || '0');

  if (emailAddress) {
    params.append('address', emailAddress);
  }

  if (url.searchParams.get('keyword')) {
    params.append('keyword', url.searchParams.get('keyword'));
  }

  // 构建请求头
  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiType === 'user' && jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
    if (customAuth) {
      headers['x-custom-auth'] = customAuth;
    }
  } else if ((apiType === 'admin' || apiType === 'user_api') && adminAuth) {
    headers['x-admin-auth'] = adminAuth;
  }

  // 发起请求
  const response = await fetch(`${mailWorkerUrl}${endpoint}?${params.toString()}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    throw new Error(`邮箱 API 返回错误: ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * 工具函数
 */

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

async function addToTokenList(env, tokenId) {
  const listKey = 'token:list';
  const listData = await env.MAIL_TOKENS.get(listKey);
  const tokenIds = listData ? JSON.parse(listData) : [];

  if (!tokenIds.includes(tokenId)) {
    tokenIds.push(tokenId);
    await env.MAIL_TOKENS.put(listKey, JSON.stringify(tokenIds));
  }
}

async function removeFromTokenList(env, tokenId) {
  const listKey = 'token:list';
  const listData = await env.MAIL_TOKENS.get(listKey);
  const tokenIds = listData ? JSON.parse(listData) : [];

  const index = tokenIds.indexOf(tokenId);
  if (index > -1) {
    tokenIds.splice(index, 1);
    await env.MAIL_TOKENS.put(listKey, JSON.stringify(tokenIds));
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-password'
    }
  });
}

function handleCORS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-password'
    }
  });
}
