/* tasks.js — Google Tasks via launchWebAuthFlow (works in Brave + Chrome) */

const TasksWidget = (() => {
  const CONTAINER = 'widget-tasks';
  const CLIENT_ID = '890256513528-aql100cimv2ehm9c0omjetmf79oq39e9.apps.googleusercontent.com';
  const SCOPE     = 'https://www.googleapis.com/auth/tasks'; // full access to create tasks
  const TOKEN_KEY = 'oauth_tasks';
  const API_BASE  = 'https://www.googleapis.com/tasks/v1';

  // Active list ID & token — set when tasks load, used by add-task form
  let _activeListId = null;
  let _activeToken  = null;

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

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderLoading(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Google Tasks</span>
      </div>
      <div class="loading-block">
        ${Array.from({ length: 5 }, () =>
          `<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
             <div class="skeleton" style="width:13px;height:13px;border-radius:50%;flex-shrink:0"></div>
             <div class="skeleton wide"></div>
           </div>`
        ).join('')}
      </div>`;
  }

  function renderSignIn(el) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Google Tasks</span>
      </div>
      <div class="oauth-prompt">
        <p>Connect to see your tasks</p>
        <button id="tasks-signin-btn" class="btn-primary">Connect Google Tasks</button>
      </div>`;

    el.querySelector('#tasks-signin-btn').addEventListener('click', async () => {
      try {
        await getToken(true);
        renderLoading(el);
        await loadTasks(el);
      } catch (err) {
        console.error('[Tasks] sign-in failed:', err);
        renderError(el, 'Sign-in cancelled or failed.');
      }
    });
  }

  function renderTasks(el, tasks) {
    const header = `
      <div class="widget-header">
        <span class="widget-title">Google Tasks</span>
        <div class="widget-actions">
          <button class="icon-btn" id="tasks-refresh" title="Refresh">↻</button>
        </div>
      </div>`;

    const taskItems = tasks.length
      ? `<ul class="tasks-list">${tasks.map(task => {
          const due = task.due
            ? `<div class="task-due">Due ${formatEventDate(task.due)}</div>`
            : '';
          return `
            <li class="task-item" data-task-id="${escapeHtml(task.id)}">
              <button class="task-check-btn" title="Mark as done">
                <div class="task-check"></div>
              </button>
              <a href="https://tasks.google.com/" target="_blank" rel="noopener noreferrer" class="task-body-link">
                <div class="task-title">${escapeHtml(task.title ?? '(Untitled)')}</div>
                ${due}
              </a>
            </li>`;
        }).join('')}</ul>`
      : `<div style="padding:10px 12px;font-size:12px;color:var(--text-muted)">No pending tasks.</div>`;

    el.innerHTML = header + taskItems + `
      <form class="task-add-form" id="task-add-form">
        <div class="task-check task-add-icon"></div>
        <input class="task-add-input" id="task-add-input"
          type="text" placeholder="Add a task…" autocomplete="off" />
      </form>`;

    el.querySelector('#tasks-refresh')?.addEventListener('click', async () => { renderLoading(el); await loadTasks(el); });

    // ── Complete task on checkbox click ──────────────────────────────────────
    el.querySelectorAll('.task-check-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const li     = btn.closest('.task-item');
        const taskId = li?.dataset.taskId;
        if (!taskId || !_activeToken || !_activeListId) return;

        // Visual feedback — check fills immediately
        btn.querySelector('.task-check').classList.add('done');
        btn.disabled = true;
        li.querySelector('.task-title')?.classList.add('done');

        // Complete via API, then fade out the row
        try {
          await fetch(
            `${API_BASE}/lists/${encodeURIComponent(_activeListId)}/tasks/${encodeURIComponent(taskId)}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: 'Bearer ' + _activeToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ status: 'completed' })
            }
          );
        } catch (err) {
          console.warn('[Tasks] complete error:', err);
        }

        // Animate out then remove
        li.classList.add('task-completing');
        setTimeout(() => li.remove(), 380);
      });
    });

    // ── Add-task form ────────────────────────────────────────────────────────
    el.querySelector('#task-add-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const input = el.querySelector('#task-add-input');
      const title = input?.value.trim();
      if (!title) return;

      input.value    = '';
      input.disabled = true;

      try {
        if (!_activeToken || !_activeListId) throw new Error('No active session');

        const res = await fetch(
          `${API_BASE}/lists/${encodeURIComponent(_activeListId)}/tasks`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + _activeToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title })
          }
        );

        if (res.status === 401) { await clearToken(); renderSignIn(el); return; }
        if (res.status === 403) {
          // Old read-only token — ask user to reconnect
          input.placeholder = 'Reconnect Tasks to add tasks';
          input.disabled = false;
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);

        // Refresh to show the new task
        await loadTasks(el);
      } catch (err) {
        console.error('[Tasks] create error:', err);
        input.disabled = false;
        input.placeholder = 'Failed — try again';
        setTimeout(() => { input.placeholder = 'Add a task…'; }, 2500);
      }
    });
  }

  function renderError(el, msg) {
    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Google Tasks</span>
      </div>
      <div class="widget-error">${escapeHtml(msg ?? 'Error loading tasks.')}</div>`;
  }

  // ── Data fetching ─────────────────────────────────────────────────────────

  async function loadTasks(el) {
    let token;
    try {
      token = await getToken(false);
    } catch {
      renderSignIn(el);
      return;
    }

    try {
      const listRes = await fetch(`${API_BASE}/users/@me/lists`, {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (listRes.status === 401) { await clearToken(); renderSignIn(el); return; }
      if (!listRes.ok) throw new Error('HTTP ' + listRes.status);

      const lists = (await listRes.json()).items ?? [];
      if (!lists.length) { renderTasks(el, []); return; }

      const selectedId = await StorageSync.get('tasksSelectedList');
      const taskList   = lists.find(l => l.id === selectedId) ?? lists[0];

      const tasksRes = await fetch(
        `${API_BASE}/lists/${encodeURIComponent(taskList.id)}/tasks?showCompleted=false&maxResults=20`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (tasksRes.status === 401) { await clearToken(); renderSignIn(el); return; }
      if (!tasksRes.ok) throw new Error('HTTP ' + tasksRes.status);

      // Store for the add-task form
      _activeListId = taskList.id;
      _activeToken  = token;

      renderTasks(el, (await tasksRes.json()).items ?? []);
    } catch (err) {
      console.error('[Tasks] fetch error:', err);
      renderError(el, 'Failed to load tasks.');
    }
  }

  async function disconnect(el) {
    _activeListId = null;
    _activeToken  = null;
    await clearToken();
    renderSignIn(el);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    const el = document.getElementById(CONTAINER);
    if (!el) return;
    renderLoading(el);
    await loadTasks(el);
  }

  return { init };
})();
