import "dotenv/config";
import db from "../db.js";
import { buildAiSummary, buildReportPayload, buildRuleBasedSummary } from "../lib/analytics.js";

const from = process.argv[2];
const to = process.argv[3];
const userId = process.argv[4] || "local-dev";

if (!from || !to) {
  console.log("Usage: node scripts/progress-report.js <from: YYYY-MM-DD> <to: YYYY-MM-DD> [user_id]");
  process.exit(1);
}

const report = buildReportPayload(db, userId, from, to);
const base = buildRuleBasedSummary(report);
let aiText = null;

try {
  aiText = await buildAiSummary(report, process.env.OPENAI_API_KEY);
} catch {
  aiText = null;
}

console.log("==== MINI REPORT ====");
console.log(base.summary);
console.log("");
console.log("Strong:");
for (const p of base.strengths) console.log(`- ${p}`);
console.log("");
console.log("Weak:");
for (const p of base.issues) console.log(`- ${p}`);
console.log("");
console.log("Advice:");
for (const p of base.advice) console.log(`- ${p}`);

if (aiText) {
  console.log("");
  console.log("==== AI REVIEW ====");
  console.log(aiText);
}
