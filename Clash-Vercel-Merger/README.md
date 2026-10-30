# Clash / Mihomo 地区节点合并器（Vercel）

基于你的 Clash YAML 主配置，只提取上游订阅中的 `proxies`，按节点名称中的地区生成 `url-test` 自动测速组，并在现有 `select` 组中追加地区组选项。原有 `DIRECT`、`Proxy`、`Auto`、DNS、规则及其现有顺序保持不变。原有 `Auto`（若是 `url-test`）也会加入新节点。

## 部署到 Vercel

1. 在 Vercel 选择 **Add New → Project → Import Git Repository**。如从 `SomeFiles` 仓库部署，将项目 **Root Directory** 设为 `Clash-Vercel-Merger`；如迁移到独立仓库则使用根目录。
2. Framework Preset 选择 **Other**（普通 Node.js Serverless Functions，无需构建命令）。Node.js 使用受支持的 LTS 版本。
3. 在 Vercel Marketplace 添加 **Upstash Redis**，创建 Redis 数据库并连接本项目。把 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 添加到项目环境变量；若旧版集成提供 `KV_REST_API_URL`、`KV_REST_API_TOKEN`，程序也兼容。
4. 在 **Project Settings → Environment Variables** 增加两个**不同**、不少于 24 字符的随机值：`ADMIN_KEY` 和 `FEED_KEY`。建议分别使用 `openssl rand -hex 32` 生成。
5. **Redeploy** 使环境变量生效，打开项目域名，输入 `ADMIN_KEY` 连接；输入 `FEED_KEY` 用于生成远程订阅地址。
6. 在页面上传你的原始 YAML，填写上游 Clash 订阅 URL，点击预览，然后下载或将生成的 `https://YOUR_DOMAIN/sub/YOUR_FEED_KEY` 导入 Clash/Mihomo 订阅。

> **重要**：项目代码不包含你的 YAML、订阅令牌或私密凭据，不要把它们放到仓库里。**FEED_KEY 对应的订阅链接可读出完整代理配置，必须保密**。原 YAML 包括控制器和认证信息，建议轮换其中已暴露的口令，并检查对外监听设置。

## 合并逻辑

- 保留主配置的完整 `rules` / `dns` / `rule-providers` 等字段。
- 仅读取上游 Clash YAML 的 `proxies`；忽略上游 `rules` / `proxy-groups`。
- 按名字中的国家、地名、地区代码或国旗识别地区；无法识别的加入 `其他地区`。这是名称匹配，并非 IP 地理定位。
- 每个地区建独立 `url-test` 组，继承原 `Auto` 的测速网址、间隔及容差。
- 原 `select` 组追加新地区组选项，保留原有所有成员及顺序；原 `Auto`（如为 `url-test`）追加节点。
- 原节点保留，新节点按参数去重；重名时自动重命名，避免覆盖已有组。
- 生成后核验所有原 `select` 组前缀成员、`rules` 和 `dns` 未被改动。

## 本地测试

```bash
npm install
npm test
npx vercel dev
```

将 `.env.example` 复制到 `.env.local` 并填入真实环境变量；不要将 `.env.local` 提交到 GitHub。使用 `vercel dev` 时，也可通过 Vercel CLI 同步项目环境变量。

## 文件结构

- `api/*.js`：Vercel Functions 的 HTTP 端点
- `src/server.js`：鉴权、Upstash 存储、上游订阅拉取和接口逻辑
- `src/merge.js`：YAML 合并、地区分组和一致性校验
- `src/ui.js`：中文网页管理界面
- `vercel.json`：页面和 `/sub/:key` 地址路由
- `test/*.test.js`：节点分类、合并保护测试

## 安全提示

后台管理和远程订阅使用不同的密钥。Upstash 存储 YAML、订阅 URL 等敏感内容；不要公开 Redis 令牌。首次配置与订阅 URL 均由你的网页通过 HTTPS 上传保存，不嵌入源码。上游服务器可能拒绝 Vercel 数据中心的请求；该程序只支持上游能返回 `proxies` 数组的 Clash YAML，不支持 Base64 分享链接。每次客户端访问 `/sub/:key` 都会实时抓取上游并生成完整文件，因此速度和可靠性依赖上游服务。
