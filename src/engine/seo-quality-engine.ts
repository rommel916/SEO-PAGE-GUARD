import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AuditRules, PageAuditResult, PageMetrics, SeoIssue } from './types.js';
import { EMPTY_METRICS } from './types.js';

type BadAnchorKind = 'empty' | 'hash' | 'javascript';

function classifyBadHref(href: string | undefined): BadAnchorKind | null {
  if (href === undefined) return null;
  const trimmed = href.trim();
  if (trimmed === '') return 'empty';
  if (trimmed === '#') return 'hash';
  if (/^javascript:\s*(void\s*\(\s*0\s*\)|;|undefined)?\s*$/i.test(trimmed)) return 'javascript';
  if (/^javascript:/i.test(trimmed)) return 'javascript';
  return null;
}

const ANCHOR_LABELS: Record<BadAnchorKind, string> = {
  empty: 'href="" 空值',
  hash: 'href="#"',
  javascript: 'href="javascript:..." 伪链接',
};

function scanAnchors($: CheerioAPI): { total: number; bad: Array<{ href: string; kind: BadAnchorKind }> } {
  const bad: Array<{ href: string; kind: BadAnchorKind }> = [];
  let total = 0;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href === undefined) return;
    total++;
    const kind = classifyBadHref(href);
    if (kind) bad.push({ href: href.trim(), kind });
  });

  return { total, bad };
}

function scanImages($: CheerioAPI): { total: number; withAlt: number } {
  let total = 0;
  let withAlt = 0;

  $('img[src]').each((_, el) => {
    total++;
    const alt = $(el).attr('alt');
    if (alt !== undefined && alt.trim() !== '') withAlt++;
  });

  return { total, withAlt };
}

function scanJsonLd($: CheerioAPI): { found: boolean; invalidBlocks: string[] } {
  const invalidBlocks: string[] = [];
  let found = false;

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()?.trim();
    if (!raw) {
      invalidBlocks.push('(empty block)');
      return;
    }
    found = true;
    try {
      JSON.parse(raw);
    } catch {
      invalidBlocks.push(raw.slice(0, 120));
    }
  });

  return { found, invalidBlocks };
}

function getOgMeta($: CheerioAPI, property: string): string {
  return (
    $(`meta[property="${property}"]`).attr('content') ??
    $(`meta[name="${property}"]`).attr('content') ??
    ''
  ).trim();
}

function buildMetrics($: CheerioAPI): PageMetrics {
  const title = $('title').text().trim();
  const description = ($('meta[name="description"]').attr('content') ?? '').trim();
  const anchors = scanAnchors($);
  const images = scanImages($);
  const jsonLd = scanJsonLd($);

  return {
    title,
    description,
    titleLength: title.length,
    descriptionLength: description.length,
    h1Count: $('h1').length,
    bodyTextLength: $('body').text().replace(/\s+/g, ' ').trim().length,
    anchorTotal: anchors.total,
    anchorBadCount: anchors.bad.length,
    imageTotal: images.total,
    imageAltCoverage: images.total === 0 ? 1 : images.withAlt / images.total,
    htmlLang: ($('html').attr('lang') ?? '').trim(),
    hasJsonLd: jsonLd.found,
    hasOgTitle: getOgMeta($, 'og:title').length > 0,
    hasOgImage: getOgMeta($, 'og:image').length > 0,
    robotsContent: ($('meta[name="robots"]').attr('content') ?? '').trim(),
  };
}

function checkCoreSeo($: CheerioAPI, url: string, metrics: PageMetrics, rules: AuditRules): SeoIssue[] {
  const issues: SeoIssue[] = [];

  if (!metrics.title) {
    issues.push({ ruleId: 'title.missing', category: 'core', level: 'error', message: '缺失 <title> 标签或内容为空' });
  } else {
    for (const pattern of rules.forbiddenTitlePatterns) {
      if (pattern.test(metrics.title)) {
        issues.push({
          ruleId: 'title.forbidden',
          category: 'core',
          level: 'error',
          message: 'Title 含非法占位符',
          actual: metrics.title,
        });
        break;
      }
    }
    for (const pattern of rules.soft404TitlePatterns) {
      if (pattern.test(metrics.title)) {
        issues.push({
          ruleId: 'soft404.title',
          category: 'core',
          level: 'error',
          message: 'Title 疑似 Soft-404 错误页',
          actual: metrics.title,
        });
        break;
      }
    }
  }

  if (!metrics.description) {
    issues.push({
      ruleId: 'description.missing',
      category: 'core',
      level: 'error',
      message: '缺失 <meta name="description"> 或 content 为空',
    });
  } else if (metrics.description.length < rules.descriptionMinLength) {
    issues.push({
      ruleId: 'description.short',
      category: 'core',
      level: 'warn',
      message: `Description 过短（${metrics.description.length} 字符，建议 ≥ ${rules.descriptionMinLength}）`,
      actual: metrics.description.slice(0, 80),
    });
  }

  const canonical = $('link[rel="canonical"]').attr('href')?.trim();
  if (rules.requireCanonical && !canonical) {
    issues.push({
      ruleId: 'canonical.missing',
      category: 'core',
      level: 'error',
      message: '缺失 <link rel="canonical">',
    });
  } else if (canonical && rules.canonicalMustMatchUrl) {
    try {
      const canonicalUrl = new URL(canonical, url);
      const pageUrl = new URL(url);
      if (canonicalUrl.origin !== pageUrl.origin || canonicalUrl.pathname !== pageUrl.pathname) {
        issues.push({
          ruleId: 'canonical.mismatch',
          category: 'core',
          level: 'warn',
          message: 'Canonical 与当前页面 URL 不一致',
          actual: canonical,
        });
      }
    } catch {
      issues.push({
        ruleId: 'canonical.invalid',
        category: 'core',
        level: 'error',
        message: 'Canonical URL 格式无效',
        actual: canonical,
      });
    }
  }

  if (rules.requireH1) {
    if (metrics.h1Count === 0) {
      issues.push({ ruleId: 'h1.missing', category: 'core', level: 'error', message: '缺失 <h1> 标签' });
    } else if (metrics.h1Count > 1) {
      issues.push({
        ruleId: 'h1.multiple',
        category: 'core',
        level: 'error',
        message: `<h1> 数量异常（当前 ${metrics.h1Count} 个，应为 1 个）`,
      });
    }
  }

  if (metrics.bodyTextLength < rules.minBodyTextLength) {
    issues.push({
      ruleId: 'body.thin',
      category: 'core',
      level: 'error',
      message: `页面文本过少（${metrics.bodyTextLength} 字符），疑似白屏或 SSG 渲染失败`,
    });
  }

  return issues;
}

function checkAnchorHealth($: CheerioAPI, rules: AuditRules): SeoIssue[] {
  if (!rules.checkAnchorHealth) return [];
  const { bad } = scanAnchors($);
  const issues: SeoIssue[] = [];

  const grouped = new Map<BadAnchorKind, number>();
  for (const item of bad) {
    grouped.set(item.kind, (grouped.get(item.kind) ?? 0) + 1);
  }

  for (const [kind, count] of grouped) {
    issues.push({
      ruleId: `anchor.${kind}`,
      category: 'link-health',
      level: 'error',
      message: `发现 ${count} 个无效占位链接（${ANCHOR_LABELS[kind]}），浪费爬虫抓取配额`,
      actual: bad.filter((b) => b.kind === kind).slice(0, 3).map((b) => b.href).join(', '),
    });
  }

  return issues;
}

function checkImageAlt(metrics: PageMetrics, rules: AuditRules): SeoIssue[] {
  if (metrics.imageTotal === 0) return [];

  const coverage = metrics.imageAltCoverage;
  const pct = Math.round(coverage * 100);
  const missing = metrics.imageTotal - Math.round(coverage * metrics.imageTotal);

  if (coverage < rules.minImageAltCoverageRatio) {
    return [{
      ruleId: 'image.alt.coverage',
      category: 'accessibility',
      level: 'error',
      message: `图片 alt 覆盖率不达标（${pct}%，要求 100%）；${missing}/${metrics.imageTotal} 张缺失有效 alt`,
    }];
  }

  if (missing > 0) {
    return [{
      ruleId: 'image.alt.partial',
      category: 'accessibility',
      level: 'warn',
      message: `部分图片缺失 alt（${missing}/${metrics.imageTotal}，覆盖率 ${pct}%）`,
    }];
  }

  return [];
}

function checkRobots(metrics: PageMetrics, rules: AuditRules): SeoIssue[] {
  if (!rules.forbidNoindex || !metrics.robotsContent) return [];

  if (/\bnoindex\b/i.test(metrics.robotsContent)) {
    return [{
      ruleId: 'robots.noindex',
      category: 'safety',
      level: 'error',
      message: '生产环境禁止 noindex：meta[name="robots"] 含 noindex，页面将被排除索引',
      actual: metrics.robotsContent,
    }];
  }

  return [];
}

function checkHtmlLang(metrics: PageMetrics, rules: AuditRules): SeoIssue[] {
  if (!rules.requireHtmlLang) return [];

  if (!metrics.htmlLang) {
    return [{
      ruleId: 'html.lang.missing',
      category: 'semantic',
      level: 'error',
      message: '缺失 <html lang="..."> 语种声明',
    }];
  }

  if (rules.expectedLang && metrics.htmlLang.toLowerCase() !== rules.expectedLang.toLowerCase()) {
    return [{
      ruleId: 'html.lang.mismatch',
      category: 'semantic',
      level: 'error',
      message: `html lang 与预期语种不一致（当前 "${metrics.htmlLang}"，预期 "${rules.expectedLang}"）`,
    }];
  }

  return [];
}

function checkJsonLd($: CheerioAPI, rules: AuditRules): SeoIssue[] {
  if (!rules.requireJsonLd) return [];

  const { found, invalidBlocks } = scanJsonLd($);
  const issues: SeoIssue[] = [];

  if (!found) {
    issues.push({
      ruleId: 'jsonld.missing',
      category: 'smart-search',
      level: 'error',
      message: '缺失 JSON-LD 结构化数据（<script type="application/ld+json">）',
    });
    return issues;
  }

  if (invalidBlocks.length > 0) {
    issues.push({
      ruleId: 'jsonld.invalid',
      category: 'smart-search',
      level: 'error',
      message: `JSON-LD 无法通过 JSON.parse 校验（${invalidBlocks.length} 处无效）`,
      actual: invalidBlocks[0],
    });
  }

  return issues;
}

function checkOgTags(metrics: PageMetrics, rules: AuditRules): SeoIssue[] {
  if (!rules.requireOgTags) return [];

  const issues: SeoIssue[] = [];

  if (!metrics.hasOgTitle) {
    issues.push({
      ruleId: 'og.title.missing',
      category: 'social',
      level: 'error',
      message: '缺失 og:title 社交分享标签',
    });
  }

  if (!metrics.hasOgImage) {
    issues.push({
      ruleId: 'og.image.missing',
      category: 'social',
      level: 'error',
      message: '缺失 og:image 社交分享标签',
    });
  }

  return issues;
}

export function validateHtmlContent(
  html: string,
  url: string,
  rules: AuditRules,
): { issues: SeoIssue[]; metrics: PageMetrics } {
  const $ = cheerio.load(html);
  const metrics = buildMetrics($);

  const issues = [
    ...checkCoreSeo($, url, metrics, rules),
    ...checkAnchorHealth($, rules),
    ...checkImageAlt(metrics, rules),
    ...checkRobots(metrics, rules),
    ...checkHtmlLang(metrics, rules),
    ...checkJsonLd($, rules),
    ...checkOgTags(metrics, rules),
  ];

  return { issues, metrics };
}

export function buildPageResult(
  url: string,
  statusCode: number,
  html: string | null,
  rules: AuditRules,
  durationMs: number,
  httpError?: string,
): PageAuditResult {
  if (httpError || statusCode < 200 || statusCode >= 300) {
    return {
      url,
      statusCode,
      passed: false,
      issues: [{
        ruleId: 'http.error',
        category: 'core',
        level: 'error',
        message: httpError ?? `HTTP 状态码异常: ${statusCode}`,
      }],
      metrics: { ...EMPTY_METRICS },
      durationMs,
    };
  }

  const { issues, metrics } = validateHtmlContent(html!, url, rules);
  const hasError = issues.some((i) => i.level === 'error');
  return {
    url,
    statusCode,
    passed: !hasError,
    issues,
    metrics,
    durationMs,
  };
}
