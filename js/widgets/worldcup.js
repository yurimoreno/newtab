/* worldcup.js — FIFA World Cup 2026 widget (live + today + upcoming) */

const WorldCupWidget = (() => {
  const CONTAINER = 'widget-worldcup';

  // Tournament window: June 11 → July 19, 2026
  const ESPN_URL =
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719';
  // Keyless static fallback (schedule only, no live scores)
  const STATIC_URL = 'https://www.thestatsapi.com/world-cup/data/fixtures.json';

  const CACHE_KEY = 'worldcup';
  const TTL_LIVE  = 60 * 1000;        // refresh fast while a match is live
  const TTL_IDLE  = 15 * 60 * 1000;   // otherwise every 15 min
  const CAP       = 8;                 // max match rows shown

  let _timer = null;

  // ── Normalizers → common shape ──────────────────────────────────────────────
  // { start, state:'pre'|'in'|'post', completed, statusLabel, stage, venue, link,
  //   home/away: { name, full, abbr, logo, score, winner } }

  function stageFromSlug(slug) {
    if (!slug) return '';
    const map = {
      'group-stage': 'Group Stage', 'round-of-32': 'Round of 32',
      'round-of-16': 'Round of 16', 'quarterfinals': 'Quarterfinals',
      'quarter-finals': 'Quarterfinals', 'semifinals': 'Semifinals',
      'semi-finals': 'Semifinals', 'third-place': 'Third Place', 'final': 'Final'
    };
    if (map[slug]) return map[slug];
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function stageFromEspn(altGameNote, season) {
    if (altGameNote) {
      const i = altGameNote.indexOf(', ');
      if (i >= 0) return altGameNote.slice(i + 2); // "FIFA World Cup, Group A" → "Group A"
    }
    return stageFromSlug(season && season.slug);
  }

  function normalizeEspn(json) {
    const events = (json && json.events) || [];
    const team = c => {
      const t = (c && c.team) || {};
      return {
        name: t.shortDisplayName || t.displayName || 'TBD',
        full: t.displayName || t.shortDisplayName || '',
        abbr: t.abbreviation || '',
        logo: t.logo || '',
        score: c ? c.score : undefined,
        winner: !!(c && c.winner)
      };
    };
    return events.map(e => {
      const comp = (e.competitions && e.competitions[0]) || {};
      const cs = comp.competitors || [];
      const home = cs.find(c => c.homeAway === 'home') || cs[0] || {};
      const away = cs.find(c => c.homeAway === 'away') || cs[1] || {};
      const st = (e.status && e.status.type) || {};
      const link = ((e.links || []).find(l => l && l.href) || {}).href || '';
      return {
        start: e.date,
        state: st.state || 'pre',
        completed: !!st.completed,
        statusLabel: st.shortDetail || '',
        stage: stageFromEspn(comp.altGameNote, e.season),
        venue: (comp.venue && comp.venue.fullName) || '',
        link,
        home: team(home),
        away: team(away)
      };
    });
  }

  function normalizeStatic(json) {
    const fx = (json && json.fixtures) || [];
    const team = name => ({ name, full: name, abbr: '', logo: '', score: undefined, winner: false });
    return fx.map(f => ({
      start: f.kickoffUtc || f.date,
      state: 'pre',
      completed: false,
      statusLabel: '',
      stage: f.group ? ('Group ' + f.group) : stageFromSlug(f.stage),
      venue: f.stadium || '',
      link: f.matchUrl || '',
      home: team(f.homeTeam),
      away: team(f.awayTeam)
    }));
  }

  // ── Data loading (ESPN primary → static fallback) ───────────────────────────
  async function load() {
    try {
      const res = await fetch(ESPN_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const events = normalizeEspn(await res.json());
      if (events.length) return { events, source: 'espn' };
      throw new Error('no events');
    } catch {
      try {
        const res = await fetch(STATIC_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const events = normalizeStatic(await res.json());
        if (events.length) return { events, source: 'static' };
      } catch {}
      return null;
    }
  }

  const hasLive = events => events.some(e => e.state === 'in');

  // ── Date helpers ────────────────────────────────────────────────────────────
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
  }
  function fmtTime(d) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function dayLabel(d, now) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (sameDay(d, now)) return 'Today';
    if (sameDay(d, tomorrow)) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  function renderLoading(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">World Cup 2026</span>
      </div>
      <div class="loading-block">
        <div class="skeleton wide"></div>
        <div class="skeleton mid"></div>
        <div class="skeleton wide"></div>
        <div class="skeleton mid"></div>
      </div>`;
  }

  function renderError(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">World Cup 2026</span>
        <div class="widget-actions">
          <button class="icon-btn wc-refresh" title="Refresh">↻</button>
        </div>
      </div>
      <div class="widget-error">Could not load match data.</div>`;
    el.querySelector('.wc-refresh')?.addEventListener('click', () => refresh(el));
  }

  function logoHtml(url) {
    return url
      ? `<img class="wc-logo" src="${escapeHtml(url)}" alt="" loading="lazy" />`
      : `<span class="wc-logo wc-logo--gap"></span>`;
  }

  function matchRow(x) {
    const e = x.e, d = x.d;
    const homeDisp = e.home.abbr || e.home.name;
    const awayDisp = e.away.abbr || e.away.name;
    const played = e.state === 'in' || e.state === 'post';
    const hasScore = played
      && e.home.score != null && e.home.score !== ''
      && e.away.score != null && e.away.score !== '';

    const mid = hasScore
      ? `<span class="wc-score">${escapeHtml(String(e.home.score))}<span class="wc-dash">–</span>${escapeHtml(String(e.away.score))}</span>`
      : `<span class="wc-time">${escapeHtml(fmtTime(d))}</span>`;

    let status = '';
    if (e.state === 'in') {
      status = `<span class="wc-status wc-status--live"><span class="wc-live-dot"></span>${escapeHtml(e.statusLabel || 'LIVE')}</span>`;
    } else if (e.state === 'post') {
      status = `<span class="wc-status">${escapeHtml(e.statusLabel || 'FT')}</span>`;
    }

    const hw = e.home.winner ? ' wc-winner' : '';
    const aw = e.away.winner ? ' wc-winner' : '';
    const meta = [e.stage, e.venue].filter(Boolean).join(' · ');

    const inner = `
      <div class="wc-row">
        <div class="wc-team wc-team--home">
          <span class="wc-abbr${hw}" title="${escapeHtml(e.home.full || e.home.name)}">${escapeHtml(homeDisp)}</span>
          ${logoHtml(e.home.logo)}
        </div>
        <div class="wc-mid">${mid}${status}</div>
        <div class="wc-team wc-team--away">
          ${logoHtml(e.away.logo)}
          <span class="wc-abbr${aw}" title="${escapeHtml(e.away.full || e.away.name)}">${escapeHtml(awayDisp)}</span>
        </div>
      </div>
      ${meta ? `<div class="wc-meta">${escapeHtml(meta)}</div>` : ''}`;

    return e.link
      ? `<a class="wc-match" href="${safeHref(e.link)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<div class="wc-match">${inner}</div>`;
  }

  function sectionLabel(t) {
    return `<div class="wc-section-label">${escapeHtml(t)}</div>`;
  }

  function render(el, events, source) {
    const now = new Date();
    const list = events
      .map(e => ({ e, d: new Date(e.start) }))
      .filter(x => !isNaN(x.d.getTime()))
      .sort((a, b) => a.d - b.d);

    const live   = list.filter(x => x.e.state === 'in');
    const today  = list.filter(x => x.e.state !== 'in' && sameDay(x.d, now));
    const future = list.filter(x => x.e.state === 'pre' && x.d > now && !sameDay(x.d, now));

    let shown = 0;
    let html = '';

    if (live.length) {
      html += sectionLabel('🔴 Live');
      live.forEach(x => { html += matchRow(x); shown++; });
    }
    if (today.length && shown < CAP) {
      html += sectionLabel('Today');
      today.slice(0, CAP - shown).forEach(x => { html += matchRow(x); shown++; });
    }
    let curDay = '';
    for (const x of future) {
      if (shown >= CAP) break;
      const dl = dayLabel(x.d, now);
      if (dl !== curDay) { curDay = dl; html += sectionLabel(dl); }
      html += matchRow(x);
      shown++;
    }
    if (!html) html = '<div class="wc-empty">No matches scheduled.</div>';

    const note = source === 'static'
      ? '<span class="wc-note" title="Live scores unavailable — showing schedule only">schedule</span>'
      : '';

    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">World Cup 2026</span>
        <div class="widget-actions">
          ${note}
          <button class="icon-btn wc-refresh" title="Refresh">↻</button>
        </div>
      </div>
      <div class="wc-list">${html}</div>`;

    el.querySelector('.wc-refresh')?.addEventListener('click', () => refresh(el));
    el.querySelectorAll('.wc-logo').forEach(img => {
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    });
  }

  // ── Live auto-refresh while the tab is open ─────────────────────────────────
  function scheduleLive(el, events) {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (!hasLive(events)) return;
    _timer = setInterval(async () => {
      const data = await load();
      if (!data) return;
      await StorageLocal.set(CACHE_KEY, { ts: Date.now(), ...data });
      render(el, data.events, data.source);
      if (!hasLive(data.events)) { clearInterval(_timer); _timer = null; }
    }, TTL_LIVE);
  }

  async function refresh(el) {
    renderLoading(el);
    const data = await load();
    if (data) {
      await StorageLocal.set(CACHE_KEY, { ts: Date.now(), ...data });
      render(el, data.events, data.source);
      scheduleLive(el, data.events);
    } else {
      renderError(el);
    }
  }

  async function init() {
    const el = document.getElementById(CONTAINER);
    if (!el) return;
    renderLoading(el);

    const cached = await StorageLocal.get(CACHE_KEY);
    if (cached && cached.events) {
      render(el, cached.events, cached.source);
      const ttl = hasLive(cached.events) ? TTL_LIVE : TTL_IDLE;
      if (Date.now() - cached.ts < ttl) {
        scheduleLive(el, cached.events);
        return; // fresh enough
      }
    }

    const data = await load();
    if (data) {
      await StorageLocal.set(CACHE_KEY, { ts: Date.now(), ...data });
      render(el, data.events, data.source);
      scheduleLive(el, data.events);
    } else if (!(cached && cached.events)) {
      renderError(el);
    }
  }

  return { init };
})();
