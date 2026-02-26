require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

if (!config.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан в .env файле!');
  process.exit(1);
}

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// ===== Команда /start =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Игрок';

  bot.sendMessage(chatId, 
    `🚀 *Привет, ${firstName}!*\n\n` +
    `Добро пожаловать в *Crash Rocket* — увлекательную игру, где ракетка взлетает, а ты решаешь, когда забрать выигрыш!\n\n` +
    `🎮 *Как играть:*\n` +
    `1. Делай ставку\n` +
    `2. Ракетка взлетает, множитель растёт\n` +
    `3. Успей забрать до взрыва!\n` +
    `4. При 3x и выше — получи NFT подарок 🎁\n\n` +
    `💰 *Пополнение:*\n` +
    `• Telegram Подарки (NFT)\n` +
    `• Крипто кошелёк (TON, USDT, BTC...)\n` +
    `• CryptoBot\n` +
    `• Telegram Stars ⭐\n\n` +
    `🎁 *Вывод:* Только в виде Telegram NFT подарков!\n\n` +
    `Нажми кнопку ниже, чтобы начать играть! 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 ИГРАТЬ', web_app: { url: config.WEBAPP_URL } }],
          [{ text: '💰 Пополнить', callback_data: 'deposit' }, { text: '🎁 Мои подарки', callback_data: 'gifts' }],
          [{ text: '📊 Статистика', callback_data: 'stats' }, { text: '🏆 Топ игроков', callback_data: 'leaderboard' }],
          [{ text: 'ℹ️ Помощь', callback_data: 'help' }],
        ]
      }
    }
  );
});

// ===== Callback Queries =====
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  bot.answerCallbackQuery(query.id);

  switch (data) {
    case 'deposit':
      bot.sendMessage(chatId,
        `💳 *Способы пополнения:*\n\n` +
        `1️⃣ *Telegram Подарки (NFT)* — отправьте подарок этому боту\n` +
        `2️⃣ *Крипто кошелёк* — TON, USDT, BTC, ETH, SOL\n` +
        `3️⃣ *CryptoBot* — быстрый перевод через @CryptoBot\n` +
        `4️⃣ *Telegram Stars* ⭐ — оплата звёздами\n\n` +
        `Откройте игру и выберите способ пополнения 👇`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Открыть игру', web_app: { url: config.WEBAPP_URL } }],
            ]
          }
        }
      );
      break;

    case 'gifts':
      bot.sendMessage(chatId,
        `🎁 *Ваши подарки*\n\n` +
        `Чтобы увидеть и вывести выигранные NFT подарки, откройте игру и перейдите в раздел "Вывод".\n\n` +
        `⚠️ Вывод доступен *только в виде Telegram NFT подарков!*`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Открыть игру', web_app: { url: config.WEBAPP_URL } }],
            ]
          }
        }
      );
      break;

    case 'stats':
      bot.sendMessage(chatId,
        `📊 *Ваша статистика*\n\n` +
        `Откройте профиль в игре для подробной статистики 👇`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Открыть игру', web_app: { url: config.WEBAPP_URL } }],
            ]
          }
        }
      );
      break;

    case 'leaderboard':
      // Fetch leaderboard from API
      try {
        const http = require('http');
        const options = { hostname: 'localhost', port: config.PORT, path: '/api/leaderboard', method: 'GET' };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.success && json.leaders.length > 0) {
                let text = '🏆 *Топ игроков:*\n\n';
                json.leaders.forEach((l, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const prefix = i < 3 ? medals[i] : `${i + 1}.`;
                  text += `${prefix} ${l.username || l.first_name || 'Аноним'} — ${l.total_won.toFixed(2)} TON\n`;
                });
                bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
              } else {
                bot.sendMessage(chatId, '🏆 Пока нет данных. Будьте первым!');
              }
            } catch (e) {
              bot.sendMessage(chatId, '🏆 Данные загружаются...');
            }
          });
        });
        req.on('error', () => bot.sendMessage(chatId, '🏆 Загрузка данных...'));
        req.end();
      } catch (e) {
        bot.sendMessage(chatId, '🏆 Данные временно недоступны');
      }
      break;

    case 'help':
      bot.sendMessage(chatId,
        `ℹ️ *Помощь — Crash Rocket*\n\n` +
        `🎮 *Правила:*\n` +
        `• Ракетка взлетает с множителем от 1.00x\n` +
        `• Множитель растёт до случайного значения (макс. 50x)\n` +
        `• Нажми "ЗАБРАТЬ" до взрыва!\n` +
        `• При 3x+ — получаешь NFT подарок 🎁\n` +
        `• Чем выше кэф, тем круче подарок!\n\n` +
        `💎 *Тиры подарков:*\n` +
        `3x-5x: 🎁 Bronze Gift\n` +
        `5x-10x: 🎄 Silver Gift\n` +
        `10x-20x: 🏆 Gold Gift\n` +
        `20x-35x: 👑 Platinum Gift\n` +
        `35x-50x: 💰 Diamond Gift\n\n` +
        `🔒 *Безопасность:*\n` +
        `Каждый раунд имеет доказуемо честный хэш.`,
        { parse_mode: 'Markdown' }
      );
      break;
  }
});

// ===== Обработка полученных подарков (NFT) =====
bot.on('message', (msg) => {
  // Обработка получения подарка/стикера как NFT
  if (msg.gift || msg.sticker?.premium_animation) {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    
    bot.sendMessage(chatId,
      `🎁 *Подарок получен!*\n\n` +
      `Ваш подарок будет оценён и зачислен на баланс.\n` +
      `Откройте игру для проверки баланса 👇`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 Открыть игру', web_app: { url: config.WEBAPP_URL } }],
          ]
        }
      }
    );
  }
});

// ===== Обработка Telegram Stars платежей =====
bot.on('pre_checkout_query', (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', (msg) => {
  const chatId = msg.chat.id;
  const payment = msg.successful_payment;
  
  bot.sendMessage(chatId,
    `⭐ *Оплата Stars принята!*\n\n` +
    `Сумма: ${payment.total_amount} Stars\n` +
    `Баланс пополнен! Откройте игру 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Играть', web_app: { url: config.WEBAPP_URL } }],
        ]
      }
    }
  );
});

console.log('🤖 Telegram Bot запущен!');
console.log(`🌐 WebApp URL: ${config.WEBAPP_URL}`);
