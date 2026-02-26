const express = require('express');
const router = express.Router();
const { queries } = require('../database/db');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// ======================================================
//  ДЕПОЗИТ: Только через CryptoBot
// ======================================================

// ===== CryptoBot — создание инвойса =====
router.post('/cryptobot', async (req, res) => {
  try {
    const { telegramId, amount, currency } = req.body;
    
    if (!telegramId || !amount) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    if (amount <= 0) {
      return res.status(400).json({ error: 'Сумма должна быть положительной' });
    }

    if (!config.CRYPTOBOT_TOKEN) {
      return res.status(500).json({ error: 'CryptoBot не настроен' });
    }
    
    const payload = uuidv4();
    const asset = currency || 'TON';
    
    const response = await fetch(`${config.CRYPTOBOT_API_URL}/createInvoice`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': config.CRYPTOBOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currency_type: 'crypto',
        asset: asset,
        amount: String(amount),
        description: `Пополнение Crash Rocket — ${amount} ${asset}`,
        payload: payload,
        allow_anonymous: true,
      })
    });
    
    const cbData = await response.json();
    
    if (!cbData.ok) {
      console.error('CryptoBot API error:', cbData);
      return res.status(400).json({ 
        error: cbData.error?.message || 'Ошибка CryptoBot. Проверьте сумму и валюту.' 
      });
    }
    
    const invoice = cbData.result;
    
    // Конвертация в TON
    const conversionRates = { 'TON': 1, 'USDT': 0.15, 'BTC': 11000, 'ETH': 550 };
    const rate = conversionRates[asset] || 1;
    const tonAmount = Math.floor(amount * rate * 100) / 100;
    
    const result = queries.createDeposit.run(
      user.id, 'cryptobot', tonAmount, asset, 'pending',
      String(invoice.invoice_id),
      JSON.stringify({ 
        currency: asset, 
        cryptobot_invoice_id: invoice.invoice_id, 
        payload: payload,
        original_amount: amount,
        rate: rate,
      })
    );
    
    res.json({
      success: true,
      message: `Инвойс на ${amount} ${asset} создан!`,
      depositId: result.lastInsertRowid,
      invoiceId: invoice.invoice_id,
      payUrl: invoice.bot_invoice_url,
      miniAppUrl: invoice.mini_app_invoice_url,
      webAppUrl: invoice.web_app_invoice_url,
    });
  } catch (err) {
    console.error('CryptoBot deposit error:', err);
    res.status(500).json({ error: 'Ошибка CryptoBot' });
  }
});

// ===== CryptoBot Webhook — автоматическое зачисление =====
router.post('/cryptobot/webhook', (req, res) => {
  try {
    const body = req.body;
    
    // Верификация подписи
    if (config.CRYPTOBOT_TOKEN && req.headers['crypto-pay-api-signature']) {
      const secret = crypto.createHash('sha256').update(config.CRYPTOBOT_TOKEN).digest();
      const checkString = JSON.stringify(body);
      const signature = req.headers['crypto-pay-api-signature'];
      const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
      if (hmac !== signature) {
        console.error('CryptoBot webhook: invalid signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }
    
    if (body.update_type === 'invoice_paid' && body.payload) {
      const invoice = body.payload;
      const invoiceId = String(invoice.invoice_id);
      
      const deposit = queries.getDepositByExternalId.get(invoiceId);
      
      if (deposit && deposit.status === 'pending') {
        queries.updateDepositStatus.run('completed', deposit.id);
        const user = queries.getUserById.get(deposit.user_id);
        if (user) {
          queries.updateBalance.run(deposit.amount, user.telegram_id);
          queries.addDeposited.run(deposit.amount, user.telegram_id);
          console.log(`[WEBHOOK] +${deposit.amount} TON → user ${user.telegram_id}`);
        }
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('CryptoBot webhook error:', err);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ===== Проверка статуса инвойса (polling) =====
router.post('/cryptobot/check', async (req, res) => {
  try {
    const { telegramId, invoiceId } = req.body;
    
    if (!telegramId || !invoiceId) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    // Проверяем через CryptoBot API
    const response = await fetch(`${config.CRYPTOBOT_API_URL}/getInvoices`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': config.CRYPTOBOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ invoice_ids: String(invoiceId) })
    });
    
    const cbData = await response.json();
    
    if (!cbData.ok || !cbData.result?.items?.length) {
      return res.json({ success: false, status: 'not_found' });
    }
    
    const invoice = cbData.result.items[0];
    
    if (invoice.status === 'paid') {
      const deposit = queries.getDepositByExternalId.get(String(invoiceId));
      
      if (deposit && deposit.status === 'pending') {
        queries.updateDepositStatus.run('completed', deposit.id);
        queries.updateBalance.run(deposit.amount, String(telegramId));
        queries.addDeposited.run(deposit.amount, String(telegramId));
        
        const updatedUser = queries.getUser.get(String(telegramId));
        return res.json({ 
          success: true, status: 'paid',
          amount: deposit.amount,
          balance: updatedUser.balance,
          message: `Оплата подтверждена! +${deposit.amount} TON`
        });
      } else if (deposit && deposit.status === 'completed') {
        const updatedUser = queries.getUser.get(String(telegramId));
        return res.json({ 
          success: true, status: 'already_paid',
          balance: updatedUser.balance,
        });
      }
    }
    
    res.json({ success: true, status: invoice.status });
  } catch (err) {
    console.error('CryptoBot check error:', err);
    res.status(500).json({ error: 'Ошибка проверки' });
  }
});

// ======================================================
//  ВЫВОД: Только Telegram подарки
// ======================================================

// Доступные подарки пользователя
router.get('/available-gifts/:telegramId', (req, res) => {
  try {
    const user = queries.getUser.get(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const gifts = queries.getUserGifts.all(user.id);
    
    res.json({
      success: true,
      gifts,
      balance: user.balance,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Каталог подарков для покупки за баланс
router.get('/gift-catalog', (req, res) => {
  try {
    res.json({ success: true, catalog: config.GIFT_CATALOG });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вывод выигранного подарка
router.post('/withdraw-gift', (req, res) => {
  try {
    const { telegramId, giftId } = req.body;
    
    if (!telegramId || !giftId) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const gifts = queries.getUserGifts.all(user.id);
    const gift = gifts.find(g => g.id === giftId && g.status === 'available');
    
    if (!gift) {
      return res.status(400).json({ error: 'Подарок не найден или уже выведен' });
    }
    
    queries.updateGiftStatus.run('pending_withdrawal', giftId);
    
    const result = queries.createWithdrawal.run(
      user.id, giftId, gift.name, gift.value
    );
    
    // Эмитим событие для бота
    const { giftWithdrawalEmitter } = require('../events');
    giftWithdrawalEmitter.emit('withdraw', {
      withdrawalId: result.lastInsertRowid,
      telegramId: String(telegramId),
      userId: user.id,
      giftId: giftId,
      giftName: gift.name,
      giftValue: gift.value,
      giftTier: gift.tier,
    });
    
    res.json({
      success: true,
      message: `Подарок "${gift.name}" отправлен на вывод!`,
      withdrawalId: result.lastInsertRowid,
    });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Ошибка вывода' });
  }
});

// Купить подарок за баланс
router.post('/buy-gift', (req, res) => {
  try {
    const { telegramId, catalogId } = req.body;
    
    if (!telegramId || catalogId === undefined) {
      return res.status(400).json({ error: 'Данные неполные' });
    }
    
    const user = queries.getUser.get(String(telegramId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const catalogItem = config.GIFT_CATALOG.find(g => g.id === catalogId);
    if (!catalogItem) {
      return res.status(400).json({ error: 'Подарок не найден в каталоге' });
    }
    
    if (user.balance < catalogItem.price) {
      return res.status(400).json({ 
        error: `Недостаточно средств! Нужно ${catalogItem.price} TON, у вас ${user.balance.toFixed(2)} TON` 
      });
    }
    
    // Списываем баланс
    queries.updateBalance.run(-catalogItem.price, String(telegramId));
    
    // Создаём подарок
    const giftResult = queries.createGift.run(
      user.id, 0, catalogItem.name, catalogItem.tier, catalogItem.price, 0, catalogItem.price
    );
    
    queries.updateGiftStatus.run('pending_withdrawal', giftResult.lastInsertRowid);
    
    const withdrawResult = queries.createWithdrawal.run(
      user.id, giftResult.lastInsertRowid, catalogItem.name, catalogItem.price
    );
    
    // Эмитим событие для бота
    const { giftWithdrawalEmitter } = require('../events');
    giftWithdrawalEmitter.emit('withdraw', {
      withdrawalId: withdrawResult.lastInsertRowid,
      telegramId: String(telegramId),
      userId: user.id,
      giftId: giftResult.lastInsertRowid,
      giftName: catalogItem.name,
      giftValue: catalogItem.price,
      giftTier: catalogItem.tier,
    });
    
    const updatedUser = queries.getUser.get(String(telegramId));
    
    res.json({
      success: true,
      message: `Подарок "${catalogItem.name}" куплен и отправлен в Telegram!`,
      balance: updatedUser.balance,
    });
  } catch (err) {
    console.error('Buy gift error:', err);
    res.status(500).json({ error: 'Ошибка покупки подарка' });
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
