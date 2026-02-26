// ============================================================
//  CRASH ROCKET GAME - Client Application
//  Telegram Mini App Compatible
// ============================================================

(function () {
  'use strict';

  // ===== State =====
  const state = {
    telegramId: null,
    username: '',
    firstName: '',
    balance: 0,
    gameStatus: 'waiting', // waiting, betting, running, crashed
    multiplier: 1.00,
    currentBet: null,
    hasBet: false,
    roundId: null,
    history: [],
    canvasCtx: null,
    animFrame: null,
    rocketY: 0,
    rocketX: 0,
    particles: [],
    stars: [],
    trail: [],
    crashed: false,
    explosionParticles: [],
  };

  // ===== Initialize Telegram WebApp =====
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0a1a');
    tg.setBackgroundColor('#0a0a1a');
    if (tg.initDataUnsafe?.user) {
      state.telegramId = String(tg.initDataUnsafe.user.id);
      state.username = tg.initDataUnsafe.user.username || '';
      state.firstName = tg.initDataUnsafe.user.first_name || '';
    }
  }

  // Фоллбэк для тестирования без Telegram
  if (!state.telegramId) {
    state.telegramId = 'test_' + Math.floor(Math.random() * 100000);
    state.username = 'TestPlayer';
    state.firstName = 'Test';
  }

  // ===== Socket.IO =====
  const socket = io();

  // ===== DOM Elements =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    balanceAmount: $('#balanceAmount'),
    historyBar: $('#historyBar'),
    gameCanvas: $('#gameCanvas'),
    multiplierValue: $('#multiplierValue'),
    gameStatus: $('#gameStatus'),
    countdown: $('#countdown'),
    countdownValue: $('#countdownValue'),
    giftPreview: $('#giftPreview'),
    giftEmoji: $('#giftEmoji'),
    giftName: $('#giftName'),
    betAmount: $('#betAmount'),
    autoCashout: $('#autoCashout'),
    btnBet: $('#btnBet'),
    btnCashout: $('#btnCashout'),
    cashoutAmount: $('#cashoutAmount'),
    playersList: $('#playersList'),
    playersCount: $('#playersCount'),
    depositModal: $('#depositModal'),
    depositFormModal: $('#depositFormModal'),
    depositFormTitle: $('#depositFormTitle'),
    depositFormBody: $('#depositFormBody'),
    withdrawModal: $('#withdrawModal'),
    giftsList: $('#giftsList'),
    withdrawHistory: $('#withdrawHistory'),
    profileModal: $('#profileModal'),
    toastContainer: $('#toastContainer'),
    winPopup: $('#winPopup'),
    winAmount: $('#winAmount'),
    winGift: $('#winGift'),
    winGiftName: $('#winGiftName'),
    winMultiplier: $('#winMultiplier'),
    gameOverlay: $('#gameOverlay'),
  };

  // ===== Canvas Setup =====
  function setupCanvas() {
    const canvas = els.gameCanvas;
    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
    state.canvasCtx = canvas.getContext('2d');
    state.canvasCtx.scale(dpr, dpr);
    state.canvasW = container.clientWidth;
    state.canvasH = container.clientHeight;

    // Init stars
    state.stars = [];
    for (let i = 0; i < 60; i++) {
      state.stars.push({
        x: Math.random() * state.canvasW,
        y: Math.random() * state.canvasH,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.5 + 0.2,
        alpha: Math.random() * 0.5 + 0.3,
      });
    }

    state.rocketX = state.canvasW * 0.15;
    state.rocketY = state.canvasH * 0.85;
  }

  // ===== Canvas Rendering =====
  function renderGame() {
    const ctx = state.canvasCtx;
    if (!ctx) return;

    const w = state.canvasW;
    const h = state.canvasH;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#050520');
    bgGrad.addColorStop(1, '#0a0a2e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Stars
    state.stars.forEach(star => {
      star.y += star.speed;
      if (star.y > h) { star.y = 0; star.x = Math.random() * w; }
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      ctx.fill();
    });

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const y = h - (h / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (state.gameStatus === 'running' && !state.crashed) {
      // Calculate rocket position based on multiplier
      const progress = Math.min((state.multiplier - 1) / 49, 1);
      const targetY = h * 0.85 - progress * h * 0.75;
      const targetX = w * 0.15 + progress * w * 0.6;

      state.rocketY += (targetY - state.rocketY) * 0.08;
      state.rocketX += (targetX - state.rocketX) * 0.08;

      // Trail
      state.trail.push({ x: state.rocketX, y: state.rocketY, alpha: 1 });
      if (state.trail.length > 80) state.trail.shift();

      // Draw trail
      if (state.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(state.trail[0].x, state.trail[0].y);
        for (let i = 1; i < state.trail.length; i++) {
          state.trail[i].alpha *= 0.98;
          ctx.lineTo(state.trail[i].x, state.trail[i].y);
        }
        const trailGrad = ctx.createLinearGradient(
          state.trail[0].x, state.trail[0].y,
          state.rocketX, state.rocketY
        );
        const color = state.multiplier >= 3 ? '0, 230, 118' : '255, 107, 53';
        trailGrad.addColorStop(0, `rgba(${color}, 0)`);
        trailGrad.addColorStop(1, `rgba(${color}, 0.6)`);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Glow trail
        ctx.strokeStyle = `rgba(${color}, 0.15)`;
        ctx.lineWidth = 12;
        ctx.stroke();
      }

      // Rocket flame particles
      for (let i = 0; i < 3; i++) {
        state.particles.push({
          x: state.rocketX + (Math.random() - 0.5) * 6,
          y: state.rocketY + 10 + Math.random() * 5,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 3 + 1,
          size: Math.random() * 4 + 2,
          alpha: 1,
          color: Math.random() > 0.5 ? '#FF6B35' : '#FFD600',
        });
      }

      // Update & draw particles
      state.particles = state.particles.filter(p => p.alpha > 0.01);
      state.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha *= 0.92;
        p.size *= 0.96;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(')', `, ${p.alpha})`).replace('rgb', 'rgba');
        if (p.color.startsWith('#')) {
          const r = parseInt(p.color.slice(1, 3), 16);
          const g = parseInt(p.color.slice(3, 5), 16);
          const b = parseInt(p.color.slice(5, 7), 16);
          ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`;
        }
        ctx.fill();
      });

      // Draw rocket emoji
      ctx.font = '32px serif';
      ctx.textAlign = 'center';
      ctx.save();
      // Rotate rocket based on trajectory
      const angle = state.trail.length > 1 ?
        Math.atan2(
          state.rocketY - state.trail[state.trail.length - 2].y,
          state.rocketX - state.trail[state.trail.length - 2].x
        ) : -Math.PI / 4;
      ctx.translate(state.rocketX, state.rocketY);
      ctx.rotate(angle + Math.PI / 4);
      ctx.fillText('🚀', 0, 0);
      ctx.restore();

    } else if (state.crashed) {
      // Explosion
      state.explosionParticles = state.explosionParticles.filter(p => p.alpha > 0.01);
      state.explosionParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // gravity
        p.alpha *= 0.96;
        p.size *= 0.97;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        const r = parseInt(p.color.slice(1, 3), 16);
        const g = parseInt(p.color.slice(3, 5), 16);
        const b = parseInt(p.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`;
        ctx.fill();
      });

      // Draw trail fading
      if (state.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(state.trail[0].x, state.trail[0].y);
        for (let i = 1; i < state.trail.length; i++) {
          state.trail[i].alpha *= 0.95;
          ctx.lineTo(state.trail[i].x, state.trail[i].y);
        }
        ctx.strokeStyle = 'rgba(255, 23, 68, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      // Waiting state — rocket on launchpad
      state.rocketX = w * 0.15;
      state.rocketY = h * 0.85;
      ctx.font = '36px serif';
      ctx.textAlign = 'center';
      // Bobbing animation
      const bob = Math.sin(Date.now() / 500) * 3;
      ctx.fillText('🚀', state.rocketX, state.rocketY + bob);

      // Launchpad
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(state.rocketX - 20, state.rocketY + 12, 40, 4);
    }

    state.animFrame = requestAnimationFrame(renderGame);
  }

  // ===== Explosion Effect =====
  function createExplosion(x, y) {
    const colors = ['#FF1744', '#FF6B35', '#FFD600', '#FF9100', '#FF5252'];
    for (let i = 0; i < 50; i++) {
      const angle = (Math.PI * 2 / 50) * i + Math.random() * 0.5;
      const speed = Math.random() * 6 + 2;
      state.explosionParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 6 + 2,
        alpha: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // ===== Socket Events =====

  socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('auth', {
      telegramId: state.telegramId,
      username: state.username,
      firstName: state.firstName,
    });
  });

  socket.on('auth:success', (data) => {
    state.balance = data.balance;
    updateBalance();
  });

  socket.on('game:state', (data) => {
    state.roundId = data.roundId;
    state.history = data.history || [];
    renderHistory();
    updatePlayersList(data.bets || []);

    if (data.status === 'running') {
      state.gameStatus = 'running';
      state.multiplier = data.multiplier || 1;
      state.crashed = false;
      updateMultiplierDisplay();
      setBetButtonState('running');
    } else if (data.status === 'waiting') {
      state.gameStatus = 'waiting';
      state.crashed = false;
      els.gameStatus.textContent = 'Ожидание ставок...';
      els.gameStatus.className = 'game-status waiting';
      setBetButtonState('waiting');
    }
  });

  socket.on('game:newRound', (data) => {
    state.roundId = data.roundId;
    state.gameStatus = 'waiting';
    state.hasBet = false;
    state.currentBet = null;
    state.multiplier = 1.00;
    state.crashed = false;
    state.trail = [];
    state.particles = [];
    state.explosionParticles = [];

    if (data.history) {
      state.history = data.history;
      renderHistory();
    }

    els.multiplierValue.textContent = '1.00';
    els.multiplierValue.className = 'multiplier-value';
    els.gameStatus.textContent = 'Делайте ставки!';
    els.gameStatus.className = 'game-status waiting';
    els.giftPreview.style.display = 'none';

    setBetButtonState('waiting');

    // Countdown
    let cd = data.countdown;
    els.countdown.style.display = 'block';
    els.countdownValue.textContent = cd;
    const cdInterval = setInterval(() => {
      cd--;
      if (cd <= 0) {
        clearInterval(cdInterval);
        els.countdown.style.display = 'none';
      } else {
        els.countdownValue.textContent = cd;
      }
    }, 1000);
  });

  socket.on('game:start', (data) => {
    state.gameStatus = 'running';
    state.crashed = false;
    state.trail = [];
    state.particles = [];
    els.countdown.style.display = 'none';
    els.gameStatus.textContent = '';
    els.gameStatus.className = 'game-status';

    if (state.hasBet) {
      setBetButtonState('active_bet');
    } else {
      setBetButtonState('running');
    }
  });

  socket.on('game:tick', (data) => {
    state.multiplier = data.multiplier;
    updateMultiplierDisplay();

    if (state.hasBet && state.currentBet) {
      const potentialWin = Math.floor(state.currentBet * state.multiplier * 100) / 100;
      els.cashoutAmount.textContent = potentialWin.toFixed(2);
    }
  });

  socket.on('game:crash', (data) => {
    state.gameStatus = 'crashed';
    state.crashed = true;
    state.multiplier = data.crashPoint;

    // Explosion
    createExplosion(state.rocketX, state.rocketY);

    els.multiplierValue.textContent = data.crashPoint.toFixed(2);
    els.multiplierValue.className = 'multiplier-value red';
    els.gameStatus.textContent = 'ВЗРЫВ!';
    els.gameStatus.className = 'game-status crashed';
    els.giftPreview.style.display = 'none';

    if (state.hasBet) {
      showToast('💥 Ракетка взорвалась! Вы проиграли.', 'error');
    }

    state.hasBet = false;
    state.currentBet = null;
    setBetButtonState('crashed');

    // Vibration
    if (navigator.vibrate) navigator.vibrate(200);
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
  });

  socket.on('game:bet', (data) => {
    addPlayerToList(data.username, data.amount, 'active');
  });

  socket.on('game:betResult', (data) => {
    if (data.success) {
      state.hasBet = true;
      state.currentBet = parseFloat(els.betAmount.value);
      state.balance = data.balance;
      updateBalance();
      showToast(`✅ Ставка ${state.currentBet} TON принята!`, 'success');

      if (state.gameStatus === 'running') {
        setBetButtonState('active_bet');
      }
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    } else {
      showToast(`❌ ${data.error}`, 'error');
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }
  });

  socket.on('game:cashout', (data) => {
    // Update player list
    updatePlayerResult(data.username, data.multiplier, data.profit);
  });

  socket.on('game:cashoutResult', (data) => {
    if (data.success) {
      state.hasBet = false;
      state.balance = data.balance;
      updateBalance();

      // Show win popup
      showWinPopup(data.totalWin, data.cashoutAt, data.gift);

      showToast(`🎉 Выигрыш: ${data.totalWin.toFixed(2)} TON (${data.cashoutAt}x)`, 'success');

      setBetButtonState('running');
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }
  });

  socket.on('game:giftPreview', (data) => {
    els.giftPreview.style.display = 'block';
    els.giftEmoji.textContent = data.gift.split(' ')[0] || '🎁';
    els.giftName.textContent = data.gift;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
  });

  // ===== UI Functions =====

  function updateBalance() {
    els.balanceAmount.textContent = state.balance.toFixed(2);
  }

  function updateMultiplierDisplay() {
    const m = state.multiplier;
    els.multiplierValue.textContent = m.toFixed(2);

    if (m >= 10) {
      els.multiplierValue.className = 'multiplier-value green';
    } else if (m >= 3) {
      els.multiplierValue.className = 'multiplier-value orange';
    } else {
      els.multiplierValue.className = 'multiplier-value';
    }
  }

  function setBetButtonState(mode) {
    switch (mode) {
      case 'waiting':
        els.btnBet.style.display = 'block';
        els.btnCashout.style.display = 'none';
        els.btnBet.disabled = false;
        els.btnBet.textContent = 'СТАВКА';
        break;
      case 'running':
        els.btnBet.style.display = 'block';
        els.btnCashout.style.display = 'none';
        els.btnBet.disabled = true;
        els.btnBet.textContent = 'ЖДИТЕ...';
        break;
      case 'active_bet':
        els.btnBet.style.display = 'none';
        els.btnCashout.style.display = 'block';
        break;
      case 'crashed':
        els.btnBet.style.display = 'block';
        els.btnCashout.style.display = 'none';
        els.btnBet.disabled = true;
        els.btnBet.textContent = 'ЖДИТЕ...';
        break;
    }
  }

  function renderHistory() {
    els.historyBar.innerHTML = '';
    const last = state.history.slice(-20).reverse();
    last.forEach(h => {
      const chip = document.createElement('div');
      chip.className = 'history-chip ';
      if (h.crashPoint >= 10) chip.className += 'purple';
      else if (h.crashPoint >= 3) chip.className += 'green';
      else if (h.crashPoint >= 2) chip.className += 'orange';
      else chip.className += 'red';
      chip.textContent = h.crashPoint.toFixed(2) + 'x';
      els.historyBar.appendChild(chip);
    });
  }

  function addPlayerToList(username, amount, status) {
    // Remove existing entry for same user
    const existing = els.playersList.querySelector(`[data-user="${username}"]`);
    if (existing) existing.remove();

    const row = document.createElement('div');
    row.className = 'player-row';
    row.dataset.user = username;
    row.innerHTML = `
      <span class="player-name">${escapeHtml(username)}</span>
      <span class="player-bet">${amount.toFixed(2)} TON</span>
      <span class="player-result active">—</span>
    `;
    els.playersList.prepend(row);
    updatePlayersCount();
  }

  function updatePlayerResult(username, multiplier, profit) {
    const row = els.playersList.querySelector(`[data-user="${username}"]`);
    if (row) {
      const resultEl = row.querySelector('.player-result');
      resultEl.className = 'player-result win';
      resultEl.textContent = `${multiplier.toFixed(2)}x (+${profit.toFixed(2)})`;
    }
  }

  function updatePlayersList(bets) {
    els.playersList.innerHTML = '';
    bets.forEach(b => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.dataset.user = b.username;
      const statusClass = b.status === 'cashed_out' ? 'win' : (b.status === 'lost' ? 'lose' : 'active');
      const statusText = b.status === 'cashed_out' ? `${b.cashoutAt?.toFixed(2)}x` : (b.status === 'lost' ? 'Проиграл' : '—');
      row.innerHTML = `
        <span class="player-name">${escapeHtml(b.username)}</span>
        <span class="player-bet">${b.amount.toFixed(2)} TON</span>
        <span class="player-result ${statusClass}">${statusText}</span>
      `;
      els.playersList.appendChild(row);
    });
    updatePlayersCount();
  }

  function updatePlayersCount() {
    els.playersCount.textContent = els.playersList.children.length;
  }

  // ===== Toast =====
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ===== Win Popup =====
  function showWinPopup(amount, multiplier, gift) {
    els.winAmount.textContent = `+${amount.toFixed(2)} TON`;
    els.winMultiplier.textContent = `${multiplier.toFixed(2)}x`;

    if (gift) {
      els.winGift.style.display = 'block';
      els.winGiftName.textContent = gift.name;
    } else {
      els.winGift.style.display = 'none';
    }

    els.winPopup.style.display = 'flex';
  }

  // ===== Modals =====
  function openModal(id) {
    document.getElementById(id).style.display = 'flex';
  }

  function closeModal(id) {
    document.getElementById(id).style.display = 'none';
  }

  // Close modal on backdrop click
  document.addEventListener('click', (e) => {
    if (e.target.dataset.close) {
      closeModal(e.target.dataset.close);
    }
  });

  // ===== Deposit Forms =====
  function openDepositForm(type) {
    let title = '';
    let html = '';

    switch (type) {
      case 'telegram_gift':
        title = '🎁 Telegram Подарки';
        html = `
          <div class="deposit-form">
            <div class="form-hint">
              Отправьте NFT подарок нашему боту в Telegram, и сумма будет зачислена на ваш баланс автоматически.
            </div>
            <div class="form-group">
              <label>Название подарка</label>
              <input type="text" class="form-input" id="dfGiftName" placeholder="Например: Birthday Cake">
            </div>
            <div class="form-group">
              <label>Оценочная стоимость (TON)</label>
              <input type="number" class="form-input" id="dfGiftValue" placeholder="5.0" min="0.1" step="0.1">
            </div>
            <div class="form-hint">
              💡 Отправьте подарок боту @YourBot в Telegram, затем нажмите кнопку ниже.
            </div>
            <button class="btn-submit" onclick="App.submitDeposit('telegram_gift')">ПОДТВЕРДИТЬ ПОДАРОК</button>
          </div>
        `;
        break;

      case 'crypto_wallet':
        title = '👛 Крипто Кошелёк';
        html = `
          <div class="deposit-form">
            <div class="form-group">
              <label>Валюта</label>
              <select class="form-select" id="dfCurrency">
                <option value="TON">TON</option>
                <option value="USDT">USDT</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="SOL">SOL</option>
              </select>
            </div>
            <div class="form-group">
              <label>Сумма</label>
              <input type="number" class="form-input" id="dfAmount" placeholder="10" min="0.001" step="0.001">
            </div>
            <div class="form-group">
              <label>Адрес вашего кошелька</label>
              <input type="text" class="form-input" id="dfWallet" placeholder="UQ...">
            </div>
            <div class="form-group">
              <label>TX Hash (необязательно)</label>
              <input type="text" class="form-input" id="dfTxHash" placeholder="Хэш транзакции">
            </div>
            <div class="form-hint">
              Отправьте средства на адрес казино, укажите детали и нажмите кнопку.
              Баланс будет пополнен после подтверждения.
            </div>
            <button class="btn-submit" onclick="App.submitDeposit('crypto_wallet')">ПОПОЛНИТЬ</button>
          </div>
        `;
        break;

      case 'cryptobot':
        title = '🤖 CryptoBot';
        html = `
          <div class="deposit-form">
            <div class="form-group">
              <label>Валюта</label>
              <select class="form-select" id="dfCbCurrency">
                <option value="TON">TON</option>
                <option value="USDT">USDT</option>
                <option value="BTC">BTC</option>
              </select>
            </div>
            <div class="form-group">
              <label>Сумма</label>
              <input type="number" class="form-input" id="dfCbAmount" placeholder="10" min="0.1" step="0.1">
            </div>
            <div class="form-hint">
              Будет создан инвойс в @CryptoBot. Оплатите его и баланс пополнится автоматически.
            </div>
            <button class="btn-submit" onclick="App.submitDeposit('cryptobot')">СОЗДАТЬ ИНВОЙС</button>
          </div>
        `;
        break;

      case 'telegram_stars':
        title = '⭐ Telegram Stars';
        html = `
          <div class="deposit-form">
            <div class="form-group">
              <label>Количество Stars</label>
              <input type="number" class="form-input" id="dfStars" placeholder="100" min="1" step="1">
            </div>
            <div class="form-hint">
              1 Star = 0.01 TON. Оплата происходит через Telegram Stars API.
            </div>
            <div class="bet-quick-amounts" style="margin: 10px 0">
              <button class="quick-bet" onclick="document.getElementById('dfStars').value=100">100⭐</button>
              <button class="quick-bet" onclick="document.getElementById('dfStars').value=500">500⭐</button>
              <button class="quick-bet" onclick="document.getElementById('dfStars').value=1000">1000⭐</button>
              <button class="quick-bet" onclick="document.getElementById('dfStars').value=5000">5000⭐</button>
            </div>
            <button class="btn-submit" onclick="App.submitDeposit('telegram_stars')">ОПЛАТИТЬ STARS</button>
          </div>
        `;
        break;
    }

    els.depositFormTitle.textContent = title;
    els.depositFormBody.innerHTML = html;
    closeModal('depositModal');
    openModal('depositFormModal');
  }

  // ===== Submit Deposit =====
  async function submitDeposit(type) {
    let body = {};
    let url = '';

    switch (type) {
      case 'telegram_gift': {
        const name = document.getElementById('dfGiftName')?.value;
        const value = parseFloat(document.getElementById('dfGiftValue')?.value);
        if (!name || !value || value <= 0) {
          showToast('Заполните все поля!', 'error');
          return;
        }
        url = '/api/deposit/telegram-gift';
        body = { telegramId: state.telegramId, giftName: name, giftValue: value };
        break;
      }
      case 'crypto_wallet': {
        const currency = document.getElementById('dfCurrency')?.value;
        const amount = parseFloat(document.getElementById('dfAmount')?.value);
        const wallet = document.getElementById('dfWallet')?.value;
        const txHash = document.getElementById('dfTxHash')?.value;
        if (!amount || amount <= 0) {
          showToast('Введите сумму!', 'error');
          return;
        }
        url = '/api/deposit/crypto-wallet';
        body = { telegramId: state.telegramId, amount, currency, walletAddress: wallet, txHash };
        break;
      }
      case 'cryptobot': {
        const currency = document.getElementById('dfCbCurrency')?.value;
        const amount = parseFloat(document.getElementById('dfCbAmount')?.value);
        if (!amount || amount <= 0) {
          showToast('Введите сумму!', 'error');
          return;
        }
        url = '/api/deposit/cryptobot';
        body = { telegramId: state.telegramId, amount, currency };
        break;
      }
      case 'telegram_stars': {
        const stars = parseInt(document.getElementById('dfStars')?.value);
        if (!stars || stars <= 0) {
          showToast('Введите количество Stars!', 'error');
          return;
        }
        // In Telegram, use Stars payment
        if (tg?.openInvoice) {
          // Production: trigger Telegram Stars payment
        }
        url = '/api/deposit/telegram-stars';
        body = { telegramId: state.telegramId, starsAmount: stars };
        break;
      }
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (data.success) {
        state.balance = data.balance;
        updateBalance();
        showToast(`✅ ${data.message}`, 'success');
        closeModal('depositFormModal');

        if (data.payUrl) {
          // Open CryptoBot pay URL
          if (tg?.openLink) {
            tg.openLink(data.payUrl);
          } else {
            window.open(data.payUrl, '_blank');
          }
        }
      } else {
        showToast(`❌ ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('❌ Ошибка сети', 'error');
    }
  }

  // ===== Withdraw =====
  async function loadGifts() {
    try {
      const resp = await fetch(`/api/deposit/available-gifts/${state.telegramId}`);
      const data = await resp.json();

      if (data.success && data.gifts.length > 0) {
        els.giftsList.innerHTML = data.gifts.map(g => `
          <div class="gift-card">
            <div class="gift-card-icon">${g.name.split(' ')[0] || '🎁'}</div>
            <div class="gift-card-info">
              <div class="gift-card-name">${escapeHtml(g.name)}</div>
              <div class="gift-card-meta">Множитель: ${g.multiplier.toFixed(2)}x | Ставка: ${g.bet_amount.toFixed(2)} TON</div>
            </div>
            <button class="btn-withdraw-gift" onclick="App.withdrawGift(${g.id})">Вывести</button>
          </div>
        `).join('');
      } else {
        els.giftsList.innerHTML = '<div class="empty-state">У вас пока нет подарков. Играйте и выигрывайте! 🚀</div>';
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadWithdrawHistory() {
    try {
      const resp = await fetch(`/api/deposit/withdrawals/${state.telegramId}`);
      const data = await resp.json();

      if (data.success && data.withdrawals.length > 0) {
        els.withdrawHistory.innerHTML = data.withdrawals.map(w => `
          <div class="history-item">
            <span class="info">${escapeHtml(w.gift_name)} | ${w.created_at}</span>
            <span class="result ${w.status === 'sent' ? 'win' : ''}">${w.status === 'sent' ? '✅ Отправлен' : '⏳ ' + w.status}</span>
          </div>
        `).join('');
      } else {
        els.withdrawHistory.innerHTML = '<div class="empty-state">Пусто</div>';
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function withdrawGift(giftId) {
    try {
      const resp = await fetch('/api/deposit/withdraw-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: state.telegramId, giftId }),
      });
      const data = await resp.json();

      if (data.success) {
        showToast(`🎁 ${data.message}`, 'success');
        loadGifts();
        loadWithdrawHistory();
      } else {
        showToast(`❌ ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('❌ Ошибка сети', 'error');
    }
  }

  // ===== Profile =====
  async function loadProfile() {
    try {
      const resp = await fetch(`/api/profile/${state.telegramId}`);
      const data = await resp.json();

      if (data.success) {
        const u = data.user;
        $('#profileName').textContent = u.firstName || u.username || 'Игрок';
        $('#profileId').textContent = `ID: ${u.telegramId}`;
        $('#statBalance').textContent = u.balance.toFixed(2);
        $('#statDeposited').textContent = u.totalDeposited.toFixed(2);
        $('#statWagered').textContent = u.totalWagered.toFixed(2);
        $('#statWon').textContent = u.totalWon.toFixed(2);

        if (u.cryptoWallet) {
          $('#walletConnected').style.display = 'block';
          $('#walletAddress').textContent = u.cryptoWallet.substring(0, 12) + '...' + u.cryptoWallet.substring(u.cryptoWallet.length - 6);
          $('#walletInput').value = u.cryptoWallet;
        }

        // Bet history
        if (data.betHistory && data.betHistory.length > 0) {
          $('#betHistory').innerHTML = data.betHistory.map(b => `
            <div class="history-item">
              <span class="info">${b.amount.toFixed(2)} TON @ ${b.crash_point?.toFixed(2) || '?'}x</span>
              <span class="result ${b.status === 'cashed_out' ? 'win' : 'lose'}">
                ${b.status === 'cashed_out' ? `+${b.profit.toFixed(2)} (${b.cashout_at.toFixed(2)}x)` : 'Проигрыш'}
              </span>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  // ===== Event Listeners =====

  // Bet button
  els.btnBet.addEventListener('click', () => {
    const amount = parseFloat(els.betAmount.value);
    const autoCashout = parseFloat(els.autoCashout.value) || 0;

    if (!amount || amount <= 0) {
      showToast('Введите сумму ставки!', 'error');
      return;
    }

    socket.emit('game:placeBet', {
      telegramId: state.telegramId,
      amount,
      autoCashout,
    });
  });

  // Cashout button
  els.btnCashout.addEventListener('click', () => {
    socket.emit('game:cashout', {
      telegramId: state.telegramId,
    });
  });

  // Quick bet amounts
  $$('.quick-bet').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.amount) {
        els.betAmount.value = btn.dataset.amount;
      }
    });
  });

  // Bet half / double
  $('#betHalf').addEventListener('click', () => {
    const v = parseFloat(els.betAmount.value) || 1;
    els.betAmount.value = Math.max(0.1, v / 2).toFixed(1);
  });

  $('#betDouble').addEventListener('click', () => {
    const v = parseFloat(els.betAmount.value) || 1;
    els.betAmount.value = Math.min(1000, v * 2).toFixed(1);
  });

  // Open deposit modal
  $('#btnOpenDeposit').addEventListener('click', () => openModal('depositModal'));

  // Deposit method cards
  $('#depositGift').addEventListener('click', () => openDepositForm('telegram_gift'));
  $('#depositWallet').addEventListener('click', () => openDepositForm('crypto_wallet'));
  $('#depositCryptoBot').addEventListener('click', () => openDepositForm('cryptobot'));
  $('#depositStars').addEventListener('click', () => openDepositForm('telegram_stars'));

  // Back from deposit form
  $('#depositFormBack').addEventListener('click', () => {
    closeModal('depositFormModal');
    openModal('depositModal');
  });

  // Bottom nav
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      switch (tab) {
        case 'game':
          closeModal('depositModal');
          closeModal('withdrawModal');
          closeModal('profileModal');
          break;
        case 'deposit':
          openModal('depositModal');
          break;
        case 'withdraw':
          loadGifts();
          loadWithdrawHistory();
          openModal('withdrawModal');
          break;
        case 'profile':
          loadProfile();
          openModal('profileModal');
          break;
      }
    });
  });

  // Connect wallet
  $('#btnConnectWallet').addEventListener('click', async () => {
    const addr = $('#walletInput').value.trim();
    if (!addr) {
      showToast('Введите адрес кошелька!', 'error');
      return;
    }

    try {
      const resp = await fetch('/api/wallet/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: state.telegramId, walletAddress: addr }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast('✅ Кошелёк привязан!', 'success');
        $('#walletConnected').style.display = 'block';
        $('#walletAddress').textContent = addr.substring(0, 12) + '...' + addr.substring(addr.length - 6);
      }
    } catch (err) {
      showToast('❌ Ошибка', 'error');
    }
  });

  // Win popup close
  $('#winClose').addEventListener('click', () => {
    els.winPopup.style.display = 'none';
  });

  // ===== Helpers =====
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== Expose global API for inline onclick handlers =====
  window.App = {
    submitDeposit,
    withdrawGift,
  };

  // ===== Init =====
  window.addEventListener('resize', () => {
    setupCanvas();
  });

  setupCanvas();
  renderGame();

  console.log('🚀 Crash Rocket Game initialized');
  console.log(`Player: ${state.telegramId} (${state.username || state.firstName})`);

})();
