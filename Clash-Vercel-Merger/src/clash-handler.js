import { timingSafeEqual } from 'node:crypto';
import { mergeClash, MergeError, validateBaseYaml } from './merge.js';

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
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Ignore accidental surrounding whitespace in Vercel environment values and pasted keys.
  // A short existing key is valid, though a long random key is strongly recommended.
  const supplied = a.trim(), configured = b.trim();
  if (!supplied || !configured) return false;
  const aa = Buffer.from(supplied, 'utf8'), bb = Buffer.from(configured, 'utf8');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function getKey(req, action) {
  if (action === 'feed') return typeof req.query?.key === 'string' ? req.query.key : '';
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
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

export function loadEnvironment() {
  const baseUrl = process.env.BASE_CONFIG_URL;
  const sourceUrl = process.env.SUBSCRIPTION_URL;
  if (!baseUrl) throw new MergeError('未设置 BASE_CONFIG_URL（主配置远程地址）。', 500);
  if (!sourceUrl) throw new MergeError('未设置 SUBSCRIPTION_URL（节点订阅地址）。', 500);
  return { baseUrl: checkSourceUrl(baseUrl), sourceUrl: checkSourceUrl(sourceUrl) };
}

async function readBody(req, maxBytes) {
  if (Number(req.headers['content-length'] || 0) > maxBytes) throw new MergeError('上传内容过大。', 413);
  // Vercel may pre-parse JSON bodies; handle both that and Node request streams.
  let parsed;
  try { parsed = req.body; } catch { throw new MergeError('请求正文解析失败。'); }
  if (parsed !== undefined && parsed !== null) {
    const buf = Buffer.isBuffer(parsed) ? parsed : Buffer.from(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
    if (buf.length > maxBytes) throw new MergeError('上传内容过大。', 413);
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  }
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) throw new MergeError('上传内容过大。', 413);
    chunks.push(buf);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export async function fetchRemote(url, label, maxBytes) {
  let current = checkSourceUrl(url);
  for (let i = 0; i <= 3; i++) {
    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(18000),
        headers: { 'User-Agent': 'clash.meta', Accept: 'application/yaml, text/yaml, text/plain, */*' }
      });
    } catch { throw new MergeError(`${label}连接失败，请确认 URL 可从 Vercel 访问。`, 502); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirect = response.headers.get('location');
      if (!redirect) throw new MergeError(`${label}的跳转缺少 Location。`, 502);
      current = checkSourceUrl(new URL(redirect, current).toString());
      continue;
    }
    if (!response.ok) throw new MergeError(`${label}返回 HTTP ${response.status}。`, 502);
    if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new MergeError(`${label}内容过大。`, 413);
    if (!response.body) throw new MergeError(`${label}内容为空。`, 502);
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); throw new MergeError(`${label}内容超过限制。`, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new MergeError(`${label}不是有效的 UTF-8 YAML 文本。`, 502); }
    return { text, userInfo: response.headers.get('subscription-userinfo') || '' };
  }
  throw new MergeError(`${label}跳转次数超过 3 次。`, 502);
}

export async function buildConfig({ baseYaml, baseUrl, sourceUrl } = {}) {
  // Explicit URL overrides work only for the current request and are not saved.
  // Permanent /sub/:key always reads both URLs from the private Vercel environment.
  if (baseYaml !== undefined && baseUrl !== undefined) {
    throw new MergeError('请在上传 YAML 和主配置 URL 之间选择一种方式。');
  }
  baseUrl ??= process.env.BASE_CONFIG_URL;
  sourceUrl ??= process.env.SUBSCRIPTION_URL;
  if (baseYaml === undefined && !baseUrl) throw new MergeError('请提供主配置 URL 或上传 YAML。', 400);
  if (!sourceUrl) throw new MergeError('请提供节点订阅 URL。', 400);
  if (baseYaml !== undefined) {
    if (typeof baseYaml !== 'string' || Buffer.byteLength(baseYaml, 'utf8') > MAX_BASE_BYTES) throw new MergeError('主配置格式或大小无效。');
    validateBaseYaml(baseYaml);
  }
  const [base, upstream] = await Promise.all([
    baseYaml === undefined ? fetchRemote(baseUrl, '主配置', MAX_BASE_BYTES) : Promise.resolve({ text: baseYaml }),
    fetchRemote(sourceUrl, '节点订阅', MAX_SOURCE_BYTES)
  ]);
  validateBaseYaml(base.text);
  return { ...mergeClash(base.text, [upstream.text]), userInfo: upstream.userInfo };
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
  if (typeof process.env.FEED_KEY !== 'string' || !process.env.FEED_KEY.trim()) {
    return error(res, 503, '当前部署尚未配置 FEED_KEY。请在 Vercel 环境变量中设置并重新部署。');
  }
  if (!sameSecret(getKey(req, action), process.env.FEED_KEY)) {
    return error(res, 401, '输入的 FEED_KEY 与当前部署不匹配。请检查填写的 Value、Production/Preview 环境范围，以及环境变量修改后是否重新部署。');
  }
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin && origin !== `${proto}://${host}`) return error(res, 403, '跨站访问被拒绝。');
  }
  try {
    if (action === 'status' && req.method === 'GET') {
      // Do not return the sensitive base YAML or upstream subscription token.
      const { baseUrl, sourceUrl } = loadEnvironment();
      const base = await fetchRemote(baseUrl, '主配置', MAX_BASE_BYTES);
      return reply(res, 200, {
        configured: true,
        baseStats: validateBaseYaml(base.text),
        baseHost: new URL(baseUrl).hostname,
        sourceHost: new URL(sourceUrl).hostname
      });
    }
    if (action === 'merge' && req.method === 'POST') {
      const text = await readBody(req, MAX_BASE_BYTES + 20_000);
      let body;
      try { body = JSON.parse(text); } catch { throw new MergeError('请求 JSON 格式不正确。'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MergeError('请求参数不正确。');
      if (body.baseYaml !== undefined && typeof body.baseYaml !== 'string') throw new MergeError('主配置必须为 YAML 文本。');
      if (body.baseUrl !== undefined && typeof body.baseUrl !== 'string') throw new MergeError('主配置 URL 必须为字符串。');
      if (body.sourceUrl !== undefined && typeof body.sourceUrl !== 'string') throw new MergeError('订阅 URL 必须为字符串。');
      const { yaml, stats } = await buildConfig({ baseYaml: body.baseYaml, baseUrl: body.baseUrl, sourceUrl: body.sourceUrl });
      return reply(res, 200, { ok: true, stats, yaml });
    }
    if ((action === 'download' || action === 'feed') && req.method === 'GET') {
      const { yaml, userInfo } = await buildConfig();
      return outputYaml(res, yaml, userInfo);
    }
    return error(res, 405, 'Method Not Allowed');
  } catch (e) {
    if (e instanceof MergeError) return error(res, e.status || 400, e.message);
    return error(res, 500, '服务器内部错误，请检查 Vercel Functions 日志和环境变量。');
  }
}
