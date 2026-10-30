/* Habits — one-tap status, in-place updates, archive and weekly chart. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  const dateKey = data.dateKey;

  function updateRing(percent) {
    const circle = document.querySelector('.ring svg circle:last-of-type');
    if (!circle) return;
    const radius = Number(circle.getAttribute('r')) || 0;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, percent));
    circle.setAttribute('stroke-dasharray', circumference.toFixed(2));
    circle.setAttribute('stroke-dashoffset', (circumference * (1 - clamped / 100)).toFixed(2));
    const valueNode = document.querySelector('.ring .ring-label strong');
    if (valueNode) valueNode.textContent = `${Math.round(clamped)}%`;
  }

  function refreshFromDay(day) {
    const heroNumber = document.querySelector('.day-number');
    if (heroNumber) heroNumber.innerHTML = `${day.done}<span> / ${day.applicable}</span>`;
    const sub = document.querySelector('.hero .muted.small');
    if (sub) {
      sub.textContent = `${day.percent}% complete${day.skipped ? ` · ${day.skipped} skipped` : ''}`;
    }
    updateRing(day.percent);

    day.habits.forEach((habit) => {
      const row = document.querySelector(`[data-habit-row="${habit._id}"]`);
      if (!row) return;
      const meta = row.querySelector('.list-item-meta');
      const labels = { done: 'Completed', skipped: 'Skipped', na: 'Not applicable' };
      if (meta) meta.textContent = habit.status ? labels[habit.status] : 'Not marked';
      row.querySelectorAll('[data-set-status]').forEach((chip) => {
        chip.classList.remove('is-done', 'is-skipped', 'is-na');
        if (habit.status && chip.dataset.setStatus === habit.status) {
          chip.classList.add(
            habit.status === 'done' ? 'is-done' : habit.status === 'skipped' ? 'is-skipped' : 'is-na'
          );
        }
      });
    });
  }

  document.querySelectorAll('[data-set-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const habitId = button.dataset.habitId;
      const status = button.dataset.setStatus;
      const row = button.closest('[data-habit-row]');
      const active = button.classList.contains(
        status === 'done' ? 'is-done' : status === 'skipped' ? 'is-skipped' : 'is-na'
      );
      try {
        const result = await window.LIFEOS.api(`/api/habits/${habitId}/status`, {
          method: 'POST',
          body: { dateKey, status: active ? 'clear' : status },
        });
        if (result.queued) return;
        refreshFromDay(result.day);
        if (row) row.scrollIntoView({ block: 'nearest' });
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  document.querySelectorAll('[data-archive-habit]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Archive this habit? Past completions are kept.')) return;
      try {
        await window.LIFEOS.api(`/api/habits/${button.dataset.archiveHabit}`, { method: 'DELETE' });
        window.LIFEOS.flash('Habit archived', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  const saveHabit = document.getElementById('save-habit');
  if (saveHabit) {
    saveHabit.addEventListener('click', async () => {
      const name = document.getElementById('habit-name').value.trim();
      if (!name) {
        window.LIFEOS.toast('Give the habit a name.', 'error');
        return;
      }
      try {
        await window.LIFEOS.api('/api/habits', { method: 'POST', body: { name } });
        window.LIFEOS.flash('Habit added', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  }

  const colors = window.LIFEOS.chartColors();
  const days = data.days || [];
  window.LIFEOS.createChart('chart-habits', {
    type: 'line',
    data: {
      labels: days.map((day) => day.dateKey.slice(5)),
      datasets: [
        {
          label: 'Habits complete (%)',
          data: days.map((day) => day.percent),
          borderColor: colors.success,
          backgroundColor: 'rgba(50,182,122,0.16)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions({
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.muted, font: { size: 9 } }, border: { display: false } },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: colors.grid },
          ticks: { color: colors.muted, font: { size: 9 } },
          border: { display: false },
        },
      },
    }),
  });
})();
