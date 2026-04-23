/* calendar.js — Google Calendar via launchWebAuthFlow (works in Brave + Chrome) */

const CalendarWidget = (() => {
  const CONTAINER  = 'widget-calendar';
  const CLIENT_ID  = '890256513528-aql100cimv2ehm9c0omjetmf79oq39e9.apps.googleusercontent.com';
  const SCOPE      = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks';
  const TOKEN_KEY  = 'oauth_google';
  const API_BASE   = 'https://www.googleapis.com/calendar/v3';

  // ── Token storage ─────────────────────────────────────────────────────────

  async function getStoredToken() {
    const data = await StorageLocal.get(TOKEN_KEY);
    if (!data) return null;
    if (Date.now() > data.expiry - 60_000) return null;
    return data.token;
  }

  async function saveToken(token, expiresIn = 3600) {
    await StorageLocal.set(TOKEN_KEY, {
      token,
      expiry: Date.now() + expiresIn * 1000
    });
  }

  async function clearToken() {
    await StorageLocal.remove(TOKEN_KEY);
  }

  // ── OAuth via launchWebAuthFlow ────────────────────────────────────────────

  async function getToken(interactive = false) {
    const stored = await getStoredToken();
    if (stored) return stored;

    if (!interactive) throw new Error('No stored token');

    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl     = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id',     CLIENT_ID);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri',  redirectUri);
    authUrl.searchParams.set('scope',         SCOPE);

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        async responseUrl => {
          if (chrome.runtime.lastError || !responseUrl) {
            reject(new Error(chrome.runtime.lastError?.message ?? 'Auth cancelled'));
            return;
          }
          const params    = new URLSearchParams(new URL(responseUrl).hash.slice(1));
          const token     = params.get('access_token');
          const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10);

          if (!token) { reject(new Error('No access_token in response')); return; }

          await saveToken(token, expiresIn);
          resolve(token);
        }
      );
    });
  }

  // ── Countdown helpers ─────────────────────────────────────────────────────

  let _countdownInterval = null;

  function clearCountdown() {
    if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  }

  // Returns a human-readable countdown string, or null for all-day / far-future
  function getCountdownText(ev) {
    const start = ev.start ?? {};

    // All-day event — no time to count down to
    if (start.date && !start.dateTime) {
      const evDay  = new Date(start.date + 'T00:00:00').setHours(0, 0, 0, 0);
      const today  = new Date().setHours(0, 0, 0, 0);
      return evDay === today ? 'All day today' : null;
    }

    const diffMs  = new Date(start.dateTime).getTime() - Date.now();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMs < -60_000) return 'In progress';        // started > 1 min ago
    if (diffMin <= 0)     return 'Starting now';
    if (diffMin < 60)     return `Starting in ${diffMin}m`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m > 0 ? `In ${h}h ${m}m` : `In ${h}h`;
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function safeColor(color) {
    return /^#[0-9a-fA-F]{3,8}$/.test(color ?? '') ? color : '#3a6fcc';
  }

  function renderLoading(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Google Calendar</span>
      </div>
      <div class="loading-block">
        ${Array.from({ length: 4 }, () => `
          <div style="display:flex;gap:8px;margin-bottom:10px;align-items:flex-start">
            <div class="skeleton" style="width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:3px"></div>
            <div class="skeleton" style="width:42px;height:32px;border-radius:4px;flex-shrink:0"></div>
            <div style="flex:1">
              <div class="skeleton wide"></div>
              <div class="skeleton mid"></div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function renderSignIn(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Google Calendar</span>
      </div>
      <div class="oauth-prompt">
        <p>Connect to see upcoming events</p>
        <button id="cal-signin-btn" class="btn-primary">Connect Google Calendar</button>
      </div>`;

    el.querySelector('#cal-signin-btn').addEventListener('click', async () => {
      try {
        await getToken(true);
        renderLoading(el);
        await loadEvents(el);
        window.dispatchEvent(new CustomEvent('google-auth-complete'));
      } catch (err) {
        console.error('[Calendar] sign-in failed:', err);
        renderError(el, 'Sign-in cancelled or failed.');
      }
    });
  }

  function renderEvents(el, events) {
    clearCountdown(); // clear any previous interval before re-rendering

    const header = `
      <div class="widget-header">
        <span class="widget-title">Google Calendar</span>
        <div class="widget-actions">
          <button class="icon-btn" id="cal-refresh" title="Refresh">↻</button>
        </div>
      </div>`;

    let body;
    if (!events.length) {
      body = `<div style="padding:12px 14px;font-size:12px;color:var(--text-muted)">No upcoming events.</div>`;
    } else {
      body = `<ul class="cal-list">${events.map((ev, idx) => {
        const start   = ev.start ?? {};
        const dateStr = start.date ?? start.dateTime ?? '';
        const color   = safeColor(ev._calColor);
        const link    = ev.htmlLink ?? 'https://calendar.google.com';
        const isNext  = idx === 0;

        return `
          <li class="cal-event${isNext ? ' cal-next-event' : ''}"
              ${isNext ? `style="--next-color:${color}"` : ''}>
            <a href="${safeHref(link)}" target="_blank" rel="noopener noreferrer" class="cal-event-link">
              <span class="cal-color-dot" style="background:${color}"></span>
              <div class="cal-date-badge">${escapeHtml(formatEventDate(dateStr))}</div>
              <div class="cal-event-details">
                <div class="cal-event-title">${escapeHtml(ev.summary ?? '(No title)')}</div>
                <div class="cal-event-time">${escapeHtml(formatEventTime(start))}</div>
              </div>
              ${isNext ? `<span class="cal-countdown" id="cal-countdown"></span>` : ''}
            </a>
          </li>`;
      }).join('')}</ul>`;
    }

    el.innerHTML = header + body;
    el.querySelector('#cal-refresh')?.addEventListener('click', async () => { clearCountdown(); renderLoading(el); await loadEvents(el); });

    // ── Live countdown for the next event ────────────────────────────────────
    const countdownEl = el.querySelector('#cal-countdown');
    if (countdownEl && events.length) {
      const nextEv = events[0];
      function tick() {
        const text = getCountdownText(nextEv);
        countdownEl.textContent  = text ?? '';
        countdownEl.style.display = text ? '' : 'none';
      }
      tick();
      _countdownInterval = setInterval(tick, 30_000); // refresh every 30 s
    }
  }

  function renderError(el, msg) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Google Calendar</span>
      </div>
      <div class="widget-error">${escapeHtml(msg ?? 'Error loading calendar.')}</div>`;
  }

  // ── Data fetching ─────────────────────────────────────────────────────────

  async function loadEvents(el) {
    let token;
    try {
      token = await getToken(false);
    } catch {
      renderSignIn(el);
      return;
    }

    try {
      // 1. Fetch calendar list — get IDs, colors, and visibility
      const calListRes = await fetch(`${API_BASE}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (calListRes.status === 401) { await clearToken(); renderSignIn(el); return; }
      if (!calListRes.ok) throw new Error('HTTP ' + calListRes.status);

      const allCals = (await calListRes.json()).items ?? [];

      // 2. Apply user selection (null = show all non-hidden)
      const selectedIds = await StorageSync.get('calSelectedCals'); // null | string[]
      const activeCals  = selectedIds?.length
        ? allCals.filter(c => selectedIds.includes(c.id))
        : allCals.filter(c => c.selected !== false && !c.hidden);

      const colorMap = {};
      activeCals.forEach(c => { colorMap[c.id] = c.backgroundColor ?? '#3a6fcc'; });

      // 3. Fetch events from each calendar in parallel
      const now     = new Date().toISOString();
      const maxTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const fetches = activeCals.map(cal =>
        fetch(
          `${API_BASE}/calendars/${encodeURIComponent(cal.id)}/events` +
          `?orderBy=startTime&singleEvents=true` +
          `&timeMin=${encodeURIComponent(now)}` +
          `&timeMax=${encodeURIComponent(maxTime)}` +
          `&maxResults=20`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
          .then(r => r.ok ? r.json() : { items: [] })
          .then(d => (d.items ?? []).map(ev => ({ ...ev, _calColor: colorMap[cal.id] })))
          .catch(() => [])
      );

      // 4. Merge, sort by start time (use Date objects so timezone offsets sort correctly),
      //    take top 8
      const events = (await Promise.all(fetches))
        .flat()
        .sort((a, b) => {
          const aT = new Date(a.start?.dateTime ?? a.start?.date ?? '').getTime();
          const bT = new Date(b.start?.dateTime ?? b.start?.date ?? '').getTime();
          return aT - bT;
        })
        .slice(0, 8);

      renderEvents(el, events);
    } catch (err) {
      console.error('[Calendar] fetch error:', err);
      renderError(el, 'Failed to load events.');
    }
  }

  async function disconnect(el) {
    clearCountdown();
    await clearToken();
    renderSignIn(el);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    const el = document.getElementById(CONTAINER);
    if (!el) return;
    renderLoading(el);
    await loadEvents(el);
  }

  return { init };
})();
