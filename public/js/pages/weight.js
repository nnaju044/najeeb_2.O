/* Body weight — one entry per day, trend chart, deletion. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  const save = document.getElementById('save-weight');

  save.addEventListener('click', async () => {
    const weightKg = Number(document.getElementById('weight-value').value);
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400) {
      window.LIFEOS.toast('Enter a weight between 20 and 400 kg.', 'error');
      return;
    }
    const payload = {
      dateKey: document.getElementById('weight-date').value,
      weightKg,
      notes: '',
    };
    const height = Number(document.getElementById('height-value').value);
    if (Number.isFinite(height) && height > 0) payload.heightCm = height;
    const waist = Number(document.getElementById('waist-value').value);
    if (Number.isFinite(waist) && waist > 0) payload.waistCm = waist;

    save.disabled = true;
    try {
      const result = await window.LIFEOS.api('/api/weights', { method: 'POST', body: payload });
      if (result.queued) return;
      window.LIFEOS.flash('Weight saved', 'success');
      window.location.reload();
    } catch (_error) {
      save.disabled = false;
    }
  });

  document.querySelectorAll('[data-delete-weight]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this weight entry?')) return;
      try {
        await window.LIFEOS.api(`/api/weights/${button.dataset.deleteWeight}`, { method: 'DELETE' });
        window.LIFEOS.flash('Entry deleted', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  const colors = window.LIFEOS.chartColors();
  const entries = data.entries || [];
  window.LIFEOS.createChart('chart-weight', {
    type: 'line',
    data: {
      labels: entries.map((entry) => entry.dateKey.slice(5)),
      datasets: [
        {
          label: 'Weight (kg)',
          data: entries.map((entry) => entry.weightKg),
          borderColor: colors.accent,
          backgroundColor: 'rgba(201,168,76,0.16)',
          borderWidth: 2,
          pointRadius: 3,
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
          grid: { color: colors.grid },
          ticks: { color: colors.muted, font: { size: 9 } },
          border: { display: false },
          suggestedMin: entries.length ? Math.min(...entries.map((entry) => entry.weightKg)) - 2 : 50,
        },
      },
    }),
  });
})();
