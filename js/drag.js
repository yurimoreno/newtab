/* drag.js — Card drag-and-drop with layout persistence */

const DragManager = (() => {
  const STORAGE_KEY = 'layout';
  const COL_IDS = ['col-1', 'col-2', 'col-3', 'col-4'];

  const DEFAULT_LAYOUT = {
    'col-1': ['widget-quote', 'widget-currency', 'widget-quicklinks'],
    'col-2': ['widget-rss-hn', 'widget-calendar'],
    'col-3': ['widget-rss-verge', 'widget-tasks'],
    'col-4': ['widget-rss-tc']
  };

  const HANDLE_SVG = `
    <svg class="drag-dots" width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="2" cy="2"  r="1.5"/>
      <circle cx="8" cy="2"  r="1.5"/>
      <circle cx="2" cy="7"  r="1.5"/>
      <circle cx="8" cy="7"  r="1.5"/>
      <circle cx="2" cy="12" r="1.5"/>
      <circle cx="8" cy="12" r="1.5"/>
    </svg>`;

  let dragged                = null;   // The .widget being dragged
  let placeholder            = null;   // Drop-position indicator div
  let dragFromHeader         = false;  // Was mousedown on the header?

  // ── Layout persistence ────────────────────────────────────────────────────

  async function loadAndApplyLayout() {
    const saved = await StorageSync.get(STORAGE_KEY);
    const layout = saved ?? DEFAULT_LAYOUT;

    for (const [colId, ids] of Object.entries(layout)) {
      const col = document.getElementById(colId);
      if (!col) continue;
      for (const id of ids) {
        const widget = document.getElementById(id);
        if (widget) col.appendChild(widget);
      }
    }
  }

  async function saveLayout() {
    const layout = {};
    COL_IDS.forEach(colId => {
      const col = document.getElementById(colId);
      if (!col) return;
      layout[colId] = [...col.querySelectorAll(':scope > .widget')]
        .map(w => w.id)
        .filter(Boolean);
    });
    await StorageSync.set(STORAGE_KEY, layout);
  }

  // ── Drag handle injection ─────────────────────────────────────────────────

  function injectHandle(header) {
    if (header.querySelector('.drag-handle')) return;
    const span = document.createElement('span');
    span.className  = 'drag-handle';
    span.title      = 'Drag to reorder';
    span.innerHTML  = HANDLE_SVG;
    header.insertBefore(span, header.firstChild);
  }

  // Watch for widget headers created by async widget renders
  function observeHeaders() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    // Inject into any headers already present
    dashboard.querySelectorAll('.widget-header').forEach(injectHandle);

    new MutationObserver(mutations => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList.contains('widget-header')) {
            injectHandle(node);
          } else {
            node.querySelectorAll?.('.widget-header').forEach(injectHandle);
          }
        }
      }
    }).observe(dashboard, { childList: true, subtree: true });
  }

  // ── Drop-position helper ──────────────────────────────────────────────────

  // Returns the widget that the cursor is above (or null if below everything)
  function getWidgetAfterCursor(col, cursorY) {
    const candidates = [
      ...col.querySelectorAll(':scope > .widget:not(.is-dragging)')
    ];
    return candidates.reduce((closest, w) => {
      const { top, height } = w.getBoundingClientRect();
      const delta = cursorY - top - height / 2;
      return delta < 0 && delta > closest.delta
        ? { delta, el: w }
        : closest;
    }, { delta: -Infinity, el: null }).el;
  }

  // ── Core drag init ────────────────────────────────────────────────────────

  function init() {
    observeHeaders();

    const widgets = [...document.querySelectorAll('.widget')];
    const cols    = [...document.querySelectorAll('.dash-col')];

    // ── Per-widget events ─────────────────────────────────────────────────

    widgets.forEach(widget => {
      widget.setAttribute('draggable', 'true');

      // Track whether the drag started on the header so we can ignore
      // accidental drags initiated from links, inputs, etc. inside the card body.
      widget.addEventListener('mousedown', e => {
        dragFromHeader = !!e.target.closest('.widget-header');
      });

      widget.addEventListener('dragstart', e => {
        if (!dragFromHeader) {
          e.preventDefault();
          return;
        }

        dragged = widget;

        // Build a same-sized placeholder
        const { height } = widget.getBoundingClientRect();
        placeholder = document.createElement('div');
        placeholder.className = 'drop-placeholder';
        placeholder.style.minHeight = height + 'px';

        // Tiny delay so the browser captures the drag image before we dim it
        requestAnimationFrame(() => widget.classList.add('is-dragging'));

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', widget.id);
      });

      widget.addEventListener('dragend', async () => {
        widget.classList.remove('is-dragging');
        placeholder?.remove();
        placeholder  = null;
        dragged      = null;
        dragFromHeader = false;
        cols.forEach(c => c.classList.remove('drag-over'));
        await saveLayout();
      });
    });

    // ── Per-column drop-zone events ───────────────────────────────────────

    cols.forEach(col => {
      col.addEventListener('dragover', e => {
        if (!dragged) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        col.classList.add('drag-over');

        const after = getWidgetAfterCursor(col, e.clientY);
        if (after) {
          col.insertBefore(placeholder, after);
        } else {
          col.appendChild(placeholder);
        }
      });

      col.addEventListener('dragleave', e => {
        // Only remove highlight when cursor leaves the column entirely
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over');
        }
      });

      col.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragged || !placeholder) return;
        col.insertBefore(dragged, placeholder);
        placeholder.remove();
        placeholder = null;
        col.classList.remove('drag-over');
        // dragend fires next and saves the layout
      });
    });
  }

  return { init, loadAndApplyLayout };
})();
