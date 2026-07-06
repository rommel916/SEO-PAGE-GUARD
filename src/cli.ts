#!/usr/bin/env node
import { DEFAULT_AUDIT_OPTIONS, DEFAULT_RULES } from './config/defaults.js';
import { runAudit } from './engine/audit-pipeline.js';
import type { AuditOptions } from './engine/types.js';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--sitemap' || arg === '-s') args.sitemap = argv[++i];
    else if (arg === '--concurrency' || arg === '-c') args.concurrency = argv[++i];
    else if (arg === '--max-urls' || arg === '-m') args.maxUrls = argv[++i];
    else if (arg === '--format' || arg === '-f') args.format = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = '1';
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.sitemap) {
  console.log(`
seo-guard audit — Sitemap-driven SEO quality checker

Usage:
  seo-guard --sitemap <url> [options]

Options:
  -s, --sitemap <url>       Sitemap URL or local file path (required)
  -c, --concurrency <n>     Concurrent requests (default: 5)
  -m, --max-urls <n>        Limit URLs to check
  -f, --format <console|json>  Output format (default: console)
  -h, --help                Show help
`);
  process.exit(args.help ? 0 : 2);
}

const options: AuditOptions = {
  sitemapUrl: args.sitemap,
  concurrency: Number(args.concurrency) || DEFAULT_AUDIT_OPTIONS.concurrency,
  timeout: DEFAULT_AUDIT_OPTIONS.timeout,
  maxUrls: args.maxUrls ? Number(args.maxUrls) : null,
  rules: { ...DEFAULT_RULES },
  userAgent: DEFAULT_AUDIT_OPTIONS.userAgent,
};

const format = args.format ?? 'console';
let hasError = false;

const report = await runAudit(options, (event) => {
  if (event.type === 'sitemap_loaded') {
    console.log(`📂 Sitemap loaded: ${event.total} URLs`);
  } else if (event.type === 'checking' && format === 'console') {
    process.stdout.write(`\r🔍 Checking ${event.index}/${event.total}...`);
  } else if (event.type === 'result' && !event.result.passed) {
    hasError = true;
    if (format === 'console') {
      console.log(`\n❌ ${event.result.url}`);
      for (const issue of event.result.issues) {
        console.log(`   [${issue.level}] ${issue.message}`);
      }
    }
  } else if (event.type === 'error') {
    console.error(`💥 ${event.message}`);
    process.exit(2);
  }
});

if (format === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n\n✅ Done: ${report.summary.passed} passed, ${report.summary.failed} failed`);
}

process.exit(hasError || report.summary.failed > 0 ? 1 : 0);
