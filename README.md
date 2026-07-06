# SEO Page Guard

独立 SEO 页面质量审计工具。传入 Sitemap 链接，自动读取全部 URL 并检测每个页面的 SEO 内容质量。

## 功能

- 解析远程 / 本地 `sitemap.xml`（支持 sitemap index 递归）
- 并发抓取页面并检测：Title、Description、Canonical、H1、白屏、Soft-404
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

## CLI 用法

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml
npm run audit -- --sitemap https://example.com/sitemap.xml --max-urls 50 --format json
```

## API

```
POST /api/audit
Content-Type: application/json

{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "concurrency": 5,
  "maxUrls": 100,
  "timeout": 12000
}
```

响应为 SSE 事件流，事件类型：`sitemap_loaded` | `checking` | `result` | `complete` | `error`

## 独立部署

```bash
npm run build
PORT=3847 node dist/server.js
```

可用 Cron、Docker 或任意 Node 宿主部署，不依赖业务工程。

## 检测规则

| 规则 | 说明 |
|------|------|
| title.missing / title.forbidden | Title 缺失或含 undefined/null/404 |
| description.missing / description.short | Description 缺失或过短 |
| canonical.missing | 缺少 canonical 标签 |
| h1.missing / h1.multiple | H1 缺失或重复 |
| body.thin | 正文文本 < 150 字符 |
| soft404.title | Title 疑似错误页 |
| http.error | HTTP 状态码非 2xx |
