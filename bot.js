require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { queries } = require('./database/db');
const { giftWithdrawalEmitter } = require('./events');

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
    `Добро пожаловать в *Crash Rocket* — ракета взлетает, а ты решаешь, когда забрать выигрыш!\n\n` +
    `🎮 *Как играть:*\n` +
    `1. Делай ставку\n` +
    `2. Ракетка взлетает, множитель растёт\n` +
    `3. Успей забрать до взрыва!\n` +
    `4. При 3x+ — получи подарок 🎁\n\n` +
    `💰 *Пополнение:* через CryptoBot (TON, USDT, BTC)\n` +
    `🎁 *Вывод:* Telegram подарки!\n\n` +
    `Нажми кнопку ниже 👇`,
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
        `💳 *Пополнение через CryptoBot*\n\n` +
        `Откройте игру, нажмите "Депозит" и выберите сумму.\n` +
        `Будет создан инвойс в @CryptoBot.\n\n` +
        `💵 Доступные валюты: TON, USDT, BTC, ETH`,
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
      {
        const telegramId = String(query.from.id);
        const user = queries.getUser.get(telegramId);
        
        if (user) {
          const gifts = queries.getUserGifts.all(user.id);
          const available = gifts.filter(g => g.status === 'available');
          
          let text = `🎁 *Ваши подарки*\n\n`;
          if (available.length > 0) {
            text += `У вас ${available.length} подарок(ов):\n\n`;
            available.forEach((g, i) => {
              text += `${i + 1}. ${g.name} — ${g.value} TON\n`;
            });
            text += `\nОткройте игру → "Вывод" чтобы забрать!`;
          } else {
            text += `Пока нет подарков. Играйте и выигрывайте! 🚀\n\n`;
            text += `💡 Подарки можно:\n• Выиграть в игре (при 3x+)\n• Купить за баланс в разделе "Вывод"`;
          }
          
          bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎮 Открыть игру', web_app: { url: config.WEBAPP_URL } }],
              ]
            }
          });
        } else {
          bot.sendMessage(chatId, '🎁 Сначала запустите игру, чтобы создать аккаунт!', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎮 Открыть игру', web_app: { url: config.WEBAPP_URL } }],
              ]
            }
          });
        }
      }
      break;

    case 'stats':
      {
        const telegramId = String(query.from.id);
        const user = queries.getUser.get(telegramId);
        
        if (user) {
          bot.sendMessage(chatId,
            `📊 *Ваша статистика*\n\n` +
            `💰 Баланс: ${user.balance.toFixed(2)} TON\n` +
            `📥 Внесено: ${user.total_deposited.toFixed(2)} TON\n` +
            `🎰 Поставлено: ${user.total_wagered.toFixed(2)} TON\n` +
            `🏆 Выиграно: ${user.total_won.toFixed(2)} TON\n`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎮 Играть', web_app: { url: config.WEBAPP_URL } }],
                ]
              }
            }
          );
        } else {
          bot.sendMessage(chatId, '📊 Сначала запустите игру!', {
            reply_markup: { inline_keyboard: [[{ text: '🎮 Открыть игру', web_app: { url: config.WEBAPP_URL } }]] }
          });
        }
      }
      break;

    case 'leaderboard':
      try {
        const leaders = queries.getLeaderboard.all();
        if (leaders.length > 0) {
          let text = '🏆 *Топ игроков:*\n\n';
          const medals = ['🥇', '🥈', '🥉'];
          leaders.forEach((l, i) => {
            const prefix = i < 3 ? medals[i] : `${i + 1}.`;
            text += `${prefix} ${l.username || l.first_name || 'Аноним'} — ${l.total_won.toFixed(2)} TON\n`;
          });
          bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } else {
          bot.sendMessage(chatId, '🏆 Пока нет данных. Будьте первым!');
        }
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
        `• При 3x+ — получаешь подарок 🎁\n\n` +
        `💎 *Тиры подарков:*\n` +
        `3x-5x: 🎁 Bronze\n` +
        `5x-10x: 🎄 Silver\n` +
        `10x-20x: 🏆 Gold\n` +
        `20x-35x: 👑 Platinum\n` +
        `35x-50x: 💰 Diamond\n\n` +
        `💰 *Пополнение:* CryptoBot (TON/USDT/BTC/ETH)\n` +
        `🎁 *Вывод:* Только Telegram подарки\n\n` +
        `🔒 Каждый раунд доказуемо честный (SHA256).`,
        { parse_mode: 'Markdown' }
      );
      break;
  }
});

// ===== Обработка вывода подарков =====
giftWithdrawalEmitter.on('withdraw', async (data) => {
  try {
    const { withdrawalId, telegramId, giftName, giftValue, giftTier } = data;
    
    console.log(`[GIFT] Processing withdrawal #${withdrawalId}: "${giftName}" for user ${telegramId}`);
    
    // Отправляем уведомление пользователю
    await bot.sendMessage(telegramId,
      `🎁 *Подарок отправлен!*\n\n` +
      `📦 ${giftName}\n` +
      `💰 Стоимость: ${giftValue} TON\n` +
      `📋 Тир: ${giftTier}\n\n` +
      `Подарок обрабатывается. Вы получите его в ближайшее время! ✨`,
      { parse_mode: 'Markdown' }
    );
    
    // Обновляем статус вывода
    queries.updateWithdrawalStatus.run('sent', `tg_gift_${Date.now()}`, withdrawalId);
    queries.updateGiftStatus.run('withdrawn', data.giftId);
    
    console.log(`[GIFT] Withdrawal #${withdrawalId} completed for user ${telegramId}`);
    
  } catch (err) {
    console.error('[GIFT] Error processing withdrawal:', err);
    
    // Если ошибка — ставим статус failed
    try {
      queries.updateWithdrawalStatus.run('failed', '', data.withdrawalId);
      queries.updateGiftStatus.run('available', data.giftId);
    } catch (e) {
      console.error('[GIFT] Error updating status:', e);
    }
  }
});

console.log('🤖 Telegram Bot запущен!');
console.log(`🌐 WebApp URL: ${config.WEBAPP_URL}`);
