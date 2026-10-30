# Clash / Mihomo 地区代理节点合并器（Vercel · 双 URL · 无数据库）

使用一个 Vercel 项目把两份 **HTTPS 远程 YAML** 实时合并：

- **主配置模板 URL（`BASE_CONFIG_URL`）**：返回你完整的 Clash / Mihomo YAML，包括 DNS、规则、原节点及原有代理组。
- **上游节点订阅 URL（`SUBSCRIPTION_URL`）**：返回 Clash YAML，只导入其中的 `proxies`，完全忽略上游规则、DNS、代理组。
- **`FEED_KEY`**：保护客户端 `/sub/:key` 订阅地址；打开网页模式时也用于预览/管理 API。

**不需要 Redis、KV、云数据库，也不需要把原 YAML 编码写进环境变量。** 每次 Clash 客户端更新订阅时，Vercel 同时抓取这两个 URL 并生成合并 YAML。

## 一、在 Vercel 部署

1. Vercel → **Add New → Project** → 选择 GitHub 仓库 `LGuangming/SomeFiles`。
2. 将 **Root Directory** 指向 `Clash-Vercel-Merger`；Framework Preset 选 **Other**。
3. 在 **Settings → Environment Variables** 填写下面三个值，应用到 Production：

| 变量名 | 内容 |
| --- | --- |
| `BASE_CONFIG_URL` | 完整主配置 YAML 的 **HTTPS 原始文件地址**，例如 `https://raw.githubusercontent.com/USER/REPO/main/config.yaml` |
| `SUBSCRIPTION_URL` | 节点提供商的完整 **Clash YAML 订阅地址**（可以包含其 token 参数） |
| `FEED_KEY` | 自选访问密钥，已有短密钥也可匹配；强烈建议至少 32 字符，推荐运行 `openssl rand -hex 32` |
| `ENABLE_WEB_UI` | `false`（默认）关闭首页及预览/下载 API；`true` 打开原有管理网页 |

4. Deploy / Redeploy。环境变量修改后需要新部署才生效。
5. **默认关闭网页**。如需使用网页预览，设定 `ENABLE_WEB_UI=true` 并重新部署；打开 Vercel 网站输入 `FEED_KEY` 后即可使用原有预览/下载功能。
6. 把 `https://你的Vercel域名/sub/你的FEED_KEY` 加入 Clash/Mihomo 的远程配置订阅。

**注意：** 如果主配置托管在 GitHub，必须填写 `raw.githubusercontent.com` 原始内容链接，而不是 `github.com/.../blob/...` 的网页链接。带有认证信息、订阅 token、节点 UUID 等秘密的主 YAML **不应放在公开 GitHub 仓库**。主配置 URL 需要能从 Vercel 直接读取；若使用私有仓库或需要授权头的地址，当前版本无法直接访问。可使用专门的受控/签名 HTTPS 直链。

## 二、可选网页预览和下载（ENABLE_WEB_UI=true）

网页可以直接使用环境变量定义的两个 URL，也可以在界面临时输入：

- 主配置 URL；或选择上传本地 YAML（二者选一）；
- 节点订阅 URL。

点击 **远程读取并预览** 后获取地区统计和合并后的 YAML，支持直接下载。以上临时输入只用于这一请求，**不会改变** `/sub/:key` 固定订阅生成时读取的环境变量，且不写入任何数据库。

## 三、保留和合并规则

- 保留主配置的所有 `rules`、`dns`、`rule-providers`、既有代理节点和代理组，原有组成员顺序保持不变。
- 上游仅导入其 `proxies`；重复节点去重，重名节点自动改名。
- 订阅 `proxies` 中的“剩余流量 / 流量剩餘 / Remaining Traffic / 距离下次重置剩余 / 套餐到期”等**流量提示节点**自动过滤，不进入任何地区组或原有 Auto；真正的英国节点仍正常保留。只过滤上游订阅，绝不删除主模板已有节点。
- 根据节点名/旗帜推断国家或地区，生成 `url-test` 自动测速组；无法识别的归入“其他地区”。这不是按节点真实出口 IP 地理定位。
- 原 `Auto` 为 `url-test` 时追加新节点；已有的 `select` 组只在末尾增加地区组，**已有的 `DIRECT`、`Proxy`、`Auto` 和其他成员不被删除或重排**。
- 合并后检查原始 DNS、规则和所有已有组成员未被更改；不通过检查时拒绝输出。

## 四、接口

| 地址 | 功能 | 验证 |
| --- | --- | --- |
| `/`、`/index.html`、`/api/home` | `ENABLE_WEB_UI=true` 时开放原网页，默认返回 404 | 无（但数据 API 需要 FEED_KEY 鉴权） |
| `GET /api/health` | 函数健康检查（不访问上游 URL，也不需密钥） | 无 |
| `GET /api/status` | 验证环境变量中的主配置，并显示基本统计（仅网页启用时） | `Authorization: Bearer FEED_KEY` |
| `POST /api/merge` | 临时 URL/上传预览，返回 YAML 和统计（仅网页启用时） | `Authorization: Bearer FEED_KEY` |
| `GET /api/download` | 直接下载默认合并配置（仅网页启用时） | `Authorization: Bearer FEED_KEY` |
| `GET /sub/:key` | 客户端自动更新的完整 YAML | URL 中携带 `FEED_KEY` |

## 五、项目代码

- `src/clash-handler.js`：两个远程 YAML 获取、输入限制、鉴权及 API。
- `src/merge.js`：节点去重、地区识别、YAML 无损优先合并及校验。
- `src/ui.js`：完整原中文网页（未删除功能），在 `ENABLE_WEB_UI=true` 时由 `api/home.js` 提供。
- `api/`：Vercel Node.js Functions 路由。
- `test/`：自动测试。
- `vercel.json`：订阅路由保持不变，`/` 和 `/index.html` 由可选网页函数控制。

本地验证：

```bash
npm install
npm test
npx vercel dev
```

可参考 `.env.example` 配置本地 `.env.local`，不要将真实密钥提交到 Git。

## 六、安全与限制

1. **完整订阅 URL 是敏感凭证**：持有它就能下载包含节点详情、认证配置的完整 YAML。不要公开发给他人，不要贴到 GitHub README。
2. **主配置私密性**：如果原始模板中有 `secret`、`authentication` 等字段，把它放到公开的 GitHub Raw 等于公开这些凭证。建议轮换之前暴露过的控制器口令，并避免对公网开放控制端口。
3. 只支持可直接 GET 的 **HTTPS** Clash YAML；私有 GitHub 仓库默认无法由此工具匿名获取，带 Authorization Header 的来源需要后续扩展。
4. 非 YAML 的 Base64 分享链接、订阅转换页面、仅有 `proxy-providers` 的文件不受支持。
5. 远程文件必须能从 Vercel 出站网络访问；源站若限制地域/IP，可能出现 403、超时等错误。单次请求受到 Vercel Functions 时长与响应大小限制。
6. 当前项目不保存上传内容，不提供网页上“永久保存设置”的功能；长期订阅使用 Vercel 环境变量中的两个 URL。

## 七、遇到 500 FUNCTION_INVOCATION_FAILED

1. 确认 Framework Preset 为 **Other**、Root Directory 为 **Clash-Vercel-Merger**，并使用最新 main 提交重新部署。
2. 先访问 `/`：默认应返回 404；如果设置 `ENABLE_WEB_UI=true`，应返回网页。随后检查 `/api/health`。
3. 再访问 `/api/health`：应返回 `{"ok":true,"service":"clash-vercel-merger"}`。如果健康检查也 500，查看 Vercel Project → Logs 中对应的运行时异常，检查 Node.js 版本和 Root Directory。
4. 如果 `/api/health` 正常，但 `/api/status` 不正常，先在 Vercel 设置 `BASE_CONFIG_URL`、`SUBSCRIPTION_URL`、`FEED_KEY` 并 Redeploy；再从页面输入 FEED_KEY，点击“检查 Vercel 默认配置”。上游文件 403/超时会返回可读 JSON 错误。
5. 如 `/api/status` 返回 `FUNCTION_INVOCATION_FAILED`，通常属于函数加载/依赖/运行时错误，检查日志中是否有 `Cannot find package 'yaml'`、`ERR_MODULE_NOT_FOUND` 或 `TypeError`。确保 `yaml` 出现在根目录 `package.json` 的 `dependencies` 内。

不要发送 Vercel 环境变量的值或任何含 token 的完整订阅 URL；排错只需日志中不含凭据的错误类型和堆栈。

### 处理 Vercel CLI 65 报错 No entrypoint found

如果 Build Logs 出现 `[BUILD_FAILED] No entrypoint found`，说明 Vercel 将该目录作为需要 Node/Express 应用入口的项目构建。此仓库采用 `src/ui.js` 可选网页 + `api/*.js` 独立函数模式，**不需要** `app.js`、`server.js` 或 Express。

仓库 `vercel.json` 已强制设置：

- `"framework": null`：使用 **Other**，覆盖 Vercel 项目设置中错误的框架预设。
- `"buildCommand": ""`：不执行前端构建。
- `"outputDirectory": "public"`：发布不含首页的静态目录；`api/` 路由仍作为 Vercel Functions 提供服务，根路径由 `api/home.js` 根据开关返回网页或 404。

在 Vercel → Project → Settings → Build and Deployment 中确认 Root Directory 为 `Clash-Vercel-Merger`；然后使用 **最新 main commit** 新建部署，必要时选择 **Redeploy without Build Cache**。部署成功后先访问 `/` 和 `/api/health`。如仍报错，请提供新部署的 Build Logs，勿发送密钥。

### FEED_KEY 显示不匹配

旧版本将 `FEED_KEY` 强制要求至少 24 字符，导致即使输入正确的短密钥也返回 401。现在移除了这一兼容性限制：只要非空且与环境变量匹配即可通过；**仍强烈建议使用足够长的随机密钥**，以防他人猜测并下载你的完整 Clash 凭据。

- **503 未配置 FEED_KEY**：确认变量名精确为 `FEED_KEY`，检查是否配置到当前部署对应的 **Production** 或 **Preview** 环境，并重新部署。
- **401 FEED_KEY 不匹配**：只输入环境变量的 **Value**，不是 `FEED_KEY=...`，保留大小写；检查是不是打开了旧部署或 Preview 网址。程序会忽略密钥首尾因复制产生的空格/换行。
- 密钥无须提供给任何人排查；不要在截图、日志或对话中公开它。

## 八、网页开关说明

配置 `ENABLE_WEB_UI`（Vercel Settings → Environment Variables）：

- 不设置 / `false`：默认隐藏网页。`/`、`/index.html`、`/api/home` 返回 404；原预览接口 `/api/status`、`/api/merge`、`/api/download` 同样返回 404。**`/sub/FEED_KEY` 始终保持可用**。`/api/health` 保留健康检查。
- `true`：恢复全部网页和原有受 `FEED_KEY` 保护的预览、下载功能。

修改环境变量后需触发新的 Vercel 部署。原先静态 `public/index.html` 已迁入 `src/ui.js`，避免直接访问静态 HTML 绕开网页开关。这是隐藏网页/减少暴露面，不替代 FEED_KEY 身份验证；旧部署的静态域名应另行检查是否仍可访问。
