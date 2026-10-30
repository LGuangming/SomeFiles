import test from 'node:test';
import assert from 'node:assert/strict';
import home from '../api/home.js';
import { handler } from '../src/clash-handler.js';
import { isWebUiEnabled } from '../src/ui-toggle.js';

function response() {
  const r = { status: 0, headers: {}, body: undefined };
  return { result: r, res: {
    writeHead(status, headers = {}) { r.status = status; r.headers = headers; },
    end(body) { r.body = body; }
  } };
}

test('homepage toggle defaults to off and can be turned on without exposing a static index', () => {
  const prev = process.env.ENABLE_WEB_UI;
  try {
    delete process.env.ENABLE_WEB_UI;
    assert.equal(isWebUiEnabled(), false);
    const hidden = response();
    home({ method: 'GET' }, hidden.res);
    assert.equal(hidden.result.status, 404);
    assert.equal(hidden.result.body, 'Not Found');

    process.env.ENABLE_WEB_UI = 'false';
    assert.equal(isWebUiEnabled(), false);
    const hiddenHead = response();
    home({ method: 'HEAD' }, hiddenHead.res);
    assert.equal(hiddenHead.result.status, 404);
    assert.equal(hiddenHead.result.body, undefined);

    process.env.ENABLE_WEB_UI = 'TRUE';
    assert.equal(isWebUiEnabled(), true);
    const visible = response();
    home({ method: 'GET' }, visible.res);
    assert.equal(visible.result.status, 200);
    assert.match(visible.result.headers['Content-Type'], /text\/html/);
    assert.match(visible.result.body, /Clash/);
    const visibleHead = response();
    home({ method: 'HEAD' }, visibleHead.res);
    assert.equal(visibleHead.result.status, 200);
    assert.equal(visibleHead.result.body, undefined);
  } finally {
    if (prev === undefined) delete process.env.ENABLE_WEB_UI;
    else process.env.ENABLE_WEB_UI = prev;
  }
});

test('disabled web UI blocks management endpoints, but keeps keyed subscription feed available', async () => {
  const keys = ['ENABLE_WEB_UI', 'FEED_KEY', 'BASE_CONFIG_URL', 'SUBSCRIPTION_URL'];
  const prev = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  process.env.ENABLE_WEB_UI = 'false';
  process.env.FEED_KEY = 'test-key-for-only-feed';
  process.env.BASE_CONFIG_URL = 'https://example.com/base.yaml';
  process.env.SUBSCRIPTION_URL = 'https://example.com/source.yaml';
  globalThis.fetch = async url => {
    if (url === process.env.BASE_CONFIG_URL) return new Response(
      'proxies: []\nproxy-groups:\n  - {name: Proxy, type: select, proxies: [DIRECT]}\nrules:\n  - MATCH,Proxy\n',
      { status: 200 }
    );
    if (url === process.env.SUBSCRIPTION_URL) return new Response(
      "proxies:\n  - {name: '🇭🇰 HK 01', type: ss, server: hk.example, port: 443, password: example}\n",
      { status: 200 }
    );
    throw new Error('Unexpected URL');
  };
  try {
    for (const action of ['status', 'merge', 'download']) {
      const r = response();
      await handler({ method: 'GET', headers: {}, query: {} }, r.res, action);
      assert.equal(r.result.status, 404, action);
    }
    const feed = response();
    await handler({ method: 'GET', headers: {}, query: { key: 'test-key-for-only-feed' } }, feed.res, 'feed');
    assert.equal(feed.result.status, 200);
    assert.match(feed.result.body, /🇭🇰 HK 01/);
    assert.match(feed.result.body, /MATCH,Proxy/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
});
