/* Progress — all analytics charts built from stored records. */
(function () {
  'use strict';
  const analytics = window.LIFEOS.readPageData();
  const colors = window.LIFEOS.chartColors();
  const series = analytics.series || {};
  const hourly = analytics.hourly || {};

  window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  window.Chart.defaults.color = colors.muted;

  window.LIFEOS.createChart('chart-score', {
    type: 'line',
    data: {
      labels: series.labels || [],
      datasets: [
        {
          label: 'Daily score',
          data: series.scores || [],
          borderColor: colors.accent,
          backgroundColor: 'rgba(201,168,76,0.16)',
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

  const doughnut = analytics.doughnut || {};
  window.LIFEOS.createChart('chart-doughnut', {
    type: 'doughnut',
    data: {
      labels: ['Productive', 'Unproductive', 'Rest', 'Sleep', 'Untracked'],
      datasets: [
        {
          data: [
            doughnut.productive || 0,
            doughnut.unproductive || 0,
            doughnut.rest || 0,
            doughnut.sleep || 0,
            doughnut.unclassified || 0,
          ],
          backgroundColor: [colors.success, colors.danger, colors.rest, colors.sleep, colors.track],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: colors.muted, boxWidth: 9, usePointStyle: true, font: { size: 10 } } },
      },
    },
  });

  window.LIFEOS.createChart('chart-hourly', {
    type: 'bar',
    data: {
      labels: hourly.labels || [],
      datasets: [
        { label: 'Productive', data: hourly.productive || [], backgroundColor: colors.success, stack: 'h', borderRadius: 2 },
        { label: 'Unproductive', data: hourly.unproductive || [], backgroundColor: colors.danger, stack: 'h', borderRadius: 2 },
        { label: 'Rest', data: hourly.rest || [], backgroundColor: colors.rest, stack: 'h', borderRadius: 2 },
        { label: 'Sleep', data: hourly.sleep || [], backgroundColor: colors.sleep, stack: 'h', borderRadius: 2 },
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
        y: { stacked: true, beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.muted, font: { size: 9 } }, border: { display: false } },
      },
    }),
  });

  const weekly = analytics.weeklySeries || {};
  window.LIFEOS.createChart('chart-weekly', {
    type: 'bar',
    data: {
      labels: weekly.labels || [],
      datasets: [
        {
          label: 'Productive hours',
          data: weekly.productiveHours || [],
          backgroundColor: colors.success,
          borderRadius: 5,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions({ plugins: { legend: { display: false } } }),
  });

  window.LIFEOS.createChart('chart-water', {
    type: 'bar',
    data: {
      labels: series.labels || [],
      datasets: [
        { label: 'Water (L)', data: series.waterL || [], backgroundColor: colors.sleep, borderRadius: 4 },
        {
          type: 'line',
          label: 'Target',
          data: (series.waterL || []).map(() => series.waterTargetL),
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

  window.LIFEOS.createChart('chart-protein', {
    type: 'line',
    data: {
      labels: series.labels || [],
      datasets: [
        {
          label: 'Protein (g)',
          data: series.proteinG || [],
          borderColor: colors.success,
          backgroundColor: 'rgba(50,182,122,0.16)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Target',
          data: (series.proteinG || []).map(() => series.proteinTarget),
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

  window.LIFEOS.createChart('chart-sleep', {
    type: 'bar',
    data: {
      labels: series.labels || [],
      datasets: [
        { label: 'Sleep (h)', data: series.sleepHours || [], backgroundColor: colors.sleep, borderRadius: 4 },
        {
          type: 'line',
          label: 'Target',
          data: (series.sleepHours || []).map(() => series.sleepTargetHours),
          borderColor: colors.accent,
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions(),
  });

  const weight = series.weight || { labels: [], values: [] };
  if (weight.labels.length) {
    window.LIFEOS.createChart('chart-weight', {
      type: 'line',
      data: {
        labels: weight.labels,
        datasets: [
          {
            label: 'Weight (kg)',
            data: weight.values,
            borderColor: colors.accent,
            backgroundColor: 'rgba(201,168,76,0.16)',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: window.LIFEOS.baseChartOptions({ plugins: { legend: { display: false } } }),
    });
  }

  window.LIFEOS.createChart('chart-gym', {
    type: 'bar',
    data: {
      labels: series.labels || [],
      datasets: [
        { label: 'Workouts', data: series.workouts || [], backgroundColor: colors.success, borderRadius: 4, yAxisID: 'workouts' },
        {
          type: 'line',
          label: 'Habits (%)',
          data: series.habitsPercent || [],
          borderColor: colors.accent,
          borderWidth: 2,
          pointRadius: 1.5,
          tension: 0.3,
          yAxisID: 'habits',
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions({
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.muted, font: { size: 9 } }, border: { display: false } },
        workouts: { beginAtZero: true, position: 'left', grid: { color: colors.grid }, ticks: { color: colors.muted, font: { size: 9 }, stepSize: 1 }, border: { display: false } },
        habits: { beginAtZero: true, max: 100, position: 'right', grid: { display: false }, ticks: { color: colors.muted, font: { size: 9 } }, border: { display: false } },
      },
    }),
  });

  const syncButton = document.getElementById('sync-reports');
  if (syncButton) {
    syncButton.addEventListener('click', async () => {
      syncButton.disabled = true;
      try {
        const result = await window.LIFEOS.api('/api/reports/sync', { method: 'POST', body: {} });
        window.LIFEOS.flash(`${result.generated} report${result.generated === 1 ? '' : 's'} refreshed`, 'success');
        window.location.reload();
      } catch (_error) {
        syncButton.disabled = false;
      }
    });
  }
})();
