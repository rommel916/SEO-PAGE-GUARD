export type IssueLevel = 'error' | 'warn';

export interface SeoIssue {
  ruleId: string;
  level: IssueLevel;
  message: string;
  actual?: string;
}

export interface PageMetrics {
  titleLength: number;
  descriptionLength: number;
  h1Count: number;
  bodyTextLength: number;
  title: string;
  description: string;
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
