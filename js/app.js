/* app.js — Bootstrap: greeting, sun arc, widget visibility + collapse, drag */

// ── Widget registry ───────────────────────────────────────────────────────────
const ALL_WIDGETS = [
  { id: 'widget-quote',      name: 'Quote of the Day'   },
  { id: 'widget-currency',   name: 'Currency Converter' },
  { id: 'widget-finance',    name: 'Finance Tracker'    },
  { id: 'widget-quicklinks', name: 'Quick Links'        },
  { id: 'widget-rss-hn',    name: 'Hacker News'        },
  { id: 'widget-rss-verge', name: 'The Verge'          },
  { id: 'widget-rss-tc',   name: 'TechCrunch'         },
  { id: 'widget-calendar',  name: 'Google Calendar'    },
  { id: 'widget-tasks',     name: 'Google Tasks'       },
];

// ── Sun-position arc ──────────────────────────────────────────────────────────
function renderSunArc() {
  const svg = document.getElementById('sun-arc-svg');
  if (!svg) return;

  const W = 110, H = 40;
  const cx = W / 2, cy = H;   // horizon at the bottom edge
  const rx = cx - 6;           // 49 — horizontal radius
  const ry = H - 5;            // 35 — vertical radius

  const now  = new Date();
  const h    = now.getHours() + now.getMinutes() / 60;
  const RISE = 6, SET = 20;   // 6 AM → 8 PM (approximate)
  const t    = (h - RISE) / (SET - RISE);   // 0 at sunrise, 1 at sunset
  const tc   = Math.max(0, Math.min(1, t)); // clamped for position

  // θ sweeps π→0 (left to right across the arc)
  const theta = Math.PI * (1 - tc);
  const sunX  = +(cx + rx * Math.cos(theta)).toFixed(2);
  const sunY  = +(cy - ry * Math.sin(theta)).toFixed(2);
  const isDay = t >= 0 && t <= 1;

  const arcStroke = isDay ? 'rgba(251,191,36,0.35)' : 'rgba(148,163,184,0.18)';
  const arcPath   = `M 6 ${H} A ${rx} ${ry} 0 0 1 ${W - 6} ${H}`;

  svg.innerHTML = `
    <path d="${arcPath}" fill="none" stroke="${arcStroke}"
          stroke-width="1.5" stroke-linecap="round"/>
    ${isDay
      ? `<circle cx="${sunX}" cy="${sunY}" r="10" fill="rgba(251,191,36,0.12)"/>
         <circle cx="${sunX}" cy="${sunY}" r="5.5" fill="#fbbf24"/>`
      : `<text x="${cx}" y="${cy - 4}" text-anchor="middle"
               font-size="13" fill="rgba(148,163,184,0.45)">🌙</text>`}`;
}

// ── Greeting + date ───────────────────────────────────────────────────────────
function initGreeting() {
  function render() {
    const now  = new Date();
    const h    = now.getHours();
    const salutation = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    const greetEl = document.getElementById('greeting-text');
    const dateEl  = document.getElementById('topbar-date');
    if (greetEl) greetEl.textContent = salutation;
    if (dateEl)  dateEl.textContent  = dateStr;
    renderSunArc();
  }

  render();
  // Refresh arc every minute, date text at midnight
  setInterval(renderSunArc, 60_000);
  const now      = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  setTimeout(() => { render(); setInterval(render, 86_400_000); }, tomorrow - now);
}

// ── Widget visibility ─────────────────────────────────────────────────────────
async function getHiddenIds() {
  return (await StorageSync.get('hiddenWidgets')) ?? [];
}

async function applyVisibility() {
  const hidden = await getHiddenIds();
  ALL_WIDGETS.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (el) el.style.display = hidden.includes(id) ? 'none' : '';
  });
}

async function hideWidget(id) {
  const hidden = await getHiddenIds();
  if (!hidden.includes(id)) {
    await StorageSync.set('hiddenWidgets', [...hidden, id]);
  }
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
  refreshAddPanel();
}

async function showWidget(id) {
  const hidden = await getHiddenIds();
  await StorageSync.set('hiddenWidgets', hidden.filter(h => h !== id));
  const el = document.getElementById(id);
  if (el) el.style.display = '';
  refreshAddPanel();
}

// ── Widget collapse ───────────────────────────────────────────────────────────
async function getCollapsedIds() {
  return (await StorageSync.get('collapsedWidgets')) ?? [];
}

async function applyCollapsedState() {
  const ids = await getCollapsedIds();
  ids.forEach(id => document.getElementById(id)?.classList.add('collapsed'));
}

const CHEVRON_SVG = `
  <svg class="chevron-icon" width="10" height="6" viewBox="0 0 10 6"
       fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <polyline points="1 1 5 5 9 1"/>
  </svg>`;

function injectChevron(header) {
  if (header.querySelector('.widget-collapse-btn')) return;
  const widget = header.closest('.widget');
  if (!widget?.id) return;

  const btn = document.createElement('button');
  btn.className = 'icon-btn widget-collapse-btn';
  btn.title     = 'Collapse / expand';
  btn.innerHTML = CHEVRON_SVG;

  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const isNowCollapsed = widget.classList.toggle('collapsed');
    const ids  = await getCollapsedIds();
    const next = isNowCollapsed
      ? [...new Set([...ids, widget.id])]
      : ids.filter(id => id !== widget.id);
    await StorageSync.set('collapsedWidgets', next);
  });

  // Always the last child → always flush to the far right, consistent on every card
  header.appendChild(btn);
}

function observeForChevrons() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard) return;
  dashboard.querySelectorAll('.widget-header').forEach(injectChevron);
  new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('widget-header')) injectChevron(node);
        else node.querySelectorAll?.('.widget-header').forEach(injectChevron);
      }
    }
  }).observe(dashboard, { childList: true, subtree: true });
}

// ── Add-widget panel ──────────────────────────────────────────────────────────
async function refreshAddPanel() {
  const panel = document.getElementById('add-panel');
  if (!panel) return;
  const hidden  = await getHiddenIds();
  const missing = ALL_WIDGETS.filter(w => hidden.includes(w.id));
  const body    = panel.querySelector('.add-panel-body');
  if (!body) return;
  if (!missing.length) {
    body.innerHTML = '<p class="add-panel-empty">All widgets are visible</p>';
    return;
  }
  body.innerHTML = missing.map(w =>
    `<button class="add-widget-chip" data-id="${w.id}">${w.name}</button>`
  ).join('');
  body.querySelectorAll('.add-widget-chip').forEach(btn => {
    btn.addEventListener('click', () => showWidget(btn.dataset.id));
  });
}

// ── Edit mode ─────────────────────────────────────────────────────────────────
function initEditMode() {
  let editMode = false;
  const editBtn  = document.getElementById('edit-btn');
  const addPanel = document.getElementById('add-panel');

  function setEditMode(active) {
    editMode = active;
    document.body.classList.toggle('edit-mode', active);
    if (editBtn) {
      editBtn.innerHTML = active ? '✓&nbsp;Done' : '✎&nbsp;Edit';
      editBtn.classList.toggle('active', active);
    }
    if (addPanel) addPanel.classList.toggle('visible', active);
    if (active) refreshAddPanel();
  }

  editBtn?.addEventListener('click', () => setEditMode(!editMode));
}

// ── Remove-button injection ───────────────────────────────────────────────────
function injectRemoveBtn(header) {
  if (header.querySelector('.widget-remove-btn')) return;
  const widgetId = header.closest('.widget')?.id;
  if (!widgetId) return;
  const btn = document.createElement('button');
  btn.className   = 'icon-btn widget-remove-btn';
  btn.title       = 'Remove widget';
  btn.textContent = '×';
  btn.addEventListener('click', e => { e.stopPropagation(); hideWidget(widgetId); });
  header.appendChild(btn);
}

function observeForRemoveBtns() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard) return;
  dashboard.querySelectorAll('.widget-header').forEach(injectRemoveBtn);
  new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('widget-header')) injectRemoveBtn(node);
        else node.querySelectorAll?.('.widget-header').forEach(injectRemoveBtn);
      }
    }
  }).observe(dashboard, { childList: true, subtree: true });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initGreeting();

  document.getElementById('open-settings')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });

  await DragManager.loadAndApplyLayout();
  await applyVisibility();

  // Load all RSS feeds (including any custom ones added in Settings)
  // and create widget containers for feeds that don't have one yet.
  const allFeeds = (await StorageSync.get('rssFeeds')) ?? RssWidget.DEFAULT_FEEDS;
  allFeeds.forEach(feed => {
    const containerId = `widget-rss-${feed.id}`;
    if (!document.getElementById(containerId)) {
      const widget = document.createElement('div');
      widget.className = 'widget';
      widget.id = containerId;
      // Place into the column with the fewest widgets (prefer later columns)
      const cols = ['col-4', 'col-3', 'col-2', 'col-1']
        .map(id => document.getElementById(id))
        .filter(Boolean);
      const target = cols.reduce((a, b) => a.children.length <= b.children.length ? a : b);
      target.appendChild(widget);
    }
  });

  await Promise.allSettled([
    QuoteWidget.init(),
    CurrencyWidget.init(),
    FinanceWidget.init(),
    QuickLinksWidget.init(),
    ...allFeeds.map(f => RssWidget.init(f.id)),
    CalendarWidget.init(),
    TasksWidget.init()
  ]);

  window.addEventListener('google-auth-complete', () => {
    CalendarWidget.init();
    TasksWidget.init();
  });

  // Restore collapsed state after widgets have rendered their headers
  await applyCollapsedState();

  DragManager.init();
  observeForChevrons();    // inject ⌄ into every widget header
  observeForRemoveBtns();  // inject × (visible only in edit mode)
  initEditMode();
});
