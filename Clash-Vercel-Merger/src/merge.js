import YAML from 'yaml';

export class MergeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MergeError';
    this.status = status;
  }
}

/**
 * Only infer regions from proxy names; do not geolocate endpoints or mutate protocols.
 * Regional groups use a single easy-to-find Chinese name, e.g. 香港, 日本, 美国.
 */
const REGIONS = [
  ['香港', /🇭🇰|香港|港(?!口)|hong[\s._-]*kong|\bHK(?:G)?\b/i],
  ['台湾', /🇹🇼|台湾|臺灣|台灣|台北|台中|高雄|taiwan|taipei|\bTW(?:N)?\b/i],
  ['澳门', /🇲🇴|澳门|澳門|macao|macau|\bMO\b/i],
  ['日本', /🇯🇵|日本|东京|東京|大阪|名古屋|tokyo|osaka|japan|\bJP(?:N)?\b/i],
  ['新加坡', /🇸🇬|新加坡|狮城|獅城|singapore|\bSG(?:P)?\b/i],
  ['美国', /🇺🇸|美国|美國|洛杉矶|洛杉磯|纽约|紐約|硅谷|矽谷|美西|美东|美東|united[\s._-]*states|america|los[\s._-]*angeles|new[\s._-]*york|silicon[\s._-]*valley|\bUS(?:A)?\b/i],
  ['韩国', /🇰🇷|韩国|韓國|首尔|首爾|韩服|韓服|korea|seoul|\bKR\b/i],
  ['英国', /🇬🇧|英国|英國|伦敦|倫敦|united[\s._-]*kingdom|britain|london|\bUK\b|\bGB\b/i],
  ['德国', /🇩🇪|德国|德國|法兰克福|法蘭克福|germany|frankfurt|\bDE(?:U)?\b/i],
  ['法国', /🇫🇷|法国|法國|巴黎|france|paris|\bFR\b/i],
  ['荷兰', /🇳🇱|荷兰|荷蘭|阿姆斯特丹|netherlands|amsterdam|\bNL\b/i],
  ['加拿大', /🇨🇦|加拿大|多伦多|多倫多|温哥华|溫哥華|canada|toronto|vancouver|\bCA(?:N)?\b/i],
  ['澳大利亚', /🇦🇺|澳大利亚|澳洲|悉尼|墨尔本|墨爾本|australia|sydney|melbourne|\bAU(?:S)?\b/i],
  ['俄罗斯', /🇷🇺|俄罗斯|俄羅斯|莫斯科|russia|moscow|\bRU\b/i],
  ['印度', /🇮🇳|印度|孟买|孟買|india|mumbai|\bIN(?:D)?\b/i],
  ['土耳其', /🇹🇷|土耳其|turkey|türkiye|istanbul|\bTR\b/i],
  ['阿联酋', /🇦🇪|阿联酋|阿聯酋|迪拜|dubai|emirates|\bAE\b/i],
  ['马来西亚', /🇲🇾|马来西亚|馬來西亞|吉隆坡|malaysia|kuala[\s._-]*lumpur|\bMY\b/i],
  ['泰国', /🇹🇭|泰国|泰國|曼谷|thailand|bangkok|\bTH\b/i],
  ['越南', /🇻🇳|越南|河内|河內|胡志明|vietnam|hanoi|\bVN\b/i],
  ['印度尼西亚', /🇮🇩|印度尼西亚|印尼|雅加达|indonesia|jakarta|\bID\b/i],
  ['菲律宾', /🇵🇭|菲律宾|菲律賓|马尼拉|馬尼拉|philippines|manila|\bPH\b/i],
  ['中国大陆', /🇨🇳|中国大陆|中國大陸|内地|內地|mainland[\s._-]*china|\bCN\b/i]
];

export function detectRegion(name) {
  const value = String(name || '').normalize('NFKC');
  for (const [region, matcher] of REGIONS) {
    // NFKC can change some glyphs; check raw and normalized strings.
    if (matcher.test(name || '') || matcher.test(value)) return region;
  }
  return '其他地区';
}

/** Only remove subscription traffic-quota announcement entries, never base-config nodes. */
export function isSubscriptionInfoNode(name) {
  const value = String(name || '').normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]/g, '');
  // Providers sometimes disguise a quota notice as a normal SS/VLESS proxy,
  // including a flag (e.g. 🇬🇧 剩余流量 12 GB). Don't classify it as a country node.
  return /(?:剩余|剩餘)(?:套餐)?流量|流量(?:剩余|剩餘)|(?:剩余|剩餘)[:：]?[\d.]+(?:GB|MB|TB|G|M|T)\b|(?:remaining|left|available)(?:traffic|data)|(?:traffic|data)(?:remaining|left)/i.test(value);
}

function parseYaml(text, label) {
  if (typeof text !== 'string' || !text.trim()) throw new MergeError(`${label}为空。`);
  const doc = YAML.parseDocument(text.replace(/^\uFEFF/, ''), { uniqueKeys: true });
  if (doc.errors.length) {
    throw new MergeError(`${label} YAML 解析失败：${doc.errors[0].message}`);
  }
  let data;
  try { data = doc.toJS({ maxAliasCount: 100 }); }
  catch (err) { throw new MergeError(`${label}无法安全解析：${err.message}`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new MergeError(`${label}必须是 Clash YAML 对象。`);
  }
  return { doc, data };
}

function getSubscriptionProxies(text, index) {
  const { data } = parseYaml(text, `订阅 ${index}`);
  if (!Array.isArray(data.proxies)) {
    throw new MergeError(`订阅 ${index} 缺少 proxies 数组：仅支持 Clash/Mihomo YAML 节点配置（不支持纯 Base64、仅 proxy-providers 或原始分享链接）。`);
  }
  const result = [];
  for (const p of data.proxies) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.name !== 'string' || !p.name.trim() || typeof p.type !== 'string') {
      throw new MergeError(`订阅 ${index} 中存在不合法的代理节点：需要 name 和 type。`);
    }
    result.push(p);
  }
  return result;
}

function stableEncode(v) {
  if (Array.isArray(v)) return `[${v.map(stableEncode).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableEncode(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function uniqueLabel(preferred, reserved) {
  if (!reserved.has(preferred)) {
    reserved.add(preferred);
    return preferred;
  }
  let n = 2;
  while (reserved.has(`${preferred} · ${n}`)) n++;
  const label = `${preferred} · ${n}`;
  reserved.add(label);
  return label;
}

/**
 * Adds only subscription proxies and region url-test groups.
 * Original groups, rules, DNS and other base fields are not replaced.
 * Preserves original order and original DIRECT/Proxy entries.
 * YAML document mutation retains most original comments as well as data values.
 */
export function mergeClash(baseText, subscriptionTexts) {
  const { doc, data } = parseYaml(baseText, '主配置');
  if (!Array.isArray(data['proxy-groups'])) throw new MergeError('主配置缺少 proxy-groups 数组。');
  if (data.proxies != null && !Array.isArray(data.proxies)) throw new MergeError('主配置的 proxies 必须是数组。');
  const originalProxies = data.proxies || [];
  const originalGroups = data['proxy-groups'];
  const reserved = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'GLOBAL', 'COMPATIBLE']);
  const originalGroupNames = [];
  for (const group of originalGroups) {
    if (!group || typeof group !== 'object' || typeof group.name !== 'string' || !group.name) {
      throw new MergeError('主配置的 proxy-groups 中存在无效组名。');
    }
    if (reserved.has(group.name)) throw new MergeError(`主配置存在与内置策略冲突的分组名：${group.name}`);
    reserved.add(group.name);
    originalGroupNames.push(group.name);
  }
  const existingIdentities = new Set();
  for (const proxy of originalProxies) {
    if (!proxy || typeof proxy.name !== 'string') throw new MergeError('主配置包含不合法的代理节点。');
    reserved.add(proxy.name);
    existingIdentities.add(stableEncode({ ...proxy, name: undefined }));
  }
  const allIncoming = subscriptionTexts.flatMap((text, i) => getSubscriptionProxies(text, i + 1));
  if (allIncoming.length > 5000) throw new MergeError('一次合并最多支持 5000 个订阅节点。');
  const incoming = allIncoming.filter(proxy => !isSubscriptionInfoNode(proxy.name));
  const filteredInfoNodes = allIncoming.length - incoming.length;
  if (incoming.length === 0) throw new MergeError('订阅 YAML 中没有可导入的代理节点（流量提示节点已排除）。');
  const regions = new Map();
  const imported = [];
  let skipped = 0, renamed = 0;
  for (const proxy of incoming) {
    const key = stableEncode({ ...proxy, name: undefined });
    if (existingIdentities.has(key)) { skipped++; continue; }
    existingIdentities.add(key);
    const before = proxy.name;
    const proxyName = reserved.has(before) ? uniqueLabel(`${before}（订阅）`, reserved) : uniqueLabel(before, reserved);
    if (proxyName !== before) renamed++;
    const entry = { ...proxy, name: proxyName };
    const region = detectRegion(before);
    if (!regions.has(region)) regions.set(region, []);
    regions.get(region).push(proxyName);
    imported.push(entry);
  }

  // Avoid overwriting a pre-existing group with the same country name.
  const regionGroups = [];
  const regionEntries = [...regions.entries()];
  // Country groups are deterministic: place unknown region last.
  regionEntries.sort((a, b) => a[0] === '其他地区' ? 1 : b[0] === '其他地区' ? -1 : a[0].localeCompare(b[0], 'zh-CN'));
  for (const [region, nodeNames] of regionEntries) {
    const groupName = uniqueLabel(region, reserved);
    regionGroups.push({ region, name: groupName, nodes: nodeNames });
  }

  if (!doc.has('proxies')) doc.set('proxies', []);
  const proxySeq = doc.get('proxies', true);
  const groupSeq = doc.get('proxy-groups', true);
  if (!YAML.isSeq(proxySeq) || !YAML.isSeq(groupSeq)) throw new MergeError('主配置节点与代理组格式不正确。');
  for (const proxy of imported) proxySeq.add(doc.createNode(proxy));

  // Existing manual groups get the NEW REGION GROUPS as additional choices,
  // never remove or reorder DIRECT, Proxy or any existing option.
  for (let i = 0; i < originalGroups.length; i++) {
    const baseGroup = originalGroups[i];
    const groupNode = groupSeq.items[i];
    const gtype = baseGroup.type;
    const isAuto = baseGroup.name === 'Auto' && gtype === 'url-test';
    const append = gtype === 'select' ? regionGroups.map(g => g.name)
      : isAuto ? imported.map(p => p.name) : [];
    if (append.length === 0) continue;
    let list = groupNode.get('proxies', true);
    if (!list) {
      groupNode.set('proxies', []);
      list = groupNode.get('proxies', true);
    }
    if (!YAML.isSeq(list)) throw new MergeError(`组 ${baseGroup.name} 的 proxies 不是数组。`);
    const known = new Set((baseGroup.proxies || []).map(String));
    for (const item of append) {
      if (!known.has(item)) { list.add(doc.createNode(item)); known.add(item); }
    }
  }

  // The new groups are strictly url-test, each testing nodes of just one region.
  const existingAuto = originalGroups.find(g => g.name === 'Auto' && g.type === 'url-test');
  const url = existingAuto?.url || 'https://www.gstatic.com/generate_204';
  const interval = Number.isInteger(existingAuto?.interval) && existingAuto.interval >= 60 ? existingAuto.interval : 300;
  const tolerance = Number.isInteger(existingAuto?.tolerance) && existingAuto.tolerance >= 0 ? existingAuto.tolerance : 150;
  for (const g of regionGroups) {
    groupSeq.add(doc.createNode({
      name: g.name,
      type: 'url-test',
      url,
      interval,
      tolerance,
      lazy: true,
      proxies: g.nodes
    }));
  }
  const yaml = String(doc);
  // Round-trip safety check: no rule loss, no existing option reorder/removal.
  const output = parseYaml(yaml, '合并输出').data;
  if (stableEncode(output.rules) !== stableEncode(data.rules)) throw new MergeError('规则校验失败，已拒绝输出。', 500);
  if (stableEncode(output.dns) !== stableEncode(data.dns)) throw new MergeError('DNS 校验失败，已拒绝输出。', 500);
  for (let i = 0; i < originalGroups.length; i++) {
    const before = originalGroups[i].proxies || [];
    const after = output['proxy-groups'][i]?.proxies || [];
    if (stableEncode(after.slice(0, before.length)) !== stableEncode(before)) {
      throw new MergeError(`组 ${originalGroups[i].name} 的原有选项发生变化，已拒绝输出。`, 500);
    }
  }
  return {
    yaml,
    stats: {
      originalNodes: originalProxies.length,
      sourceNodes: allIncoming.length,
      filteredInfoNodes,
      importedNodes: imported.length,
      duplicateNodes: skipped,
      renamedNodes: renamed,
      originalGroups: originalGroups.length,
      regionGroups: regionGroups.map(g => ({ name: g.name, region: g.region, count: g.nodes.length, nodes: g.nodes })),
      rules: data.rules?.length ?? 0,
      hasAuto: !!existingAuto,
      originalGroupNames
    }
  };
}

export function validateBaseYaml(baseText) {
  const { data } = parseYaml(baseText, '主配置');
  if (!Array.isArray(data['proxy-groups']) || data['proxy-groups'].length === 0) {
    throw new MergeError('主配置必须包含非空 proxy-groups 数组。');
  }
  if (data.proxies != null && !Array.isArray(data.proxies)) throw new MergeError('主配置 proxies 不是数组。');
  return { originalNodes: data.proxies?.length ?? 0, originalGroups: data['proxy-groups'].length, rules: data.rules?.length ?? 0 };
}
