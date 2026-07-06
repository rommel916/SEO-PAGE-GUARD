import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AUDIT_OPTIONS, DEFAULT_RULES } from './config/defaults.js';
import { runAudit } from './engine/audit-pipeline.js';
import type { AuditOptions, AuditProgressEvent } from './engine/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3847;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'seo-page-guard' });
});

app.post('/api/audit', async (req, res) => {
  const { sitemapUrl, concurrency, maxUrls, timeout } = req.body ?? {};

  if (!sitemapUrl || typeof sitemapUrl !== 'string') {
    res.status(400).json({ error: '请提供有效的 sitemapUrl' });
    return;
  }

  const options: AuditOptions = {
    sitemapUrl: sitemapUrl.trim(),
    concurrency: Math.min(Math.max(Number(concurrency) || DEFAULT_AUDIT_OPTIONS.concurrency, 1), 20),
    timeout: Math.min(Math.max(Number(timeout) || DEFAULT_AUDIT_OPTIONS.timeout, 3000), 60000),
    maxUrls: maxUrls ? Math.max(Number(maxUrls), 1) : null,
    rules: { ...DEFAULT_RULES },
    userAgent: DEFAULT_AUDIT_OPTIONS.userAgent,
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: AuditProgressEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await runAudit(options, send);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'error', message });
  } finally {
    res.end();
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  SEO Page Guard\n  → http://localhost:${PORT}\n`);
});
