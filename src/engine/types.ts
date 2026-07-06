export type IssueLevel = 'error' | 'warn';

export type RuleCategory =
  | 'core'
  | 'safety'
  | 'semantic'
  | 'smart-search'
  | 'social'
  | 'link-health'
  | 'accessibility';

export interface SeoIssue {
  ruleId: string;
  level: IssueLevel;
  category: RuleCategory;
  message: string;
  actual?: string;
}

export interface PageMetrics {
  title: string;
  description: string;
  titleLength: number;
  descriptionLength: number;
  h1Count: number;
  bodyTextLength: number;
  anchorTotal: number;
  anchorBadCount: number;
  imageTotal: number;
  imageAltCoverage: number;
  htmlLang: string;
  hasJsonLd: boolean;
  hasOgTitle: boolean;
  hasOgImage: boolean;
  robotsContent: string;
}

export interface PageAuditResult {
  url: string;
  statusCode: number;
  passed: boolean;
  issues: SeoIssue[];
  metrics: PageMetrics;
  durationMs: number;
}

export interface AuditRules {
  minBodyTextLength: number;
  descriptionMinLength: number;
  forbiddenTitlePatterns: RegExp[];
  soft404TitlePatterns: RegExp[];
  requireCanonical: boolean;
  requireH1: boolean;
  canonicalMustMatchUrl: boolean;
  checkAnchorHealth: boolean;
  minImageAltCoverageRatio: number;
  forbidNoindex: boolean;
  requireHtmlLang: boolean;
  expectedLang: string | null;
  requireJsonLd: boolean;
  requireOgTags: boolean;
}

export interface AuditOptions {
  sitemapUrl: string;
  concurrency: number;
  timeout: number;
  maxUrls: number | null;
  rules: AuditRules;
  userAgent: string;
}

export interface AuditSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  httpErrors: number;
}

export interface AuditReport {
  sitemap: string;
  checkedAt: string;
  summary: AuditSummary;
  results: PageAuditResult[];
}

export type AuditProgressEvent =
  | { type: 'sitemap_loaded'; total: number }
  | { type: 'checking'; url: string; index: number; total: number }
  | { type: 'result'; result: PageAuditResult }
  | { type: 'complete'; report: AuditReport }
  | { type: 'error'; message: string };

export const EMPTY_METRICS: PageMetrics = {
  title: '',
  description: '',
  titleLength: 0,
  descriptionLength: 0,
  h1Count: 0,
  bodyTextLength: 0,
  anchorTotal: 0,
  anchorBadCount: 0,
  imageTotal: 0,
  imageAltCoverage: 1,
  htmlLang: '',
  hasJsonLd: false,
  hasOgTitle: false,
  hasOgImage: false,
  robotsContent: '',
};
