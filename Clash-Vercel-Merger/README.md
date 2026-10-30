# Clash / Mihomo 地区代理节点合并器（Vercel · 双 URL · 无数据库）

使用一个 Vercel 项目把两份 **HTTPS 远程 YAML** 实时合并：

- **主配置模板 URL（`BASE_CONFIG_URL`）**：返回你完整的 Clash / Mihomo YAML，包括 DNS、规则、原节点及原有代理组。
- **上游节点订阅 URL（`SUBSCRIPTION_URL`）**：返回 Clash YAML，只导入其中的 `proxies`，完全忽略上游规则、DNS、代理组。
- **`FEED_KEY`**：保护网页操作和 `/sub/:key` 完整配置订阅。

**不需要 Redis、KV、云数据库，也不需要把原 YAML 编码写进环境变量。** 每次 Clash 客户端更新订阅时，Vercel 同时抓取这两个 URL 并生成合并 YAML。

## 一、在 Vercel 部署

1. Vercel → **Add New → Project** → 选择 GitHub 仓库 `LGuangming/SomeFiles`。
2. 将 **Root Directory** 指向 `Clash-Vercel-Merger`；Framework Preset 选 **Other**。
3. 在 **Settings → Environment Variables** 填写下面三个值，应用到 Production：

| 变量名 | 内容 |
| --- | --- |
| `BASE_CONFIG_URL` | 完整主配置 YAML 的 **HTTPS 原始文件地址**，例如 `https://raw.githubusercontent.com/USER/REPO/main/config.yaml` |
| `SUBSCRIPTION_URL` | 节点提供商的完整 **Clash YAML 订阅地址**（可以包含其 token 参数） |
| `FEED_KEY` | 自选的强随机值，最少 24 字符，推荐运行 `openssl rand -hex 32` |

4. Deploy / Redeploy。环境变量修改后需要新部署才生效。
5. 打开 Vercel 网站，在网页输入 `FEED_KEY`，点击 **检查 Vercel 默认配置**。可以选择填入两个临时 URL 做预览；不填则从环境变量读取。
6. 把 `https://你的Vercel域名/sub/你的FEED_KEY` 加入 Clash/Mihomo 的远程配置订阅。

**注意：** 如果主配置托管在 GitHub，必须填写 `raw.githubusercontent.com` 原始内容链接，而不是 `github.com/.../blob/...` 的网页链接。带有认证信息、订阅 token、节点 UUID 等秘密的主 YAML **不应放在公开 GitHub 仓库**。主配置 URL 需要能从 Vercel 直接读取；若使用私有仓库或需要授权头的地址，当前版本无法直接访问。可使用专门的受控/签名 HTTPS 直链。

## 二、网页预览和下载

网页可以直接使用环境变量定义的两个 URL，也可以在界面临时输入：

- 主配置 URL；或选择上传本地 YAML（二者选一）；
- 节点订阅 URL。

点击 **远程读取并预览** 后获取地区统计和合并后的 YAML，支持直接下载。以上临时输入只用于这一请求，**不会改变** `/sub/:key` 固定订阅生成时读取的环境变量，且不写入任何数据库。

## 三、保留和合并规则

- 保留主配置的所有 `rules`、`dns`、`rule-providers`、既有代理节点和代理组，原有组成员顺序保持不变。
- 上游仅导入其 `proxies`；重复节点去重，重名节点自动改名。
- 根据节点名/旗帜推断国家或地区，生成 `url-test` 自动测速组；无法识别的归入“其他地区”。这不是按节点真实出口 IP 地理定位。
- 原 `Auto` 为 `url-test` 时追加新节点；已有的 `select` 组只在末尾增加地区组，**已有的 `DIRECT`、`Proxy`、`Auto` 和其他成员不被删除或重排**。
- 合并后检查原始 DNS、规则和所有已有组成员未被更改；不通过检查时拒绝输出。

## 四、接口

| 地址 | 功能 | 验证 |
| --- | --- | --- |
| `/` | 网页界面 | 无（但数据 API 需要鉴权） |
| `GET /api/status` | 验证环境变量中的主配置，并显示基本统计 | `Authorization: Bearer FEED_KEY` |
| `POST /api/merge` | 临时 URL/上传预览，返回 YAML 和统计 | `Authorization: Bearer FEED_KEY` |
| `GET /api/download` | 直接下载默认合并配置 | `Authorization: Bearer FEED_KEY` |
| `GET /sub/:key` | 客户端自动更新的完整 YAML | URL 中携带 `FEED_KEY` |

## 五、项目代码

- `src/server.js`：两个远程 YAML 获取、输入限制、鉴权及 API。
- `src/merge.js`：节点去重、地区识别、YAML 无损优先合并及校验。
- `src/ui.js`：中文静态网页。
- `api/`：Vercel Node.js Functions 路由。
- `test/`：自动测试。
- `vercel.json`：网页和 `/sub/:key` 路由重写。

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
