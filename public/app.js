/** @typedef {{ ruleId: string; level: string; message: string; actual?: string }} Issue */
/** @typedef {{ url: string; statusCode: number; passed: boolean; issues: Issue[]; metrics: Record<string, unknown>; durationMs: number }} PageResult */
/** @typedef {{ sitemap: string; checkedAt: string; summary: Record<string, number>; results: PageResult[] }} AuditReport */

const form = document.getElementById('audit-form');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const progressSection = document.getElementById('progress-section');
const progressLabel = document.getElementById('progress-label');
const progressCount = document.getElementById('progress-count');
const progressFill = document.getElementById('progress-fill');
const progressUrl = document.getElementById('progress-url');
const summarySection = document.getElementById('summary-section');
const filterSection = document.getElementById('filter-section');
const resultsSection = document.getElementById('results-section');
const resultsList = document.getElementById('results-list');
const emptyState = document.getElementById('empty-state');
const exportBtn = document.getElementById('export-btn');

/** @type {AbortController | null} */
let abortController = null;
/** @type {PageResult[]} */
let allResults = [];
/** @type {AuditReport | null} */
let lastReport = null;
/** @type {string} */
let activeFilter = 'all';

const RULE_LABELS = {
  'title.missing': 'Title',
  'title.forbidden': 'Title',
  'soft404.title': 'Soft-404',
  'description.missing': 'Description',
  'description.short': 'Description',
  'canonical.missing': 'Canonical',
  'canonical.mismatch': 'Canonical',
  'canonical.invalid': 'Canonical',
  'h1.missing': 'H1',
  'h1.multiple': 'H1',
  'body.thin': '白屏',
  'http.error': 'HTTP',
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await startAudit();
});

cancelBtn.addEventListener('click', () => {
  abortController?.abort();
});

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('filter-btn--active'));
    btn.classList.add('filter-btn--active');
    activeFilter = btn.dataset.filter;
    renderResults();
  });
});

exportBtn.addEventListener('click', () => {
  if (!lastReport) return;
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `seo-audit-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

async function startAudit() {
  const fd = new FormData(form);
  const body = {
    sitemapUrl: fd.get('sitemapUrl'),
    concurrency: Number(fd.get('concurrency')) || 5,
    timeout: Number(fd.get('timeout')) || 12000,
  };
  const maxUrls = fd.get('maxUrls');
  if (maxUrls) body.maxUrls = Number(maxUrls);

  abortController = new AbortController();
  allResults = [];
  lastReport = null;
  activeFilter = 'all';

  setRunning(true);
  emptyState.hidden = true;
  progressSection.hidden = false;
  summarySection.hidden = true;
  filterSection.hidden = true;
  resultsSection.hidden = true;
  resultsList.innerHTML = '';

  progressLabel.textContent = '正在加载 Sitemap…';
  progressCount.textContent = '0 / 0';
  progressFill.style.width = '0%';
  progressUrl.textContent = '';

  try {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          handleEvent(event);
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      alert(`审计失败: ${err.message}`);
      emptyState.hidden = false;
    }
  } finally {
    setRunning(false);
    progressSection.hidden = true;
  }
}

function handleEvent(event) {
  switch (event.type) {
    case 'sitemap_loaded':
      progressLabel.textContent = '正在逐页检测…';
      progressCount.textContent = `0 / ${event.total}`;
      break;

    case 'checking':
      progressCount.textContent = `${event.index} / ${event.total}`;
      progressFill.style.width = `${(event.index / event.total) * 100}%`;
      progressUrl.textContent = event.url;
      break;

    case 'result':
      allResults.push(event.result);
      break;

    case 'complete':
      lastReport = event.report;
      showSummary(event.report.summary);
      filterSection.hidden = false;
      resultsSection.hidden = false;
      renderResults();
      break;

    case 'error':
      alert(`错误: ${event.message}`);
      break;
  }
}

function showSummary(summary) {
  summarySection.hidden = false;
  document.getElementById('stat-total').textContent = summary.total;
  document.getElementById('stat-passed').textContent = summary.passed;
  document.getElementById('stat-failed').textContent = summary.failed;
  document.getElementById('stat-warnings').textContent = summary.warnings;
}

function renderResults() {
  const filtered = allResults.filter((r) => {
    if (activeFilter === 'failed') return !r.passed;
    if (activeFilter === 'passed') return r.passed;
    return true;
  });

  resultsList.innerHTML = filtered.length === 0
    ? '<p style="text-align:center;color:var(--text-dim);padding:2rem;font-size:0.875rem">暂无匹配结果</p>'
    : filtered.map(renderCard).join('');

  resultsList.querySelectorAll('.result-card__header').forEach((header) => {
    header.addEventListener('click', () => {
      header.closest('.result-card').classList.toggle('result-card--open');
    });
  });
}

function renderCard(result) {
  const statusClass = result.passed ? 'result-card--pass' : 'result-card--fail';
  const statusIcon = result.passed ? '✓' : '✕';
  const title = result.metrics?.title || '(无 Title)';

  const issuesHtml = result.issues.length === 0
    ? '<li class="issue-item"><span class="issue-text">无问题</span></li>'
    : result.issues.map((issue) => `
        <li class="issue-item">
          <span class="issue-badge issue-badge--${issue.level}">${issue.level}</span>
          <div>
            <span class="issue-text">${esc(issue.message)}</span>
            <span class="issue-actual">${RULE_LABELS[issue.ruleId] ?? issue.ruleId}${issue.actual ? ` · ${esc(issue.actual)}` : ''}</span>
          </div>
        </li>
      `).join('');

  const m = result.metrics ?? {};
  return `
    <article class="result-card ${statusClass}">
      <div class="result-card__header">
        <span class="result-card__status">${statusIcon}</span>
        <div class="result-card__main">
          <div class="result-card__url">${esc(result.url)}</div>
          <div class="result-card__title">${esc(title)}</div>
        </div>
        <div class="result-card__meta">
          <span>${result.statusCode || '—'}</span>
          <span>${result.durationMs}ms</span>
        </div>
      </div>
      <div class="result-card__body">
        <ul class="issue-list">${issuesHtml}</ul>
        <div class="metrics-grid">
          <div class="metric"><div class="metric__label">Title 长度</div><div class="metric__value">${m.titleLength ?? 0}</div></div>
          <div class="metric"><div class="metric__label">Desc 长度</div><div class="metric__value">${m.descriptionLength ?? 0}</div></div>
          <div class="metric"><div class="metric__label">H1 数量</div><div class="metric__value">${m.h1Count ?? 0}</div></div>
          <div class="metric"><div class="metric__label">正文长度</div><div class="metric__value">${m.bodyTextLength ?? 0}</div></div>
        </div>
      </div>
    </article>
  `;
}

function setRunning(running) {
  submitBtn.disabled = running;
  cancelBtn.hidden = !running;
  form.querySelectorAll('input').forEach((el) => { el.disabled = running; });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
