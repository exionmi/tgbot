const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'game.db');
const fs = require('fs');

// Создаём папку data если нет
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===================== ТАБЛИЦЫ =====================

db.exec(`
  -- Пользователи
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    balance REAL DEFAULT 0,
    total_deposited REAL DEFAULT 0,
    total_wagered REAL DEFAULT 0,
    total_won REAL DEFAULT 0,
    crypto_wallet TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Депозиты
  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    method TEXT NOT NULL,          -- 'telegram_gift', 'crypto_wallet', 'cryptobot', 'telegram_stars'
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'TON',
    status TEXT DEFAULT 'pending', -- pending, completed, failed
    external_id TEXT DEFAULT '',
    meta TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Выводы (только NFT гифты)
  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    gift_name TEXT NOT NULL,
    gift_value REAL DEFAULT 0,
    status TEXT DEFAULT 'pending', -- pending, processing, sent, failed
    telegram_tx TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (gift_id) REFERENCES gifts(id)
  );

  -- Выигранные подарки
  CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    round_id INTEGER,
    name TEXT NOT NULL,
    tier TEXT NOT NULL,
    value REAL DEFAULT 0,
    multiplier REAL DEFAULT 0,
    bet_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'available', -- available, withdrawn, pending_withdrawal
    won_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Раунды игры
  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crash_point REAL NOT NULL,
    hash TEXT NOT NULL,
    status TEXT DEFAULT 'waiting', -- waiting, running, crashed
    started_at DATETIME,
    crashed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Ставки
  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    round_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    auto_cashout REAL DEFAULT 0,
    cashout_at REAL DEFAULT 0,
    profit REAL DEFAULT 0,
    status TEXT DEFAULT 'active', -- active, cashed_out, lost
    gift_won TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (round_id) REFERENCES rounds(id)
  );

  -- Индексы
  CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);
  CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
  CREATE INDEX IF NOT EXISTS idx_gifts_user ON gifts(user_id);
  CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
`);

// ===================== Методы =====================

const queries = {
  // --- Users ---
  createUser: db.prepare(`
    INSERT OR IGNORE INTO users (telegram_id, username, first_name)
    VALUES (?, ?, ?)
  `),
  
  getUser: db.prepare(`SELECT * FROM users WHERE telegram_id = ?`),
  getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  
  updateBalance: db.prepare(`
    UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `),
  
  setBalance: db.prepare(`
    UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `),

  updateWallet: db.prepare(`
    UPDATE users SET crypto_wallet = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `),

  addWagered: db.prepare(`
    UPDATE users SET total_wagered = total_wagered + ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `),

  addWon: db.prepare(`
    UPDATE users SET total_won = total_won + ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `),

  addDeposited: db.prepare(`
    UPDATE users SET total_deposited = total_deposited + ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `),

  // --- Deposits ---
  createDeposit: db.prepare(`
    INSERT INTO deposits (user_id, method, amount, currency, status, external_id, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  updateDepositStatus: db.prepare(`
    UPDATE deposits SET status = ? WHERE id = ?
  `),

  getDepositsByUser: db.prepare(`
    SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `),

  // --- Withdrawals ---
  createWithdrawal: db.prepare(`
    INSERT INTO withdrawals (user_id, gift_id, gift_name, gift_value, status)
    VALUES (?, ?, ?, ?, 'pending')
  `),

  updateWithdrawalStatus: db.prepare(`
    UPDATE withdrawals SET status = ?, telegram_tx = ? WHERE id = ?
  `),

  getWithdrawalsByUser: db.prepare(`
    SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `),

  // --- Gifts ---
  createGift: db.prepare(`
    INSERT INTO gifts (user_id, round_id, name, tier, value, multiplier, bet_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getUserGifts: db.prepare(`
    SELECT * FROM gifts WHERE user_id = ? AND status = 'available' ORDER BY won_at DESC
  `),

  updateGiftStatus: db.prepare(`
    UPDATE gifts SET status = ? WHERE id = ?
  `),

  // --- Rounds ---
  createRound: db.prepare(`
    INSERT INTO rounds (crash_point, hash, status) VALUES (?, ?, 'waiting')
  `),

  updateRoundStatus: db.prepare(`
    UPDATE rounds SET status = ?, started_at = CASE WHEN ? = 'running' THEN CURRENT_TIMESTAMP ELSE started_at END,
    crashed_at = CASE WHEN ? = 'crashed' THEN CURRENT_TIMESTAMP ELSE crashed_at END
    WHERE id = ?
  `),

  getLastRounds: db.prepare(`
    SELECT * FROM rounds WHERE status = 'crashed' ORDER BY id DESC LIMIT 20
  `),

  getCurrentRound: db.prepare(`
    SELECT * FROM rounds WHERE status IN ('waiting', 'running') ORDER BY id DESC LIMIT 1
  `),

  // --- Bets ---
  createBet: db.prepare(`
    INSERT INTO bets (user_id, round_id, amount, auto_cashout) VALUES (?, ?, ?, ?)
  `),

  getRoundBets: db.prepare(`
    SELECT b.*, u.username, u.first_name, u.telegram_id
    FROM bets b JOIN users u ON b.user_id = u.id
    WHERE b.round_id = ?
  `),

  getUserActiveBet: db.prepare(`
    SELECT * FROM bets WHERE user_id = ? AND round_id = ? AND status = 'active'
  `),

  cashoutBet: db.prepare(`
    UPDATE bets SET status = 'cashed_out', cashout_at = ?, profit = ?, gift_won = ?
    WHERE id = ?
  `),

  loseBet: db.prepare(`
    UPDATE bets SET status = 'lost' WHERE round_id = ? AND status = 'active'
  `),

  getUserBetHistory: db.prepare(`
    SELECT b.*, r.crash_point FROM bets b
    JOIN rounds r ON b.round_id = r.id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC LIMIT 50
  `),

  // Leaderboard
  getLeaderboard: db.prepare(`
    SELECT telegram_id, username, first_name, total_won
    FROM users ORDER BY total_won DESC LIMIT 20
  `),
};

module.exports = { db, queries };
