import "dotenv/config";
import { Telegraf, Markup } from "telegraf";

const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL;

if (!token || !webAppUrl) {
  console.warn("Bot skipped: TELEGRAM_BOT_TOKEN or WEBAPP_URL is missing.");
  process.exit(0);
}

const bot = new Telegraf(token);

const keyboard = Markup.keyboard([[Markup.button.webApp("Open Nutrition App", webAppUrl)]])
  .resize()
  .persistent();

bot.start(async (ctx) => {
  await ctx.reply(
    "Nutrition Assistant ready.\nOpen Mini App button below and track calories, water, training and weight.",
    keyboard
  );
});

bot.command("app", async (ctx) => {
  await ctx.reply("Open Mini App:", Markup.inlineKeyboard([Markup.button.webApp("Launch", webAppUrl)]));
});

bot.launch();
console.log("Telegram bot is running (long polling)");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
