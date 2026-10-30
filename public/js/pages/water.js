/* Water — one-tap logging, undo, delete and 7-day chart. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  const dateKey = data.dateKey;

  async function add(amountMl) {
    if (!amountMl || amountMl < 1) return;
    try {
      const result = await window.LIFEOS.api('/api/water', { method: 'POST', body: { dateKey, amountMl } });
      if (result.queued) return;
      window.LIFEOS.flash(`+${amountMl} ml water`, 'success');
      window.location.reload();
    } catch (_error) {
      /* toast shown */
    }
  }

  document.querySelectorAll('[data-water-amount]').forEach((button) => {
    button.addEventListener('click', () => add(Number(button.dataset.waterAmount)));
  });

  const customInput = document.getElementById('water-custom');
  const customAdd = document.getElementById('water-custom-add');
  if (customAdd && customInput) {
    customAdd.addEventListener('click', () => add(Math.round(Number(customInput.value))));
    customInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') add(Math.round(Number(customInput.value)));
    });
  }

  const undo = document.getElementById('water-undo');
  if (undo) {
    undo.addEventListener('click', async () => {
      try {
        const result = await window.LIFEOS.api('/api/water/undo', { method: 'POST', body: { dateKey } });
        if (result.queued) return;
        window.LIFEOS.flash(`Removed ${result.removed.amountMl} ml`, 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  }

  document.querySelectorAll('[data-delete-entry]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.LIFEOS.api(`/api/water/${button.dataset.deleteEntry}`, { method: 'DELETE' });
        window.LIFEOS.flash('Entry deleted', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  const colors = window.LIFEOS.chartColors();
  const week = data.week || [];
  window.LIFEOS.createChart('chart-water', {
    type: 'bar',
    data: {
      labels: week.map((day) => day.dateKey.slice(5)),
      datasets: [
        {
          label: 'Water (L)',
          data: week.map((day) => Math.round(day.totalMl / 100) / 10),
          backgroundColor: colors.sleep,
          borderRadius: 5,
        },
        {
          type: 'line',
          label: 'Target (L)',
          data: week.map(() => Math.round((data.targetMl / 1000) * 10) / 10),
          borderColor: colors.muted,
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions(),
  });
})();
