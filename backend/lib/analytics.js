import OpenAI from "openai";

function toISODate(input) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildRange(from, to) {
  const start = new Date(`${toISODate(from)}T00:00:00`);
  const end = new Date(`${toISODate(to)}T00:00:00`);
  if (start > end) return { from: toISODate(to), to: toISODate(from) };
  return { from: toISODate(from), to: toISODate(to) };
}

export function getProgressRows(db, userId, fromInput, toInput) {
  const { from, to } = buildRange(fromInput, toInput);
  const rows = db
    .prepare(
      `
    WITH RECURSIVE dates(date) AS (
      SELECT ?
      UNION ALL
      SELECT date(date, '+1 day') FROM dates WHERE date < ?
    ),
    food AS (
      SELECT
        date,
        COALESCE(SUM(calories), 0) AS calories,
        COALESCE(SUM(protein), 0) AS protein,
        COALESCE(SUM(fat), 0) AS fat,
        COALESCE(SUM(carbs), 0) AS carbs
      FROM food_entries
      WHERE user_id = ? AND date BETWEEN ? AND ?
      GROUP BY date
    ),
    water AS (
      SELECT date, COALESCE(SUM(volume_ml), 0) AS water_ml
      FROM water_entries
      WHERE user_id = ? AND date BETWEEN ? AND ?
      GROUP BY date
    ),
    train AS (
      SELECT date, COUNT(*) AS training_count
      FROM training_entries
      WHERE user_id = ? AND date BETWEEN ? AND ?
      GROUP BY date
    ),
    wt AS (
      SELECT date, weight
      FROM weight_entries
      WHERE user_id = ? AND date BETWEEN ? AND ?
    )
    SELECT
      d.date,
      COALESCE(f.calories, 0) AS calories,
      COALESCE(f.protein, 0) AS protein,
      COALESCE(f.fat, 0) AS fat,
      COALESCE(f.carbs, 0) AS carbs,
      COALESCE(w.water_ml, 0) AS water_ml,
      COALESCE(t.training_count, 0) AS training_count,
      wt.weight AS weight
    FROM dates d
    LEFT JOIN food f ON f.date = d.date
    LEFT JOIN water w ON w.date = d.date
    LEFT JOIN train t ON t.date = d.date
    LEFT JOIN wt ON wt.date = d.date
    ORDER BY d.date ASC
  `
    )
    .all(from, to, userId, from, to, userId, from, to, userId, from, to, userId, from, to);

  return { from, to, rows };
}

function ratio(value, goal) {
  if (!goal || goal <= 0) return 0;
  return value / goal;
}

export function buildReportPayload(db, userId, fromInput, toInput) {
  const settings =
    db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId) || {
      user_id: userId,
      calories_goal: 2200,
      protein_goal: 120,
      fat_goal: 70,
      carbs_goal: 250,
      water_goal_ml: 2500
    };
  const { from, to, rows } = getProgressRows(db, userId, fromInput, toInput);
  const days = rows.length || 1;
  const totals = rows.reduce(
    (acc, row) => {
      acc.calories += Number(row.calories || 0);
      acc.protein += Number(row.protein || 0);
      acc.fat += Number(row.fat || 0);
      acc.carbs += Number(row.carbs || 0);
      acc.water_ml += Number(row.water_ml || 0);
      acc.training_days += row.training_count > 0 ? 1 : 0;
      if (row.weight !== null && row.weight !== undefined) {
        if (acc.start_weight === null) acc.start_weight = Number(row.weight);
        acc.end_weight = Number(row.weight);
      }
      acc.goal_hits.calories += ratio(row.calories, settings.calories_goal) >= 0.9 ? 1 : 0;
      acc.goal_hits.protein += ratio(row.protein, settings.protein_goal) >= 0.9 ? 1 : 0;
      acc.goal_hits.fat += ratio(row.fat, settings.fat_goal) >= 0.9 ? 1 : 0;
      acc.goal_hits.carbs += ratio(row.carbs, settings.carbs_goal) >= 0.9 ? 1 : 0;
      acc.goal_hits.water += ratio(row.water_ml, settings.water_goal_ml) >= 0.9 ? 1 : 0;
      return acc;
    },
    {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      water_ml: 0,
      training_days: 0,
      start_weight: null,
      end_weight: null,
      goal_hits: { calories: 0, protein: 0, fat: 0, carbs: 0, water: 0 }
    }
  );

  const averages = {
    calories: Number((totals.calories / days).toFixed(1)),
    protein: Number((totals.protein / days).toFixed(1)),
    fat: Number((totals.fat / days).toFixed(1)),
    carbs: Number((totals.carbs / days).toFixed(1)),
    water_ml: Number((totals.water_ml / days).toFixed(0))
  };

  const compliance = {
    calories: Number(((totals.goal_hits.calories / days) * 100).toFixed(0)),
    protein: Number(((totals.goal_hits.protein / days) * 100).toFixed(0)),
    fat: Number(((totals.goal_hits.fat / days) * 100).toFixed(0)),
    carbs: Number(((totals.goal_hits.carbs / days) * 100).toFixed(0)),
    water: Number(((totals.goal_hits.water / days) * 100).toFixed(0))
  };

  const weight_delta =
    totals.start_weight !== null && totals.end_weight !== null
      ? Number((totals.end_weight - totals.start_weight).toFixed(2))
      : null;

  return {
    from,
    to,
    days,
    settings,
    averages,
    compliance,
    training_days: totals.training_days,
    weight: {
      start: totals.start_weight,
      end: totals.end_weight,
      delta: weight_delta
    },
    rows
  };
}

export function buildRuleBasedSummary(report) {
  const issues = [];
  if (report.compliance.protein < 60) issues.push("недобор белка");
  if (report.compliance.water < 60) issues.push("нестабильная вода");
  if (report.training_days / report.days < 0.3) issues.push("мало тренировок");
  if (report.compliance.calories < 60) issues.push("ккал сильно гуляют");

  const strengths = [];
  if (report.compliance.protein >= 75) strengths.push("белок на хорошем уровне");
  if (report.compliance.water >= 75) strengths.push("вода держится стабильно");
  if (report.training_days / report.days >= 0.5) strengths.push("регулярные тренировки");

  const advice = [];
  if (report.compliance.protein < 75) advice.push("Добавь 1-2 белковых приема пищи в день.");
  if (report.compliance.water < 75) advice.push("Поставь минимум 3 фиксированных точки воды: утро, день, вечер.");
  if (report.training_days / report.days < 0.4) advice.push("Зафиксируй минимум 3 тренировки в неделю.");
  if (report.compliance.calories < 70)
    advice.push("Выравни калории: держи коридор +/-10% от дневной нормы.");

  return {
    summary: `Период ${report.from} - ${report.to}: средние ${report.averages.calories} ккал, ${report.averages.protein}г белка, ${report.averages.water_ml} мл воды. Тренировочных дней: ${report.training_days}/${report.days}.`,
    strengths: strengths.length ? strengths : ["данных пока мало для сильных сторон"],
    issues: issues.length ? issues : ["критичных провалов не обнаружено"],
    advice: advice.length ? advice : ["Продолжай текущий режим и контролируй стабильность."]
  };
}

export async function buildAiSummary(report, apiKey) {
  if (!apiKey) return null;
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Ты фитнес-аналитик. На входе JSON с прогрессом. Верни краткий отчет на русском: 1) Итог периода (1-2 предложения), 2) Что хорошо (3 пункта), 3) Что проседает (3 пункта), 4) Конкретный план на следующую неделю (4 пункта). Никакой воды."
      },
      { role: "user", content: JSON.stringify(report) }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() || null;
}
