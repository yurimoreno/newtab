/* currency.js — Live currency converter widget */

const CurrencyWidget = (() => {
  const CONTAINER = 'widget-currency';
  const API = 'https://open.er-api.com/v6/latest/USD';
  const TTL = 60 * 60 * 1000; // 1 hour

  function renderLoading(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Currency Converter</span>
      </div>
      <div class="loading-block">
        <div class="skeleton wide"></div>
        <div class="skeleton mid" style="margin-top:12px"></div>
        <div class="skeleton mid"></div>
      </div>`;
  }

  function renderWidget(el, rates, updatedAt) {
    const settings = { from: 'USD', to: 'BRL' };

    const buildHtml = (fromAmt, toAmt) => `
      <div class="widget-header">
        <span class="widget-title">Currency Converter</span>
      </div>
      <div class="currency-body">
        <div class="currency-rate-display">
          <span class="rate-label">1 USD =</span>
          ${rates['BRL'].toFixed(4)} BRL
        </div>
        <div class="currency-converter">
          <div class="currency-row">
            <label>USD</label>
            <input class="currency-input" id="cur-from" type="number" min="0" step="any"
              value="${fromAmt}" placeholder="Amount" />
          </div>
          <div class="currency-row">
            <label>BRL</label>
            <input class="currency-input" id="cur-to" type="number" min="0" step="any"
              value="${toAmt}" placeholder="Amount" />
          </div>
        </div>
        <div class="currency-updated">Updated ${formatRelativeTime(updatedAt)}</div>
      </div>`;

    el.innerHTML = buildHtml('1', rates['BRL'].toFixed(2));

    const fromInput = el.querySelector('#cur-from');
    const toInput   = el.querySelector('#cur-to');

    fromInput.addEventListener('input', () => {
      const amt = parseFloat(fromInput.value);
      toInput.value = isNaN(amt) ? '' : (amt * rates['BRL']).toFixed(2);
    });

    toInput.addEventListener('input', () => {
      const amt = parseFloat(toInput.value);
      fromInput.value = isNaN(amt) ? '' : (amt / rates['BRL']).toFixed(2);
    });
  }

  function renderError(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Currency Converter</span>
      </div>
      <div class="widget-error">Could not load exchange rates.</div>`;
  }

  async function init() {
    const el = document.getElementById(CONTAINER);
    if (!el) return;
    renderLoading(el);

    try {
      const cached = await StorageLocal.get('currency_usd');
      if (cached && (Date.now() - cached.ts < TTL)) {
        renderWidget(el, cached.rates, new Date(cached.ts).toISOString());
        return;
      }

      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.result !== 'success') throw new Error('API error');

      const ts = Date.now();
      await StorageLocal.set('currency_usd', { ts, rates: data.rates });
      renderWidget(el, data.rates, new Date(ts).toISOString());
    } catch {
      renderError(el);
    }
  }

  return { init };
})();
