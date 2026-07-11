(function () {
  'use strict';

  // --- State ---
  let allPlugins = [];
  let currentType = 'all';
  let currentCategory = 'all';
  let currentSearch = '';

  // --- Icons (inline SVG helpers) ---
  const icons = {
    tool: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    permission: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    setting: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    window: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/></svg>',
    puzzle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.39 4.39a1.85 1.85 0 0 0-2.75.8l-.24.68a2 2 0 0 1-2.6 1.18l-.68-.24a1.85 1.85 0 0 0-2.4 2.4l.24.68a2 2 0 0 1-1.18 2.6l-.68.24a1.85 1.85 0 0 0 .8 2.75l.68.24a2 2 0 0 1 1.18 2.6l-.24.68a1.85 1.85 0 0 0 2.4 2.4l.68-.24a2 2 0 0 1 2.6 1.18l.24.68a1.85 1.85 0 0 0 2.75-.8l.24-.68a2 2 0 0 1 2.6-1.18l.68.24a1.85 1.85 0 0 0 2.4-2.4l-.24-.68a2 2 0 0 1 1.18-2.6l.68-.24a1.85 1.85 0 0 0-.8-2.75l-.68-.24a2 2 0 0 1-1.18-2.6l.24-.68a1.85 1.85 0 0 0-2.4-2.4l-.68.24a2 2 0 0 1-2.6-1.18z"/><circle cx="12" cy="12" r="3"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    download: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
    code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  };

  const categoryLabels = {
    browser: 'Browser',
    'dev-tools': 'Dev Tools',
    productivity: 'Productivity',
    media: 'Media',
    community: 'Community',
  };

  // --- DOM refs ---
  const pluginGrid = document.getElementById('pluginGrid');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const header = document.getElementById('header');
  const themeToggle = document.getElementById('themeToggle');
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const nav = document.getElementById('nav');
  const menuIcon = document.getElementById('menuIcon');
  const closeMenuIcon = document.getElementById('closeMenuIcon');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const modalTitle = document.getElementById('modalTitle');
  const modalMeta = document.getElementById('modalMeta');
  const modalBody = document.getElementById('modalBody');

  // --- Helpers ---
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getIconForCategory(category) {
    switch (category) {
      case 'browser':
        return icons.window;
      case 'media':
        return icons.star;
      case 'dev-tools':
        return icons.code;
      default:
        return icons.puzzle;
    }
  }

  function formatPermission(p) {
    let s = p.type;
    if (p.allowedHosts && p.allowedHosts.length) {
      s += ` (${p.allowedHosts.join(', ')})`;
    }
    if (p.allowedPaths && p.allowedPaths.length) {
      s += ` (${p.allowedPaths.join(', ')})`;
    }
    return s;
  }

  // --- Rendering ---
  function renderPlugins() {
    const filtered = allPlugins.filter((plugin) => {
      if (currentType !== 'all' && plugin.type !== currentType) return false;
      if (currentCategory !== 'all' && plugin.category !== currentCategory) return false;
      if (currentSearch) {
        const term = currentSearch.toLowerCase();
        const text = [
          plugin.name,
          plugin.id,
          plugin.description,
          plugin.author,
          ...(plugin.tags || []),
          ...(plugin.tools || []).map((t) => `${t.name} ${t.description}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!text.includes(term)) return false;
      }
      return true;
    });

    pluginGrid.innerHTML = '';

    if (filtered.length === 0) {
      pluginGrid.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    pluginGrid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filtered.forEach((plugin) => {
      const card = document.createElement('article');
      card.className = 'plugin-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `View details for ${escapeHtml(plugin.name)}`);

      const badgeClass = plugin.type === 'official' ? 'badge-official' : 'badge-community';
      const badgeText = plugin.type === 'official' ? 'Official' : 'Community';
      const toolCount = (plugin.tools || []).length;
      const permissionCount = (plugin.permissions || []).length;
      const categoryLabel = categoryLabels[plugin.category] || plugin.category || 'General';

      card.innerHTML = `
        <div class="plugin-card-header">
          <div class="plugin-icon">${getIconForCategory(plugin.category)}</div>
          <div class="plugin-title">
            <h3>${escapeHtml(plugin.name)}</h3>
            <div class="meta">
              <span>v${escapeHtml(plugin.version)}</span>
              <span>by ${escapeHtml(plugin.author || 'Unknown')}</span>
            </div>
          </div>
        </div>
        <p class="plugin-desc">${escapeHtml(plugin.description || '')}</p>
        <div class="plugin-tags">
          <span class="badge ${badgeClass}">${badgeText}</span>
          <span class="badge badge-category">${escapeHtml(categoryLabel)}</span>
          ${(plugin.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="plugin-card-footer">
          <div class="plugin-stats">
            <span title="Tools">${icons.tool} ${toolCount}</span>
            <span title="Permissions">${icons.permission} ${permissionCount}</span>
          </div>
          <span class="btn btn-sm btn-primary">Details</span>
        </div>
      `;

      card.addEventListener('click', () => openModal(plugin));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(plugin);
        }
      });

      pluginGrid.appendChild(card);
    });
  }

  function openModal(plugin) {
    const badgeClass = plugin.type === 'official' ? 'badge-official' : 'badge-community';
    const badgeText = plugin.type === 'official' ? 'Official' : 'Community';
    const categoryLabel = categoryLabels[plugin.category] || plugin.category || 'General';

    modalTitle.textContent = plugin.name;
    modalMeta.innerHTML = `
      <span class="badge ${badgeClass}">${badgeText}</span>
      <span class="badge badge-category">${escapeHtml(categoryLabel)}</span>
      <span>v${escapeHtml(plugin.version)}</span>
      <span>${escapeHtml(plugin.author || 'Unknown')}</span>
      <span>ID: ${escapeHtml(plugin.id)}</span>
    `;

    const toolsHtml = (plugin.tools || []).length
      ? plugin.tools
          .map(
            (tool) => `
          <div class="modal-list-item tool-item">
            <span class="tool-name">${escapeHtml(tool.name)}</span>
            <span class="tool-desc">${escapeHtml(tool.description || '')}</span>
          </div>
        `
          )
          .join('')
      : '<p>No tools declared.</p>';

    const permissionsHtml = (plugin.permissions || []).length
      ? plugin.permissions
          .map(
            (p) => `
          <div class="modal-list-item">
            ${icons.permission}
            <span>${escapeHtml(formatPermission(p))}</span>
          </div>
        `
          )
          .join('')
      : '<p>No permissions declared.</p>';

    const settingsHtml = (plugin.settings || []).length
      ? plugin.settings
          .map(
            (s) => `
          <div class="modal-list-item setting-item">
            <span class="setting-name">${escapeHtml(s.label || s.key)}</span>
            <span class="setting-meta">${escapeHtml(s.type)}${s.required ? ' · required' : ''}${s.default !== undefined ? ` · default: ${escapeHtml(String(s.default))}` : ''}</span>
          </div>
        `
          )
          .join('')
      : '<p>No settings declared.</p>';

    const windowsHtml = (plugin.windows || []).length
      ? plugin.windows
          .map(
            (w) => `
          <div class="modal-list-item">
            ${icons.window}
            <span>${escapeHtml(w.title || w.windowId)} (${w.defaultWidth || '-'}×${w.defaultHeight || '-'})</span>
          </div>
        `
          )
          .join('')
      : '';

    const installSteps = plugin.downloadUrl
      ? `
      <ol>
        <li>Download the plugin zip from the release below.</li>
        <li>Extract it into your ModelFlow plugins directory.</li>
        <li>Restart ModelFlow and enable the plugin in Settings → Plugins.</li>
      </ol>
      <div class="modal-actions">
        <a href="${escapeHtml(plugin.downloadUrl)}" class="btn btn-primary" target="_blank" rel="noopener">${icons.download} Download Zip</a>
        ${plugin.repo ? `<a href="${escapeHtml(plugin.repo)}" class="btn btn-secondary" target="_blank" rel="noopener">${icons.code} Source</a>` : ''}
      </div>
    `
      : `
      <ol>
        <li>Clone or download the plugin source from the repository below.</li>
        <li>Place the plugin folder into your ModelFlow plugins directory.</li>
        <li>Restart ModelFlow and enable the plugin in Settings → Plugins.</li>
      </ol>
      <div class="modal-actions">
        ${plugin.repo ? `<a href="${escapeHtml(plugin.repo)}" class="btn btn-primary" target="_blank" rel="noopener">${icons.code} View Source</a>` : ''}
      </div>
    `;

    modalBody.innerHTML = `
      <div class="modal-section">
        <h4>About</h4>
        <p>${escapeHtml(plugin.description || 'No description provided.')}</p>
      </div>
      <div class="modal-section">
        <h4>Tools (${(plugin.tools || []).length})</h4>
        <div class="modal-list">${toolsHtml}</div>
      </div>
      <div class="modal-section">
        <h4>Permissions (${(plugin.permissions || []).length})</h4>
        <div class="modal-list">${permissionsHtml}</div>
      </div>
      <div class="modal-section">
        <h4>Settings (${(plugin.settings || []).length})</h4>
        <div class="modal-list">${settingsHtml}</div>
      </div>
      ${windowsHtml ? `
      <div class="modal-section">
        <h4>Windows (${(plugin.windows || []).length})</h4>
        <div class="modal-list">${windowsHtml}</div>
      </div>` : ''}
      ${plugin.eventSources && plugin.eventSources.length ? `
      <div class="modal-section">
        <h4>Event Sources (${plugin.eventSources.length})</h4>
        <div class="modal-list">
          ${plugin.eventSources.map((es) => `
            <div class="modal-list-item">${icons.tool}<span>${escapeHtml(es.id)} → ${escapeHtml(es.topic)} (every ${es.interval || 60}s)</span></div>
          `).join('')}
        </div>
      </div>` : ''}
      <div class="modal-section">
        <h4>Install</h4>
        <div class="install-box">${installSteps}</div>
      </div>
    `;

    modalOverlay.classList.add('open');
    modalOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
    modalOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // --- Theme ---
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      moonIcon.classList.add('hidden');
      sunIcon.classList.remove('hidden');
    } else {
      moonIcon.classList.remove('hidden');
      sunIcon.classList.add('hidden');
    }
    try {
      localStorage.setItem('modelflow-plugins-theme', theme);
    } catch (e) {
      // ignore storage errors
    }
  }

  function initTheme() {
    let theme = 'dark';
    try {
      const saved = localStorage.getItem('modelflow-plugins-theme');
      if (saved === 'light' || saved === 'dark') theme = saved;
    } catch (e) {
      // ignore
    }
    applyTheme(theme);
  }

  // --- Events ---
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    renderPlugins();
  });

  categorySelect.addEventListener('change', (e) => {
    currentCategory = e.target.value;
    renderPlugins();
  });

  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      filterTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      currentType = tab.dataset.type;
      renderPlugins();
    });
  });

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  mobileMenuBtn.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
    menuIcon.classList.toggle('hidden', isOpen);
    closeMenuIcon.classList.toggle('hidden', !isOpen);
  });

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) {
      closeModal();
    }
  });

  // --- Init ---
  async function init() {
    initTheme();

    try {
      const response = await fetch('data/plugins.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      allPlugins = await response.json();
    } catch (err) {
      console.error('Failed to load plugins:', err);
      pluginGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          <h3>Failed to load plugins</h3>
          <p>Please make sure data/plugins.json is accessible and try again.</p>
        </div>
      `;
      return;
    }

    renderPlugins();
  }

  init();
})();
