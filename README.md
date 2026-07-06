# SEO Page Guard

独立 SEO 页面质量审计工具。传入 Sitemap 链接，自动读取全部 URL 并检测每个页面的 SEO 内容质量。

## 功能

- 解析远程 / 本地 `sitemap.xml`（支持 sitemap index 递归）
- 并发抓取页面并执行多维度 SEO 质量审计
- Web 可视化界面 + CLI 命令行
- SSE 实时进度推送
- JSON 报告导出

## 快速开始

```bash
cd seo-page-guard
npm install
npm run dev
```

打开 http://localhost:3847 ，输入 Sitemap 链接即可开始审计。

## 检测规则分类

### 核心 SEO

| 规则 ID | 级别 | 通过标准 |
|---------|------|----------|
| title.missing / title.forbidden | error | Title 存在且不含 undefined/null/404 |
| description.missing / description.short | error / warn | Description 存在，建议 ≥ 50 字符 |
| canonical.missing | error | 必须包含 canonical |
| h1.missing / h1.multiple | error | 有且仅有 1 个 H1 |
| body.thin | error | 正文纯文本 ≥ 150 字符 |
| soft404.title | error | Title 不含错误页特征 |

### 安全卡点

| 规则 ID | 级别 | 通过标准 |
|---------|------|----------|
| robots.noindex | error | 生产环境 `meta[name="robots"]` 不得含 noindex |

### 语义合规

| 规则 ID | 级别 | 通过标准 |
|---------|------|----------|
| html.lang.missing | error | `<html lang="...">` 必须显式声明 |
| html.lang.mismatch | error | lang 与配置的预期语种一致（可选） |

### 智能搜索

| 规则 ID | 级别 | 通过标准 |
|---------|------|----------|
| jsonld.missing | error | 必须存在 `application/ld+json` |
| jsonld.invalid | error | JSON-LD 内容可通过 JSON.parse |

### 社交传播

| 规则 ID | 级别 | 通过标准 |
|---------|------|----------|
| og.title.missing | error | 必须包含 og:title |
| og.image.missing | error | 必须包含 og:image |

### 链路健康（Anchor Health）

| 规则 ID | 级别 | 通过标准 |
|---------|------|----------|
| anchor.empty | error | 禁止 `href=""` |
| anchor.hash | error | 禁止 `href="#"` |
| anchor.javascript | error | 禁止 `href="javascript:void(0)"` 等伪链接 |

### 无障碍（img alt）

| 规则 ID | 级别 | 通过标准 |
|---------|------|----------|
| image.alt.coverage | error | 所有有效 `<img>` 必须含非空 alt（覆盖率 100%） |
| image.alt.partial | warn | 部分图片缺失 alt |

## CLI 用法

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml
npm run audit -- --sitemap https://example.com/sitemap.xml --max-urls 50 --format json
```

## 独立部署

```bash
npm run build
PORT=3847 node dist/server.js
```

可用 Cron、Docker 或任意 Node 宿主部署，不依赖业务工程。
