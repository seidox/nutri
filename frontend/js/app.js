const API = "/api";
const tg = window.Telegram?.WebApp ?? null;

const state = {
  userId: "local-dev",
  telegramInitData: "",
  date: new Date().toISOString().slice(0, 10),
  settings: null,
  summary: null,
  foodEntries: [],
  foodTemplates: [],
  trainingEntries: [],
  trainingTemplates: [],
  weightHistory: [],
  progressRows: [],
  editFoodId: null,
  editTrainingId: null,
  calendarMonthCursor: null
};

const el = {
  dateTitle: document.getElementById("dateTitle"),
  prevDayBtn: document.getElementById("prevDayBtn"),
  todayBtn: document.getElementById("todayBtn"),
  calendarBtn: document.getElementById("calendarBtn"),
  nextDayBtn: document.getElementById("nextDayBtn"),
  calendarDialog: document.getElementById("calendarDialog"),
  calendarPrevMonthBtn: document.getElementById("calendarPrevMonthBtn"),
  calendarNextMonthBtn: document.getElementById("calendarNextMonthBtn"),
  calendarMonthTitle: document.getElementById("calendarMonthTitle"),
  calendarGrid: document.getElementById("calendarGrid"),
  calendarCloseBtn: document.getElementById("calendarCloseBtn"),
  caloriesValue: document.getElementById("caloriesValue"),
  calRing: document.getElementById("calRing"),
  proteinText: document.getElementById("proteinText"),
  fatText: document.getElementById("fatText"),
  carbText: document.getElementById("carbText"),
  proteinBar: document.getElementById("proteinBar"),
  fatBar: document.getElementById("fatBar"),
  carbBar: document.getElementById("carbBar"),
  waterText: document.getElementById("waterText"),
  waterCurrent: document.getElementById("waterCurrent"),
  waterBar: document.getElementById("waterBar"),
  foodList: document.getElementById("foodList"),
  trainingList: document.getElementById("trainingList"),
  weightHistory: document.getElementById("weightHistory"),
  goalCalories: document.getElementById("goalCalories"),
  goalProtein: document.getElementById("goalProtein"),
  goalFat: document.getElementById("goalFat"),
  goalCarbs: document.getElementById("goalCarbs"),
  goalWater: document.getElementById("goalWater"),
  weightInput: document.getElementById("weightInput"),
  addFoodBtn: document.getElementById("addFoodBtn"),
  foodDialog: document.getElementById("foodDialog"),
  foodForm: document.getElementById("foodForm"),
  foodCancelBtn: document.getElementById("foodCancelBtn"),
  foodDialogTitle: document.getElementById("foodDialogTitle"),
  foodMode: document.getElementById("foodMode"),
  foodTemplateWrap: document.getElementById("foodTemplateWrap"),
  foodTemplateSelect: document.getElementById("foodTemplateSelect"),
  foodNameWrap: document.getElementById("foodNameWrap"),
  foodMacrosWrap: document.getElementById("foodMacrosWrap"),
  foodNameInput: document.getElementById("foodNameInput"),
  foodGramsInput: document.getElementById("foodGramsInput"),
  foodCaloriesInput: document.getElementById("foodCaloriesInput"),
  foodProteinInput: document.getElementById("foodProteinInput"),
  foodFatInput: document.getElementById("foodFatInput"),
  foodCarbsInput: document.getElementById("foodCarbsInput"),
  addTrainingBtn: document.getElementById("addTrainingBtn"),
  trainingDialog: document.getElementById("trainingDialog"),
  trainingForm: document.getElementById("trainingForm"),
  trainingCancelBtn: document.getElementById("trainingCancelBtn"),
  trainingDialogTitle: document.getElementById("trainingDialogTitle"),
  trainingMode: document.getElementById("trainingMode"),
  trainingTemplateWrap: document.getElementById("trainingTemplateWrap"),
  trainingTemplateSelect: document.getElementById("trainingTemplateSelect"),
  trainingNameWrap: document.getElementById("trainingNameWrap"),
  trainingNameInput: document.getElementById("trainingNameInput"),
  trainingSetsInput: document.getElementById("trainingSetsInput"),
  trainingRepsInput: document.getElementById("trainingRepsInput"),
  trainingWeightInput: document.getElementById("trainingWeightInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  saveWeightBtn: document.getElementById("saveWeightBtn"),
  aiInput: document.getElementById("aiInput"),
  askAiBtn: document.getElementById("askAiBtn"),
  aiAnswer: document.getElementById("aiAnswer"),
  progressChart: document.getElementById("progressChart"),
  weightChart: document.getElementById("weightChart"),
  reportFrom: document.getElementById("reportFrom"),
  reportTo: document.getElementById("reportTo"),
  buildReportBtn: document.getElementById("buildReportBtn"),
  reportOutput: document.getElementById("reportOutput")
};

function tDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function shiftDate(days) {
  const d = new Date(`${state.date}T12:00:00`);
  d.setDate(d.getDate() + days);
  state.date = d.toISOString().slice(0, 10);
}

function getDateShift(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.telegramInitData) {
    headers["x-telegram-init-data"] = state.telegramInitData;
  } else {
    headers["x-user-id"] = state.userId;
  }

  const res = await fetch(`${API}${path}`, {
    headers,
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function pct(value, goal) {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, (Number(value) / Number(goal)) * 100);
}

function renderSummary() {
  if (!state.summary || !state.settings) return;

  const n = state.summary.nutrition;
  const s = state.settings;
  el.dateTitle.textContent = tDate(state.date);
  el.caloriesValue.textContent = Math.round(n.calories);
  const calPercent = pct(n.calories, s.calories_goal);
  const ringCirc = 314;
  el.calRing.style.strokeDashoffset = String(ringCirc - (calPercent / 100) * ringCirc);

  el.proteinText.textContent = `${n.protein.toFixed(1)}/${s.protein_goal} г`;
  el.fatText.textContent = `${n.fat.toFixed(1)}/${s.fat_goal} г`;
  el.carbText.textContent = `${n.carbs.toFixed(1)}/${s.carbs_goal} г`;
  el.proteinBar.style.width = `${pct(n.protein, s.protein_goal)}%`;
  el.fatBar.style.width = `${pct(n.fat, s.fat_goal)}%`;
  el.carbBar.style.width = `${pct(n.carbs, s.carbs_goal)}%`;

  el.waterText.textContent = `${state.summary.water_ml} / ${s.water_goal_ml} мл`;
  if (el.waterCurrent) {
    el.waterCurrent.textContent = `${state.summary.water_ml} мл`;
  }
  el.waterBar.style.width = `${pct(state.summary.water_ml, s.water_goal_ml)}%`;
}

function renderFoodList() {
  if (!state.foodEntries.length) {
    el.foodList.innerHTML = `<div class="item"><div class="item-meta">Нет приемов пищи за этот день</div></div>`;
    return;
  }

  el.foodList.innerHTML = state.foodEntries
    .map(
      (e) => `
      <div class="item">
        <div class="item-top">
          <div class="item-title">${e.name}</div>
          <div class="item-actions">
            <button class="icon-btn" data-action="edit-food" data-id="${e.id}">Edit</button>
            <button class="danger-btn" data-action="delete-food" data-id="${e.id}">Delete</button>
          </div>
        </div>
        <div class="item-meta">${e.grams} g • ${e.calories} kcal • P ${e.protein} • F ${e.fat} • C ${e.carbs}</div>
      </div>
    `
    )
    .join("");
}

function renderTrainingList() {
  if (!state.trainingEntries.length) {
    el.trainingList.innerHTML = `<div class="item"><div class="item-meta">Нет тренировок за этот день</div></div>`;
    return;
  }

  el.trainingList.innerHTML = state.trainingEntries
    .map(
      (e) => `
      <div class="item">
        <div class="item-top">
          <div class="item-title">${e.exercise_name}</div>
          <div class="item-actions">
            <button class="icon-btn" data-action="edit-training" data-id="${e.id}">Edit</button>
            <button class="danger-btn" data-action="delete-training" data-id="${e.id}">Delete</button>
          </div>
        </div>
        <div class="item-meta">${e.sets} set(s) • ${e.reps} reps • ${e.weight} kg</div>
      </div>
    `
    )
    .join("");
}

function renderWeightHistory() {
  if (!state.weightHistory.length) {
    el.weightHistory.innerHTML = `<div class="item"><div class="item-meta">История веса пока пустая</div></div>`;
    return;
  }

  el.weightHistory.innerHTML = state.weightHistory
    .map(
      (r) => `
      <div class="item">
        <div class="item-top">
          <div class="item-title">${r.weight} kg</div>
          <div class="item-actions">
            <button class="danger-btn" data-action="delete-weight" data-date="${r.date}">Delete</button>
          </div>
        </div>
        <div class="item-meta">${tDate(r.date)}</div>
      </div>
    `
    )
    .join("");
}

function renderSettings() {
  const s = state.settings;
  if (!s) return;
  el.goalCalories.value = s.calories_goal;
  el.goalProtein.value = s.protein_goal;
  el.goalFat.value = s.fat_goal;
  el.goalCarbs.value = s.carbs_goal;
  el.goalWater.value = s.water_goal_ml;
  el.weightInput.value = state.summary?.weight ?? "";
}

function fillFoodTemplates() {
  const html = state.foodTemplates
    .map((t) => `<option value="${t.id}">${t.name} (${t.grams}g: ${t.calories} kcal)</option>`)
    .join("");
  el.foodTemplateSelect.innerHTML = html || `<option value="">Сначала добавьте новое блюдо</option>`;
}

function fillTrainingTemplates() {
  const html = state.trainingTemplates.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
  el.trainingTemplateSelect.innerHTML = html || `<option value="">Сначала добавьте новое упражнение</option>`;
}

function toggleFoodMode() {
  const isNew = el.foodMode.value === "new";
  el.foodTemplateWrap.classList.toggle("hidden", isNew);
  el.foodNameWrap.classList.toggle("hidden", !isNew);
  el.foodMacrosWrap.classList.toggle("hidden", !isNew);
  el.foodCaloriesInput.disabled = !isNew;
  el.foodProteinInput.disabled = !isNew;
  el.foodFatInput.disabled = !isNew;
  el.foodCarbsInput.disabled = !isNew;
}

function toggleTrainingMode() {
  const isNew = el.trainingMode.value === "new";
  el.trainingTemplateWrap.classList.toggle("hidden", isNew);
  el.trainingNameWrap.classList.toggle("hidden", !isNew);
}

function drawLineChart(canvas, labels, datasets, yMax = 100) {
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  ctx.clearRect(0, 0, width, height);

  const pad = 26;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;

  ctx.strokeStyle = "#2c1e43";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + chartW, y);
    ctx.stroke();
  }

  const stepX = labels.length > 1 ? chartW / (labels.length - 1) : chartW;
  datasets.forEach((set) => {
    ctx.strokeStyle = set.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    set.values.forEach((v, i) => {
      const x = pad + i * stepX;
      const y = pad + chartH - Math.min(yMax, Math.max(0, v)) * (chartH / yMax);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function renderProgressChart() {
  if (!state.progressRows.length || !state.settings) return;
  const labels = state.progressRows.map((r) => r.date.slice(5));
  const cals = state.progressRows.map((r) => pct(r.calories, state.settings.calories_goal));
  const waters = state.progressRows.map((r) => pct(r.water_ml, state.settings.water_goal_ml));
  drawLineChart(
    el.progressChart,
    labels,
    [
      { color: "#ff3ca8", values: cals },
      { color: "#4d8cff", values: waters }
    ],
    100
  );
}

function renderWeightChart() {
  if (!state.weightHistory.length) return;
  const rows = [...state.weightHistory].reverse();
  const labels = rows.map((r) => r.date.slice(5));
  const values = rows.map((r) => Number(r.weight));
  const max = Math.max(...values) + 1;
  const min = Math.min(...values) - 1;
  const normalized = values.map((v) => ((v - min) / (max - min || 1)) * 100);
  drawLineChart(el.weightChart, labels, [{ color: "#ff3ca8", values: normalized }], 100);
}

function prefillReportRange() {
  if (!el.reportTo.value) el.reportTo.value = state.date;
  if (!el.reportFrom.value) el.reportFrom.value = getDateShift(state.date, -13);
}

function monthStart(iso) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(1);
  return d;
}

function addMonths(dateObj, delta) {
  const d = new Date(dateObj);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function renderCalendar() {
  const base = state.calendarMonthCursor || monthStart(state.date);
  const monthLabel = base.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  el.calendarMonthTitle.textContent = monthLabel;

  const first = new Date(base);
  const firstWeekday = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - firstWeekday);

  const selected = state.date;
  const today = new Date().toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    const iso = toISO(cur);
    const muted = cur.getMonth() !== base.getMonth() ? "muted" : "";
    const active = iso === selected ? "active" : "";
    const isToday = iso === today ? "*" : "";
    cells.push(
      `<button class="calendar-day ${muted} ${active}" data-date="${iso}" type="button">${cur.getDate()}${isToday}</button>`
    );
  }
  el.calendarGrid.innerHTML = cells.join("");
}

function openCalendar() {
  state.calendarMonthCursor = monthStart(state.date);
  renderCalendar();
  el.calendarDialog.showModal();
}

async function loadAll() {
  const from = getDateShift(state.date, -13);
  const to = state.date;
  const [settings, summary, foodEntries, foodTemplates, trainingEntries, trainingTemplates, weightHistory, progress] =
    await Promise.all([
      api("/settings"),
      api(`/day-summary?date=${state.date}`),
      api(`/food/entries?date=${state.date}`),
      api("/food/templates"),
      api(`/training/entries?date=${state.date}`),
      api("/training/templates"),
      api("/weight/history?limit=30"),
      api(`/progress?from=${from}&to=${to}`)
    ]);
  state.settings = settings;
  state.summary = summary;
  state.foodEntries = foodEntries;
  state.foodTemplates = foodTemplates;
  state.trainingEntries = trainingEntries;
  state.trainingTemplates = trainingTemplates;
  state.weightHistory = weightHistory;
  state.progressRows = progress.rows || [];
  fillFoodTemplates();
  fillTrainingTemplates();
  renderSummary();
  renderFoodList();
  renderTrainingList();
  renderSettings();
  renderWeightHistory();
  renderProgressChart();
  renderWeightChart();
  prefillReportRange();
}

async function addWater(volumeMl) {
  await api("/water/entries", {
    method: "POST",
    body: JSON.stringify({ date: state.date, volume_ml: volumeMl })
  });
  await loadAll();
}

function resetFoodDialog() {
  state.editFoodId = null;
  el.foodDialogTitle.textContent = "Добавить прием пищи";
  el.foodForm.reset();
  el.foodMode.value = "existing";
  toggleFoodMode();
}

async function submitFood(event) {
  event.preventDefault();
  if (event.submitter?.id === "foodCancelBtn") {
    el.foodDialog.close();
    resetFoodDialog();
    return;
  }
  if (state.editFoodId) {
    const payload = {
      name: el.foodNameInput.value.trim(),
      grams: Number(el.foodGramsInput.value || 0),
      calories: Number(el.foodCaloriesInput.value || 0),
      protein: Number(el.foodProteinInput.value || 0),
      fat: Number(el.foodFatInput.value || 0),
      carbs: Number(el.foodCarbsInput.value || 0)
    };
    await api(`/food/entries/${state.editFoodId}`, { method: "PUT", body: JSON.stringify(payload) });
    el.foodDialog.close();
    resetFoodDialog();
    await loadAll();
    return;
  }

  const mode = el.foodMode.value;
  const payload =
    mode === "existing"
      ? {
          date: state.date,
          mode,
          template_id: Number(el.foodTemplateSelect.value),
          grams: Number(el.foodGramsInput.value || 0)
        }
      : {
          date: state.date,
          mode,
          name: el.foodNameInput.value.trim(),
          grams: Number(el.foodGramsInput.value || 0),
          calories: Number(el.foodCaloriesInput.value || 0),
          protein: Number(el.foodProteinInput.value || 0),
          fat: Number(el.foodFatInput.value || 0),
          carbs: Number(el.foodCarbsInput.value || 0),
          save_as_template: true
        };
  await api("/food/entries", { method: "POST", body: JSON.stringify(payload) });
  el.foodDialog.close();
  resetFoodDialog();
  await loadAll();
}

async function editFood(id) {
  const entry = state.foodEntries.find((e) => e.id === id);
  if (!entry) return;
  state.editFoodId = id;
  el.foodDialogTitle.textContent = "Редактировать прием пищи";
  el.foodMode.value = "new";
  toggleFoodMode();
  el.foodNameInput.value = entry.name;
  el.foodGramsInput.value = entry.grams;
  el.foodCaloriesInput.value = entry.calories;
  el.foodProteinInput.value = entry.protein;
  el.foodFatInput.value = entry.fat;
  el.foodCarbsInput.value = entry.carbs;
  el.foodDialog.showModal();
}

async function deleteFood(id) {
  if (!confirm("Удалить запись питания?")) return;
  await api(`/food/entries/${id}`, { method: "DELETE" });
  await loadAll();
}

function resetTrainingDialog() {
  state.editTrainingId = null;
  el.trainingDialogTitle.textContent = "Добавить упражнение";
  el.trainingForm.reset();
  el.trainingMode.value = "existing";
  el.trainingSetsInput.value = 1;
  el.trainingRepsInput.value = 1;
  el.trainingWeightInput.value = 0;
  toggleTrainingMode();
}

async function submitTraining(event) {
  event.preventDefault();
  if (event.submitter?.id === "trainingCancelBtn") {
    el.trainingDialog.close();
    resetTrainingDialog();
    return;
  }
  if (state.editTrainingId) {
    const payload = {
      exercise_name: el.trainingNameInput.value.trim(),
      sets: Number(el.trainingSetsInput.value || 1),
      reps: Number(el.trainingRepsInput.value || 1),
      weight: Number(el.trainingWeightInput.value || 0)
    };
    await api(`/training/entries/${state.editTrainingId}`, { method: "PUT", body: JSON.stringify(payload) });
    el.trainingDialog.close();
    resetTrainingDialog();
    await loadAll();
    return;
  }

  const mode = el.trainingMode.value;
  const payload =
    mode === "existing"
      ? {
          date: state.date,
          mode,
          template_id: Number(el.trainingTemplateSelect.value),
          sets: Number(el.trainingSetsInput.value || 1),
          reps: Number(el.trainingRepsInput.value || 1),
          weight: Number(el.trainingWeightInput.value || 0)
        }
      : {
          date: state.date,
          mode,
          exercise_name: el.trainingNameInput.value.trim(),
          sets: Number(el.trainingSetsInput.value || 1),
          reps: Number(el.trainingRepsInput.value || 1),
          weight: Number(el.trainingWeightInput.value || 0),
          save_as_template: true
        };
  await api("/training/entries", { method: "POST", body: JSON.stringify(payload) });
  el.trainingDialog.close();
  resetTrainingDialog();
  await loadAll();
}

async function editTraining(id) {
  const entry = state.trainingEntries.find((e) => e.id === id);
  if (!entry) return;
  state.editTrainingId = id;
  el.trainingDialogTitle.textContent = "Редактировать упражнение";
  el.trainingMode.value = "new";
  toggleTrainingMode();
  el.trainingNameInput.value = entry.exercise_name;
  el.trainingSetsInput.value = entry.sets;
  el.trainingRepsInput.value = entry.reps;
  el.trainingWeightInput.value = entry.weight;
  el.trainingDialog.showModal();
}

async function deleteTraining(id) {
  if (!confirm("Удалить запись тренировки?")) return;
  await api(`/training/entries/${id}`, { method: "DELETE" });
  await loadAll();
}

async function saveSettings() {
  await api("/settings", {
    method: "PUT",
    body: JSON.stringify({
      calories_goal: Number(el.goalCalories.value || 0),
      protein_goal: Number(el.goalProtein.value || 0),
      fat_goal: Number(el.goalFat.value || 0),
      carbs_goal: Number(el.goalCarbs.value || 0),
      water_goal_ml: Number(el.goalWater.value || 0)
    })
  });
  await loadAll();
}

async function saveWeight() {
  await api("/weight", {
    method: "POST",
    body: JSON.stringify({ date: state.date, weight: Number(el.weightInput.value || 0) })
  });
  await loadAll();
}

async function deleteWeight(date) {
  if (!confirm("Удалить запись веса?")) return;
  await api(`/weight/${date}`, { method: "DELETE" });
  await loadAll();
}

async function askAi() {
  const query = el.aiInput.value.trim();
  if (!query) return;
  el.aiAnswer.textContent = "Считаю...";
  try {
    const data = await api("/ai/macros", { method: "POST", body: JSON.stringify({ query }) });
    el.aiAnswer.textContent = data.answer || "Нет ответа";
  } catch {
    el.aiAnswer.textContent = "Ошибка запроса к AI";
  }
}

async function buildReport() {
  const from = el.reportFrom.value;
  const to = el.reportTo.value;
  if (!from || !to) return;
  el.reportOutput.textContent = "Собираю отчет...";
  try {
    const data = await api("/report", { method: "POST", body: JSON.stringify({ from, to }) });
    const metrics = data.metrics;
    const txt = [
      `Период: ${metrics.from} - ${metrics.to}`,
      `Среднее: ${metrics.averages.calories} kcal, P ${metrics.averages.protein}g, F ${metrics.averages.fat}g, C ${metrics.averages.carbs}g`,
      `Вода: ${metrics.averages.water_ml} ml/день`,
      `Соблюдение целей: kcal ${metrics.compliance.calories}%, protein ${metrics.compliance.protein}%, fat ${metrics.compliance.fat}%, carbs ${metrics.compliance.carbs}%, water ${metrics.compliance.water}%`,
      `Тренировочных дней: ${metrics.training_days}/${metrics.days}`,
      `Вес: ${metrics.weight.start ?? "-"} -> ${metrics.weight.end ?? "-"} (delta: ${metrics.weight.delta ?? "-"})`,
      "",
      `Mini report: ${data.ruleBased.summary}`,
      `Strong: ${data.ruleBased.strengths.join("; ")}`,
      `Weak: ${data.ruleBased.issues.join("; ")}`,
      `Advice: ${data.ruleBased.advice.join("; ")}`
    ];
    if (data.ai) {
      txt.push("");
      txt.push("AI analysis:");
      txt.push(data.ai);
    }
    el.reportOutput.textContent = txt.join("\n");
  } catch {
    el.reportOutput.textContent = "Не удалось построить отчет";
  }
}

function bindTabs() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach((section) => section.classList.remove("active"));
      document.getElementById(`tab-${tab}`).classList.add("active");
    });
  });
}

function bindEvents() {
  el.prevDayBtn.addEventListener("click", async () => {
    shiftDate(-1);
    await loadAll();
  });
  el.calendarBtn.addEventListener("click", openCalendar);
  el.calendarCloseBtn.addEventListener("click", () => el.calendarDialog.close());
  el.calendarPrevMonthBtn.addEventListener("click", () => {
    state.calendarMonthCursor = addMonths(state.calendarMonthCursor || monthStart(state.date), -1);
    renderCalendar();
  });
  el.calendarNextMonthBtn.addEventListener("click", () => {
    state.calendarMonthCursor = addMonths(state.calendarMonthCursor || monthStart(state.date), 1);
    renderCalendar();
  });
  el.calendarGrid.addEventListener("click", async (event) => {
    const btn = event.target.closest("button.calendar-day");
    if (!btn) return;
    state.date = btn.dataset.date;
    el.calendarDialog.close();
    await loadAll();
  });
  el.nextDayBtn.addEventListener("click", async () => {
    shiftDate(1);
    await loadAll();
  });
  document.querySelectorAll(".water-add").forEach((btn) => {
    btn.addEventListener("click", async () => addWater(Number(btn.dataset.ml)));
  });

  el.addFoodBtn.addEventListener("click", () => {
    resetFoodDialog();
    el.foodDialog.showModal();
  });
  el.foodMode.addEventListener("change", toggleFoodMode);
  el.foodForm.addEventListener("submit", submitFood);
  el.foodDialog.addEventListener("close", resetFoodDialog);
  el.foodCancelBtn.addEventListener("click", () => {
    el.foodDialog.close();
    resetFoodDialog();
  });

  el.foodList.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === "edit-food") await editFood(id);
    if (btn.dataset.action === "delete-food") await deleteFood(id);
  });

  el.addTrainingBtn.addEventListener("click", () => {
    resetTrainingDialog();
    el.trainingDialog.showModal();
  });
  el.trainingMode.addEventListener("change", toggleTrainingMode);
  el.trainingForm.addEventListener("submit", submitTraining);
  el.trainingDialog.addEventListener("close", resetTrainingDialog);
  el.trainingCancelBtn.addEventListener("click", () => {
    el.trainingDialog.close();
    resetTrainingDialog();
  });

  el.trainingList.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === "edit-training") await editTraining(id);
    if (btn.dataset.action === "delete-training") await deleteTraining(id);
  });

  el.weightHistory.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action === "delete-weight") await deleteWeight(btn.dataset.date);
  });

  el.saveSettingsBtn.addEventListener("click", saveSettings);
  el.saveWeightBtn.addEventListener("click", saveWeight);
  el.askAiBtn.addEventListener("click", askAi);
  el.buildReportBtn.addEventListener("click", buildReport);
}

async function init() {
  if (tg) {
    tg.ready();
    tg.expand();
    state.telegramInitData = tg.initData || "";
    const tgUserId = tg.initDataUnsafe?.user?.id;
    if (tgUserId !== undefined && tgUserId !== null) {
      state.userId = String(tgUserId);
    }
  }
  bindTabs();
  bindEvents();
  toggleFoodMode();
  toggleTrainingMode();
  await loadAll();
}

init().catch((error) => {
  console.error(error);
  alert("Не удалось загрузить данные. Проверь подключение к серверу и Telegram initData.");
});
