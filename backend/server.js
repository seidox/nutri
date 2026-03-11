import "dotenv/config";
import express from "express";
import cors from "cors";
import db from "./db.js";
import OpenAI from "openai";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { buildAiSummary, buildReportPayload, buildRuleBasedSummary, getProgressRows } from "./lib/analytics.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../frontend");

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDir));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const allowUnsafeUserId =
  String(process.env.ALLOW_UNSAFE_USER_ID || (process.env.NODE_ENV === "production" ? "false" : "true")) ===
  "true";

function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const digest = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const hashBuf = Buffer.from(hash, "hex");
  const digestBuf = Buffer.from(digest, "hex");
  if (hashBuf.length !== digestBuf.length) return null;
  if (!crypto.timingSafeEqual(hashBuf, digestBuf)) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw);
    if (!user?.id) return null;
    return String(user.id);
  } catch {
    return null;
  }
}

app.use((req, res, next) => {
  const initData = String(req.headers["x-telegram-init-data"] || "");
  const verifiedTelegramUserId = validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
  if (verifiedTelegramUserId) {
    req.userId = verifiedTelegramUserId;
    return next();
  }

  if (allowUnsafeUserId) {
    req.userId = String(req.headers["x-user-id"] || "local-dev");
    return next();
  }

  res.status(401).json({ error: "Unauthorized: invalid Telegram initData" });
});

app.use((req, _, next) => {
  if (!req.userId) req.userId = "local-dev";
  next();
});

function getOrCreateSettings(userId) {
  let settings = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId);
  if (!settings) {
    db.prepare(
      `
      INSERT INTO settings (user_id, calories_goal, protein_goal, fat_goal, carbs_goal, water_goal_ml)
      VALUES (?, 2200, 120, 70, 250, 2500)
    `
    ).run(userId);
    settings = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId);
  }
  return settings;
}

function toISODate(input) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.get("/api/settings", (req, res) => {
  const settings = getOrCreateSettings(req.userId);
  res.json(settings);
});

app.put("/api/settings", (req, res) => {
  const {
    calories_goal = 2200,
    protein_goal = 120,
    fat_goal = 70,
    carbs_goal = 250,
    water_goal_ml = 2500
  } = req.body || {};

  getOrCreateSettings(req.userId);
  db.prepare(
    `
    UPDATE settings
    SET calories_goal = ?, protein_goal = ?, fat_goal = ?, carbs_goal = ?, water_goal_ml = ?
    WHERE user_id = ?
  `
  ).run(calories_goal, protein_goal, fat_goal, carbs_goal, water_goal_ml, req.userId);

  res.json(db.prepare("SELECT * FROM settings WHERE user_id = ?").get(req.userId));
});

app.get("/api/day-summary", (req, res) => {
  const date = toISODate(req.query.date);
  const nutrition =
    db
      .prepare(
        `
    SELECT
      COALESCE(SUM(calories), 0) AS calories,
      COALESCE(SUM(protein), 0) AS protein,
      COALESCE(SUM(fat), 0) AS fat,
      COALESCE(SUM(carbs), 0) AS carbs
    FROM food_entries
    WHERE user_id = ? AND date = ?
  `
      )
      .get(req.userId, date) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const water_ml =
    db
      .prepare(
        `
    SELECT COALESCE(SUM(volume_ml), 0) AS water_ml
    FROM water_entries
    WHERE user_id = ? AND date = ?
  `
      )
      .get(req.userId, date)?.water_ml || 0;
  const settings = getOrCreateSettings(req.userId);
  const weight = db
    .prepare("SELECT weight FROM weight_entries WHERE user_id = ? AND date = ?")
    .get(req.userId, date)?.weight;

  res.json({ date, nutrition, water_ml, settings, weight: weight ?? null });
});

app.get("/api/food/templates", (_, res) => {
  const templates = db
    .prepare(
      `
    SELECT * FROM food_templates
    WHERE user_id = ?
    ORDER BY name COLLATE NOCASE ASC
  `
    )
    .all(_.userId);
  res.json(templates);
});

app.get("/api/food/entries", (req, res) => {
  const date = toISODate(req.query.date);
  const entries = db
    .prepare(
      `
    SELECT * FROM food_entries
    WHERE user_id = ? AND date = ?
    ORDER BY id DESC
  `
    )
    .all(req.userId, date);
  res.json(entries);
});

app.post("/api/food/entries", (req, res) => {
  const {
    date,
    mode,
    template_id,
    name,
    grams,
    calories,
    protein,
    fat,
    carbs,
    save_as_template = true
  } = req.body || {};

  const entryDate = toISODate(date);

  let finalTemplateId = null;
  let finalName = "";
  let finalGrams = Number(grams || 0);
  let finalCalories = 0;
  let finalProtein = 0;
  let finalFat = 0;
  let finalCarbs = 0;

  if (mode === "existing") {
    const template = db
      .prepare("SELECT * FROM food_templates WHERE id = ? AND user_id = ?")
      .get(template_id, req.userId);
    if (!template) return res.status(404).json({ error: "Template not found" });
    finalTemplateId = template.id;
    finalName = template.name;
    finalGrams = finalGrams || template.grams || 100;
    const k = finalGrams / (template.grams || 100);
    finalCalories = Number((template.calories * k).toFixed(2));
    finalProtein = Number((template.protein * k).toFixed(2));
    finalFat = Number((template.fat * k).toFixed(2));
    finalCarbs = Number((template.carbs * k).toFixed(2));
  } else {
    finalName = String(name || "").trim();
    if (!finalName) return res.status(400).json({ error: "Name is required for new food item" });
    // New food input is interpreted as per-100g macros.
    const per100Calories = Number(calories || 0);
    const per100Protein = Number(protein || 0);
    const per100Fat = Number(fat || 0);
    const per100Carbs = Number(carbs || 0);
    if (!finalGrams) finalGrams = 100;
    const k = finalGrams / 100;
    finalCalories = Number((per100Calories * k).toFixed(2));
    finalProtein = Number((per100Protein * k).toFixed(2));
    finalFat = Number((per100Fat * k).toFixed(2));
    finalCarbs = Number((per100Carbs * k).toFixed(2));

    if (save_as_template) {
      db.prepare(
        `
        INSERT INTO food_templates (user_id, name, grams, calories, protein, fat, carbs)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, name) DO UPDATE SET
          grams = excluded.grams,
          calories = excluded.calories,
          protein = excluded.protein,
          fat = excluded.fat,
          carbs = excluded.carbs
      `
      ).run(req.userId, finalName, 100, per100Calories, per100Protein, per100Fat, per100Carbs);
      finalTemplateId = db
        .prepare("SELECT id FROM food_templates WHERE user_id = ? AND name = ?")
        .get(req.userId, finalName).id;
    }
  }

  const info = db
    .prepare(
      `
    INSERT INTO food_entries (user_id, date, template_id, name, grams, calories, protein, fat, carbs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      req.userId,
      entryDate,
      finalTemplateId,
      finalName,
      finalGrams,
      finalCalories,
      finalProtein,
      finalFat,
      finalCarbs
    );

  const entry = db.prepare("SELECT * FROM food_entries WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(entry);
});

app.put("/api/food/entries/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM food_entries WHERE id = ? AND user_id = ?").get(id, req.userId);
  if (!row) return res.status(404).json({ error: "Food entry not found" });

  const grams = Number(req.body?.grams ?? row.grams);
  const calories = Number(req.body?.calories ?? row.calories);
  const protein = Number(req.body?.protein ?? row.protein);
  const fat = Number(req.body?.fat ?? row.fat);
  const carbs = Number(req.body?.carbs ?? row.carbs);
  const name = String(req.body?.name ?? row.name).trim();
  if (!name) return res.status(400).json({ error: "name is required" });

  db.prepare(
    `
    UPDATE food_entries
    SET name = ?, grams = ?, calories = ?, protein = ?, fat = ?, carbs = ?
    WHERE id = ? AND user_id = ?
  `
  ).run(name, grams, calories, protein, fat, carbs, id, req.userId);

  res.json(db.prepare("SELECT * FROM food_entries WHERE id = ? AND user_id = ?").get(id, req.userId));
});

app.delete("/api/food/entries/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM food_entries WHERE id = ? AND user_id = ?").run(id, req.userId);
  if (!info.changes) return res.status(404).json({ error: "Food entry not found" });
  res.json({ ok: true });
});

app.get("/api/water/entries", (req, res) => {
  const date = toISODate(req.query.date);
  const entries = db
    .prepare(
      `
    SELECT * FROM water_entries
    WHERE user_id = ? AND date = ?
    ORDER BY id DESC
  `
    )
    .all(req.userId, date);
  res.json(entries);
});

app.post("/api/water/entries", (req, res) => {
  const date = toISODate(req.body?.date);
  const volume_ml = Number(req.body?.volume_ml || 0);
  if (volume_ml <= 0) return res.status(400).json({ error: "volume_ml must be > 0" });

  const info = db
    .prepare("INSERT INTO water_entries (user_id, date, volume_ml) VALUES (?, ?, ?)")
    .run(req.userId, date, volume_ml);
  res.status(201).json(db.prepare("SELECT * FROM water_entries WHERE id = ?").get(info.lastInsertRowid));
});

app.get("/api/training/templates", (_, res) => {
  const templates = db
    .prepare(
      `
    SELECT * FROM exercise_templates
    WHERE user_id = ?
    ORDER BY name COLLATE NOCASE ASC
  `
    )
    .all(_.userId);
  res.json(templates);
});

app.get("/api/training/entries", (req, res) => {
  const date = toISODate(req.query.date);
  const entries = db
    .prepare(
      `
    SELECT * FROM training_entries
    WHERE user_id = ? AND date = ?
    ORDER BY id DESC
  `
    )
    .all(req.userId, date);
  res.json(entries);
});

app.post("/api/training/entries", (req, res) => {
  const { date, mode, template_id, exercise_name, sets, reps, weight, save_as_template = true } =
    req.body || {};
  const entryDate = toISODate(date);
  let finalTemplateId = null;
  let finalExerciseName = "";

  if (mode === "existing") {
    const template = db
      .prepare("SELECT * FROM exercise_templates WHERE id = ? AND user_id = ?")
      .get(template_id, req.userId);
    if (!template) return res.status(404).json({ error: "Exercise template not found" });
    finalTemplateId = template.id;
    finalExerciseName = template.name;
  } else {
    finalExerciseName = String(exercise_name || "").trim();
    if (!finalExerciseName) return res.status(400).json({ error: "exercise_name is required" });
    if (save_as_template) {
      db.prepare(
        `
        INSERT INTO exercise_templates (user_id, name)
        VALUES (?, ?)
        ON CONFLICT(user_id, name) DO NOTHING
      `
      ).run(req.userId, finalExerciseName);
      finalTemplateId = db
        .prepare("SELECT id FROM exercise_templates WHERE user_id = ? AND name = ?")
        .get(req.userId, finalExerciseName).id;
    }
  }

  const finalSets = Math.max(1, Number(sets || 1));
  const finalReps = Math.max(1, Number(reps || 1));
  const finalWeight = Number(weight || 0);

  const info = db
    .prepare(
      `
    INSERT INTO training_entries (user_id, date, template_id, exercise_name, sets, reps, weight)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(req.userId, entryDate, finalTemplateId, finalExerciseName, finalSets, finalReps, finalWeight);

  res.status(201).json(db.prepare("SELECT * FROM training_entries WHERE id = ?").get(info.lastInsertRowid));
});

app.put("/api/training/entries/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare("SELECT * FROM training_entries WHERE id = ? AND user_id = ?")
    .get(id, req.userId);
  if (!row) return res.status(404).json({ error: "Training entry not found" });

  const exercise_name = String(req.body?.exercise_name ?? row.exercise_name).trim();
  if (!exercise_name) return res.status(400).json({ error: "exercise_name is required" });
  const sets = Math.max(1, Number(req.body?.sets ?? row.sets));
  const reps = Math.max(1, Number(req.body?.reps ?? row.reps));
  const weight = Number(req.body?.weight ?? row.weight);

  db.prepare(
    `
    UPDATE training_entries
    SET exercise_name = ?, sets = ?, reps = ?, weight = ?
    WHERE id = ? AND user_id = ?
  `
  ).run(exercise_name, sets, reps, weight, id, req.userId);

  res.json(db.prepare("SELECT * FROM training_entries WHERE id = ? AND user_id = ?").get(id, req.userId));
});

app.delete("/api/training/entries/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM training_entries WHERE id = ? AND user_id = ?").run(id, req.userId);
  if (!info.changes) return res.status(404).json({ error: "Training entry not found" });
  res.json({ ok: true });
});

app.get("/api/weight", (req, res) => {
  const date = toISODate(req.query.date);
  const row = db.prepare("SELECT * FROM weight_entries WHERE user_id = ? AND date = ?").get(req.userId, date);
  res.json(row || { date, weight: null });
});

app.get("/api/weight/history", (req, res) => {
  const limit = Math.min(90, Math.max(1, Number(req.query.limit || 30)));
  const rows = db
    .prepare(
      `
    SELECT * FROM weight_entries
    WHERE user_id = ?
    ORDER BY date DESC
    LIMIT ?
  `
    )
    .all(req.userId, limit);
  res.json(rows);
});

app.post("/api/weight", (req, res) => {
  const date = toISODate(req.body?.date);
  const weight = Number(req.body?.weight || 0);
  if (weight <= 0) return res.status(400).json({ error: "Weight must be > 0" });

  db.prepare(
    `
    INSERT INTO weight_entries (user_id, date, weight)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET weight = excluded.weight
  `
  ).run(req.userId, date, weight);

  res.status(201).json(
    db.prepare("SELECT * FROM weight_entries WHERE user_id = ? AND date = ?").get(req.userId, date)
  );
});

app.delete("/api/weight/:date", (req, res) => {
  const date = toISODate(req.params.date);
  db.prepare("DELETE FROM weight_entries WHERE user_id = ? AND date = ?").run(req.userId, date);
  res.json({ ok: true });
});

app.get("/api/progress", (req, res) => {
  const now = new Date().toISOString().slice(0, 10);
  const from = req.query.from || now;
  const to = req.query.to || now;
  const data = getProgressRows(db, req.userId, from, to);
  res.json(data);
});

app.post("/api/report", async (req, res) => {
  const now = new Date().toISOString().slice(0, 10);
  const from = req.body?.from || now;
  const to = req.body?.to || now;
  const report = buildReportPayload(db, req.userId, from, to);
  const ruleBased = buildRuleBasedSummary(report);

  let ai = null;
  try {
    ai = await buildAiSummary(report, process.env.OPENAI_API_KEY);
  } catch {
    ai = null;
  }

  res.json({ from: report.from, to: report.to, metrics: report, ruleBased, ai });
});

app.post("/api/ai/macros", async (req, res) => {
  if (!openai) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  const query = String(req.body?.query || "").trim();
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Ты нутрициолог-калькулятор. Отвечай ТОЛЬКО в 4 строках, без пояснений и воды: Калории - X ккал, Белки - X г, Жиры - X г, Углеводы - X г. Давай максимально точные оценочные значения."
        },
        { role: "user", content: query }
      ]
    });

    res.json({ answer: completion.choices[0]?.message?.content?.trim() || "" });
  } catch (error) {
    res.status(500).json({ error: "OpenAI request failed", detail: String(error?.message || error) });
  }
});

app.get("*", (_, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Nutrition backend is running on http://localhost:${port}`);
});
