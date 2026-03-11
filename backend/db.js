import "dotenv/config";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configuredDbPath = String(process.env.DB_PATH || "").trim();
const dbPath = configuredDbPath
  ? path.isAbsolute(configuredDbPath)
    ? configuredDbPath
    : path.resolve(__dirname, configuredDbPath)
  : path.join(__dirname, "nutrition.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const LEGACY_USER_ID = "legacy";

function tableExists(name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return Boolean(row);
}

function hasColumn(table, column) {
  if (!tableExists(table)) return false;
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function createV2Schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY,
  calories_goal REAL NOT NULL DEFAULT 2200,
  protein_goal REAL NOT NULL DEFAULT 120,
  fat_goal REAL NOT NULL DEFAULT 70,
  carbs_goal REAL NOT NULL DEFAULT 250,
  water_goal_ml INTEGER NOT NULL DEFAULT 2500
);

CREATE TABLE IF NOT EXISTS food_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grams REAL NOT NULL DEFAULT 100,
  calories REAL NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS food_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  template_id INTEGER,
  name TEXT NOT NULL,
  grams REAL NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  fat REAL NOT NULL,
  carbs REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES food_templates(id)
);

CREATE TABLE IF NOT EXISTS water_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  volume_ml INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exercise_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS training_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  template_id INTEGER,
  exercise_name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES exercise_templates(id)
);

CREATE TABLE IF NOT EXISTS weight_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);
`);
}

function migrateToV2() {
  const isOldSchema = tableExists("settings") && !hasColumn("settings", "user_id");
  if (!isOldSchema) return;

  db.exec(`
ALTER TABLE settings RENAME TO settings_old;
ALTER TABLE food_templates RENAME TO food_templates_old;
ALTER TABLE food_entries RENAME TO food_entries_old;
ALTER TABLE water_entries RENAME TO water_entries_old;
ALTER TABLE exercise_templates RENAME TO exercise_templates_old;
ALTER TABLE training_entries RENAME TO training_entries_old;
ALTER TABLE weight_entries RENAME TO weight_entries_old;
`);

  createV2Schema();

  const settingsOld = db.prepare("SELECT * FROM settings_old LIMIT 1").get();
  if (settingsOld) {
    db.prepare(
      `
      INSERT INTO settings (user_id, calories_goal, protein_goal, fat_goal, carbs_goal, water_goal_ml)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      LEGACY_USER_ID,
      settingsOld.calories_goal,
      settingsOld.protein_goal,
      settingsOld.fat_goal,
      settingsOld.carbs_goal,
      settingsOld.water_goal_ml
    );
  }

  db.prepare(
    `
    INSERT INTO food_templates (id, user_id, name, grams, calories, protein, fat, carbs, created_at)
    SELECT id, ?, name, grams, calories, protein, fat, carbs, created_at
    FROM food_templates_old
  `
  ).run(LEGACY_USER_ID);

  db.prepare(
    `
    INSERT INTO food_entries (id, user_id, date, template_id, name, grams, calories, protein, fat, carbs, created_at)
    SELECT id, ?, date, template_id, name, grams, calories, protein, fat, carbs, created_at
    FROM food_entries_old
  `
  ).run(LEGACY_USER_ID);

  db.prepare(
    `
    INSERT INTO water_entries (id, user_id, date, volume_ml, created_at)
    SELECT id, ?, date, volume_ml, created_at
    FROM water_entries_old
  `
  ).run(LEGACY_USER_ID);

  db.prepare(
    `
    INSERT INTO exercise_templates (id, user_id, name, created_at)
    SELECT id, ?, name, created_at
    FROM exercise_templates_old
  `
  ).run(LEGACY_USER_ID);

  db.prepare(
    `
    INSERT INTO training_entries (id, user_id, date, template_id, exercise_name, sets, reps, weight, created_at)
    SELECT id, ?, date, template_id, exercise_name, sets, reps, weight, created_at
    FROM training_entries_old
  `
  ).run(LEGACY_USER_ID);

  db.prepare(
    `
    INSERT INTO weight_entries (id, user_id, date, weight, created_at)
    SELECT id, ?, date, weight, created_at
    FROM weight_entries_old
  `
  ).run(LEGACY_USER_ID);

  db.exec(`
DROP TABLE settings_old;
DROP TABLE food_entries_old;
DROP TABLE food_templates_old;
DROP TABLE water_entries_old;
DROP TABLE training_entries_old;
DROP TABLE exercise_templates_old;
DROP TABLE weight_entries_old;
`);
}

migrateToV2();
createV2Schema();

export default db;
