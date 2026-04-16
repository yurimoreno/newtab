/* quote.js — Quote of the Day widget */

const QuoteWidget = (() => {
  const CONTAINER = 'widget-quote';
  const API = 'https://zenquotes.io/api/today';
  const TTL = 24 * 60 * 60 * 1000;

  function renderLoading(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Quote of the Day</span>
      </div>
      <div class="loading-block">
        <div class="skeleton wide"></div>
        <div class="skeleton wide"></div>
        <div class="skeleton mid"></div>
        <div class="skeleton short" style="margin-top:10px"></div>
      </div>`;
  }

  function renderQuote(el, text, author) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Quote of the Day</span>
      </div>
      <div class="quote-body">
        <p class="quote-text">${escapeHtml(text)}</p>
        <p class="quote-author">${escapeHtml(author)}</p>
      </div>`;
  }

  function renderError(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Quote of the Day</span>
      </div>
      <div class="widget-error">Could not load quote.</div>`;
  }

  async function init() {
    const el = document.getElementById(CONTAINER);
    if (!el) return;
    renderLoading(el);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const cached = await StorageLocal.get('quote');

      if (cached && cached.date === today) {
        renderQuote(el, cached.text, cached.author);
        return;
      }

      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const [data] = await res.json();

      const text   = data.q ?? 'No quote available.';
      const author = data.a ?? 'Unknown';

      await StorageLocal.set('quote', { date: today, text, author });
      renderQuote(el, text, author);
    } catch {
      renderError(el);
    }
  }

  return { init };
})();

/* ── Shared utilities (loaded once, used by all widgets) ── */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
  } catch {}
  return '#';
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return mins + 'm ago';
  if (hours < 24) return hours + 'h ago';
  if (days < 7)   return days + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatEventTime(startObj) {
  if (startObj.date) return 'All day';
  if (!startObj.dateTime) return '';
  const d = new Date(startObj.dateTime);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
