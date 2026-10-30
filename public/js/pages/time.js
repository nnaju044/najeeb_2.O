/* 24-hour tracker — bottom sheet editing, hour caps and charts. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  const dateKey = data.dateKey;
  const categories = ['productive', 'unproductive', 'rest', 'sleep'];

  const sheet = document.getElementById('hour-sheet');
  const inputs = {};
  categories.forEach((category) => {
    inputs[category] = sheet.querySelector(`[data-input="${category}"]`);
  });
  const readouts = {};
  categories.forEach((category) => {
    readouts[category] = sheet.querySelector(`[data-readout="${category}"]`);
  });
  const remainingEl = document.getElementById('hour-remaining');
  const balanceEl = document.getElementById('hour-balance');
  const saveButton = document.getElementById('save-hour');
  const titleEl = document.getElementById('hour-sheet-title');
  const subtitleEl = document.getElementById('hour-sheet-sub');

  let activeHour = null;

  function values() {
    const result = {};
    categories.forEach((category) => {
      const parsed = Math.max(0, Math.min(60, Math.round(Number(inputs[category].value) || 0)));
      result[category] = parsed;
    });
    return result;
  }

  function render() {
    const current = values();
    const total = categories.reduce((sum, category) => sum + current[category], 0);
    const remaining = 60 - total;

    categories.forEach((category) => {
      if (readouts[category]) readouts[category].textContent = `${current[category]} min`;
      const value = current[category];
      sheet.querySelectorAll(`[data-chips="${category}"] .chip`).forEach((chip) => {
        chip.classList.toggle('is-active', Number(chip.dataset.value) === value);
      });
    });

    if (remainingEl) remainingEl.textContent = remaining;
    if (balanceEl) {
      balanceEl.classList.toggle('is-over', remaining < 0);
      balanceEl.classList.toggle('is-balanced', remaining === 0);
      balanceEl.querySelector('span').textContent = remaining === 0 ? 'Hour accounted' : remaining > 0 ? 'Unclassified' : 'Over by';
    }
    if (saveButton) saveButton.disabled = remaining < 0;
  }

  categories.forEach((category) => {
    inputs[category].addEventListener('input', render);
    sheet.querySelectorAll(`[data-chips="${category}"] .chip`).forEach((chip) => {
      chip.addEventListener('click', () => {
        inputs[category].value = chip.dataset.value;
        render();
      });
    });
  });

  function openForRow(row) {
    activeHour = Number(row.dataset.hour);
    titleEl.textContent = row.dataset.label;
    subtitleEl.textContent = Number(row.dataset.total) > 0 ? `${row.dataset.total} minutes recorded` : 'Not tracked yet';
    categories.forEach((category) => {
      inputs[category].value = Number(row.dataset[category]) || 0;
    });
    render();
    window.LIFEOS.openSheet(sheet);
  }

  document.querySelectorAll('[data-hour-row]').forEach((row) => {
    row.addEventListener('click', () => openForRow(row));
  });

  document.getElementById('mark-sleep').addEventListener('click', () => {
    inputs.productive.value = 0;
    inputs.unproductive.value = 0;
    inputs.rest.value = 0;
    inputs.sleep.value = 60;
    render();
  });

  document.getElementById('clear-hour').addEventListener('click', async () => {
    if (activeHour === null) return;
    try {
      const result = await window.LIFEOS.api('/api/time/clear-hour', {
        method: 'POST',
        body: { dateKey, hour: activeHour },
      });
      if (result.queued) return;
      window.LIFEOS.closeSheet();
      window.LIFEOS.flash('Hour cleared', 'success');
      window.location.reload();
    } catch (_error) {
      /* handled by toast */
    }
  });

  saveButton.addEventListener('click', async () => {
    if (activeHour === null) return;
    const current = values();
    const total = categories.reduce((sum, category) => sum + current[category], 0);
    if (total > 60) {
      window.LIFEOS.toast('An hour cannot hold more than 60 minutes.', 'error');
      return;
    }
    saveButton.disabled = true;
    try {
      const result = await window.LIFEOS.api('/api/time/hour', {
        method: 'POST',
        body: { dateKey, hour: activeHour, ...current },
      });
      window.LIFEOS.closeSheet();
      if (result.queued) {
        window.LIFEOS.flash('Hour saved on this device — syncing later.', 'success');
        window.location.reload();
        return;
      }
      window.LIFEOS.flash(total === 0 ? 'Hour cleared' : 'Hour saved', 'success');
      window.location.reload();
    } catch (_error) {
      saveButton.disabled = false;
    }
  });

  const copyButton = document.getElementById('copy-yesterday');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      if (!window.confirm('Copy tracked hours from the previous day? Only empty hours are filled.')) return;
      try {
        const result = await window.LIFEOS.api('/api/time/copy-day', {
          method: 'POST',
          body: { fromDateKey: copyButton.dataset.source, toDateKey: copyButton.dataset.target },
        });
        if (result.queued) return;
        window.LIFEOS.flash(`${result.copied} hours copied`, 'success');
        window.location.reload();
      } catch (_error) {
        /* handled by toast */
      }
    });
  }

  /* ── charts ──────────────────────────────────────────────────────────── */
  const colors = window.LIFEOS.chartColors();
  const hours = data.hours || [];

  window.LIFEOS.createChart('chart-hourly', {
    type: 'bar',
    data: {
      labels: hours.map((hour) => hour.hour),
      datasets: [
        {
          label: 'Productive',
          data: hours.map((hour) => hour.productive),
          backgroundColor: colors.success,
          stack: 'time',
          borderRadius: 2,
        },
        {
          label: 'Unproductive',
          data: hours.map((hour) => hour.unproductive),
          backgroundColor: colors.danger,
          stack: 'time',
          borderRadius: 2,
        },
        {
          label: 'Rest',
          data: hours.map((hour) => hour.rest),
          backgroundColor: colors.rest,
          stack: 'time',
          borderRadius: 2,
        },
        {
          label: 'Sleep',
          data: hours.map((hour) => hour.sleep),
          backgroundColor: colors.sleep,
          stack: 'time',
          borderRadius: 2,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions({
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: colors.muted, font: { size: 8 }, autoSkip: true, maxTicksLimit: 12 },
          border: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 60,
          grid: { color: colors.grid },
          ticks: { color: colors.muted, font: { size: 9 }, stepSize: 15 },
          border: { display: false },
        },
      },
      plugins: { legend: { display: true, labels: { color: colors.muted, boxWidth: 9, usePointStyle: true, font: { size: 9 } } } },
    }),
  });

  const totals = hours.reduce(
    (acc, hour) => {
      acc.productive += hour.productive;
      acc.unproductive += hour.unproductive;
      acc.rest += hour.rest;
      acc.sleep += hour.sleep;
      return acc;
    },
    { productive: 0, unproductive: 0, rest: 0, sleep: 0 }
  );

  const doughnutCanvas = document.getElementById('chart-doughnut');
  if (doughnutCanvas) {
    const unclassified = Math.max(0, 1440 - (totals.productive + totals.unproductive + totals.rest + totals.sleep));
    window.LIFEOS.createChart('chart-doughnut', {
      type: 'doughnut',
      data: {
        labels: ['Productive', 'Unproductive', 'Rest', 'Sleep', 'Untracked'],
        datasets: [
          {
            data: [totals.productive, totals.unproductive, totals.rest, totals.sleep, unclassified],
            backgroundColor: [colors.success, colors.danger, colors.rest, colors.sleep, colors.track],
            borderColor: 'transparent',
            borderWidth: 0,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: { position: 'bottom', labels: { color: colors.muted, boxWidth: 9, usePointStyle: true, font: { size: 10 } } },
        },
      },
    });
  }

  const week = data.week || [];
  window.LIFEOS.createChart('chart-week', {
    type: 'bar',
    data: {
      labels: week.map((day) => day.dateKey.slice(5)),
      datasets: [
        {
          label: 'Recorded h',
          data: week.map((day) => Math.round((day.recorded / 60) * 10) / 10),
          backgroundColor: colors.track,
          borderRadius: 4,
        },
        {
          label: 'Productive h',
          data: week.map((day) => Math.round((day.productive / 60) * 10) / 10),
          backgroundColor: colors.success,
          borderRadius: 4,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions(),
  });
})();
