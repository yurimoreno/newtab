/* rss.js — RSS / Atom feed reader with favicons, thumbnails, timestamps, read-state */

const RssWidget = (() => {
  const TTL      = 15 * 60 * 1000;
  const READ_KEY = 'rssReadUrls';

  // ── Read-URL tracking ────────────────────────────────────────────────────────
  // Shared across all three feed instances; loaded once, updated on click.

  let _readUrls   = new Set();
  let _readReady  = null; // single shared Promise so we only hit storage once

  function ensureReadUrls() {
    if (!_readReady) {
      _readReady = StorageLocal.get(READ_KEY).then(arr => {
        _readUrls = new Set(arr ?? []);
      });
    }
    return _readReady;
  }

  async function markAsRead(url) {
    if (!url || _readUrls.has(url)) return;
    _readUrls.add(url);
    // Cap at 500 entries so storage doesn't grow forever
    const trimmed = [..._readUrls].slice(-500);
    _readUrls = new Set(trimmed);
    await StorageLocal.set(READ_KEY, trimmed);
  }

  const DEFAULT_FEEDS = [
    { id: 'hn',    name: 'Hacker News', url: 'https://hnrss.org/frontpage',            target: 'widget-rss-hn' },
    { id: 'verge', name: 'The Verge',   url: 'https://www.theverge.com/rss/index.xml', target: 'widget-rss-verge' },
    { id: 'tc',    name: 'TechCrunch',  url: 'https://techcrunch.com/feed/',            target: 'widget-rss-tc' }
  ];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getFaviconUrl(articleUrl) {
    try {
      const { hostname } = new URL(articleUrl);
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=16`;
    } catch { return null; }
  }

  // Extract first <img src> from an HTML string (used for Verge thumbnails)
  function extractFirstImage(htmlStr) {
    if (!htmlStr) return null;
    try {
      const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
      return doc.querySelector('img[src]')?.getAttribute('src') ?? null;
    } catch { return null; }
  }

  // Parse HN-style "Points: N" and "# Comments: N" from description CDATA
  function parseHnMeta(descText) {
    const pts = descText.match(/Points:\s*(\d+)/);
    const cmt = descText.match(/#\s*Comments:\s*(\d+)/);
    return {
      points:   pts ? parseInt(pts[1], 10)  : null,
      comments: cmt ? parseInt(cmt[1], 10)  : null,
    };
  }

  // ── XML parsing ──────────────────────────────────────────────────────────────

  function parseXml(text) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return [];

    // ── RSS 2.0 ──────────────────────────────────────────────────────────────
    const rssItems = [...doc.querySelectorAll('item')];
    if (rssItems.length) {
      return rssItems.map(n => {
        const linkEl  = n.querySelector('link');
        const link    = linkEl?.textContent?.trim() || linkEl?.getAttribute('href') || '#';
        const descRaw = n.querySelector('description')?.textContent ?? '';
        const hnMeta  = parseHnMeta(descRaw);

        return {
          title:    n.querySelector('title')?.textContent?.trim()  ?? '(no title)',
          link,
          date:     n.querySelector('pubDate')?.textContent?.trim() ?? '',
          author:   n.querySelector('creator')?.textContent?.trim() ??  // dc:creator
                    n.querySelector('author')?.textContent?.trim()  ?? '',
          thumbnail: null,   // not available in RSS 2.0 feeds for HN/TC
          points:   hnMeta.points,
          comments: hnMeta.comments,
        };
      });
    }

    // ── Atom ─────────────────────────────────────────────────────────────────
    return [...doc.querySelectorAll('entry')].map(n => {
      const link      = n.querySelector('link[rel="alternate"]')?.getAttribute('href')
                     ?? n.querySelector('link')?.getAttribute('href') ?? '#';
      const contentHtml = n.querySelector('content')?.textContent ?? '';

      return {
        title:    n.querySelector('title')?.textContent?.trim() ?? '(no title)',
        link,
        date:     n.querySelector('published')?.textContent?.trim()
               ?? n.querySelector('updated')?.textContent?.trim()  ?? '',
        author:   n.querySelector('author name')?.textContent?.trim() ?? '',
        thumbnail: extractFirstImage(contentHtml),
        points:   null,
        comments: null,
      };
    });
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  function renderLoading(el, name) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">${escapeHtml(name)}</span>
      </div>
      <div class="loading-block">
        ${Array.from({ length: 7 }, () =>
          `<div class="rss-skel-row">
             <div class="skeleton" style="width:14px;height:14px;border-radius:3px;flex-shrink:0"></div>
             <div class="skeleton wide" style="flex:1"></div>
             <div class="skeleton" style="width:22px"></div>
           </div>`
        ).join('')}
      </div>`;
  }

  function renderItems(el, name, feedId, items) {
    const listHtml = items.map((item, idx) => {
      const favicon  = getFaviconUrl(item.link);
      const time     = item.date ? formatRelativeTime(item.date) : '';
      const isFirst  = idx === 0 && item.thumbnail;
      const isRead   = _readUrls.has(item.link);

      const faviconEl = favicon
        ? `<img class="rss-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy" />`
        : `<span class="rss-favicon-gap"></span>`;

      const timeEl = time
        ? `<span class="rss-time">${escapeHtml(time)}</span>`
        : '';

      const hnMetaEl = (item.points != null || item.comments != null)
        ? `<div class="rss-hn-meta">
             ${item.points   != null ? `<span class="rss-pts">▲ ${item.points}</span>` : ''}
             ${item.comments != null ? `<span class="rss-cmts">· ${item.comments} cmt${item.comments !== 1 ? 's' : ''}</span>` : ''}
           </div>`
        : '';

      if (isFirst) {
        return `
          <li class="rss-item rss-item--featured${isRead ? ' rss-item--read' : ''}"
              data-url="${escapeHtml(item.link)}">
            <a href="${safeHref(item.link)}" target="_blank" rel="noopener noreferrer">
              <img class="rss-thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />
              <div class="rss-item-body">
                ${faviconEl}
                <div class="rss-item-text">
                  <span class="rss-title">${escapeHtml(item.title)}</span>
                  ${hnMetaEl}
                </div>
                ${timeEl}
              </div>
            </a>
          </li>`;
      }

      return `
        <li class="rss-item${isRead ? ' rss-item--read' : ''}"
            data-url="${escapeHtml(item.link)}">
          <a href="${safeHref(item.link)}" target="_blank" rel="noopener noreferrer">
            ${faviconEl}
            <div class="rss-item-text">
              <span class="rss-title">${escapeHtml(item.title)}</span>
              ${hnMetaEl}
            </div>
            ${timeEl}
          </a>
        </li>`;
    }).join('');

    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">${escapeHtml(name)}</span>
        <div class="widget-actions">
          <button class="icon-btn rss-refresh" data-feed="${escapeHtml(feedId)}" title="Refresh">↻</button>
        </div>
      </div>
      <ul class="rss-list">${listHtml}</ul>`;

    // Broken images
    el.querySelectorAll('.rss-thumb').forEach(img => {
      img.addEventListener('error', () => {
        const li = img.closest('.rss-item--featured');
        if (li) li.classList.remove('rss-item--featured');
        img.remove();
      });
    });
    el.querySelectorAll('.rss-favicon').forEach(img => {
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    });

    el.querySelector('.rss-refresh')?.addEventListener('click', () => {
      refreshFeed(feedId, el, name);
    });

    // Mark items as read on click
    el.querySelectorAll('.rss-item[data-url]').forEach(li => {
      li.querySelector('a')?.addEventListener('click', () => {
        const url = li.dataset.url;
        if (!url) return;
        li.classList.add('rss-item--read');
        markAsRead(url);
      });
    });
  }

  function renderError(el, name, msg) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">${escapeHtml(name)}</span>
      </div>
      <div class="widget-error">${escapeHtml(msg || 'Could not load feed.')}</div>`;
  }

  // ── Fetch with cache ─────────────────────────────────────────────────────────

  function makeCacheKey(url) {
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
    return 'rss_' + Math.abs(h).toString(36);
  }

  async function fetchFeed(url) {
    const key    = makeCacheKey(url);
    const cached = await StorageLocal.get(key);
    if (cached && Date.now() - cached.ts < TTL) return cached.items;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const items = parseXml(await res.text()).slice(0, 12);
    if (!items.length) throw new Error('No items in feed');

    await StorageLocal.set(key, { ts: Date.now(), items });
    return items;
  }

  async function refreshFeed(feedId, el, name) {
    const feeds = await getFeeds();
    const feed  = feeds.find(f => f.id === feedId);
    if (!feed) return;

    await StorageLocal.remove(makeCacheKey(feed.url));
    renderLoading(el, name);
    try {
      renderItems(el, name, feedId, await fetchFeed(feed.url));
    } catch (err) {
      renderError(el, name, String(err));
    }
  }

  async function getFeeds() {
    return (await StorageSync.get('rssFeeds')) ?? DEFAULT_FEEDS;
  }

  // ── Public init ──────────────────────────────────────────────────────────────

  async function init(feedId) {
    const el = document.getElementById(`widget-rss-${feedId}`);
    if (!el) { console.warn(`[RSS] #widget-rss-${feedId} not found`); return; }

    // Resolve the feed config first so the skeleton shows the real name,
    // not the raw feedId (which is a random uid for custom feeds).
    const feeds = await getFeeds();
    const feed  = feeds.find(f => f.id === feedId)
               ?? DEFAULT_FEEDS.find(f => f.id === feedId);

    if (!feed) { renderError(el, feedId, 'Feed config not found'); return; }

    renderLoading(el, feed.name);

    // Ensure read-URL set is populated before first render (shared promise)
    await ensureReadUrls();

    try {
      renderItems(el, feed.name, feedId, await fetchFeed(feed.url));
    } catch (err) {
      console.error(`[RSS] ${feedId}:`, err);
      renderError(el, feed.name, 'Could not load feed.');
    }
  }

  return { init, getFeeds, DEFAULT_FEEDS };
})();
