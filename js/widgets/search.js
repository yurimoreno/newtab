/* search.js — Search bar widget */

const SearchWidget = (() => {
  const ENGINES = {
    google: 'https://www.google.com/search?q=',
    ddg:    'https://duckduckgo.com/?q=',
    bing:   'https://www.bing.com/search?q='
  };

  async function init() {
    const container = document.getElementById('widget-search');
    if (!container) return;

    const engine = (await StorageSync.get('searchEngine')) ?? 'google';

    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" placeholder="Search…" autocomplete="off" spellcheck="false" autofocus />
      <button type="submit" aria-label="Search">&#x2315;</button>
    `;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const q = form.querySelector('input').value.trim();
      if (!q) return;
      const eng = (await StorageSync.get('searchEngine')) ?? 'google';
      window.location.href = ENGINES[eng] + encodeURIComponent(q);
    });

    container.appendChild(form);
    // Focus the input when the page loads
    form.querySelector('input').focus();
  }

  return { init };
})();
