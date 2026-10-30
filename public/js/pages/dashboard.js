/* Dashboard — water taps and habit toggles without leaving the page. */
(function () {
  'use strict';

  const waterBox = document.getElementById('dashboard-water');
  const valueEl = document.getElementById('dash-water-value');
  const noteEl = document.getElementById('dash-water-note');
  const barEl = document.getElementById('dash-water-bar');
  const labelEl = document.getElementById('dash-water-label');

  function applyWater(summary) {
    if (!summary) return;
    if (valueEl) valueEl.innerHTML = `${(summary.totalMl / 1000).toFixed(2)}<small>L</small>`;
    if (noteEl) noteEl.textContent = `${summary.percent}% of target`;
    if (barEl) barEl.style.width = `${Math.min(100, summary.percent)}%`;
    if (labelEl) labelEl.textContent = `${(summary.totalMl / 1000).toFixed(2)} / ${(summary.targetMl / 1000).toFixed(1)} L`;
  }

  if (waterBox) {
    const dateKey = waterBox.dataset.date;
    waterBox.querySelectorAll('[data-water]').forEach((button) => {
      button.addEventListener('click', async () => {
        const amountMl = Number(button.dataset.water);
        if (!amountMl) return;
        button.setAttribute('aria-busy', 'true');
        try {
          const result = await window.LIFEOS.api('/api/water', {
            method: 'POST',
            body: { dateKey, amountMl },
          });
          if (result.queued) return;
          applyWater(result.summary);
          window.LIFEOS.toast(`+${amountMl} ml water`, 'success');
        } finally {
          button.removeAttribute('aria-busy');
        }
      });
    });
  }

  const noteButton = document.getElementById('save-note');
  if (noteButton) {
    noteButton.addEventListener('click', async () => {
      const textarea = document.getElementById('daily-note');
      const status = document.getElementById('note-status');
      noteButton.disabled = true;
      try {
        await window.LIFEOS.api('/api/daily-note', {
          method: 'POST',
          body: { dateKey: noteButton.dataset.date, notes: textarea.value },
        });
        if (status) status.textContent = 'Saved';
        window.LIFEOS.toast('Note saved', 'success');
      } catch (_error) {
        /* toast shown */
      } finally {
        noteButton.disabled = false;
      }
    });
  }

  const habitSummary = document.getElementById('dash-habit-summary');

  document.querySelectorAll('[data-habit-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const habitId = button.dataset.habitId;
      const dateKey = button.dataset.date;
      const current = button.dataset.status || 'none';
      const next = current === 'done' ? 'clear' : 'done';
      try {
        const result = await window.LIFEOS.api(`/api/habits/${habitId}/status`, {
          method: 'POST',
          body: { dateKey, status: next },
        });
        if (result.queued) return;
        const day = result.day;
        const habit = day.habits.find((entry) => entry._id === habitId);
        button.dataset.status = habit.status || 'none';
        button.setAttribute('aria-pressed', habit.status === 'done' ? 'true' : 'false');
        const meta = button.querySelector('.list-item-meta');
        if (meta) {
          meta.textContent = habit.status === 'done' ? 'DONE' : habit.status === 'skipped' ? 'SKIPPED' : 'Tap to complete';
        }
        const tag = button.querySelector('.tag');
        if (tag) {
          tag.className = `tag ${habit.status === 'done' ? 'success' : habit.status === 'skipped' ? 'warning' : ''}`;
          tag.innerHTML = window.lucide ? '<i data-lucide="check"></i>' : '';
          window.LIFEOS.refreshIcons();
        }
        if (habitSummary) habitSummary.textContent = `${day.done}/${day.total} done`;
      } catch (_error) {
        /* toast already shown by the API helper */
      }
    });
  });

  const prayerBox = document.getElementById('prayer-tracker-card');
  if (prayerBox) {
    const dateKey = prayerBox.dataset.date;
    const summaryEl = document.getElementById('prayer-progress-summary');
    const barEl = document.getElementById('prayer-bar-fill');

    prayerBox.querySelectorAll('[data-prayer]').forEach((chip) => {
      chip.addEventListener('click', async () => {
        const prayerName = chip.dataset.prayer;
        const currentCompleted = chip.dataset.completed === 'true';
        const nextCompleted = !currentCompleted;

        chip.disabled = true;
        try {
          const result = await window.LIFEOS.api('/api/prayer/toggle', {
            method: 'POST',
            body: { dateKey, prayerName, completed: nextCompleted },
          });

          if (result.queued) return;

          const day = result.day;
          const updated = day.prayers.find((p) => p.name === prayerName);
          const isDone = Boolean(updated && updated.completed);

          chip.dataset.completed = isDone ? 'true' : 'false';
          chip.classList.toggle('is-completed', isDone);

          const indicator = chip.querySelector('.prayer-chip-indicator');
          if (indicator) {
            indicator.innerHTML = isDone
              ? '<i data-lucide="check"></i>'
              : `<i data-lucide="${updated.icon}"></i>`;
            if (window.LIFEOS.refreshIcons) window.LIFEOS.refreshIcons();
          }

          if (summaryEl) {
            summaryEl.textContent = `${day.completedCount} / ${day.totalCount} completed · ${day.percent}%`;
          }
          if (barEl) {
            barEl.style.width = `${day.percent}%`;
          }

          window.LIFEOS.toast(`${prayerName} ${isDone ? 'marked completed' : 'unmarked'}`, 'success');
        } catch (_error) {
          /* toast shown */
        } finally {
          chip.disabled = false;
        }
      });
    });
  }
})();
