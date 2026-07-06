import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

function normalizeLoc(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(normalizeLoc);
  return [];
}

function extractUrlsFromParsed(doc: Record<string, unknown>): string[] {
  const urlset = doc.urlset as Record<string, unknown> | undefined;
  if (urlset?.url) {
    const entries = Array.isArray(urlset.url) ? urlset.url : [urlset.url];
    return entries.flatMap((entry) => {
      const loc = (entry as Record<string, unknown>).loc;
      return normalizeLoc(loc);
    });
  }
  return [];
}

function extractSitemapIndexes(doc: Record<string, unknown>): string[] {
  const index = doc.sitemapindex as Record<string, unknown> | undefined;
  if (index?.sitemap) {
    const entries = Array.isArray(index.sitemap) ? index.sitemap : [index.sitemap];
    return entries.flatMap((entry) => {
      const loc = (entry as Record<string, unknown>).loc;
      return normalizeLoc(loc);
    });
  }
  return [];
}

async function fetchXml(source: string, timeout: number, userAgent: string): Promise<string> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(source, {
        signal: controller.signal,
        headers: { 'User-Agent': userAgent },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching sitemap`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  const filePath = path.resolve(source);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sitemap file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function resolveSitemapUrl(baseUrl: string, childLoc: string): string {
  try {
    return new URL(childLoc, baseUrl).href;
  } catch {
    return childLoc;
  }
}

export async function loadUrlsFromSitemap(
  sitemapSource: string,
  options: { timeout: number; userAgent: string; maxUrls: number | null },
): Promise<string[]> {
  const visited = new Set<string>();
  const urls = new Set<string>();

  async function walk(source: string, baseForResolve: string) {
    const normalizedSource = source.startsWith('http') ? source : path.resolve(source);
    if (visited.has(normalizedSource)) return;
    visited.add(normalizedSource);

    const xml = await fetchXml(source, options.timeout, options.userAgent);
    const doc = parser.parse(xml) as Record<string, unknown>;

    const childSitemaps = extractSitemapIndexes(doc);
    if (childSitemaps.length > 0) {
      for (const child of childSitemaps) {
        await walk(resolveSitemapUrl(baseForResolve, child), resolveSitemapUrl(baseForResolve, child));
        if (options.maxUrls && urls.size >= options.maxUrls) return;
      }
      return;
    }

    for (const loc of extractUrlsFromParsed(doc)) {
      urls.add(loc);
      if (options.maxUrls && urls.size >= options.maxUrls) return;
    }
  }

  const base = sitemapSource.startsWith('http') ? sitemapSource : `file://${path.resolve(sitemapSource)}`;
  await walk(sitemapSource, base);

  return [...urls];
}
