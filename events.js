const EventEmitter = require('events');

// Глобальный EventEmitter для коммуникации между модулями
const giftWithdrawalEmitter = new EventEmitter();

module.exports = { giftWithdrawalEmitter };
