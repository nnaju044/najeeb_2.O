/* LIFEOS — shared client behaviour */
(function () {
  'use strict';

  const csrfToken = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
  const QUEUE_KEY = 'lifeos.queue.v1';
  const FLASH_KEY = 'lifeos.flash.v1';

  /* ── offline-safe endpoints ──────────────────────────────────────────────
     Only writes that are idempotent on the server (clientId or natural upsert)
     are queued. Everything else reports an honest "needs connection" error. */
  const OFFLINE_SAFE = [
    /^\/api\/time\/hour$/,
    /^\/api\/time\/sleep-hour$/,
    /^\/api\/time\/clear-hour$/,
    /^\/api\/water$/,
    /^\/api\/meals$/,
    /^\/api\/sleep$/,
    /^\/api\/workouts$/,
    /^\/api\/weights$/,
    /^\/api\/work-sessions$/,
    /^\/api\/habits\/[a-f0-9]{24}\/status$/,
  ];

  function canQueue(path, method) {
    return method === 'POST' && OFFLINE_SAFE.some((pattern) => pattern.test(path));
  }

  function newClientId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `c_${Date.now().toString(36)}_${random}`;
  }

  /* ── toasts ────────────────────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(message, type) {
    if (!message) return;
    let node = document.getElementById('toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'toast';
      node.className = 'toast';
      node.setAttribute('role', 'status');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.className = `toast is-visible${type ? ` is-${type}` : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.className = 'toast';
    }, 3200);
  }

  function flash(message, type) {
    try {
      sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type }));
    } catch (_error) {
      /* storage unavailable — the action still succeeded */
    }
  }

  function consumeFlash() {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY);
      if (!raw) return;
      sessionStorage.removeItem(FLASH_KEY);
      const parsed = JSON.parse(raw);
      setTimeout(() => toast(parsed.message, parsed.type), 60);
    } catch (_error) {
      /* ignore malformed flash */
    }
  }

  /* ── offline queue ─────────────────────────────────────────────────────── */
  function readQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (_error) {
      toast('Storage is full — this entry could not be queued.', 'error');
    }
    renderSyncState();
  }

  function enqueue(path, body) {
    const queue = readQueue();
    queue.push({
      url: path,
      method: 'POST',
      body,
      createdAt: new Date().toISOString(),
    });
    writeQueue(queue);
  }

  function renderSyncState() {
    const queue = readQueue();
    const banner = document.getElementById('sync-banner');
    const text = document.getElementById('sync-text');
    if (!banner || !text) return;
    banner.classList.toggle('is-offline', !navigator.onLine);
    if (!navigator.onLine) {
      text.textContent = queue.length
        ? `Offline · ${queue.length} ${queue.length === 1 ? 'entry' : 'entries'} waiting to sync`
        : 'Offline · new entries are stored on this device';
    } else if (queue.length) {
      text.textContent = `${queue.length} ${queue.length === 1 ? 'entry' : 'entries'} waiting to sync`;
    } else {
      text.textContent = 'All entries saved to the server.';
    }
  }

  let flushing = false;
  async function flushQueue() {
    if (flushing || !navigator.onLine) return;
    const queue = readQueue();
    if (!queue.length) {
      renderSyncState();
      return;
    }
    flushing = true;
    const remaining = [];
    let synced = 0;
    let authProblem = false;

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify(item.body),
        });
        if (response.ok || response.status === 409) {
          synced += 1;
        } else if (response.status === 401 || response.status === 403) {
          authProblem = true;
          remaining.push(...queue.slice(index));
          break;
        } else if (response.status >= 500) {
          remaining.push(...queue.slice(index));
          break;
        } else {
          // A 4xx means this entry can never be saved; drop it after telling
          // the user, never silently.
          toast('One queued entry was rejected by the server.', 'error');
        }
      } catch (_error) {
        remaining.push(...queue.slice(index));
        break;
      }
    }

    writeQueue(remaining);
    flushing = false;
    if (authProblem) {
      toast('Sign in again to sync offline entries.', 'error');
      return;
    }
    if (synced > 0) {
      toast(`${synced} offline ${synced === 1 ? 'entry' : 'entries'} synced`, 'success');
      setTimeout(() => window.location.reload(), 900);
    }
    renderSyncState();
  }

  /* ── API wrapper ───────────────────────────────────────────────────────── */
  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? { ...options.body } : undefined;
    if (body && method === 'POST' && canQueue(path) && !body.clientId) {
      body.clientId = newClientId();
    }

    let response;
    try {
      response = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      if (body && canQueue(path, method)) {
        enqueue(path, body);
        toast('Saved on this device — will sync when you reconnect.', 'success');
        return { ok: true, queued: true };
      }
      toast('No connection. This action needs the server.', 'error');
      throw networkError;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }

    if (!response.ok) {
      const message = (data && data.error) || 'That action could not be saved.';
      toast(message, 'error');
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  /* ── sheets ────────────────────────────────────────────────────────────── */
  function openSheet(sheetOrId) {
    const sheet = typeof sheetOrId === 'string' ? document.getElementById(sheetOrId) : sheetOrId;
    if (!sheet) return;
    const backdrop = document.getElementById('sheet-backdrop');
    document.querySelectorAll('.sheet.is-open').forEach((node) => node.classList.remove('is-open'));
    if (backdrop) backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const focusable = sheet.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 220);
    refreshIcons();
  }

  function closeSheet() {
    document.querySelectorAll('.sheet.is-open').forEach((node) => node.classList.remove('is-open'));
    const backdrop = document.getElementById('sheet-backdrop');
    if (backdrop) backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  /* ── theme ─────────────────────────────────────────────────────────────── */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F6F7F9' : '#101216');
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  async function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      await api('/api/settings/theme', { method: 'PATCH', body: { theme: next } });
    } catch (_error) {
      applyTheme(next === 'dark' ? 'light' : 'dark');
    }
  }

  /* ── charts ────────────────────────────────────────────────────────────── */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function chartColors() {
    return {
      accent: cssVar('--accent') || '#C9A84C',
      success: cssVar('--success') || '#32B67A',
      danger: cssVar('--danger') || '#E05A5A',
      rest: cssVar('--accent') || '#C9A84C',
      sleep: cssVar('--sleep') || '#5B8DEF',
      text: cssVar('--text') || '#F5F5F5',
      muted: cssVar('--muted') || '#A0A7B4',
      grid: 'rgba(128,128,128,0.14)',
      track: 'rgba(128,128,128,0.12)',
    };
  }

  function baseChartOptions(extra = {}) {
    const colors = chartColors();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: colors.muted,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            font: { size: 10 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(16,18,22,0.94)',
          titleColor: '#F5F5F5',
          bodyColor: '#F5F5F5',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          padding: 9,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.muted, font: { size: 9 }, maxRotation: 0, autoSkipPadding: 8 },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.grid },
          ticks: { color: colors.muted, font: { size: 9 }, maxTicksLimit: 5 },
          border: { display: false },
        },
      },
      ...extra,
    };
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function readPageData() {
    const node = document.getElementById('page-data');
    if (!node) return {};
    try {
      return JSON.parse(node.textContent || '{}');
    } catch (_error) {
      return {};
    }
  }

  function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;
    const context = canvas.getContext('2d');
    return new window.Chart(context, config);
  }

  /* ── wiring ────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    consumeFlash();
    renderSyncState();
    flushQueue();

    const themeButton = document.querySelector('[data-theme-toggle]');
    if (themeButton) themeButton.addEventListener('click', toggleTheme);

    document.querySelectorAll('[data-close-sheet]').forEach((button) => {
      button.addEventListener('click', closeSheet);
    });
    const backdrop = document.getElementById('sheet-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeSheet);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSheet();
    });

    document.querySelectorAll('[data-auto-submit]').forEach((select) => {
      select.addEventListener('change', () => select.form && select.form.submit());
    });

    // Auto-wrap any unwrapped password inputs
    document.querySelectorAll('input[type="password"]:not([data-no-toggle])').forEach((input) => {
      if (input.closest('.password-input-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'password-input-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-toggle';
      btn.setAttribute('aria-label', 'Show password');
      btn.setAttribute('title', 'Show password');
      btn.setAttribute('tabindex', '-1');
      btn.innerHTML = '<i data-lucide="eye"></i>';
      wrap.appendChild(btn);
    });
    refreshIcons();
  });

  // Password visibility toggle handler
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('.password-toggle, [data-toggle-password]');
    if (!toggle) return;
    event.preventDefault();
    const targetId = toggle.getAttribute('data-toggle-password');
    const input = targetId ? document.getElementById(targetId) : toggle.parentElement?.querySelector('input');
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const label = isPassword ? 'Hide password' : 'Show password';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    toggle.setAttribute('aria-pressed', String(isPassword));
    toggle.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}"></i>`;
    refreshIcons();

    if (typeof input.selectionStart === 'number') {
      const pos = input.selectionStart;
      input.focus();
      try { input.setSelectionRange(pos, pos); } catch (_) {}
    } else {
      input.focus();
    }
  });

  window.addEventListener('online', () => {
    toast('Back online — syncing.', 'success');
    flushQueue();
    renderSyncState();
  });
  window.addEventListener('offline', () => {
    toast('You are offline. Entries are stored on this device.', 'error');
    renderSyncState();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is a progressive enhancement */
      });
    });
  }

  const jeebsApi = {
    api,
    toast,
    flash,
    openSheet,
    closeSheet,
    refreshIcons,
    readPageData,
    chartColors,
    baseChartOptions,
    createChart,
    applyTheme,
    currentTheme,
    renderSyncState,
    flushQueue,
    newClientId,
  };
  window.Jeebs = jeebsApi;
  window.LIFEOS = jeebsApi;
})();
