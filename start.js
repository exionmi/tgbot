// ============================================================
//  COMBINED START — Server + Bot в одном процессе
// ============================================================
console.log('[START] Запуск ...');
console.log('[START] NODE_ENV:', process.env.NODE_ENV);
console.log('[START] PORT:', process.env.PORT);
console.log('[START] WEBAPP_URL:', process.env.WEBAPP_URL);
console.log('[START] BOT_TOKEN exists:', !!process.env.BOT_TOKEN);
console.log('[START] CRYPTOBOT_TOKEN exists:', !!process.env.CRYPTOBOT_TOKEN);

const config = require('./config');

// Запускаем игровой сервер
console.log('[START] Загрузка server.js ...');
let app;
try {
  ({ app } = require('./server'));
  console.log('[START] server.js загружен OK');
} catch (err) {
  console.error('[START] КРИТИЧЕСКАЯ ОШИБКА в server.js:', err.message);
  console.error(err.stack);
  process.exit(1);
}

// Запускаем бота
console.log('[START] Загрузка bot.js ...');
let botModule;
try {
  botModule = require('./bot');
  console.log('[START] bot.js загружен OK, isProduction:', botModule && botModule.isProduction);
} catch (err) {
  console.error('[START] Ошибка bot.js:', err.message);
  console.error(err.stack);
}

// Если продакшн — подключаем webhook
if (botModule && botModule.bot && botModule.isProduction) {
  const webhookPath = `/webhook${config.BOT_TOKEN}`;
  const webhookUrl = `${config.WEBAPP_URL}${webhookPath}`;

  app.post(webhookPath, (req, res) => {
    botModule.bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  botModule.bot.setWebHook(webhookUrl)
    .then(() => console.log(`[START] ✅ Webhook установлен: ${webhookUrl}`))
    .catch(err => console.error('[START] ❌ Ошибка webhook:', err.message));
}

console.log('[START] Запуск завершён. Порт:', config.PORT);

