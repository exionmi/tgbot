const express = require('express');
const router = express.Router();
const { queries } = require('../database/db');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

// ======================================================
//  ДЕПОЗИТ: 4 метода пополнения
// ======================================================

// ===== 1. Telegram Gifts (NFT) =====
router.post('/telegram-gift', (req, res) => {
  try {
    const { telegramId, giftId, giftName, giftValue } = req.body;
    
    if (!telegramId || !giftValue) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    // Создаём запись о депозите
    const result = queries.createDeposit.run(
      user.id, 'telegram_gift', giftValue, 'TON', 'completed',
      giftId || uuidv4(),
      JSON.stringify({ giftName, giftId })
    );
    
    // Начисляем баланс
    queries.updateBalance.run(giftValue, String(telegramId));
    queries.addDeposited.run(giftValue, String(telegramId));
    
    const updatedUser = queries.getUser.get(String(telegramId));
    
    res.json({
      success: true,
      message: `Подарок "${giftName}" принят! Начислено ${giftValue} TON`,
      depositId: result.lastInsertRowid,
      balance: updatedUser.balance,
    });
  } catch (err) {
    console.error('Telegram Gift deposit error:', err);
    res.status(500).json({ error: 'Ошибка обработки подарка' });
  }
});

// ===== 2. Crypto Wallet (TON Connect / любой крипто кошелёк) =====
router.post('/crypto-wallet', (req, res) => {
  try {
    const { telegramId, amount, currency, walletAddress, txHash } = req.body;
    
    if (!telegramId || !amount || !currency) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    if (amount <= 0) {
      return res.status(400).json({ error: 'Сумма должна быть положительной' });
    }
    
    // Привязываем кошелёк если указан
    if (walletAddress) {
      queries.updateWallet.run(walletAddress, String(telegramId));
    }
    
    // Конвертация в TON (упрощённая)
    const conversionRates = {
      'TON': 1,
      'USDT': 0.15,    // ~1 USDT = 0.15 TON
      'BTC': 11000,     // ~1 BTC = 11000 TON
      'ETH': 550,       // ~1 ETH = 550 TON
      'SOL': 25,        // ~1 SOL = 25 TON
    };
    
    const rate = conversionRates[currency] || 1;
    const tonAmount = Math.floor(amount * rate * 100) / 100;
    
    // Создаём депозит (pending - нужна проверка транзакции)
    const depositId = uuidv4();
    const result = queries.createDeposit.run(
      user.id, 'crypto_wallet', tonAmount, currency, 'pending',
      txHash || depositId,
      JSON.stringify({ walletAddress, originalAmount: amount, currency, rate })
    );
    
    // В продакшене здесь нужна верификация транзакции через блокчейн
    // Для демо автоматически подтверждаем
    queries.updateDepositStatus.run('completed', result.lastInsertRowid);
    queries.updateBalance.run(tonAmount, String(telegramId));
    queries.addDeposited.run(tonAmount, String(telegramId));
    
    const updatedUser = queries.getUser.get(String(telegramId));
    
    res.json({
      success: true,
      message: `Депозит ${amount} ${currency} (${tonAmount} TON) обработан!`,
      depositId: result.lastInsertRowid,
      tonAmount,
      balance: updatedUser.balance,
    });
  } catch (err) {
    console.error('Crypto wallet deposit error:', err);
    res.status(500).json({ error: 'Ошибка обработки депозита' });
  }
});

// ===== 3. CryptoBot =====
router.post('/cryptobot', async (req, res) => {
  try {
    const { telegramId, amount, currency } = req.body;
    
    if (!telegramId || !amount) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    if (!config.CRYPTOBOT_TOKEN) {
      // Демо-режим без CryptoBot
      const tonAmount = Math.floor(amount * 100) / 100;
      const result = queries.createDeposit.run(
        user.id, 'cryptobot', tonAmount, currency || 'TON', 'completed',
        uuidv4(),
        JSON.stringify({ demo: true })
      );
      
      queries.updateBalance.run(tonAmount, String(telegramId));
      queries.addDeposited.run(tonAmount, String(telegramId));
      
      const updatedUser = queries.getUser.get(String(telegramId));
      
      return res.json({
        success: true,
        message: `CryptoBot: ${tonAmount} TON начислено (демо)`,
        depositId: result.lastInsertRowid,
        balance: updatedUser.balance,
      });
    }
    
    // Создаём инвойс через CryptoBot API
    const invoiceId = uuidv4();
    
    // В продакшене: вызов CryptoBot API для создания invoice
    // const response = await fetch(`${config.CRYPTOBOT_API_URL}/createInvoice`, {
    //   method: 'POST',
    //   headers: {
    //     'Crypto-Pay-API-Token': config.CRYPTOBOT_TOKEN,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     asset: currency || 'TON',
    //     amount: String(amount),
    //     description: 'Пополнение баланса Crash Game',
    //     payload: invoiceId,
    //   })
    // });
    
    const result = queries.createDeposit.run(
      user.id, 'cryptobot', amount, currency || 'TON', 'pending',
      invoiceId,
      JSON.stringify({ currency: currency || 'TON' })
    );
    
    res.json({
      success: true,
      message: 'Инвойс CryptoBot создан',
      depositId: result.lastInsertRowid,
      invoiceId,
      // payUrl: response.result.pay_url,  // В продакшене
      payUrl: `https://t.me/CryptoBot?start=${invoiceId}`,
    });
  } catch (err) {
    console.error('CryptoBot deposit error:', err);
    res.status(500).json({ error: 'Ошибка CryptoBot' });
  }
});

// CryptoBot webhook
router.post('/cryptobot/webhook', (req, res) => {
  try {
    const { invoice_id, status, amount, asset } = req.body;
    
    // В продакшене: верификация подписи вебхука
    if (status === 'paid') {
      // Находим депозит и подтверждаем
      // Для демо: просто отвечаем OK
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ===== 4. Telegram Stars =====
router.post('/telegram-stars', (req, res) => {
  try {
    const { telegramId, starsAmount, paymentId } = req.body;
    
    if (!telegramId || !starsAmount) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    // Конвертация Stars в TON (примерный курс)
    // 1 Star ≈ 0.02 USD ≈ 0.003 TON (условно)
    const starsToTon = 0.01; // 1 star = 0.01 TON
    const tonAmount = Math.floor(starsAmount * starsToTon * 100) / 100;
    
    const result = queries.createDeposit.run(
      user.id, 'telegram_stars', tonAmount, 'STARS', 'completed',
      paymentId || uuidv4(),
      JSON.stringify({ starsAmount, rate: starsToTon })
    );
    
    queries.updateBalance.run(tonAmount, String(telegramId));
    queries.addDeposited.run(tonAmount, String(telegramId));
    
    const updatedUser = queries.getUser.get(String(telegramId));
    
    res.json({
      success: true,
      message: `${starsAmount} Stars → ${tonAmount} TON начислено!`,
      depositId: result.lastInsertRowid,
      tonAmount,
      balance: updatedUser.balance,
    });
  } catch (err) {
    console.error('Stars deposit error:', err);
    res.status(500).json({ error: 'Ошибка обработки Stars' });
  }
});

// ======================================================
//  ВЫВОД: Только Telegram NFT подарки!
// ======================================================

// Получить доступные для вывода подарки
router.get('/available-gifts/:telegramId', (req, res) => {
  try {
    const user = queries.getUser.get(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const gifts = queries.getUserGifts.all(user.id);
    
    res.json({
      success: true,
      gifts: gifts.filter(g => g.status === 'available'),
      message: 'Вывод доступен только в виде Telegram NFT подарков'
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Запрос на вывод подарка
router.post('/withdraw-gift', (req, res) => {
  try {
    const { telegramId, giftId } = req.body;
    
    if (!telegramId || !giftId) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    // Проверяем подарок
    const gifts = queries.getUserGifts.all(user.id);
    const gift = gifts.find(g => g.id === giftId && g.status === 'available');
    
    if (!gift) {
      return res.status(400).json({ error: 'Подарок не найден или уже выведен' });
    }
    
    // Обновляем статус подарка
    queries.updateGiftStatus.run('pending_withdrawal', giftId);
    
    // Создаём запрос на вывод
    const result = queries.createWithdrawal.run(
      user.id, giftId, gift.name, gift.value
    );
    
    // В продакшене: отправка NFT подарка через Telegram Bot API
    // Здесь будет интеграция с Telegram Gift API
    
    // Имитируем отправку
    setTimeout(() => {
      try {
        queries.updateWithdrawalStatus.run('sent', `tg_gift_${Date.now()}`, result.lastInsertRowid);
        queries.updateGiftStatus.run('withdrawn', giftId);
      } catch (e) {
        console.error('Withdrawal processing error:', e);
      }
    }, 2000);
    
    res.json({
      success: true,
      message: `Подарок "${gift.name}" отправлен! Ожидайте доставку в Telegram.`,
      withdrawalId: result.lastInsertRowid,
      gift: {
        id: gift.id,
        name: gift.name,
        value: gift.value,
        tier: gift.tier,
      }
    });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Ошибка вывода' });
  }
});

// Статус выводов
router.get('/withdrawals/:telegramId', (req, res) => {
  try {
    const user = queries.getUser.get(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const withdrawals = queries.getWithdrawalsByUser.all(user.id);
    
    res.json({ success: true, withdrawals });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
