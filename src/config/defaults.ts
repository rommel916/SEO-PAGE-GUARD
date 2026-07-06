import type { AuditRules } from './types.js';

export const DEFAULT_RULES: AuditRules = {
  minBodyTextLength: 150,
  descriptionMinLength: 50,
  forbiddenTitlePatterns: [/undefined/i, /null/i, /\b404\b/i],
  soft404TitlePatterns: [/not found/i, /页面不存在/, /错误/, /暂无页面/],
  requireCanonical: true,
  requireH1: true,
  canonicalMustMatchUrl: false,
};

export const DEFAULT_AUDIT_OPTIONS = {
  concurrency: 5,
  timeout: 12000,
  maxUrls: null as number | null,
  userAgent: 'SEO-Page-Guard/1.0 (Automated Health Checker)',
};
