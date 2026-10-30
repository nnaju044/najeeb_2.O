/* Health hub — quick water logging from the overview. */
(function () {
  'use strict';

  document.querySelectorAll('[data-water-amount]').forEach((button) => {
    button.addEventListener('click', async () => {
      const amountMl = Number(button.dataset.waterAmount);
      const dateKey = button.dataset.date;
      if (!amountMl || !dateKey) return;
      try {
        const result = await window.LIFEOS.api('/api/water', {
          method: 'POST',
          body: { dateKey, amountMl },
        });
        if (result.queued) return;
        window.LIFEOS.flash(`+${amountMl} ml water`, 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });
})();
