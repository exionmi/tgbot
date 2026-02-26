// ============================================================
//  COMBINED START — Server + Bot в одном процессе
// ============================================================
const config = require('./config');

// Запускаем игровой сервер
const { app } = require('./server');

// Запускаем бота
let botModule;
try {
  botModule = require('./bot');
} catch (err) {
  console.error('⚠️ Bot не запустился:', err.message);
}

// Если продакшн — подключаем webhook
if (botModule && botModule.bot && botModule.isProduction) {
  const webhookPath = `/webhook${config.BOT_TOKEN}`;
  const webhookUrl = `${config.WEBAPP_URL}${webhookPath}`;

  // Регистрируем маршрут для входящих апдейтов от Telegram
  app.post(webhookPath, (req, res) => {
    botModule.bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Сообщаем Telegram адрес webhook
  botModule.bot.setWebHook(webhookUrl)
    .then(() => console.log(`✅ Webhook установлен: ${webhookUrl}`))
    .catch(err => console.error('❌ Ошибка установки webhook:', err.message));
}

if (botModule && botModule.bot) {
  console.log('✅ Server + Bot запущены в одном процессе');
} else {
  console.log('⚠️ Сервер запущен без бота');
}
