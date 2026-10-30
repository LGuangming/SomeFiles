import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { mergeClash, detectRegion, validateBaseYaml } from '../src/merge.js';

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
