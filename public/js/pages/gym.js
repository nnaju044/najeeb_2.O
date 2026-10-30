/* Gym — workout builder with sets, custom exercises and progression charts. */
(function () {
  'use strict';
  const data = window.LIFEOS.readPageData();
  const sheet = document.getElementById('workout-sheet');
  const exercisesBox = document.getElementById('workout-exercises');
  const emptyNote = document.getElementById('workout-empty');
  const resultsBox = document.getElementById('exercise-results');
  const searchInput = document.getElementById('exercise-search');
  const countLabel = document.getElementById('exercise-count');
  const durationInput = document.getElementById('workout-duration');
  const typeChips = document.querySelectorAll('[data-workout-type]');
  const durationChips = document.querySelectorAll('[data-duration]');

  const state = { type: 'full_body', exercises: [] };

  function setType(type) {
    state.type = type;
    typeChips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.workoutType === type));
  }

  typeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      setType(chip.dataset.workoutType);
      const label = chip.textContent.trim();
      const nameInput = document.getElementById('workout-name');
      if (nameInput) nameInput.value = label;
    });
  });

  durationChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      durationChips.forEach((other) => other.classList.toggle('is-active', other === chip));
      durationInput.value = chip.dataset.duration;
    });
  });

  function renderExercises() {
    if (!exercisesBox) return;
    exercisesBox.querySelectorAll('[data-exercise-card]').forEach((node) => node.remove());
    if (emptyNote) emptyNote.classList.toggle('hidden', state.exercises.length > 0);
    if (countLabel) countLabel.textContent = String(state.exercises.length);

    state.exercises.forEach((exercise, index) => {
      const card = document.createElement('div');
      card.className = 'card tight';
      card.dataset.exerciseCard = String(index);

      const head = document.createElement('div');
      head.className = 'between';
      const title = document.createElement('span');
      title.className = 'list-item-title';
      title.textContent = exercise.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn';
      remove.innerHTML = '<i data-lucide="x"></i>';
      remove.addEventListener('click', () => {
        state.exercises.splice(index, 1);
        renderExercises();
      });
      head.append(title, remove);

      const setsBox = document.createElement('div');
      setsBox.className = 'stack-sm';
      exercise.sets.forEach((set, setIndex) => {
        const row = document.createElement('div');
        row.className = 'field-row';
        row.style.alignItems = 'center';

        const repsField = document.createElement('div');
        repsField.className = 'field';
        const repsLabel = document.createElement('label');
        repsLabel.textContent = `Set ${setIndex + 1} reps`;
        const repsInput = document.createElement('input');
        repsInput.type = 'number';
        repsInput.min = '0';
        repsInput.max = '500';
        repsInput.inputMode = 'numeric';
        repsInput.value = String(set.reps);
        repsInput.addEventListener('input', () => {
          set.reps = Math.max(0, Number(repsInput.value) || 0);
        });
        repsField.append(repsLabel, repsInput);

        const weightField = document.createElement('div');
        weightField.className = 'field';
        const weightLabel = document.createElement('label');
        weightLabel.textContent = 'Weight (kg)';
        const weightInput = document.createElement('input');
        weightInput.type = 'number';
        weightInput.min = '0';
        weightInput.max = '500';
        weightInput.step = '0.5';
        weightInput.inputMode = 'decimal';
        weightInput.value = String(set.weightKg);
        weightInput.addEventListener('input', () => {
          set.weightKg = Math.max(0, Number(weightInput.value) || 0);
        });
        weightField.append(weightLabel, weightInput);

        row.append(repsField, weightField);
        setsBox.appendChild(row);
      });

      const addSet = document.createElement('button');
      addSet.type = 'button';
      addSet.className = 'btn is-sm';
      addSet.textContent = 'Add set';
      addSet.addEventListener('click', () => {
        const last = exercise.sets[exercise.sets.length - 1] || { reps: 10, weightKg: 0 };
        exercise.sets.push({ reps: last.reps, weightKg: last.weightKg });
        renderExercises();
      });

      const addWeight = document.createElement('span');
      addWeight.className = 'tag';
      addWeight.textContent = exercise.muscleGroup || 'Full body';

      card.append(head, addWeight, setsBox, addSet);
      exercisesBox.appendChild(card);
    });
    window.LIFEOS.refreshIcons();
  }

  function addExercise(exercise) {
    state.exercises.push({
      exerciseId: exercise._id || null,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup || 'Full body',
      sets: [{ reps: 10, weightKg: 0 }],
    });
    renderExercises();
    if (resultsBox) resultsBox.innerHTML = '';
    if (searchInput) searchInput.value = '';
  }

  function renderResults(list) {
    if (!resultsBox) return;
    resultsBox.innerHTML = '';
    const query = (searchInput.value || '').trim().toLowerCase();
    list
      .filter((exercise) => !query || exercise.name.toLowerCase().includes(query))
      .slice(0, 12)
      .forEach((exercise) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'list-item';
        row.style.textAlign = 'left';
        const main = document.createElement('span');
        main.className = 'list-item-main';
        const title = document.createElement('span');
        title.className = 'list-item-title';
        title.textContent = exercise.name;
        const meta = document.createElement('span');
        meta.className = 'list-item-meta';
        meta.textContent = `${exercise.muscleGroup}${exercise.equipment ? ' · ' + exercise.equipment : ''}`;
        main.append(title, meta);
        const add = document.createElement('span');
        add.className = 'tag accent';
        add.textContent = 'Add';
        row.append(main, add);
        row.addEventListener('click', () => addExercise(exercise));
        resultsBox.appendChild(row);
      });
  }

  const openButton = document.getElementById('open-workout');
  if (openButton) {
    openButton.addEventListener('click', () => {
      state.exercises = [];
      renderExercises();
      renderResults(data.exercises || []);
      window.LIFEOS.openSheet(sheet);
    });
  }

  if (searchInput) {
    searchInput.addEventListener('focus', () => renderResults(data.exercises || []));
    searchInput.addEventListener('input', () => renderResults(data.exercises || []));
  }

  const saveButton = document.getElementById('save-workout');
  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      const duration = Math.round(Number(durationInput.value) || 0);
      const name = (document.getElementById('workout-name').value || 'Workout').trim();
      saveButton.disabled = true;
      try {
        const result = await window.LIFEOS.api('/api/workouts', {
          method: 'POST',
          body: {
            dateKey: data.todayKey,
            type: state.type,
            name,
            durationMinutes: duration,
            exercises: state.exercises.map((exercise) => ({
              exerciseId: exercise.exerciseId,
              name: exercise.name,
              muscleGroup: exercise.muscleGroup,
              sets: exercise.sets,
            })),
            notes: (document.getElementById('workout-notes') || {}).value || '',
          },
        });
        if (result.queued) return;
        window.LIFEOS.flash('Workout saved', 'success');
        window.location.reload();
      } catch (_error) {
        saveButton.disabled = false;
      }
    });
  }

  document.querySelectorAll('[data-delete-workout]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this workout?')) return;
      try {
        await window.LIFEOS.api(`/api/workouts/${button.dataset.deleteWorkout}`, { method: 'DELETE' });
        window.LIFEOS.flash('Workout deleted', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  });

  const saveExercise = document.getElementById('save-exercise');
  if (saveExercise) {
    saveExercise.addEventListener('click', async () => {
      const name = document.getElementById('exercise-name').value.trim();
      if (!name) {
        window.LIFEOS.toast('Give the exercise a name.', 'error');
        return;
      }
      try {
        await window.LIFEOS.api('/api/exercises', {
          method: 'POST',
          body: {
            name,
            muscleGroup: document.getElementById('exercise-muscle').value,
            equipment: document.getElementById('exercise-equipment').value.trim(),
          },
        });
        window.LIFEOS.flash('Exercise added', 'success');
        window.location.reload();
      } catch (_error) {
        /* toast shown */
      }
    });
  }

  /* ── charts ───────────────────────────────────────────────────────────── */
  const colors = window.LIFEOS.chartColors();
  const weekly = data.weekly || [];
  window.LIFEOS.createChart('chart-gym', {
    type: 'bar',
    data: {
      labels: weekly.map((day) => day.dateKey.slice(5)),
      datasets: [
        {
          label: 'Workouts',
          data: weekly.map((day) => day.count),
          backgroundColor: colors.success,
          borderRadius: 4,
          barPercentage: 0.7,
        },
      ],
    },
    options: window.LIFEOS.baseChartOptions({
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.muted, font: { size: 8 }, autoSkip: true, maxTicksLimit: 10 }, border: { display: false } },
        y: {
          beginAtZero: true,
          max: 2,
          ticks: { color: colors.muted, font: { size: 9 }, stepSize: 1 },
          grid: { color: colors.grid },
          border: { display: false },
        },
      },
    }),
  });

  const progression = data.progression || [];
  if (progression.length) {
    window.LIFEOS.createChart('chart-progression', {
      type: 'line',
      data: {
        labels: progression.map((point) => point.dateKey.slice(5)),
        datasets: [
          {
            label: 'Max weight (kg)',
            data: progression.map((point) => point.maxWeightKg),
            borderColor: colors.accent,
            backgroundColor: 'rgba(201,168,76,0.16)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: window.LIFEOS.baseChartOptions({ plugins: { legend: { display: false } } }),
    });
  }
})();
