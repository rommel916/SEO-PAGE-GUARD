import { buildPageResult } from './seo-quality-engine.js';
import { loadUrlsFromSitemap } from './sitemap-source.js';
import type {
  AuditOptions,
  AuditProgressEvent,
  AuditReport,
  AuditSummary,
  PageAuditResult,
} from './types.js';

async function fetchPage(
  url: string,
  timeout: number,
  userAgent: string,
): Promise<{ statusCode: number; html: string | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
    });
    const html = await res.text();
    return { statusCode: res.status, html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { statusCode: 0, html: null, error: message };
  } finally {
    clearTimeout(timer);
    void start;
  }
}

function summarize(results: PageAuditResult[]): AuditSummary {
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let httpErrors = 0;

  for (const r of results) {
    if (r.issues.some((i) => i.ruleId === 'http.error')) httpErrors++;
    if (r.passed) {
      passed++;
      if (r.issues.some((i) => i.level === 'warn')) warnings++;
    } else {
      failed++;
    }
  }

  return { total: results.length, passed, failed, warnings, httpErrors };
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

export async function runAudit(
  options: AuditOptions,
  onProgress?: (event: AuditProgressEvent) => void,
): Promise<AuditReport> {
  const urls = await loadUrlsFromSitemap(options.sitemapUrl, {
    timeout: options.timeout,
    userAgent: options.userAgent,
    maxUrls: options.maxUrls,
  });

  onProgress?.({ type: 'sitemap_loaded', total: urls.length });

  const results: PageAuditResult[] = [];

  await runPool(urls, options.concurrency, async (url, index) => {
    onProgress?.({ type: 'checking', url, index: index + 1, total: urls.length });

    const start = Date.now();
    const { statusCode, html, error } = await fetchPage(url, options.timeout, options.userAgent);
    const result = buildPageResult(url, statusCode, html, options.rules, Date.now() - start, error);

    results.push(result);
    onProgress?.({ type: 'result', result });
    return result;
  });

  const report: AuditReport = {
    sitemap: options.sitemapUrl,
    checkedAt: new Date().toISOString(),
    summary: summarize(results),
    results: results.sort((a, b) => Number(a.passed) - Number(b.passed)),
  };

  onProgress?.({ type: 'complete', report });
  return report;
}
