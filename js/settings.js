/* settings.js — Settings page logic */

const DEFAULT_FEEDS = [
  { id: 'hn',    name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { id: 'verge', name: 'The Verge',   url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'tc',    name: 'TechCrunch',  url: 'https://techcrunch.com/feed/' }
];


/* ── Helpers ─────────────────────────────────────────────────────────────── */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid() { return Math.random().toString(36).slice(2, 9); }

function flashStatus(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2000);
}

/* ── RSS Feeds ───────────────────────────────────────────────────────────── */

async function initFeeds() {
  const feedsList = document.getElementById('feeds-list');
  const addForm   = document.getElementById('add-feed-form');
  if (!feedsList || !addForm) return;

  async function getFeeds() {
    return (await StorageSync.get('rssFeeds')) ?? DEFAULT_FEEDS;
  }

  async function renderFeeds() {
    const feeds = await getFeeds();

    if (!feeds.length) {
      feedsList.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No feeds added.</p>';
      return;
    }

    feedsList.innerHTML = feeds.map(feed => `
      <div class="list-item" data-id="${escapeHtml(feed.id)}">
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(feed.name)}</div>
          <div class="list-item-url">${escapeHtml(feed.url)}</div>
        </div>
        <button class="btn btn-danger btn-del-feed" data-id="${escapeHtml(feed.id)}"
          style="padding:5px 10px;font-size:12px">Remove</button>
      </div>
    `).join('');

    feedsList.querySelectorAll('.btn-del-feed').forEach(btn => {
      btn.addEventListener('click', async () => {
        const feeds = await getFeeds();
        const updated = feeds.filter(f => f.id !== btn.dataset.id);
        await StorageSync.set('rssFeeds', updated);
        renderFeeds();
      });
    });
  }

  addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('feed-name').value.trim();
    const url  = document.getElementById('feed-url').value.trim();
    if (!name || !url) return;

    const feeds = await getFeeds();
    feeds.push({ id: uid(), name, url });
    await StorageSync.set('rssFeeds', feeds);

    addForm.reset();
    renderFeeds();
  });

  renderFeeds();
}

/* ── Google Integrations ─────────────────────────────────────────────────── */

async function initGoogleIntegrations() {
  const container = document.getElementById('google-integrations');
  if (!container) return;

  // Read token stored by the widgets (launchWebAuthFlow approach)
  async function getToken(key) {
    const data = await StorageLocal.get(key);
    if (!data) return null;
    if (Date.now() > data.expiry - 60_000) return null;
    return data.token;
  }

  // ── Calendar section ──────────────────────────────────────────────────────

  async function buildCalSection(token) {
    if (!token) return '';
    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) return '';
      const cals        = (await res.json()).items ?? [];
      const selectedIds = (await StorageSync.get('calSelectedCals')) ?? [];

      const rows = cals.map(cal => {
        // Checked when: no preference saved (all on by default) OR this ID is in the list
        const checked = !selectedIds.length || selectedIds.includes(cal.id);
        const color   = /^#[0-9a-fA-F]{3,8}$/.test(cal.backgroundColor ?? '')
          ? cal.backgroundColor : '#3a6fcc';
        return `
          <label class="cal-check-label">
            <input type="checkbox" class="cal-checkbox" data-id="${escapeHtml(cal.id)}"
              ${checked ? 'checked' : ''} />
            <span class="cal-color-swatch" style="background:${color}"></span>
            ${escapeHtml(cal.summary)}
          </label>`;
      }).join('');

      return `
        <div class="service-sub-section">
          <div class="sub-section-label">Calendars to show</div>
          <div class="cal-checkbox-list">${rows}</div>
          <div class="status-msg" id="cal-sel-status" style="display:none">Saved!</div>
        </div>`;
    } catch { return ''; }
  }

  // ── Tasks section ─────────────────────────────────────────────────────────

  async function buildTasksSection(token) {
    if (!token) return '';
    try {
      const res = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) return '';
      const lists      = (await res.json()).items ?? [];
      const selectedId = await StorageSync.get('tasksSelectedList');

      const options = lists.map(list => {
        const sel = selectedId ? selectedId === list.id : lists[0]?.id === list.id;
        return `<option value="${escapeHtml(list.id)}" ${sel ? 'selected' : ''}>${escapeHtml(list.title)}</option>`;
      }).join('');

      return `
        <div class="service-sub-section">
          <div class="sub-section-label">Task list to show</div>
          <select class="form-input" id="tasks-list-select" style="max-width:260px">${options}</select>
          <div class="status-msg" id="tasks-sel-status" style="display:none">Saved!</div>
        </div>`;
    } catch { return ''; }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  async function render() {
    const calToken   = await getToken('oauth_cal');
    const tasksToken = await getToken('oauth_tasks');
    const [calSub, tasksSub] = await Promise.all([
      buildCalSection(calToken),
      buildTasksSection(tasksToken)
    ]);

    container.innerHTML = `
      <div class="google-service-row">
        <div class="google-service-header">
          <div>
            <div class="google-row-name">Google Calendar</div>
            <div class="google-status ${calToken ? 'connected' : ''}">
              ${calToken ? 'Connected' : 'Not connected — use the Calendar widget on the dashboard to connect'}
            </div>
          </div>
          ${calToken
            ? `<button class="btn btn-ghost" id="cal-disconnect-btn" style="font-size:12px;padding:5px 12px">Disconnect</button>`
            : ''}
        </div>
        ${calSub}
      </div>

      <div class="google-service-row">
        <div class="google-service-header">
          <div>
            <div class="google-row-name">Google Tasks</div>
            <div class="google-status ${tasksToken ? 'connected' : ''}">
              ${tasksToken ? 'Connected' : 'Not connected — use the Tasks widget on the dashboard to connect'}
            </div>
          </div>
          ${tasksToken
            ? `<button class="btn btn-ghost" id="tasks-disconnect-btn" style="font-size:12px;padding:5px 12px">Disconnect</button>`
            : ''}
        </div>
        ${tasksSub}
      </div>`;

    // Disconnect buttons
    document.getElementById('cal-disconnect-btn')?.addEventListener('click', async () => {
      await StorageLocal.remove('oauth_cal');
      render();
    });
    document.getElementById('tasks-disconnect-btn')?.addEventListener('click', async () => {
      await StorageLocal.remove('oauth_tasks');
      render();
    });

    // Calendar checkboxes — save all checked IDs on any change
    container.querySelectorAll('.cal-checkbox').forEach(cb => {
      cb.addEventListener('change', async () => {
        const checked = [...container.querySelectorAll('.cal-checkbox:checked')].map(c => c.dataset.id);
        await StorageSync.set('calSelectedCals', checked);
        flashStatus('cal-sel-status');
      });
    });

    // Task list dropdown
    document.getElementById('tasks-list-select')?.addEventListener('change', async e => {
      await StorageSync.set('tasksSelectedList', e.target.value);
      flashStatus('tasks-sel-status');
    });
  }

  render();
}

/* ── Back Link ───────────────────────────────────────────────────────────── */

function initBackLink() {
  document.getElementById('back-link')?.addEventListener('click', e => {
    e.preventDefault();
    window.close();
  });
}

/* ── Boot ────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initBackLink();
  initFeeds();
  initGoogleIntegrations();
});
