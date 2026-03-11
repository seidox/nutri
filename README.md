# Telegram Mini App: Nutrition + Training

Мини-приложение с 3 страницами:
- КБЖУ + вода + AI-подсказки;
- Трекер тренировок;
- Настройки норм и ежедневный вес.

## Что реализовано
- Локальная БД SQLite (`backend/nutrition.db`).
- Шаблоны блюд и упражнений для повторного использования.
- История по дням через выбор даты (стрелки вверху).
- Вода с быстрыми кнопками и прогресс-баром.
- Круговой индикатор калорий и полосы Б/Ж/У.
- AI endpoint на `gpt-4o-mini` с коротким строгим ответом.
- Редактирование и удаление записей питания/тренировок/веса.
- График прогресса (ккал и вода) + график веса.
- Мини-отчет по периоду с советами.
- CLI-скрипт отчета по периоду.

## Установка и запуск
1. Перейти в backend:
```bash
cd backend
```
2. Установить зависимости:
```bash
npm install
```
3. Создать `.env` из примера:
```bash
copy .env.example .env
```
4. Заполнить `OPENAI_API_KEY` в `.env`.
   Для Telegram-проверки также заполни `TELEGRAM_BOT_TOKEN`.
5. Запустить API + бота одной командой:
```bash
npm start
```

Открыть в браузере: `http://localhost:3001`.

Опционально раздельный запуск:
```bash
npm run start:api
npm run start:bot
```

## GitHub + Railway (без `.env` в репозитории)
- `.env` и `nutrition.db` должны быть только локально (см. `.gitignore`).
- В GitHub пушится только код и `backend/.env.example`.
- На Railway все секреты задаются в `Variables`:
  - `OPENAI_API_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - `WEBAPP_URL`
  - `ALLOW_UNSAFE_USER_ID=false` (для прод)
- Если токены не заданы, API все равно запустится, а бот будет пропущен без падения процесса.

## Отчет по периоду (CLI)
```bash
npm run report -- 2026-03-01 2026-03-12
```
Скрипт выведет мини-отчет, проблемы/сильные стороны и советы. Если есть `OPENAI_API_KEY`, добавит AI-анализ.

Опционально можно указать user_id:
```bash
npm run report -- 2026-03-01 2026-03-12 123456789
```

## Интеграция с Telegram-ботом (базовая)
1. В `.env` заполнить:
- `TELEGRAM_BOT_TOKEN`
- `WEBAPP_URL` (публичный URL мини-аппа, например Cloudflare Tunnel/ngrok)

2. Запуск бота отдельно (если нужен только бот):
```bash
npm run start:bot
```

3. В боте:
- `/start` пришлет постоянную кнопку `Open Nutrition App`
- `/app` пришлет inline-кнопку `Launch`

## Telegram Mini App URL
Для Telegram нужен публичный HTTPS URL.
Можно пробросить локальный `3001` через Cloudflare Tunnel или ngrok и вставить URL в `WEBAPP_URL`.

## Валидация Telegram initData
- Backend валидирует `x-telegram-init-data` подписью через `TELEGRAM_BOT_TOKEN`.
- В проде рекомендуется `ALLOW_UNSAFE_USER_ID=false` (иначе fallback на `x-user-id` будет разрешен).
- Для локальной разработки можно оставить `ALLOW_UNSAFE_USER_ID=true`.
