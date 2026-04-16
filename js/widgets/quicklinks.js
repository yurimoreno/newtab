/* quicklinks.js — Quick Links widget with groups, stored in chrome.storage.sync */

const QuickLinksWidget = (() => {
  const CONTAINER   = 'widget-quicklinks';
  const STORAGE_KEY = 'quicklinks';

  const DEFAULT_GROUPS = [
    {
      id: 'g1',
      name: 'Notes',
      links: [
        { id: 'l1', label: 'Google Keep',        url: 'https://keep.google.com',          emoji: '📝' },
        { id: 'l2', label: 'Notion',              url: 'https://notion.so',                emoji: '🗒️' },
        { id: 'l3', label: 'Google Docs',         url: 'https://docs.google.com',          emoji: '📄' }
      ]
    },
    {
      id: 'g2',
      name: "Yuri's Meeting Notes",
      links: [
        { id: 'l4', label: 'Gmail',               url: 'https://mail.google.com',          emoji: '📧' },
        { id: 'l5', label: 'Google Calendar',     url: 'https://calendar.google.com',      emoji: '📅' },
        { id: 'l6', label: 'GitHub',              url: 'https://github.com',               emoji: '🐙' }
      ]
    }
  ];

  let groups   = [];
  let editMode = false;

  async function loadGroups() {
    const stored = await StorageSync.get(STORAGE_KEY);
    groups = stored ?? DEFAULT_GROUPS;
  }

  async function saveGroups() {
    await StorageSync.set(STORAGE_KEY, groups);
  }

  function uid() { return Math.random().toString(36).slice(2, 9); }

  function render() {
    const el = document.getElementById(CONTAINER);
    if (!el) return;

    const groupsHtml = groups.map(group => `
      <div class="ql-group" data-gid="${escapeHtml(group.id)}">

        <div class="ql-group-header">
          <span class="ql-group-name">${escapeHtml(group.name)}</span>
          ${editMode ? `
            <div class="ql-group-actions">
              <button class="ql-group-btn ql-rename-group" data-gid="${escapeHtml(group.id)}" title="Rename">✎</button>
              <button class="ql-group-btn ql-del-group"    data-gid="${escapeHtml(group.id)}" title="Delete">✕</button>
            </div>` : ''}
        </div>

        <ul class="ql-links">
          ${group.links.map(link => `
            <li class="ql-link-item">
              <a class="ql-link" href="${safeHref(link.url)}" target="_blank" rel="noopener noreferrer"
                 data-lid="${escapeHtml(link.id)}" data-gid="${escapeHtml(group.id)}">
                <span class="ql-link-bullet"></span>
                ${escapeHtml(link.label)}
              </a>
              ${editMode ? `
                <button class="ql-delete-btn" data-lid="${escapeHtml(link.id)}" data-gid="${escapeHtml(group.id)}" title="Remove">✕</button>` : ''}
            </li>
          `).join('')}
          ${editMode ? `
            <li class="ql-add-link-item">
              <button class="ql-add-link-btn" data-gid="${escapeHtml(group.id)}">+ Add link</button>
            </li>` : ''}
        </ul>

      </div>
    `).join('');

    el.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">Quick Links</span>
        <div class="widget-actions">
          <button class="icon-btn" id="ql-edit-toggle" title="${editMode ? 'Done editing' : 'Edit links'}">
            ${editMode ? '✓' : '✎'}
          </button>
        </div>
      </div>
      <div class="quicklinks-body">
        ${groupsHtml}
        ${editMode ? `<div class="ql-add-group-area"><button class="ql-add-group-btn" id="ql-add-group">+ Add group</button></div>` : ''}
      </div>`;

    attachEvents(el);
  }

  function attachEvents(el) {
    el.querySelector('#ql-edit-toggle')?.addEventListener('click', () => {
      editMode = !editMode;
      render();
    });

    el.querySelector('#ql-add-group')?.addEventListener('click', async () => {
      const name = prompt('Group name:');
      if (!name?.trim()) return;
      groups.push({ id: uid(), name: name.trim(), links: [] });
      await saveGroups();
      render();
    });

    el.querySelectorAll('.ql-add-link-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        const gid = btn.dataset.gid;
        const label = prompt('Link label:');
        if (!label?.trim()) return;
        const url = prompt('URL (https://...):');
        if (!url?.trim()) return;
        const group = groups.find(g => g.id === gid);
        if (!group) return;
        group.links.push({ id: uid(), label: label.trim(), url: url.trim(), emoji: '🔗' });
        await saveGroups();
        render();
      });
    });

    el.querySelectorAll('.ql-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        const { gid, lid } = btn.dataset;
        const group = groups.find(g => g.id === gid);
        if (!group) return;
        group.links = group.links.filter(l => l.id !== lid);
        await saveGroups();
        render();
      });
    });

    el.querySelectorAll('.ql-rename-group').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        const { gid } = btn.dataset;
        const group = groups.find(g => g.id === gid);
        if (!group) return;
        const name = prompt('New group name:', group.name);
        if (!name?.trim()) return;
        group.name = name.trim();
        await saveGroups();
        render();
      });
    });

    el.querySelectorAll('.ql-del-group').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        const { gid } = btn.dataset;
        if (!confirm('Delete this group and all its links?')) return;
        groups = groups.filter(g => g.id !== gid);
        await saveGroups();
        render();
      });
    });
  }

  async function init() {
    await loadGroups();
    render();
  }

  return { init };
})();
