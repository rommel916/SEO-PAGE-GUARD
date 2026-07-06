import * as cheerio from 'cheerio';
import type { AuditRules, PageAuditResult, PageMetrics, SeoIssue } from './types.js';

function buildMetrics($: cheerio.CheerioAPI): PageMetrics {
  const title = $('title').text().trim();
  const description = ($('meta[name="description"]').attr('content') ?? '').trim();
  return {
    title,
    description,
    titleLength: title.length,
    descriptionLength: description.length,
    h1Count: $('h1').length,
    bodyTextLength: $('body').text().replace(/\s+/g, ' ').trim().length,
  };
}

export function validateHtmlContent(
  html: string,
  url: string,
  rules: AuditRules,
): { issues: SeoIssue[]; metrics: PageMetrics } {
  const $ = cheerio.load(html);
  const metrics = buildMetrics($);
  const issues: SeoIssue[] = [];

  if (!metrics.title) {
    issues.push({ ruleId: 'title.missing', level: 'error', message: '缺失 <title> 标签或内容为空' });
  } else {
    for (const pattern of rules.forbiddenTitlePatterns) {
      if (pattern.test(metrics.title)) {
        issues.push({
          ruleId: 'title.forbidden',
          level: 'error',
          message: `Title 含非法占位符`,
          actual: metrics.title,
        });
        break;
      }
    }
    for (const pattern of rules.soft404TitlePatterns) {
      if (pattern.test(metrics.title)) {
        issues.push({
          ruleId: 'soft404.title',
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
      level: 'error',
      message: '缺失 <meta name="description"> 或 content 为空',
    });
  } else if (metrics.description.length < rules.descriptionMinLength) {
    issues.push({
      ruleId: 'description.short',
      level: 'warn',
      message: `Description 过短（${metrics.description.length} 字符，建议 ≥ ${rules.descriptionMinLength}）`,
      actual: metrics.description.slice(0, 80),
    });
  }

  const canonical = $('link[rel="canonical"]').attr('href')?.trim();
  if (rules.requireCanonical && !canonical) {
    issues.push({
      ruleId: 'canonical.missing',
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
          level: 'warn',
          message: 'Canonical 与当前页面 URL 不一致',
          actual: canonical,
        });
      }
    } catch {
      issues.push({
        ruleId: 'canonical.invalid',
        level: 'error',
        message: 'Canonical URL 格式无效',
        actual: canonical,
      });
    }
  }

  if (rules.requireH1) {
    if (metrics.h1Count === 0) {
      issues.push({ ruleId: 'h1.missing', level: 'error', message: '缺失 <h1> 标签' });
    } else if (metrics.h1Count > 1) {
      issues.push({
        ruleId: 'h1.multiple',
        level: 'error',
        message: `<h1> 数量异常（当前 ${metrics.h1Count} 个，应为 1 个）`,
      });
    }
  }

  if (metrics.bodyTextLength < rules.minBodyTextLength) {
    issues.push({
      ruleId: 'body.thin',
      level: 'error',
      message: `页面文本过少（${metrics.bodyTextLength} 字符），疑似白屏或 SSG 渲染失败`,
    });
  }

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
      issues: [
        {
          ruleId: 'http.error',
          level: 'error',
          message: httpError ?? `HTTP 状态码异常: ${statusCode}`,
        },
      ],
      metrics: {
        title: '',
        description: '',
        titleLength: 0,
        descriptionLength: 0,
        h1Count: 0,
        bodyTextLength: 0,
      },
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
