/* Sleep — bed/wake selection, duration preview, quality and history. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  const dateKey = data.dateKey;
  const bedInput = document.getElementById('bed-time');
  const wakeInput = document.getElementById('wake-time');
  const preview = document.getElementById('duration-preview');
  const qualityChips = document.querySelectorAll('[data-quality]');
  let quality = 'average';

  qualityChips.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.quality === quality);
    chip.addEventListener('click', () => {
      quality = chip.dataset.quality;
      qualityChips.forEach((other) => other.classList.toggle('is-active', other === chip));
    });
  });

  function minutesOf(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }

  function durationMinutes() {
    const bed = minutesOf(bedInput.value);
    const wake = minutesOf(wakeInput.value);
    if (bed === null || wake === null) return 0;
    return (wake - bed + 1440) % 1440;
  }

  function renderPreview() {
    const minutes = durationMinutes();
    if (!preview) return;
    if (!minutes) {
      preview.textContent = 'Same time — adjust';
      return;
    }
    const hours = (minutes / 60).toFixed(1);
    const targetMinutes = Number(data.targetMinutes) || 480;
    const diff = minutes - targetMinutes;
    const delta = diff === 0 ? 'on target' : `${diff > 0 ? '+' : '−'}${Math.abs(Math.round(diff))} min vs target`;
    preview.textContent = `${hours} h · ${delta}`;
  }

  document.querySelectorAll('[data-bed]').forEach((chip) => {
    chip.addEventListener('click', () => {
      bedInput.value = chip.dataset.bed;
      renderPreview();
    });
  });
  document.querySelectorAll('[data-wake]').forEach((chip) => {
    chip.addEventListener('click', () => {
      wakeInput.value = chip.dataset.wake;
      renderPreview();
    });
  });
  bedInput.addEventListener('input', renderPreview);
  wakeInput.addEventListener('input', renderPreview);
  renderPreview();

  const save = document.getElementById('save-sleep');
  save.addEventListener('click', async () => {
    if (!durationMinutes()) {
      window.LIFEOS.toast('Bedtime and wake-up time cannot be the same.', 'error');
      return;
    }
    save.disabled = true;
    try {
      const result = await window.LIFEOS.api('/api/sleep', {
        method: 'POST',
        body: {
          dateKey,
          bedTime: bedInput.value,
          wakeTime: wakeInput.value,
          quality,
          notes: (document.getElementById('sleep-notes') || {}).value || '',
        },
      });
      if (result.queued) return;
      window.LIFEOS.flash('Sleep saved', 'success');
      window.location.reload();
    } catch (_error) {
      save.disabled = false;
    }
  });

  document.querySelectorAll('[data-delete-sleep]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.LIFEOS.api(`/api/sleep/${button.dataset.deleteSleep}`, { method: 'DELETE' });
        window.LIFEOS.flash('Sleep entry removed', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  const colors = window.LIFEOS.chartColors();
  const history = data.history || [];
  window.LIFEOS.createChart('chart-sleep', {
    type: 'bar',
    data: {
      labels: history.map((day) => day.dateKey.slice(5)),
      datasets: [
        {
          label: 'Hours slept',
          data: history.map((day) => Math.round((day.minutes / 60) * 10) / 10),
          backgroundColor: history.map((day) => (day.recorded ? colors.sleep : colors.track)),
          borderRadius: 4,
        },
        {
          type: 'line',
          label: 'Target',
          data: history.map(() => Math.round((data.targetMinutes / 6) / 10) / 10),
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
})();
