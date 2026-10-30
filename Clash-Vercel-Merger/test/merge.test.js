import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { mergeClash, detectRegion, isSubscriptionInfoNode, validateBaseYaml } from '../src/merge.js';

const original = `# base config\nsecret: super-secret\ndns:\n  enable: true\n  nameserver: [1.1.1.1]\nproxies:\n  - name: Old USA\n    type: ss\n    server: old.test\n    port: 443\nproxy-groups:\n  - name: Auto\n    type: url-test\n    url: http://captive.apple.com/generate_204\n    interval: 300\n    proxies: [Old USA]\n  - name: Proxy\n    type: select\n    proxies: [Old USA]\n  - name: Domestic\n    type: select\n    proxies: [DIRECT, Proxy, Auto, Old USA]\n  - name: AI\n    type: select\n    proxies: [Proxy, Auto]\nrules:\n  - GEOSITE,cn,DIRECT\n  - MATCH,Proxy\n`;
const source = `proxies:\n  - {name: '🇺🇸 US 01', type: ss, server: us.example, port: 8888, password: A}\n  - {name: '🇺🇸 US 02', type: ss, server: us2.example, port: 8888, password: B}\n  - {name: 'HK 01', type: ss, server: hk.example, port: 8888, password: C}\n  - {name: '🇯🇵 东京 01', type: ss, server: jp.example, port: 8888, password: D}\n  - {name: 'Random 01', type: ss, server: xx.example, port: 8888, password: E}\nproxy-groups:\n  - {name: Proxy, type: select, proxies: [🇺🇸 US 01]}\nrules:\n  - MATCH,Proxy\n`;

test('regional node classification', () => {
  assert.equal(detectRegion('🇺🇸 US 01'), '美国');
  assert.equal(detectRegion('Zgo - HK - 02'), '香港');
  assert.equal(detectRegion('日本东京'), '日本');
  assert.equal(detectRegion('🇩🇪DE Frankfurt 02'), '德国');
  assert.equal(detectRegion('Unknown node'), '其他地区');
});

test('existing options stay in order; source rules ignored; url-test groups populated', () => {
  const r = mergeClash(original, [source]);
  const base = YAML.parse(original);
  const merged = YAML.parse(r.yaml);
  assert.deepEqual(merged.rules, base.rules);
  assert.deepEqual(merged.dns, base.dns);
  assert.equal(merged.secret, base.secret);
  assert.deepEqual(merged['proxy-groups'][2].proxies.slice(0, 4), base['proxy-groups'][2].proxies);
  assert.deepEqual(merged['proxy-groups'][3].proxies.slice(0, 2), base['proxy-groups'][3].proxies);
  assert.equal(r.stats.importedNodes, 5);
  assert.equal(r.stats.regionGroups.length, 4);
  for (const g of r.stats.regionGroups) {
    const newGroup = merged['proxy-groups'].find(x => x.name === g.name);
    assert.equal(newGroup.type, 'url-test');
    assert.equal(newGroup.proxies.length, g.count);
  }
  assert.equal(merged.proxies.length, 6);
  assert.equal(merged['proxy-groups'][0].proxies.length, 6);
  assert.ok(r.yaml.includes('# base config'));
});

test('name conflicts rename imported nodes, original remains intact', () => {
  const sameName = 'proxies:\n  - { name: Old USA, type: ss, server: distinct.example, port: 444 }\nrules: [MATCH,DIRECT]';
  const out = mergeClash(original, [sameName]);
  assert.equal(out.stats.renamedNodes, 1);
  const decoded = YAML.parse(out.yaml);
  assert.equal(decoded.proxies[0].name, 'Old USA');
  assert.equal(decoded.proxies[1].name, 'Old USA（订阅）');
});

test('duplicate source nodes are skipped', () => {
  const doubled = source.replace('proxy-groups:', '  - {name: "HK 02", type: ss, server: hk.example, port: 8888, password: C}\nproxy-groups:');
  const out = mergeClash(original, [doubled]);
  assert.equal(out.stats.duplicateNodes, 1);
});

test('validates base and rejects missing proxies subscription', () => {
  assert.equal(validateBaseYaml(original).originalGroups, 4);
  assert.throws(() => mergeClash(original, ['rules:\n  - MATCH,DIRECT']), /缺少 proxies/);
});

test('traffic quota notices are excluded before country classification and Auto group insertion', () => {
  const sourceWithQuota = `proxies:
  - {name: '🇬🇧 剩余流量：12.5 GB', type: ss, server: quota1.test, port: 443}
  - {name: '流量剩餘 12GB', type: ss, server: quota2.test, port: 443}
  - {name: 'Remaining Traffic 12GB', type: ss, server: quota3.test, port: 443}
  - {name: '🇬🇧 UK London 01', type: ss, server: uk.test, port: 443}
  - {name: '🇯🇵 JP 01', type: ss, server: jp.test, port: 443}
`;
  assert.equal(isSubscriptionInfoNode('🇬🇧 剩余流量：12.5 GB'), true);
  assert.equal(isSubscriptionInfoNode('流量剩餘 12GB'), true);
  assert.equal(isSubscriptionInfoNode('Remaining Traffic 12GB'), true);
  assert.equal(isSubscriptionInfoNode('🇬🇧 UK London 01'), false);
  const output = mergeClash(original, [sourceWithQuota]);
  const parsed = YAML.parse(output.yaml);
  assert.equal(output.stats.sourceNodes, 5);
  assert.equal(output.stats.filteredInfoNodes, 3);
  assert.equal(output.stats.importedNodes, 2);
  assert.deepEqual(output.stats.regionGroups.map(x => x.region).sort(), ['日本', '英国'].sort());
  assert.ok(parsed.proxies.some(x => x.name === '🇬🇧 UK London 01'));
  assert.ok(parsed['proxy-groups'].some(x => x.name === '英国' && x.proxies.length === 1));
  assert.equal(parsed.proxies.some(x => /剩余流量|流量剩餘|Remaining Traffic/i.test(x.name)), false);
  assert.equal(parsed['proxy-groups'][0].proxies.some(x => /剩余流量|流量剩餘|Remaining Traffic/i.test(x)), false);
  assert.equal(parsed['proxy-groups'][2].proxies[0], 'DIRECT');
  assert.equal(parsed['proxy-groups'][2].proxies[1], 'Proxy');
});

test('when all subscription entries are quota notices, reject an empty regional configuration', () => {
  const onlyQuota = `proxies:
  - {name: '🇬🇧 剩余流量 10GB', type: ss, server: quota.test, port: 443}
`;
  assert.throws(() => mergeClash(original, [onlyQuota]), /没有可导入的代理节点/);
});

test('reset countdown notices are filtered, including UK-flagged entries', () => {
  const notices = [
    '🇬🇧 距离下次重置剩余 15 天',
    '距离下次重置剩余：5天',
    '距下次重置剩余 10 小时',
    '距离下次流量重置还有 2天',
    '下次重置剩餘 3日',
    '🇬🇧 下次套餐重置倒计时 6天'
  ];
  for (const name of notices) assert.equal(isSubscriptionInfoNode(name), true, name);
  for (const name of ['🇬🇧 UK London 01', '🇬🇧 UK London 02', '香港 03', '英国高速中继']) {
    assert.equal(isSubscriptionInfoNode(name), false, name);
  }
  const sourceWithCountdown = `proxies:
  - {name: '🇬🇧 距离下次重置剩余 15 天', type: ss, server: notice1.test, port: 443}
  - {name: '距离下次流量重置还有 2天', type: ss, server: notice2.test, port: 443}
  - {name: '🇬🇧 London 01', type: ss, server: uk1.test, port: 443}
`;
  const merged = mergeClash(original, [sourceWithCountdown]);
  const parsed = YAML.parse(merged.yaml);
  assert.equal(merged.stats.sourceNodes, 3);
  assert.equal(merged.stats.filteredInfoNodes, 2);
  assert.equal(merged.stats.importedNodes, 1);
  assert.equal(merged.stats.regionGroups.length, 1);
  assert.equal(merged.stats.regionGroups[0].region, '英国');
  assert.deepEqual(parsed['proxy-groups'].find(g => g.name === '英国').proxies, ['🇬🇧 London 01']);
  assert.equal(parsed.proxies.some(p => p.name.includes('重置')), false);
  assert.equal(parsed['proxy-groups'][0].proxies.some(p => p.includes('重置')), false);
  assert.deepEqual(parsed.rules, YAML.parse(original).rules);
  assert.deepEqual(parsed.dns, YAML.parse(original).dns);
});

test('subscription expiry notices are filtered without suppressing real proxies', () => {
  const notices = [
    '🇬🇧 套餐到期：2026-11-30',
    '套餐即将到期 3 天',
    '套餐已过期',
    '🇬🇧 訂閱到期 2026/11/30',
    '订阅将于 2026年11月 到期',
    '套餐有效期至 2026-11-30'
  ];
  for (const name of notices) {
    assert.equal(isSubscriptionInfoNode(name), true, name);
  }
  for (const name of ['🇬🇧 London 01', '🇺🇸 US 02', '🇯🇵 套餐极速 日本 03']) {
    assert.equal(isSubscriptionInfoNode(name), false, name);
  }
  const input = `proxies:
  - {name: '🇬🇧 套餐到期：2026-11-30', type: ss, server: notice.example, port: 443}
  - {name: '套餐即将到期 3 天', type: ss, server: notice2.example, port: 443}
  - {name: '🇬🇧 London 01', type: ss, server: uk.example, port: 443}
`;
  const result = mergeClash(original, [input]);
  const parsed = YAML.parse(result.yaml);
  assert.equal(result.stats.sourceNodes, 3);
  assert.equal(result.stats.filteredInfoNodes, 2);
  assert.equal(result.stats.importedNodes, 1);
  assert.deepEqual(result.stats.regionGroups.map(x => x.region), ['英国']);
  assert.deepEqual(parsed['proxy-groups'].find(x => x.name === '英国').proxies, ['🇬🇧 London 01']);
  assert.equal(parsed.proxies.some(x => /套餐到期|套餐即将到期/.test(x.name)), false);
  assert.equal(parsed['proxy-groups'][0].proxies.some(x => /套餐到期|套餐即将到期/.test(x)), false);
  assert.deepEqual(parsed.rules, YAML.parse(original).rules);
  assert.deepEqual(parsed.dns, YAML.parse(original).dns);
});
