import { timingSafeEqual } from 'node:crypto';
import { mergeClash, MergeError, validateBaseYaml } from './merge.js';
import { UI_HTML } from './ui.js';

export const BASE_KEY = 'clash-merger:private:base';
export const SOURCE_KEY = 'clash-merger:private:source_url';
export const FILENAME_KEY = 'clash-merger:private:base_name';
const MAX_BASE_BYTES = 1_500_000;
const MAX_SOURCE_BYTES = 3_000_000;

const headers = {
  'Cache-Control': 'no-store, private, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

function reply(res, status, value, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...headers, 'Content-Type': contentType });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(value) : value);
}
function error(res, status, message) { reply(res, status, { error: message }); }

export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b.length < 24) return false;
  const aa = Buffer.from(a, 'utf8'), bb = Buffer.from(b, 'utf8');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function authorized(req) {
  const raw = req.headers.authorization || '';
  return sameSecret(raw.replace(/^Bearer\s+/i, ''), process.env.ADMIN_KEY);
}

export function checkSourceUrl(raw) {
  let target;
  try { target = new URL(raw); } catch { throw new MergeError('请输入有效的 HTTPS 订阅地址。'); }
  if (target.protocol !== 'https:' || target.username || target.password) throw new MergeError('仅允许不含 URL 基础认证的 HTTPS 订阅地址。');
  const host = target.hostname.toLowerCase();
  if (host.length > 253 || !host.includes('.') || host === 'localhost' || /\.(?:localhost|local|internal|test)$/.test(host) || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':')) {
    throw new MergeError('订阅地址不能为内网或 IP 字面量。');
  }
  return target.toString();
}

async function readBody(req, maxBytes) {
  if (Number(req.headers['content-length'] || 0) > maxBytes) throw new MergeError('上传内容过大。', 413);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) throw new MergeError('上传内容过大。', 413);
    chunks.push(buf);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

function storageEnv() {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!endpoint || !token || !/^https:\/\//.test(endpoint)) throw new MergeError('未配置 Upstash Redis 环境变量。', 500);
  return { endpoint: endpoint.replace(/\/+$/, ''), token };
}

export async function redisCommands(commands) {
  const { endpoint, token } = storageEnv();
  const response = await fetch(endpoint + (commands.length > 1 ? '/pipeline' : ''), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands.length > 1 ? commands : commands[0]),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new MergeError('私有存储读取失败。', 502);
  const values = await response.json();
  const results = Array.isArray(values) ? values : [values];
  if (results.length !== commands.length || results.some(item => Object.hasOwn(item, 'error'))) {
    throw new MergeError('私有存储处理失败。', 502);
  }
  return results.map(item => item.result);
}

export async function fetchSubscription(url) {
  let current = checkSourceUrl(url);
  for (let i = 0; i <= 3; i++) {
    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(18000),
        headers: { 'User-Agent': 'clash.meta', Accept: 'application/yaml, text/yaml, text/plain, */*' }
      });
    } catch { throw new MergeError('无法访问上游订阅服务器，请确认源站允许 Vercel 请求。', 502); }
    if ([301,302,303,307,308].includes(response.status)) {
      const redirect = response.headers.get('location');
      if (!redirect) throw new MergeError('订阅服务器跳转缺少地址。', 502);
      current = checkSourceUrl(new URL(redirect, current).toString());
      continue;
    }
    if (!response.ok) throw new MergeError(`订阅服务器返回 HTTP ${response.status}。`, 502);
    if (Number(response.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) throw new MergeError('订阅大小超过 3MB。', 413);
    if (!response.body) throw new MergeError('订阅内容为空。', 502);
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) { await reader.cancel().catch(() => {}); throw new MergeError('订阅大小超过 3MB。', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), userInfo: response.headers.get('subscription-userinfo') || '' };
  }
  throw new MergeError('上游订阅跳转次数超过 3 次。', 502);
}

export async function buildConfig() {
  const [base, source] = await redisCommands([['GET', BASE_KEY], ['GET', SOURCE_KEY]]);
  if (!base) throw new MergeError('尚未上传主配置 YAML。');
  if (!source) throw new MergeError('尚未保存节点订阅 URL。');
  const upstream = await fetchSubscription(source);
  return { ...mergeClash(base, [upstream.text]), userInfo: upstream.userInfo };
}

export function outputYaml(res, yaml, userInfo = '') {
  const extra = {
    ...headers,
    'Content-Type': 'text/yaml; charset=utf-8',
    'Content-Disposition': 'attachment; filename="Merged-Clash.yaml"',
    'Profile-Update-Interval': '6'
  };
  if (userInfo && /^[\w\s=;.-]{1,300}$/.test(userInfo)) extra['Subscription-Userinfo'] = userInfo;
  res.writeHead(200, extra);
  res.end(yaml);
}

export async function handler(req, res, action) {
  if (action === 'home') {
    if (req.method !== 'GET') return error(res, 405, 'Method Not Allowed');
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'" });
    return res.end(UI_HTML);
  }
  if (action === 'feed') {
    if (req.method !== 'GET') return error(res, 405, 'Method Not Allowed');
    const key = typeof req.query?.key === 'string' ? req.query.key : '';
    if (!sameSecret(key, process.env.FEED_KEY)) return error(res, 401, '订阅令牌无效。');
  } else if (!authorized(req)) {
    return error(res, 401, '管理密钥无效。');
  }
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin && origin !== `${proto}://${host}`) return error(res, 403, '跨站写入被拒绝。');
  }
  try {
    if (action === 'status' && req.method === 'GET') {
      const [base, source, name] = await redisCommands([['GET', BASE_KEY], ['GET', SOURCE_KEY], ['GET', FILENAME_KEY]]);
      return reply(res, 200, { hasBase: !!base, baseName: name || '主配置.yaml', baseStats: base ? validateBaseYaml(base) : null, hasSource: !!source, sourceHost: source ? new URL(source).hostname : '' });
    }
    if (action === 'base' && req.method === 'POST') {
      const base = await readBody(req, MAX_BASE_BYTES);
      const stats = validateBaseYaml(base);
      let name = '主配置.yaml';
      try { name = decodeURIComponent(req.headers['x-filename'] || name); } catch { /* invalid filename */ }
      name = name.replace(/[^\w\u4e00-\u9fa5.() -]/g, '_').slice(0, 100);
      await redisCommands([['SET', BASE_KEY, base], ['SET', FILENAME_KEY, name]]);
      return reply(res, 200, { ok: true, name, ...stats });
    }
    if (action === 'source' && req.method === 'POST') {
      const text = await readBody(req, 10000);
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new MergeError('请求 JSON 格式不正确。'); }
      const source = checkSourceUrl(parsed?.url);
      await redisCommands([['SET', SOURCE_KEY, source]]);
      return reply(res, 200, { ok: true, sourceHost: new URL(source).hostname });
    }
    if (action === 'preview' && req.method === 'GET') {
      const { stats } = await buildConfig();
      return reply(res, 200, { ok: true, ...stats });
    }
    if ((action === 'download' || action === 'feed') && req.method === 'GET') {
      const { yaml, userInfo } = await buildConfig();
      return outputYaml(res, yaml, userInfo);
    }
    return error(res, 405, 'Method Not Allowed');
  } catch (e) {
    if (e instanceof MergeError) return error(res, e.status || 400, e.message);
    // Never leak stored YAML, credentials, upstream subscription URL or stack traces.
    return error(res, 500, '服务器内部错误，请检查 Vercel Functions 日志和环境变量。');
  }
}
