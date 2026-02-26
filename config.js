require('dotenv').config();

module.exports = {
  // Telegram Bot
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  WEBAPP_URL: process.env.WEBAPP_URL || 'http://localhost:3000',
  
  // Server
  PORT: process.env.PORT || 3000,
  
  // CryptoBot
  CRYPTOBOT_TOKEN: process.env.CRYPTOBOT_TOKEN || '',
  CRYPTOBOT_API_URL: process.env.CRYPTOBOT_API_URL || 'https://pay.crypt.bot/api',
  
  // Game settings
  GAME: {
    MIN_BET: 0.1,
    MAX_BET: 1000,
    MAX_MULTIPLIER: 50,
    MIN_WIN_MULTIPLIER: 3.0,       // Минимальный коэф для выигрыша подарка
    GIFT_SHOW_DELAY: 4500,          // Задержка показа гифтов для крупных ставок (мс)
    BIG_BET_THRESHOLD: 10,          // Порог крупной ставки (в TON)
    ROUND_INTERVAL: 5000,           // Интервал между раундами (мс)
    TICK_RATE: 50,                  // Частота обновления (мс)
    HOUSE_EDGE: 0.05,               // Комиссия казино 5%
  },

  // NFT Gifts tiers based on multiplier
  GIFT_TIERS: [
    { minMultiplier: 3.0,  maxMultiplier: 5.0,  gifts: ['🎁 Bronze Gift', '⭐ Small Star Pack'], value: 5 },
    { minMultiplier: 5.0,  maxMultiplier: 10.0,  gifts: ['🎄 Silver Gift', '💎 Crystal NFT'], value: 15 },
    { minMultiplier: 10.0, maxMultiplier: 20.0,  gifts: ['🏆 Gold Gift', '🚀 Rocket NFT'], value: 50 },
    { minMultiplier: 20.0, maxMultiplier: 35.0,  gifts: ['👑 Platinum Gift', '🌟 Legendary Star'], value: 150 },
    { minMultiplier: 35.0, maxMultiplier: 50.0,  gifts: ['💰 Diamond Gift', '🔥 Ultimate NFT'], value: 500 },
  ],

  // Supported currencies
  CURRENCIES: ['TON', 'USDT', 'BTC', 'ETH', 'SOL'],
};
