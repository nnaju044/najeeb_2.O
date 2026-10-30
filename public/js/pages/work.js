/* Focused work — category and duration chips, session logging, 30-day chart. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  let category = 'Coding';
  const categoryChips = document.querySelectorAll('[data-work-category]');
  const durationChips = document.querySelectorAll('[data-work-duration]');
  const durationInput = document.getElementById('work-duration');

  categoryChips.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.workCategory === category);
    chip.addEventListener('click', () => {
      category = chip.dataset.workCategory;
      categoryChips.forEach((other) => other.classList.toggle('is-active', other === chip));
    });
  });

  durationChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      durationChips.forEach((other) => other.classList.toggle('is-active', other === chip));
      durationInput.value = chip.dataset.workDuration;
    });
  });

  const save = document.getElementById('save-work');
  save.addEventListener('click', async () => {
    const durationMinutes = Math.round(Number(durationInput.value) || 0);
    if (durationMinutes < 5 || durationMinutes > 480) {
      window.LIFEOS.toast('Sessions must be 5–480 minutes.', 'error');
      return;
    }
    save.disabled = true;
    try {
      const result = await window.LIFEOS.api('/api/work-sessions', {
        method: 'POST',
        body: {
          dateKey: data.todayKey || new Date().toISOString().slice(0, 10),
          startTime: document.getElementById('work-start').value || '10:00',
          durationMinutes,
          category,
          project: document.getElementById('work-project').value.trim(),
        },
      });
      if (result.queued) return;
      const note = result.allocated !== undefined && result.allocated < durationMinutes
        ? `Saved · ${result.allocated} min added to the tracker`
        : 'Session saved';
      window.LIFEOS.flash(note, 'success');
      window.location.reload();
    } catch (_error) {
      save.disabled = false;
    }
  });

  document.querySelectorAll('[data-delete-work]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this session? The tracked productive minutes are reversed.')) return;
      try {
        await window.LIFEOS.api(`/api/work-sessions/${button.dataset.deleteWork}`, { method: 'DELETE' });
        window.LIFEOS.flash('Session deleted', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  const colors = window.LIFEOS.chartColors();
  const month = data.month || { days: [] };
  window.LIFEOS.createChart('chart-work', {
    type: 'bar',
    data: {
      labels: (month.days || []).map((day) => day.dateKey.slice(5)),
      datasets: [
        {
          label: 'Focused minutes',
          data: (month.days || []).map((day) => day.minutes),
          backgroundColor: colors.accent,
          borderRadius: 3,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions({
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.muted, font: { size: 8 }, autoSkip: true, maxTicksLimit: 10 }, border: { display: false } },
        y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.muted, font: { size: 9 } }, border: { display: false } },
      },
    }),
  });
})();
