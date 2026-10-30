export const UI_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>Clash 节点整合 | Vercel</title>
<style>
:root{--bg:#f6f7fa;--panel:#fff;--ink:#1b2736;--sub:#677587;--line:#e4e9f0;--blue:#2865e8;--bluebg:#eff4ff;--ok:#13855c;--bad:#bb3345}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.65}
.wrap{max-width:1080px;margin:auto;padding:36px 20px 80px}.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:26px}.eyebrow{color:var(--blue);font-size:12px;letter-spacing:.13em;font-weight:700;text-transform:uppercase}h1{font-size:30px;line-height:1.24;letter-spacing:-.04em;margin:8px 0 10px}h2{font-size:16px;letter-spacing:-.01em;margin:0 0 16px}.desc{color:var(--sub);margin:0;max-width:690px}.shield{border:1px solid #dbe8fc;border-radius:100px;background:#eff5ff;color:#3761ad;padding:6px 12px;white-space:nowrap;font-size:12px}.grid{display:grid;grid-template-columns:1.2fr 1fr;gap:18px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:24px;box-shadow:0 3px 14px #0f234506}.full{grid-column:1/-1}
.step{display:inline-flex;align-items:center;justify-content:center;border-radius:7px;background:var(--bluebg);color:var(--blue);font-weight:700;width:26px;height:26px;margin-right:10px}label{display:block;font-size:12px;font-weight:700;color:#455368;margin-bottom:7px}input[type=password],input[type=url],input[type=text]{height:43px;width:100%;background:#fff;color:var(--ink);border:1px solid #d7dfe9;border-radius:8px;padding:0 12px;outline:none;font-size:13px}input:focus{border-color:#8aacec;box-shadow:0 0 0 3px #2865e814}.field{margin:0 0 14px}.hint{font-size:12px;color:var(--sub);margin-top:7px}.filebox{border:1px dashed #b5c5d9;background:#fafcff;border-radius:10px;padding:20px;text-align:center}.filebox input{max-width:100%;font-size:12px}.btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid #cad7e7;background:white;color:#2b3f57;padding:10px 15px;min-height:42px;border-radius:9px;font-size:13px;font-weight:650;cursor:pointer;gap:7px;transition:.14s}.btn:hover{background:#f5f9ff;border-color:#9cb4d9}.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}.btn.primary:hover{background:#1854d0}.btn:disabled{opacity:.5;cursor:not-allowed}.row{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.muted{color:var(--sub);font-size:12px}.status{background:#f5f8fb;border:1px solid var(--line);border-radius:10px;padding:11px 13px;margin-top:14px;font-size:12px;color:#536276}.status.good{background:#f0fbf6;border-color:#c9e9d6;color:#18744d}.status.bad{background:#fff4f4;border-color:#f2d2d7;color:var(--bad)}
.metricgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:17px 0}.metric{background:#f7f9fd;border:1px solid #edf0f4;border-radius:10px;padding:15px}.metric b{display:block;font-size:24px;line-height:1.25;letter-spacing:-.03em}.metric span{font-size:12px;color:#748195}.regions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.region{border:1px solid var(--line);padding:12px 13px;border-radius:9px;display:flex;justify-content:space-between;gap:7px;align-items:center}.region span{font-weight:650}.region small{color:var(--sub)}.empty{padding:23px;border:1px dashed var(--line);border-radius:10px;color:var(--sub);text-align:center}
.linkrow{display:flex;gap:10px}.linkrow input{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.notice{border-left:3px solid #8eace6;padding:6px 0 6px 13px;color:#596b81;font-size:12px}.footer{margin-top:18px;font-size:12px;color:var(--sub);text-align:center}.spacer{height:9px}code{background:#f1f5fa;padding:1px 4px;border-radius:4px}#message{display:none;position:sticky;top:12px;z-index:4;max-width:800px;margin:0 auto 16px;box-shadow:0 3px 12px #162d5115}
@media(max-width:770px){.wrap{padding:26px 14px 50px}.hero{flex-direction:column;gap:10px}.grid{grid-template-columns:1fr}.panel{padding:19px}.regions{grid-template-columns:repeat(2,minmax(0,1fr))}.metricgrid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:26px}.linkrow{flex-direction:column}.shield{white-space:normal}}
</style>
</head>
<body><main class="wrap">
<div class="hero"><div><div class="eyebrow">Vercel Functions / Mihomo</div><h1>Clash 配置节点整合</h1><p class="desc">以你的规则文件为基础，仅提取订阅节点，按国家及地区建立 <strong>url-test</strong> 自动测速组。原有分流、DNS、DIRECT / Proxy 等选项保持不变。</p></div><div class="shield">私有 Redis 存储 · 密钥验证</div></div>
<div id="message" class="status" role="status" aria-live="polite"></div>
<section class="grid">
<div class="panel full"><h2><span class="step">0</span>连接管理后台</h2>
<div class="grid" style="gap:14px"><div class="field"><label for="admin">管理密钥 ADMIN_KEY</label><input id="admin" type="password" autocomplete="off" placeholder="填写 Vercel 环境变量 中设置的管理密钥"/></div><div class="field"><label for="feedkey">订阅令牌 FEED_KEY（仅用于生成订阅地址）</label><input id="feedkey" type="password" autocomplete="off" placeholder="填写 Vercel 环境变量 中设置的订阅令牌"/></div></div>
<div class="row"><button class="btn" id="connect">连接并查看状态</button><span class="muted">密钥仅保留在当前页面内存，不写入浏览器存储。</span></div><div class="status" id="status">尚未连接。</div></div>
<div class="panel"><h2><span class="step">1</span>保存主配置</h2><div class="filebox"><label for="basefile">上传你原有的 Clash / Mihomo YAML</label><input id="basefile" type="file" accept=".yaml,.yml,text/yaml,text/plain"/><div class="hint">包括你原有的 proxies、proxy-groups、rules、dns 等内容。</div></div><div class="spacer"></div><button class="btn" id="savebase">保存主配置到私有 Redis</button><div class="status" id="baseStatus">尚未上传。</div></div>
<div class="panel"><h2><span class="step">2</span>保存节点订阅</h2><div class="field"><label for="source">Clash YAML 订阅 URL</label><input id="source" type="password" autocomplete="off" placeholder="https://example.com/api/subscribe?token=..."/><div class="hint">只会读取订阅中的 <code>proxies</code>，不导入其三条规则或代理组。</div></div><button class="btn" id="savesource">保存订阅地址到私有 Redis</button><div class="status" id="sourceStatus">尚未保存。</div></div>
<div class="panel full"><h2><span class="step">3</span>生成与检查</h2><p class="muted">点击后 Vercel 从订阅源实时获取节点，展示地区统计和合并结果；每次订阅客户端更新时也会重新拉取。</p>
<div class="row"><button class="btn primary" id="preview">拉取节点并预览</button><button class="btn" id="download" disabled>下载合并后的 YAML</button></div>
<div id="stats" hidden><div class="metricgrid"><div class="metric"><b id="totalNodes">-</b><span>导入新节点</span></div><div class="metric"><b id="regionalCount">-</b><span>地区自动组</span></div><div class="metric"><b id="existingGroups">-</b><span>原有代理组</span></div><div class="metric"><b id="existingRules">-</b><span>保留原规则</span></div></div><h2 style="margin-top:20px">地区分组预览</h2><div id="regions" class="regions"></div><p id="details" class="hint"></p></div>
<div id="noStats" class="empty">完成前两步后，点击“拉取节点并预览”。</div></div>
<div class="panel full"><h2><span class="step">4</span>自动更新的远程订阅地址</h2><p class="muted">将下面地址添加到 Clash/Mihomo 的远程配置订阅中。客户端更新配置时，会由 Vercel 重新读取上游订阅并合并，无需手动下载。</p>
<div class="linkrow"><input id="feedurl" type="text" readonly placeholder="输入 FEED_KEY 后可生成"/><button class="btn" id="copylink">复制订阅地址</button></div><div class="spacer"></div><div class="notice">此链接相当于完整配置的读取凭证，包含原配置中的连接信息和认证字段。不要公开分享，也不要存放在公开仓库。可在 Vercel 更换 FEED_KEY 令原地址失效。</div></div>
</section><p class="footer">原配置与订阅 URL 存储于私有 Upstash Redis · 网页不使用第三方脚本</p>
</main><script>
'use strict';
const $ = id => document.getElementById(id);
let previewReady = false;
function key() { return $('admin').value.trim(); }
function alertBox(message, good) {
 const el = $('message'); el.style.display = 'block'; el.textContent = message;
 el.className = 'status ' + (good ? 'good' : 'bad');
}
function setStatus(id, message, good) {
 const el = $(id); el.textContent = message; el.className = 'status ' + (good ? 'good' : 'bad');
}
async function api(path, options) {
 if (!key()) throw Error('请先输入管理密钥 ADMIN_KEY。');
 const response = await fetch(path, Object.assign({}, options || {}, {
   headers: Object.assign({}, options?.headers || {}, { 'Authorization': 'Bearer ' + key() })
 }));
 if (!response.ok) {
   let info;
   try { info = await response.json(); } catch { /* no JSON */ }
   throw Error((info && info.error) || ('HTTP ' + response.status));
 }
 return response;
}
function showLink() {
 const token = $('feedkey').value.trim();
 $('feedurl').value = token ? (location.origin + '/sub/' + encodeURIComponent(token)) : '';
}
$('feedkey').addEventListener('input', showLink);
$('connect').onclick = async () => {
 try {
   const r = await (await api('/api/status')).json();
   setStatus('status', '连接成功 · 主配置：' + (r.hasBase ? r.baseName + '（节点 ' + r.baseStats.originalNodes + ' / 分组 ' + r.baseStats.originalGroups + ' / 规则 ' + r.baseStats.rules + '）' : '未上传') + ' · 订阅：' + (r.hasSource ? r.sourceHost : '未保存'), true);
   setStatus('baseStatus', r.hasBase ? ('已保存：' + r.baseName) : '尚未上传。', r.hasBase);
   setStatus('sourceStatus', r.hasSource ? ('已保存：' + r.sourceHost + '（地址已隐藏）') : '尚未保存。', r.hasSource);
 } catch(e) { alertBox(e.message, false); }
};
$('savebase').onclick = async () => {
 const file = $('basefile').files[0];
 if (!file) { alertBox('请选择主配置 YAML 文件。', false); return; }
 try {
   if (file.size > 1500000) throw Error('主配置文件不能超过 1.5 MB。');
   const result = await (await api('/api/base', { method:'POST', headers:{'Content-Type':'text/yaml','X-Filename':encodeURIComponent(file.name)}, body: await file.text() })).json();
   setStatus('baseStatus', '已上传：原节点 ' + result.originalNodes + '，原有分组 ' + result.originalGroups + '，原有规则 ' + result.rules, true);
   previewReady = false; $('download').disabled = true; $('stats').hidden = true; $('noStats').hidden = false;
   alertBox('主配置已保存；不会被公开嵌入网页。', true);
 } catch(e) { alertBox(e.message, false); }
};
$('savesource').onclick = async () => {
 const source = $('source').value.trim();
 if (!source) { alertBox('请输入订阅 URL。', false); return; }
 try {
   const result = await (await api('/api/source', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:source}) })).json();
   setStatus('sourceStatus', '已保存：' + result.sourceHost + '（订阅令牌不回显）', true);
   $('source').value = '';
   previewReady = false; $('download').disabled = true; $('stats').hidden = true; $('noStats').hidden = false;
   alertBox('节点订阅地址已保存。', true);
 } catch(e) { alertBox(e.message, false); }
};
$('preview').onclick = async () => {
 $('preview').disabled = true;
 try {
   const r = await (await api('/api/preview')).json();
   $('totalNodes').textContent = r.importedNodes;
   $('regionalCount').textContent = r.regionGroups.length;
   $('existingGroups').textContent = r.originalGroups;
   $('existingRules').textContent = r.rules;
   const root = $('regions'); root.replaceChildren();
   for (const group of r.regionGroups) {
     const node = document.createElement('div'); node.className = 'region';
     const text = document.createElement('span'); text.textContent = group.name;
     const count = document.createElement('small'); count.textContent = group.count + ' 节点 · url-test';
     node.append(text, count); root.append(node);
   }
   $('details').textContent = '原节点 ' + r.originalNodes + ' 个保留 · 从订阅读取 ' + r.sourceNodes + ' 个 · 去重 ' + r.duplicateNodes + ' 个 · 节点重名改名 ' + r.renamedNodes + ' 个 · Auto 已扩展：' + (r.hasAuto ? '是' : '否（主配置无 Auto url-test 组）');
   $('stats').hidden = false; $('noStats').hidden = true;
   previewReady = true; $('download').disabled = false;
   alertBox('成功生成预览：原有 DNS、rules 与原代理组选项已通过完整性检查。', true);
 } catch(e) { previewReady = false; $('download').disabled = true; alertBox(e.message, false); }
 finally { $('preview').disabled = false; }
};
$('download').onclick = async () => {
 if (!previewReady) return;
 try {
   const response = await api('/api/download'); const content = await response.blob();
   const url = URL.createObjectURL(content); const a = document.createElement('a');
   a.href = url; a.download = 'Merged-Clash.yaml'; document.body.append(a); a.click(); a.remove();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
 } catch(e) { alertBox(e.message, false); }
};
$('copylink').onclick = async () => {
 showLink(); const v = $('feedurl').value;
 if (!v) { alertBox('请在步骤 0 输入 FEED_KEY。', false); return; }
 try { await navigator.clipboard.writeText(v); alertBox('已复制远程订阅地址。', true); }
 catch { $('feedurl').focus(); $('feedurl').select(); alertBox('请手动复制已选中的订阅地址。', false); }
};
</script></body></html>`;
