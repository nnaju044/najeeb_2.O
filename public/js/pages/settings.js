/* Settings — theme, profile name and sync state. */
(function () {
  'use strict';
  const themeChips = document.querySelectorAll('[data-theme-choice]');

  themeChips.forEach((chip) => {
    chip.addEventListener('click', async () => {
      themeChips.forEach((other) => other.classList.remove('is-active'));
      chip.classList.add('is-active');
      window.LIFEOS.applyTheme(chip.dataset.themeChoice);
      try {
        await window.LIFEOS.api('/api/settings/theme', {
          method: 'PATCH',
          body: { theme: chip.dataset.themeChoice },
        });
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  const saveProfile = document.getElementById('save-profile');
  if (saveProfile) {
    saveProfile.addEventListener('click', async () => {
      try {
        const result = await window.LIFEOS.api('/api/settings/profile', {
          method: 'PATCH',
          body: { name: document.getElementById('profile-name').value.trim() },
        });
        window.LIFEOS.toast(`Saved${result.name ? `, ${result.name}` : ''}`, 'success');
      } catch (_error) {
        /* toast shown */
      }
    });
  }

  const savePassword = document.getElementById('save-password');
  if (savePassword) {
    savePassword.addEventListener('click', async () => {
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-new-password').value;
      if (!currentPassword || !newPassword) {
        window.LIFEOS.toast('Please enter both current and new password', 'error');
        return;
      }
      if (newPassword.length < 8) {
        window.LIFEOS.toast('New password must be at least 8 characters', 'error');
        return;
      }
      if (confirmPassword && confirmPassword !== newPassword) {
        window.LIFEOS.toast('New passwords do not match', 'error');
        return;
      }
      try {
        await window.LIFEOS.api('/api/settings/password', {
          method: 'POST',
          body: { currentPassword, newPassword, confirmPassword },
        });
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
        window.LIFEOS.toast('Password updated successfully', 'success');
      } catch (_error) {
        /* toast shown by api wrapper */
      }
    });
  }

  const prayerToggle = document.getElementById('feature-prayer-tracker');
  if (prayerToggle) {
    prayerToggle.addEventListener('change', async () => {
      const enabled = prayerToggle.checked;
      try {
        await window.LIFEOS.api('/api/settings/features', {
          method: 'PATCH',
          body: { feature: 'prayerTracker', enabled },
        });
        window.LIFEOS.toast(enabled ? 'Prayer Tracker enabled' : 'Prayer Tracker disabled', 'success');
      } catch (_error) {
        prayerToggle.checked = !enabled;
      }
    });
  }

  const btnResetPlan = document.getElementById('btn-reset-plan');
  if (btnResetPlan) {
    btnResetPlan.addEventListener('click', async () => {
      const dateInput = document.getElementById('reset-start-date');
      const newStartDate = dateInput ? dateInput.value.trim() : null;

      const confirmed = window.confirm(
        '⚠️ ARE YOU SURE YOU WANT TO RESET YOUR PLAN?\n\n' +
        'This will permanently delete all your tracked records:\n' +
        '• 24-hour time logs\n' +
        '• Water intake entries\n' +
        '• Meal and nutrition records\n' +
        '• Sleep sessions\n' +
        '• Workouts & exercises\n' +
        '• Weight entries\n' +
        '• Habit completions (habits will reset to 9 defaults)\n' +
        '• Prayer tracking entries\n' +
        '• Weekly reports & achievements\n\n' +
        `Your 90-day challenge will restart from scratch on ${newStartDate || 'today'}.\n\n` +
        'This action cannot be undone. Proceed?'
      );
      if (!confirmed) return;

      btnResetPlan.disabled = true;
      const originalHtml = btnResetPlan.innerHTML;
      btnResetPlan.innerHTML = '<i data-lucide="loader"></i> Resetting plan...';
      window.LIFEOS.refreshIcons();

      try {
        await window.LIFEOS.api('/api/settings/reset-plan', {
          method: 'POST',
          body: { newStartDate: newStartDate || null },
        });
        window.LIFEOS.toast('Plan reset successfully! Starting from scratch.', 'success');
        setTimeout(() => {
          window.location.href = '/';
        }, 800);
      } catch (_error) {
        btnResetPlan.disabled = false;
        btnResetPlan.innerHTML = originalHtml;
        window.LIFEOS.refreshIcons();
      }
    });
  }

  window.LIFEOS.renderSyncState();
  window.LIFEOS.flushQueue();
})();
