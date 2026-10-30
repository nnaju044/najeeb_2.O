/* Prayer Tracker — one-tap completion controls and instant feedback */
(function () {
  'use strict';

  const card = document.getElementById('prayer-list-card');
  if (!card) return;

  const dateKey = card.dataset.date;
  const summaryEl = document.getElementById('prayer-page-summary');
  const barEl = document.getElementById('prayer-page-bar');

  card.querySelectorAll('.prayer-row').forEach((row) => {
    const prayerName = row.dataset.prayer;
    const btn = row.querySelector('.prayer-toggle-btn');

    async function togglePrayer() {
      const isCompleted = row.dataset.completed === 'true';
      const nextCompleted = !isCompleted;

      btn.disabled = true;
      try {
        const result = await window.LIFEOS.api('/api/prayer/toggle', {
          method: 'POST',
          body: { dateKey, prayerName, completed: nextCompleted },
        });

        if (result.queued) return;

        const day = result.day;
        const updated = day.prayers.find((p) => p.name === prayerName);
        const isDone = Boolean(updated && updated.completed);

        row.dataset.completed = isDone ? 'true' : 'false';
        row.classList.toggle('is-completed', isDone);

        // Update button appearance
        btn.classList.toggle('is-primary', isDone);
        btn.innerHTML = isDone
          ? '<i data-lucide="check"></i><span>Completed</span>'
          : '<i data-lucide="circle"></i><span>Mark done</span>';

        // Update icon box
        const iconBox = row.querySelector('.prayer-icon-box');
        if (iconBox) {
          iconBox.innerHTML = isDone
            ? '<i data-lucide="check"></i>'
            : `<i data-lucide="${updated.icon}"></i>`;
        }

        // Update summary text and progress bar
        if (summaryEl) {
          summaryEl.textContent = `${day.completedCount} of ${day.totalCount} completed`;
        }
        if (barEl) {
          barEl.style.width = `${day.percent}%`;
        }

        if (window.LIFEOS.refreshIcons) {
          window.LIFEOS.refreshIcons();
        }

        window.LIFEOS.toast(`${prayerName} ${isDone ? 'marked completed' : 'unmarked'}`, 'success');
      } catch (_error) {
        /* Error handled by API wrapper */
      } finally {
        btn.disabled = false;
      }
    }

    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePrayer();
      });
    }

    row.addEventListener('click', (e) => {
      if (e.target.closest('.prayer-toggle-btn')) return;
      togglePrayer();
    });
  });

  window.LIFEOS.renderSyncState();
  window.LIFEOS.flushQueue();
})();
