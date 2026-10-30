import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig, checkSourceUrl, fetchRemote, handler, loadEnvironment, sameSecret } from '../src/clash-handler.js';

const base = `dns: {enable: true}
proxies: []
proxy-groups:
  - {name: Proxy, type: select, proxies: [DIRECT]}
rules: [MATCH,Proxy]
`;
const subscription = `proxies:
  - {name: '🇭🇰 香港 01', type: ss, server: node.example, port: 443, password: example}
rules: [MATCH,DIRECT]
`;

const ORIGINAL_ENV = {
  BASE_CONFIG_URL: process.env.BASE_CONFIG_URL,
  SUBSCRIPTION_URL: process.env.SUBSCRIPTION_URL,
  FEED_KEY: process.env.FEED_KEY
};
function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test('rejects unsafe addresses; accepts HTTPS with signed query', () => {
  assert.throws(() => checkSourceUrl('http://example.com/config.yaml'), /HTTPS/);
  assert.throws(() => checkSourceUrl('https://127.0.0.1/config.yaml'), /IP/);
  assert.throws(() => checkSourceUrl('https://localhost/config.yaml'), /内网/);
  assert.equal(checkSourceUrl('https://example.com/config.yaml?key=abc'), 'https://example.com/config.yaml?key=abc');
  assert.equal(sameSecret('a'.repeat(25), 'a'.repeat(25)), true);
  assert.equal(sameSecret('a'.repeat(25), 'b'.repeat(25)), false);
  assert.equal(sameSecret('short', 'short'), true);
  assert.equal(sameSecret(' short ', 'short'), true);
  assert.equal(sameSecret('short', ' short\n '), true);
  assert.equal(sameSecret('', ''), false);
});

test('loads URLs, not base64 YAML, from environment', () => {
  try {
    process.env.BASE_CONFIG_URL = 'https://example.com/main.yaml';
    process.env.SUBSCRIPTION_URL = 'https://example.com/subscribe?token=abc';
    assert.deepEqual(loadEnvironment(), {
      baseUrl: 'https://example.com/main.yaml',
      sourceUrl: 'https://example.com/subscribe?token=abc'
    });
  } finally { restoreEnv(); }
});

test('two URL sources are fetched; source rules discarded; original rules retained', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    if (url === 'https://example.com/main.yaml') return new Response(base, { status: 200 });
    if (url === 'https://example.com/subscribe') return new Response(subscription, { status: 200 });
    throw Error('Unexpected URL: ' + url);
  };
  try {
    const result = await buildConfig({baseUrl: 'https://example.com/main.yaml', sourceUrl: 'https://example.com/subscribe'});
    assert.equal(result.stats.importedNodes, 1);
    assert.equal(result.stats.rules, 1);
    assert.equal(result.stats.regionGroups[0].name, '香港');
    assert.equal(calls.length, 2);
    assert.match(result.yaml, /MATCH,Proxy/);
    assert.doesNotMatch(result.yaml, /MATCH,DIRECT/);
  } finally { globalThis.fetch = originalFetch; }
});

test('uploaded YAML overrides default/URL and is not saved', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => { calls.push(url); return new Response(subscription, {status:200}); };
  try {
    const result = await buildConfig({baseYaml:base,sourceUrl:'https://example.com/subscribe'});
    assert.equal(result.stats.importedNodes,1);
    assert.deepEqual(calls,['https://example.com/subscribe']);
    await assert.rejects(buildConfig({baseYaml:base,baseUrl:'https://example.com/main.yaml',sourceUrl:'https://example.com/subscribe'}), /选择一种方式/);
  } finally { globalThis.fetch=originalFetch; }
});

test('redirect to insecure endpoint is rejected', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  try{await assert.rejects(fetchRemote('https://example.com/main.yaml','主配置',10000),/HTTPS/);}
  finally {globalThis.fetch=originalFetch;}
});

test('authentication distinguishes a missing environment key from a wrong key', async () => {
  function capture() {
    const result = { code: null, body: null };
    return {
      result,
      res: {
        writeHead(code) { result.code = code; },
        end(body) { result.body = JSON.parse(body); }
      }
    };
  }
  const req = (key) => ({ method: 'GET', headers: { authorization: 'Bearer ' + key }, query: {} });
  try {
    delete process.env.FEED_KEY;
    const missing = capture();
    await handler(req('short'), missing.res, 'status');
    assert.equal(missing.result.code, 503);
    assert.match(missing.result.body.error, /尚未配置 FEED_KEY/);
    process.env.FEED_KEY = 'short';
    const wrong = capture();
    await handler(req('different'), wrong.res, 'status');
    assert.equal(wrong.result.code, 401);
    const accepted = capture();
    await handler(req('short'), accepted.res, 'unknown-route');
    assert.equal(accepted.result.code, 405);
  } finally { restoreEnv(); }
});
