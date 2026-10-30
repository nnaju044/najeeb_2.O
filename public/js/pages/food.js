/* Food — meal builder, food search, favourites and custom foods. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  const dateKey = data.dateKey;
  const favorites = data.favorites || [];
  const mealSheet = document.getElementById('meal-sheet');
  const favouriteSheet = document.getElementById('favorite-sheet');
  const itemsBox = document.getElementById('meal-items');
  const emptyNote = document.getElementById('meal-empty');
  const summary = document.getElementById('meal-summary');
  const typeChips = document.querySelectorAll('[data-meal-type]');
  const resultsBox = document.getElementById('food-results');
  const searchInput = document.getElementById('food-search');
  const favouritesBlock = document.getElementById('favourites-block');

  const state = { mealType: 'breakfast', items: [] };

  function setMealType(type) {
    state.mealType = type;
    typeChips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.mealType === type));
  }

  function totals() {
    return state.items.reduce(
      (acc, item) => {
        acc.calories += item.calories * item.servings;
        acc.protein += item.protein * item.servings;
        acc.carbs += item.carbs * item.servings;
        acc.fat += item.fat * item.servings;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }

  function renderItems() {
    if (!itemsBox) return;
    itemsBox.querySelectorAll('[data-meal-item]').forEach((node) => node.remove());
    if (emptyNote) emptyNote.classList.toggle('hidden', state.items.length > 0);

    state.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.dataset.mealItem = String(index);

      const main = document.createElement('span');
      main.className = 'list-item-main';
      const title = document.createElement('span');
      title.className = 'list-item-title';
      title.textContent = item.name;
      const meta = document.createElement('span');
      meta.className = 'list-item-meta';
      meta.textContent = `${item.servingLabel || '1 serving'} · ${Math.round(item.calories * item.servings)} kcal · ${(item.protein * item.servings).toFixed(1)} g protein`;
      main.append(title, meta);

      const actions = document.createElement('span');
      actions.className = 'list-item-actions';

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'icon-btn';
      minus.setAttribute('aria-label', 'Decrease servings');
      minus.textContent = '−';
      minus.addEventListener('click', () => {
        item.servings = Math.max(0.5, Math.round((item.servings - 0.5) * 10) / 10);
        renderItems();
      });

      const quantity = document.createElement('span');
      quantity.className = 'tag accent';
      quantity.textContent = `${item.servings}×`;

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'icon-btn';
      plus.setAttribute('aria-label', 'Increase servings');
      plus.textContent = '+';
      plus.addEventListener('click', () => {
        item.servings = Math.min(20, Math.round((item.servings + 0.5) * 10) / 10);
        renderItems();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn';
      remove.setAttribute('aria-label', 'Remove item');
      remove.innerHTML = '<i data-lucide="x"></i>';
      remove.addEventListener('click', () => {
        state.items.splice(index, 1);
        renderItems();
      });

      actions.append(minus, quantity, plus, remove);
      row.append(main, actions);
      itemsBox.appendChild(row);
    });

    const sum = totals();
    if (summary) {
      summary.textContent = `${Math.round(sum.calories)} kcal · ${sum.protein.toFixed(1)} g P`;
    }
    window.LIFEOS.refreshIcons();
  }

  function addFood(food) {
    const existing = state.items.find((item) => item.foodId && food.foodId && item.foodId === food.foodId);
    if (existing) {
      existing.servings = Math.min(20, Math.round((existing.servings + 1) * 10) / 10);
    } else {
      state.items.push({
        foodId: food.foodId || null,
        name: food.name,
        servingLabel: food.servingLabel,
        servings: 1,
        calories: Number(food.calories) || 0,
        protein: Number(food.protein) || 0,
        carbs: Number(food.carbs) || 0,
        fat: Number(food.fat) || 0,
      });
    }
    renderItems();
    if (favouritesBlock) favouritesBlock.classList.add('hidden');
  }

  function openMeal(type) {
    if (type) setMealType(type);
    state.items = [];
    renderItems();
    if (resultsBox) resultsBox.innerHTML = '';
    if (searchInput) searchInput.value = '';
    if (favouritesBlock) favouritesBlock.classList.remove('hidden');
    window.LIFEOS.openSheet(mealSheet);
  }

  document.querySelectorAll('[data-add-meal]').forEach((button) => {
    button.addEventListener('click', () => openMeal(button.dataset.addMeal));
  });

  document.querySelectorAll('[data-quick-food]').forEach((button) => {
    button.addEventListener('click', () => {
      let food = {};
      try {
        food = JSON.parse(button.dataset.food);
      } catch (_error) {
        return;
      }
      openMeal('breakfast');
      addFood(food);
    });
  });

  typeChips.forEach((chip) => {
    chip.addEventListener('click', () => setMealType(chip.dataset.mealType));
  });

  async function search(query) {
    if (!resultsBox) return;
    try {
      const response = await fetch(`/api/foods?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json();
      resultsBox.innerHTML = '';
      (payload.foods || []).slice(0, 20).forEach((food) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'list-item';
        row.style.textAlign = 'left';

        const main = document.createElement('span');
        main.className = 'list-item-main';
        const title = document.createElement('span');
        title.className = 'list-item-title';
        title.textContent = food.name;
        const meta = document.createElement('span');
        meta.className = 'list-item-meta';
        meta.textContent = `${food.servingLabel} · ${food.calories} kcal · ${food.protein} g P`;
        main.append(title, meta);

        const add = document.createElement('span');
        add.className = 'tag accent';
        add.textContent = 'Add';

        row.append(main, add);
        row.addEventListener('click', () => addFood({ ...food, foodId: food._id }));
        resultsBox.appendChild(row);
      });
      if (!(payload.foods || []).length) {
        const note = document.createElement('p');
        note.className = 'muted small';
        note.textContent = 'No match. Add a custom food below.';
        resultsBox.appendChild(note);
      }
    } catch (_error) {
      window.LIFEOS.toast('Could not search foods. Check your connection.', 'error');
    }
  }

  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const query = searchInput.value.trim();
      searchTimer = setTimeout(() => search(query), 220);
    });
    searchInput.addEventListener('focus', () => {
      if (!resultsBox.children.length) search('');
    });
  }

  const customSave = document.getElementById('custom-food-save');
  if (customSave) {
    customSave.addEventListener('click', async () => {
      const name = document.getElementById('custom-name').value.trim();
      const calories = Number(document.getElementById('custom-calories').value);
      const protein = Number(document.getElementById('custom-protein').value);
      const carbs = Number(document.getElementById('custom-carbs').value);
      const fat = Number(document.getElementById('custom-fat').value);
      if (!name) {
        window.LIFEOS.toast('Give the custom food a name.', 'error');
        return;
      }
      if ([calories, protein, carbs, fat].some((value) => !Number.isFinite(value) || value < 0)) {
        window.LIFEOS.toast('Nutrition values must be zero or more.', 'error');
        return;
      }
      try {
        const result = await window.LIFEOS.api('/api/foods', {
          method: 'POST',
          body: {
            name,
            calories,
            protein,
            carbs,
            fat,
            servingLabel: document.getElementById('custom-serving').value.trim() || '1 serving',
          },
        });
        window.LIFEOS.toast(`"${name}" added to your library`, 'success');
        addFood({ ...result.food, foodId: result.food._id });
      } catch (_error) {
        /* toast shown */
      }
    });
  }

  const saveMeal = document.getElementById('save-meal');
  saveMeal.addEventListener('click', async () => {
    if (!state.items.length) {
      window.LIFEOS.toast('Add at least one food first.', 'error');
      return;
    }
    const payloadItems = state.items.map((item) =>
      item.foodId
        ? { foodId: item.foodId, servings: item.servings }
        : {
            name: item.name,
            servingLabel: item.servingLabel,
            servings: item.servings,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
          }
    );
    saveMeal.disabled = true;
    try {
      const result = await window.LIFEOS.api('/api/meals', {
        method: 'POST',
        body: { dateKey, mealType: state.mealType, items: payloadItems },
      });
      if (result.queued) return;
      window.LIFEOS.flash('Meal saved', 'success');
      window.location.reload();
    } catch (_error) {
      saveMeal.disabled = false;
    }
  });

  document.querySelectorAll('[data-delete-meal]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.LIFEOS.api(`/api/meals/${button.dataset.deleteMeal}`, { method: 'DELETE' });
        window.LIFEOS.flash('Meal deleted', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  document.querySelectorAll('[data-log-favorite]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const result = await window.LIFEOS.api(`/api/favorites/${button.dataset.logFavorite}/log`, {
          method: 'POST',
          body: { dateKey },
        });
        if (result.queued) return;
        window.LIFEOS.flash('Favourite logged', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  document.querySelectorAll('[data-sheet-favorite]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const result = await window.LIFEOS.api(`/api/favorites/${button.dataset.sheetFavorite}/log`, {
          method: 'POST',
          body: { dateKey },
        });
        if (result.queued) return;
        window.LIFEOS.flash('Favourite logged', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  let favoriteMealId = null;
  const favoriteName = document.getElementById('favorite-name');
  document.querySelectorAll('[data-save-favorite]').forEach((button) => {
    button.addEventListener('click', () => {
      favoriteMealId = button.dataset.saveFavorite;
      if (favoriteName) favoriteName.value = '';
      window.LIFEOS.openSheet(favouriteSheet);
    });
  });

  const saveFavourite = document.getElementById('save-favorite');
  if (saveFavourite) {
    saveFavourite.addEventListener('click', async () => {
      const name = (favoriteName.value || '').trim();
      if (!name) {
        window.LIFEOS.toast('Give this favourite a name.', 'error');
        return;
      }
      try {
        await window.LIFEOS.api('/api/favorites', {
          method: 'POST',
          body: { name, mealId: favoriteMealId },
        });
        window.LIFEOS.flash('Favourite saved', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  }

  /* ── chart ───────────────────────────────────────────────────────────── */
  const colors = window.LIFEOS.chartColors();
  const week = data.week || [];
  window.LIFEOS.createChart('chart-nutrition', {
    type: 'bar',
    data: {
      labels: week.map((day) => day.dateKey.slice(5)),
      datasets: [
        {
          label: 'Protein (g)',
          data: week.map((day) => Math.round(day.protein)),
          backgroundColor: colors.success,
          borderRadius: 4,
          yAxisID: 'protein',
        },
        {
          type: 'line',
          label: 'Calories',
          data: week.map((day) => Math.round(day.calories)),
          borderColor: colors.accent,
          backgroundColor: colors.accent,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          yAxisID: 'calories',
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions({
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.muted, font: { size: 9 } }, border: { display: false } },
        protein: {
          beginAtZero: true,
          position: 'left',
          grid: { color: colors.grid },
          ticks: { color: colors.muted, font: { size: 9 } },
          border: { display: false },
        },
        calories: {
          beginAtZero: true,
          position: 'right',
          grid: { display: false },
          ticks: { color: colors.muted, font: { size: 9 } },
          border: { display: false },
        },
      },
    }),
  });
})();
