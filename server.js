const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Для Telegram Web App
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting с более строгими правилами
const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 30, // максимум 30 запросов в минуту
  message: { error: 'Слишком много запросов! Подождите немного.' }
});

const normalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 200 // максимум 200 запросов за 15 минут
});

app.use('/api/', normalLimiter);
app.use('/api/tap/', strictLimiter);
app.use('/api/mine/', strictLimiter);

// База данных
const db = new sqlite3.Database('quantum_nexus.db');

// Инициализация базы данных с расширенными таблицами
db.serialize(() => {
  // Таблица пользователей (расширенная)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    coins INTEGER DEFAULT 0,
    quanhash INTEGER DEFAULT 0,
    energy INTEGER DEFAULT 100,
    max_energy INTEGER DEFAULT 100,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    tap_power INTEGER DEFAULT 1,
    offline_income_start DATETIME,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    referrer_id INTEGER,
    referrals_count INTEGER DEFAULT 0,
    total_taps INTEGER DEFAULT 0,
    total_mined INTEGER DEFAULT 0,
    prestige_level INTEGER DEFAULT 0,
    prestige_points INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_prestige DATETIME,
    achievements_unlocked TEXT DEFAULT '[]',
    active_boosts TEXT DEFAULT '[]',
    guild_id INTEGER,
    guild_role TEXT DEFAULT 'member',
    pvp_wins INTEGER DEFAULT 0,
    pvp_losses INTEGER DEFAULT 0,
    daily_bonus_claimed DATETIME,
    streak_days INTEGER DEFAULT 0,
    total_playtime INTEGER DEFAULT 0,
    last_session_start DATETIME,
    cheat_detection_count INTEGER DEFAULT 0,
    is_banned BOOLEAN DEFAULT 0,
    ban_reason TEXT,
    ban_until DATETIME
  )`);

  // Таблица майнинг машин (расширенная)
  db.run(`CREATE TABLE IF NOT EXISTS mining_machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    machine_type TEXT,
    hash_rate INTEGER,
    power_consumption INTEGER,
    efficiency REAL,
    durability INTEGER DEFAULT 100,
    last_maintenance DATETIME,
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    upgrade_level INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Таблица карточек (расширенная)
  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    card_type TEXT,
    rarity TEXT,
    passive_income INTEGER,
    boost_multiplier REAL,
    energy_bonus INTEGER,
    obtained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    fusion_level INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Таблица бустов (расширенная)
  db.run(`CREATE TABLE IF NOT EXISTS boosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    boost_type TEXT,
    multiplier REAL,
    duration INTEGER,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Таблица технологий
  db.run(`CREATE TABLE IF NOT EXISTS technologies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tech_type TEXT,
    level INTEGER DEFAULT 1,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    research_progress INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Таблица достижений
  db.run(`CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    achievement_id TEXT,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    progress INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Таблица событий
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT,
    start_time DATETIME,
    end_time DATETIME,
    multiplier REAL,
    description TEXT,
    is_active BOOLEAN DEFAULT 1
  )`);

  // Таблица гильдий
  db.run(`CREATE TABLE IF NOT EXISTS guilds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    description TEXT,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    quanhash INTEGER DEFAULT 0,
    max_members INTEGER DEFAULT 50,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    leader_id INTEGER,
    FOREIGN KEY (leader_id) REFERENCES users (id)
  )`);

  // Таблица PvP боев
  db.run(`CREATE TABLE IF NOT EXISTS pvp_battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_id INTEGER,
    defender_id INTEGER,
    winner_id INTEGER,
    coins_won INTEGER,
    quanhash_won INTEGER,
    battle_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attacker_id) REFERENCES users (id),
    FOREIGN KEY (defender_id) REFERENCES users (id),
    FOREIGN KEY (winner_id) REFERENCES users (id)
  )`);

  // Таблица турниров
  db.run(`CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT,
    start_time DATETIME,
    end_time DATETIME,
    prize_pool_coins INTEGER,
    prize_pool_quanhash INTEGER,
    participants TEXT DEFAULT '[]',
    is_active BOOLEAN DEFAULT 1
  )`);

  // Таблица квестов
  db.run(`CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    quest_type TEXT,
    quest_data TEXT,
    progress INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
});

// Расширенная конфигурация игры
const GAME_CONFIG = {
  OFFLINE_INCOME_DURATION: 3 * 60 * 60 * 1000, // 3 часа
  BASE_TAP_INCOME: 1,
  BASE_OFFLINE_INCOME: 0.1,
  ENERGY_RECOVERY_RATE: 1, // энергия восстанавливается каждую минуту
  MAX_ENERGY: 100,
  ANTI_CHEAT_MAX_TAPS_PER_SECOND: 8, // Снижено для большей строгости
  ANTI_CHEAT_MAX_TAPS_PER_MINUTE: 200,
  ANTI_CHEAT_SUSPICIOUS_THRESHOLD: 5,
  PRESTIGE_MIN_LEVEL: 100,
  PRESTIGE_MULTIPLIER: 1.1,
  DAILY_BONUS_BASE: 100,
  STREAK_MULTIPLIER: 1.1,
  MAX_STREAK_DAYS: 30,
  PVP_COOLDOWN: 5 * 60 * 1000, // 5 минут между боями
  GUILD_MAX_MEMBERS: 50,
  TOURNAMENT_DURATION: 24 * 60 * 60 * 1000, // 24 часа
  QUEST_RESET_TIME: 24 * 60 * 60 * 1000, // 24 часа
  MINING_COMPLEXITY: {
    BASE_HASH_RATE: 1,
    DIFFICULTY_MULTIPLIER: 1.15,
    POWER_CONSUMPTION_FACTOR: 0.8,
    MAINTENANCE_COST: 0.1
  }
};

// Расширенная система защиты от читов
const cheatDetection = {
  userStats: new Map(),
  suspiciousUsers: new Set(),
  
  recordAction(userId, action, timestamp = Date.now()) {
    if (!this.userStats.has(userId)) {
      this.userStats.set(userId, {
        taps: [],
        mines: [],
        purchases: [],
        lastAction: timestamp,
        suspiciousCount: 0
      });
    }
    
    const stats = this.userStats.get(userId);
    stats[action].push(timestamp);
    stats.lastAction = timestamp;
    
    // Очищаем старые записи (старше 1 минуты)
    const oneMinuteAgo = timestamp - 60000;
    stats.taps = stats.taps.filter(t => t > oneMinuteAgo);
    stats.mines = stats.mines.filter(t => t > oneMinuteAgo);
    stats.purchases = stats.purchases.filter(t => t > oneMinuteAgo);
    
    return this.checkForCheating(userId, stats);
  },
  
  checkForCheating(userId, stats) {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;
    
    // Проверка тапов
    const recentTaps = stats.taps.filter(t => t > oneSecondAgo);
    if (recentTaps.length > GAME_CONFIG.ANTI_CHEAT_MAX_TAPS_PER_SECOND) {
      stats.suspiciousCount++;
      return { isCheating: true, reason: 'too_many_taps_per_second' };
    }
    
    const tapsLastMinute = stats.taps.filter(t => t > oneMinuteAgo);
    if (tapsLastMinute.length > GAME_CONFIG.ANTI_CHEAT_MAX_TAPS_PER_MINUTE) {
      stats.suspiciousCount++;
      return { isCheating: true, reason: 'too_many_taps_per_minute' };
    }
    
    // Проверка майнинга
    const recentMines = stats.mines.filter(t => t > oneSecondAgo);
    if (recentMines.length > 3) {
      stats.suspiciousCount++;
      return { isCheating: true, reason: 'too_many_mines_per_second' };
    }
    
    // Проверка покупок
    const recentPurchases = stats.purchases.filter(t => t > oneMinuteAgo);
    if (recentPurchases.length > 20) {
      stats.suspiciousCount++;
      return { isCheating: true, reason: 'too_many_purchases_per_minute' };
    }
    
    // Проверка подозрительной активности
    if (stats.suspiciousCount >= GAME_CONFIG.ANTI_CHEAT_SUSPICIOUS_THRESHOLD) {
      this.suspiciousUsers.add(userId);
      return { isCheating: true, reason: 'suspicious_activity' };
    }
    
    return { isCheating: false };
  },
  
  isUserSuspicious(userId) {
    return this.suspiciousUsers.has(userId);
  },
  
  resetUserStats(userId) {
    this.userStats.delete(userId);
    this.suspiciousUsers.delete(userId);
  }
};

// Система достижений
const ACHIEVEMENTS = {
  FIRST_TAP: { id: 'first_tap', name: 'Первый тап', description: 'Сделайте первый тап', reward: { coins: 10 }, condition: { taps: 1 } },
  HUNDRED_TAPS: { id: 'hundred_taps', name: 'Сотня тапов', description: 'Сделайте 100 тапов', reward: { coins: 100 }, condition: { taps: 100 } },
  THOUSAND_TAPS: { id: 'thousand_taps', name: 'Тысяча тапов', description: 'Сделайте 1000 тапов', reward: { coins: 1000 }, condition: { taps: 1000 } },
  TEN_THOUSAND_TAPS: { id: 'ten_thousand_taps', name: 'Десять тысяч тапов', description: 'Сделайте 10000 тапов', reward: { coins: 10000, quanhash: 1000 }, condition: { taps: 10000 } },
  FIRST_MINE: { id: 'first_mine', name: 'Первый майнинг', description: 'Добывайте QuanHash', reward: { coins: 50 }, condition: { mined: 1 } },
  FIRST_CARD: { id: 'first_card', name: 'Первая карточка', description: 'Получите первую карточку', reward: { coins: 200 }, condition: { cards: 1 } },
  FIRST_REFERRAL: { id: 'first_referral', name: 'Первый реферал', description: 'Пригласите первого друга', reward: { coins: 500 }, condition: { referrals: 1 } },
  LEVEL_10: { id: 'level_10', name: 'Уровень 10', description: 'Достигните 10 уровня', reward: { coins: 1000 }, condition: { level: 10 } },
  LEVEL_50: { id: 'level_50', name: 'Уровень 50', description: 'Достигните 50 уровня', reward: { coins: 5000 }, condition: { level: 50 } },
  LEVEL_100: { id: 'level_100', name: 'Уровень 100', description: 'Достигните 100 уровня', reward: { coins: 10000, quanhash: 5000 }, condition: { level: 100 } },
  MILLIONAIRE: { id: 'millionaire', name: 'Миллионер', description: 'Накопите 1,000,000 коинов', reward: { coins: 10000 }, condition: { coins: 1000000 } },
  QUANTUM_MASTER: { id: 'quantum_master', name: 'Квантовый мастер', description: 'Накопите 100,000 QuanHash', reward: { coins: 50000, quanhash: 10000 }, condition: { quanhash: 100000 } },
  PRESTIGE_MASTER: { id: 'prestige_master', name: 'Мастер престижа', description: 'Достигните 10 уровня престижа', reward: { coins: 100000, quanhash: 50000 }, condition: { prestige: 10 } },
  GUILD_LEADER: { id: 'guild_leader', name: 'Лидер гильдии', description: 'Создайте гильдию', reward: { coins: 20000 }, condition: { guildCreated: 1 } },
  PVP_CHAMPION: { id: 'pvp_champion', name: 'Чемпион PvP', description: 'Выиграйте 100 PvP боев', reward: { coins: 50000 }, condition: { pvpWins: 100 } },
  QUEST_MASTER: { id: 'quest_master', name: 'Мастер квестов', description: 'Выполните 50 квестов', reward: { coins: 25000 }, condition: { questsCompleted: 50 } },
  STREAK_KING: { id: 'streak_king', name: 'Король серий', description: 'Держите серию 30 дней', reward: { coins: 30000 }, condition: { streakDays: 30 } },
  ENERGY_SAVER: { id: 'energy_saver', name: 'Энергосберегатель', description: 'Накопите 1000 максимальной энергии', reward: { coins: 15000 }, condition: { maxEnergy: 1000 } },
  CARD_COLLECTOR: { id: 'card_collector', name: 'Коллекционер карт', description: 'Соберите 100 карточек', reward: { coins: 20000 }, condition: { cards: 100 } }
};

// Система событий
const EVENTS = {
  DOUBLE_COINS: { id: 'double_coins', name: 'Двойные коины', multiplier: 2, duration: 3600000, color: '#f39c12' },
  DOUBLE_EXP: { id: 'double_exp', name: 'Двойной опыт', multiplier: 2, duration: 3600000, color: '#9b59b6' },
  FREE_ENERGY: { id: 'free_energy', name: 'Бесплатная энергия', multiplier: 0, duration: 1800000, color: '#2ecc71' },
  LUCKY_MINING: { id: 'lucky_mining', name: 'Удачный майнинг', multiplier: 3, duration: 7200000, color: '#e74c3c' },
  QUANTUM_STORM: { id: 'quantum_storm', name: 'Квантовая буря', multiplier: 5, duration: 1800000, color: '#8e44ad' },
  ENERGY_OVERFLOW: { id: 'energy_overflow', name: 'Переполнение энергии', multiplier: 1, duration: 3600000, color: '#3498db' },
  MINING_FRENZY: { id: 'mining_frenzy', name: 'Майнинговая лихорадка', multiplier: 4, duration: 5400000, color: '#e67e22' },
  QUANTUM_BLESSING: { id: 'quantum_blessing', name: 'Квантовое благословение', multiplier: 3, duration: 7200000, color: '#1abc9c' }
};

// Функция для расчета оффлайн дохода с улучшениями
function calculateOfflineIncome(user, cards = [], activeBoosts = []) {
  if (!user.offline_income_start) return 0;
  
  const now = new Date();
  const lastActive = new Date(user.last_active);
  const offlineTime = Math.min(now - lastActive, GAME_CONFIG.OFFLINE_INCOME_DURATION);
  
  if (offlineTime <= 0) return 0;
  
  const hoursOffline = offlineTime / (1000 * 60 * 60);
  let baseIncome = GAME_CONFIG.BASE_OFFLINE_INCOME * hoursOffline * user.tap_power;
  
  // Учитываем карточки
  cards.forEach(card => {
    if (card.is_active) {
      baseIncome += card.passive_income * hoursOffline;
    }
  });
  
  // Учитываем бусты
  let multiplier = 1;
  activeBoosts.forEach(boost => {
    if (boost.is_active && new Date(boost.expires_at) > now) {
      multiplier *= boost.multiplier;
    }
  });
  
  // Учитываем уровень престижа
  multiplier *= Math.pow(GAME_CONFIG.PRESTIGE_MULTIPLIER, user.prestige_level);
  
  return Math.floor(baseIncome * multiplier);
}

// Функция для проверки и выдачи достижений
async function checkAchievements(userId, userData) {
  const achievements = [];
  
  for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
    // Проверяем, не получено ли уже достижение
    const existing = await new Promise((resolve) => {
      db.get('SELECT * FROM achievements WHERE user_id = ? AND achievement_id = ?', [userId, achievement.id], resolve);
    });
    
    if (existing) continue;
    
    let shouldUnlock = false;
    
    switch (achievement.condition) {
      case achievement.condition.taps && userData.total_taps >= achievement.condition.taps:
        shouldUnlock = true;
        break;
      case achievement.condition.mined && userData.total_mined >= achievement.condition.mined:
        shouldUnlock = true;
        break;
      case achievement.condition.cards:
        const cardCount = await new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM cards WHERE user_id = ?', [userId], (err, row) => {
            resolve(row ? row.count : 0);
          });
        });
        if (cardCount >= achievement.condition.cards) shouldUnlock = true;
        break;
      case achievement.condition.level && userData.level >= achievement.condition.level:
        shouldUnlock = true;
        break;
      case achievement.condition.coins && userData.coins >= achievement.condition.coins:
        shouldUnlock = true;
        break;
      case achievement.condition.quanhash && userData.quanhash >= achievement.condition.quanhash:
        shouldUnlock = true;
        break;
      case achievement.condition.prestige && userData.prestige_level >= achievement.condition.prestige:
        shouldUnlock = true;
        break;
      case achievement.condition.referrals && userData.referrals_count >= achievement.condition.referrals:
        shouldUnlock = true;
        break;
      case achievement.condition.pvpWins && userData.pvp_wins >= achievement.condition.pvpWins:
        shouldUnlock = true;
        break;
      case achievement.condition.maxEnergy && userData.max_energy >= achievement.condition.maxEnergy:
        shouldUnlock = true;
        break;
      case achievement.condition.streakDays && userData.streak_days >= achievement.condition.streakDays:
        shouldUnlock = true;
        break;
    }
    
    if (shouldUnlock) {
      // Выдаем достижение
      await new Promise((resolve) => {
        db.run('INSERT INTO achievements (user_id, achievement_id) VALUES (?, ?)', [userId, achievement.id], resolve);
      });
      
      // Выдаем награду
      if (achievement.reward.coins) {
        await new Promise((resolve) => {
          db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [achievement.reward.coins, userId], resolve);
        });
      }
      if (achievement.reward.quanhash) {
        await new Promise((resolve) => {
          db.run('UPDATE users SET quanhash = quanhash + ? WHERE id = ?', [achievement.reward.quanhash, userId], resolve);
        });
      }
      
      achievements.push(achievement);
    }
  }
  
  return achievements;
}

// API маршруты
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Админ панель
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Админ авторизация
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'smartfxinsk' && password === 'Magadan1996') {
    res.json({ success: true, token: 'admin_token_' + Date.now() });
  } else {
    res.status(401).json({ error: 'Неверные учетные данные' });
  }
});

// Получение всех пользователей для админки
app.get('/api/admin/users', (req, res) => {
  const { token } = req.query;
  
  if (!token || !token.startsWith('admin_token_')) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  db.all('SELECT id, telegram_id, username, first_name, last_name, coins, quanhash, level, energy, max_energy, total_taps, total_mined, prestige_level, referrals_count, is_banned, ban_reason, ban_until, created_at, last_active FROM users ORDER BY coins DESC', (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения пользователей' });
    }
    
    res.json({ users });
  });
});

// Обновление баланса пользователя
app.post('/api/admin/update-balance', (req, res) => {
  const { token, userId, coins, quanhash } = req.body;
  
  if (!token || !token.startsWith('admin_token_')) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  if (!userId || (coins === undefined && quanhash === undefined)) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }
  
  let updateQuery = 'UPDATE users SET ';
  let params = [];
  
  if (coins !== undefined) {
    updateQuery += 'coins = ?';
    params.push(coins);
  }
  
  if (quanhash !== undefined) {
    if (coins !== undefined) {
      updateQuery += ', ';
    }
    updateQuery += 'quanhash = ?';
    params.push(quanhash);
  }
  
  updateQuery += ' WHERE id = ?';
  params.push(userId);
  
  db.run(updateQuery, params, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка обновления баланса' });
    }
    
    res.json({ success: true, message: 'Баланс обновлен' });
  });
});

// Блокировка/разблокировка пользователя
app.post('/api/admin/toggle-ban', (req, res) => {
  const { token, userId, ban, reason } = req.body;
  
  if (!token || !token.startsWith('admin_token_')) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  if (!userId || ban === undefined) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }
  
  const banUntil = ban ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null; // 30 дней или null
  
  db.run(
    'UPDATE users SET is_banned = ?, ban_reason = ?, ban_until = ? WHERE id = ?',
    [ban ? 1 : 0, reason || null, banUntil, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Ошибка обновления статуса' });
      }
      
      res.json({ 
        success: true, 
        message: ban ? 'Пользователь заблокирован' : 'Пользователь разблокирован' 
      });
    }
  );
});

// Временная заморозка пользователя
app.post('/api/admin/freeze', (req, res) => {
  const { token, userId, freezeHours } = req.body;
  
  if (!token || !token.startsWith('admin_token_')) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  if (!userId || !freezeHours) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }
  
  const freezeUntil = new Date(Date.now() + freezeHours * 60 * 60 * 1000).toISOString();
  
  db.run(
    'UPDATE users SET ban_until = ?, is_banned = 1, ban_reason = ? WHERE id = ?',
    [freezeUntil, `Временная заморозка на ${freezeHours} часов`, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Ошибка заморозки пользователя' });
      }
      
      res.json({ 
        success: true, 
        message: `Пользователь заморожен на ${freezeHours} часов` 
      });
    }
  );
});

// Получение статистики для админки
app.get('/api/admin/stats', (req, res) => {
  const { token } = req.query;
  
  if (!token || !token.startsWith('admin_token_')) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  db.get('SELECT COUNT(*) as totalUsers, SUM(coins) as totalCoins, SUM(quanhash) as totalQuanhash, SUM(total_taps) as totalTaps FROM users', (err, stats) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения статистики' });
    }
    
    db.get('SELECT COUNT(*) as bannedUsers FROM users WHERE is_banned = 1', (err, bannedStats) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка получения статистики' });
      }
      
      res.json({
        totalUsers: stats.totalUsers,
        totalCoins: stats.totalCoins || 0,
        totalQuanhash: stats.totalQuanhash || 0,
        totalTaps: stats.totalTaps || 0,
        bannedUsers: bannedStats.bannedUsers
      });
    });
  });
});

// Авторизация через Telegram (упрощенная для демо)
app.post('/api/auth', (req, res) => {
  const { initData } = req.body;
  
  try {
    // Для демо упрощаем авторизацию
    let userData;
    try {
      const urlParams = new URLSearchParams(initData);
      userData = JSON.parse(urlParams.get('user'));
    } catch {
      // Если нет данных Telegram, создаем тестового пользователя
      userData = {
        id: Math.floor(Math.random() * 1000000),
        username: 'test_user',
        first_name: 'Тест',
        last_name: 'Пользователь'
      };
    }
    
    const telegramId = userData.id;
    const username = userData.username || '';
    const firstName = userData.first_name || '';
    const lastName = userData.last_name || '';
    
    // Проверяем или создаем пользователя
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка базы данных' });
      }
      
      if (!user) {
        // Создаем нового пользователя
        db.run(
          'INSERT INTO users (telegram_id, username, first_name, last_name, last_session_start) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [telegramId, username, firstName, lastName],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Ошибка создания пользователя' });
            }
            
            res.json({
              success: true,
              userId: this.lastID,
              isNewUser: true
            });
          }
        );
      } else {
        // Обновляем время последней активности
        db.run('UPDATE users SET last_active = CURRENT_TIMESTAMP, last_session_start = CURRENT_TIMESTAMP WHERE telegram_id = ?', [telegramId]);
        
        res.json({
          success: true,
          userId: user.id,
          isNewUser: false
        });
      }
    });
  } catch (error) {
    res.status(400).json({ error: 'Неверные данные авторизации' });
  }
});

// Получение данных пользователя с расширенной информацией
app.get('/api/user/:id', async (req, res) => {
  const userId = req.params.id;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получаем карточки
    const cards = await new Promise((resolve) => {
      db.all('SELECT * FROM cards WHERE user_id = ? AND is_active = 1', [userId], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    // Получаем активные бусты
    const activeBoosts = await new Promise((resolve) => {
      db.all('SELECT * FROM boosts WHERE user_id = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP', [userId], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    // Рассчитываем оффлайн доход
    const offlineIncome = calculateOfflineIncome(user, cards, activeBoosts);
    
    // Проверяем достижения
    const newAchievements = await checkAchievements(userId, user);
    
    // Получаем активные события
    const activeEvents = await new Promise((resolve) => {
      db.all('SELECT * FROM events WHERE is_active = 1 AND start_time <= CURRENT_TIMESTAMP AND end_time >= CURRENT_TIMESTAMP', [], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    res.json({
      ...user,
      offlineIncome,
      newAchievements,
      activeEvents,
      cards,
      activeBoosts
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения данных пользователя' });
  }
});

// Улучшенный тап с защитой от читов
app.post('/api/tap/:userId', async (req, res) => {
  const userId = req.params.userId;
  const timestamp = Date.now();
  
  try {
    // Проверяем защиту от читов
    const cheatCheck = cheatDetection.recordAction(userId, 'taps', timestamp);
    if (cheatCheck.isCheating) {
      // Увеличиваем счетчик подозрительной активности
      await new Promise((resolve) => {
        db.run('UPDATE users SET cheat_detection_count = cheat_detection_count + 1 WHERE id = ?', [userId], resolve);
      });
      
      return res.status(429).json({ 
        error: 'Подозрительная активность обнаружена! Подождите немного.',
        reason: cheatCheck.reason
      });
    }
    
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ? AND is_banned = 0', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден или заблокирован' });
    }
    
    // Проверяем энергию
    if (user.energy <= 0) {
      return res.status(400).json({ error: 'Недостаточно энергии!' });
    }
    
    // Получаем активные бусты
    const activeBoosts = await new Promise((resolve) => {
      db.all('SELECT * FROM boosts WHERE user_id = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP', [userId], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    // Получаем активные события
    const activeEvents = await new Promise((resolve) => {
      db.all('SELECT * FROM events WHERE is_active = 1 AND start_time <= CURRENT_TIMESTAMP AND end_time >= CURRENT_TIMESTAMP', [], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    // Рассчитываем доход с учетом всех модификаторов
    let income = user.tap_power;
    
    // Применяем бусты
    activeBoosts.forEach(boost => {
      if (boost.boost_type === 'tap_power' || boost.boost_type === 'coin_multiplier') {
        income *= boost.multiplier;
      }
    });
    
    // Применяем события
    activeEvents.forEach(event => {
      if (event.event_type === 'double_coins') {
        income *= event.multiplier;
      }
    });
    
    // Применяем престиж
    income *= Math.pow(GAME_CONFIG.PRESTIGE_MULTIPLIER, user.prestige_level);
    
    income = Math.floor(income);
    
    // Обновляем данные пользователя
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET coins = coins + ?, energy = energy - 1, total_taps = total_taps + 1, experience = experience + 1, last_active = CURRENT_TIMESTAMP WHERE id = ?',
        [income, userId],
        resolve
      );
    });
    
    // Проверяем достижения
    const newAchievements = await checkAchievements(userId, { ...user, total_taps: user.total_taps + 1 });
    
    res.json({
      success: true,
      income,
      newCoins: user.coins + income,
      newEnergy: user.energy - 1,
      newAchievements,
      activeBoosts,
      activeEvents
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка тапа' });
  }
});

// Получение оффлайн дохода с уведомлением
app.post('/api/claim-offline/:userId', async (req, res) => {
  const userId = req.params.userId;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получаем карточки и бусты
    const cards = await new Promise((resolve) => {
      db.all('SELECT * FROM cards WHERE user_id = ? AND is_active = 1', [userId], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    const activeBoosts = await new Promise((resolve) => {
      db.all('SELECT * FROM boosts WHERE user_id = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP', [userId], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    const offlineIncome = calculateOfflineIncome(user, cards, activeBoosts);
    
    if (offlineIncome > 0) {
      await new Promise((resolve) => {
        db.run(
          'UPDATE users SET coins = coins + ?, offline_income_start = CURRENT_TIMESTAMP, last_active = CURRENT_TIMESTAMP WHERE id = ?',
          [offlineIncome, userId],
          resolve
        );
      });
      
      // Проверяем достижения
      const newAchievements = await checkAchievements(userId, { ...user, coins: user.coins + offlineIncome });
      
      res.json({
        success: true,
        income: offlineIncome,
        newCoins: user.coins + offlineIncome,
        newAchievements,
        offlineTime: Math.min(Date.now() - new Date(user.last_active), GAME_CONFIG.OFFLINE_INCOME_DURATION)
      });
    } else {
      res.json({
        success: true,
        income: 0,
        newCoins: user.coins,
        offlineTime: 0
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения оффлайн дохода' });
  }
});

// Улучшенный майнинг
app.post('/api/mine/:userId', async (req, res) => {
  const userId = req.params.userId;
  
  try {
    // Проверяем защиту от читов
    const cheatCheck = cheatDetection.recordAction(userId, 'mines');
    if (cheatCheck.isCheating) {
      return res.status(429).json({ 
        error: 'Слишком много попыток майнинга! Подождите немного.',
        reason: cheatCheck.reason
      });
    }
    
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получаем майнинг машины пользователя
    const machines = await new Promise((resolve) => {
      db.all('SELECT * FROM mining_machines WHERE user_id = ? AND is_active = 1', [userId], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    let totalHashRate = 0;
    let totalPowerConsumption = 0;
    
    machines.forEach(machine => {
      totalHashRate += machine.hash_rate * machine.efficiency;
      totalPowerConsumption += machine.power_consumption;
    });
    
    if (totalHashRate === 0) {
      return res.status(400).json({ error: 'У вас нет активных майнинг машин!' });
    }
    
    // Сложный алгоритм майнинга
    const difficulty = Math.pow(GAME_CONFIG.MINING_COMPLEXITY.DIFFICULTY_MULTIPLIER, user.level);
    const miningChance = Math.min(totalHashRate / (difficulty * 1000), 0.15); // Максимум 15% шанс
    
    // Получаем активные события
    const activeEvents = await new Promise((resolve) => {
      db.all('SELECT * FROM events WHERE is_active = 1 AND start_time <= CURRENT_TIMESTAMP AND end_time >= CURRENT_TIMESTAMP', [], (err, rows) => {
        resolve(rows || []);
      });
    });
    
    let eventMultiplier = 1;
    activeEvents.forEach(event => {
      if (event.event_type === 'lucky_mining' || event.event_type === 'mining_frenzy') {
        eventMultiplier *= event.multiplier;
      }
    });
    
    const finalChance = Math.min(miningChance * eventMultiplier, 0.25); // Максимум 25% с событиями
    const minedHash = Math.random() < finalChance ? Math.floor(totalHashRate / 100 * eventMultiplier) : 0;
    
    if (minedHash > 0) {
      await new Promise((resolve) => {
        db.run(
          'UPDATE users SET quanhash = quanhash + ?, total_mined = total_mined + ? WHERE id = ?',
          [minedHash, minedHash, userId],
          resolve
        );
      });
      
      // Проверяем достижения
      const newAchievements = await checkAchievements(userId, { ...user, total_mined: user.total_mined + minedHash });
      
      res.json({
        success: true,
        minedHash,
        newQuanHash: user.quanhash + minedHash,
        hashRate: totalHashRate,
        difficulty,
        eventMultiplier,
        newAchievements,
        activeEvents
      });
    } else {
      res.json({
        success: true,
        minedHash: 0,
        newQuanHash: user.quanhash,
        hashRate: totalHashRate,
        difficulty,
        eventMultiplier,
        activeEvents
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка майнинга' });
  }
});

// Получение рейтинга
app.get('/api/leaderboard', (req, res) => {
  const { type = 'coins', limit = 10 } = req.query;
  
  let query = '';
  switch (type) {
    case 'coins':
      query = 'SELECT username, coins, level, prestige_level FROM users WHERE is_banned = 0 ORDER BY coins DESC LIMIT ?';
      break;
    case 'quanhash':
      query = 'SELECT username, quanhash, level, prestige_level FROM users WHERE is_banned = 0 ORDER BY quanhash DESC LIMIT ?';
      break;
    case 'taps':
      query = 'SELECT username, total_taps, level, prestige_level FROM users WHERE is_banned = 0 ORDER BY total_taps DESC LIMIT ?';
      break;
    case 'level':
      query = 'SELECT username, level, experience, prestige_level FROM users WHERE is_banned = 0 ORDER BY level DESC, experience DESC LIMIT ?';
      break;
    case 'prestige':
      query = 'SELECT username, prestige_level, prestige_points, level FROM users WHERE is_banned = 0 ORDER BY prestige_level DESC, prestige_points DESC LIMIT ?';
      break;
    default:
      return res.status(400).json({ error: 'Неверный тип рейтинга' });
  }
  
  db.all(query, [limit], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения рейтинга' });
    }
    
    res.json({
      type,
      leaderboard: rows
    });
  });
});

// Покупка улучшений
app.post('/api/buy-upgrade/:userId', async (req, res) => {
  const userId = req.params.userId;
  const { upgradeType } = req.body;
  
  const upgradeCosts = {
    tap_power: 100,
    max_energy: 200,
    energy_recovery: 300,
    mining_efficiency: 500,
    offline_multiplier: 1000
  };
  
  const cost = upgradeCosts[upgradeType];
  if (!cost) {
    return res.status(400).json({ error: 'Неверный тип улучшения' });
  }
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (user.coins < cost) {
      return res.status(400).json({ error: 'Недостаточно коинов' });
    }
    
    // Проверяем защиту от читов
    const cheatCheck = cheatDetection.recordAction(userId, 'purchases');
    if (cheatCheck.isCheating) {
      return res.status(429).json({ error: 'Слишком много покупок! Подождите немного.' });
    }
    
    let updateQuery = '';
    let updateParams = [];
    
    switch (upgradeType) {
      case 'tap_power':
        updateQuery = 'UPDATE users SET coins = coins - ?, tap_power = tap_power + 1 WHERE id = ?';
        updateParams = [cost, userId];
        break;
      case 'max_energy':
        updateQuery = 'UPDATE users SET coins = coins - ?, max_energy = max_energy + 10, energy = energy + 10 WHERE id = ?';
        updateParams = [cost, userId];
        break;
      case 'energy_recovery':
        updateQuery = 'UPDATE users SET coins = coins - ?, energy = max_energy WHERE id = ?';
        updateParams = [cost, userId];
        break;
      case 'mining_efficiency':
        updateQuery = 'UPDATE users SET coins = coins - ? WHERE id = ?';
        updateParams = [cost, userId];
        // Обновляем эффективность всех машин
        await new Promise((resolve) => {
          db.run('UPDATE mining_machines SET efficiency = MIN(efficiency + 0.05, 1.0) WHERE user_id = ?', [userId], resolve);
        });
        break;
      case 'offline_multiplier':
        updateQuery = 'UPDATE users SET coins = coins - ? WHERE id = ?';
        updateParams = [cost, userId];
        break;
    }
    
    await new Promise((resolve) => {
      db.run(updateQuery, updateParams, resolve);
    });
    
    res.json({
      success: true,
      newCoins: user.coins - cost,
      upgradeType
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка покупки улучшения' });
  }
});

// Покупка энергии
app.post('/api/buy-energy/:userId', async (req, res) => {
  const userId = req.params.userId;
  const { amount = 50, cost = 50 } = req.body;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (user.coins < cost) {
      return res.status(400).json({ error: 'Недостаточно коинов' });
    }
    
    const newEnergy = Math.min(user.energy + amount, user.max_energy);
    
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET coins = coins - ?, energy = ? WHERE id = ?',
        [cost, newEnergy, userId],
        resolve
      );
    });
    
    res.json({
      success: true,
      newCoins: user.coins - cost,
      newEnergy
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка покупки энергии' });
  }
});

// Покупка майнинг машины
app.post('/api/buy-mining-machine/:userId', async (req, res) => {
  const userId = req.params.userId;
  const { machineType = 'basic' } = req.body;
  
  const machineConfigs = {
    basic: { cost: 500, hashRate: 50, powerConsumption: 20, efficiency: 0.8 },
    advanced: { cost: 2000, hashRate: 200, powerConsumption: 80, efficiency: 0.85 },
    quantum: { cost: 10000, hashRate: 1000, powerConsumption: 400, efficiency: 0.9 },
    nexus: { cost: 50000, hashRate: 5000, powerConsumption: 2000, efficiency: 0.95 },
    infinity: { cost: 250000, hashRate: 25000, powerConsumption: 10000, efficiency: 0.98 }
  };
  
  const config = machineConfigs[machineType];
  if (!config) {
    return res.status(400).json({ error: 'Неверный тип машины' });
  }
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (user.coins < config.cost) {
      return res.status(400).json({ error: 'Недостаточно коинов' });
    }
    
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET coins = coins - ? WHERE id = ?',
        [config.cost, userId],
        resolve
      );
    });
    
    // Добавляем майнинг машину
    const machineId = await new Promise((resolve) => {
      db.run(
        'INSERT INTO mining_machines (user_id, machine_type, hash_rate, power_consumption, efficiency) VALUES (?, ?, ?, ?, ?)',
        [userId, machineType, config.hashRate, config.powerConsumption, config.efficiency],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    res.json({
      success: true,
      newCoins: user.coins - config.cost,
      machineId
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка покупки машины' });
  }
});

// Получение майнинг машин пользователя
app.get('/api/mining-machines/:userId', (req, res) => {
  const userId = req.params.userId;
  
  db.all('SELECT * FROM mining_machines WHERE user_id = ?', [userId], (err, machines) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения машин' });
    }
    
    res.json({
      machines
    });
  });
});

// Система карточек
app.post('/api/open-card-pack/:userId', async (req, res) => {
  const userId = req.params.userId;
  const { packType = 'basic', cost = 100 } = req.body;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (user.coins < cost) {
      return res.status(400).json({ error: 'Недостаточно коинов' });
    }
    
    // Генерируем случайную карточку с улучшенными шансами
    const rarities = ['common', 'rare', 'epic', 'legendary'];
    const rarityWeights = [0.5, 0.3, 0.15, 0.05]; // Улучшенные шансы
    
    let rarity = 'common';
    const random = Math.random();
    let cumulativeWeight = 0;
    
    for (let i = 0; i < rarities.length; i++) {
      cumulativeWeight += rarityWeights[i];
      if (random <= cumulativeWeight) {
        rarity = rarities[i];
        break;
      }
    }
    
    // Статистики карточки в зависимости от редкости
    const cardStats = {
      common: { passiveIncome: 2, boostMultiplier: 1.15, energyBonus: 8 },
      rare: { passiveIncome: 5, boostMultiplier: 1.25, energyBonus: 15 },
      epic: { passiveIncome: 12, boostMultiplier: 1.5, energyBonus: 25 },
      legendary: { passiveIncome: 30, boostMultiplier: 2.0, energyBonus: 60 }
    };
    
    const stats = cardStats[rarity];
    
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET coins = coins - ? WHERE id = ?',
        [cost, userId],
        resolve
      );
    });
    
    // Добавляем карточку
    const cardId = await new Promise((resolve) => {
      db.run(
        'INSERT INTO cards (user_id, card_type, rarity, passive_income, boost_multiplier, energy_bonus) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, 'quantum_card', rarity, stats.passiveIncome, stats.boostMultiplier, stats.energyBonus],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Проверяем достижения
    const newAchievements = await checkAchievements(userId, user);
    
    res.json({
      success: true,
      newCoins: user.coins - cost,
      card: {
        id: cardId,
        rarity,
        passiveIncome: stats.passiveIncome,
        boostMultiplier: stats.boostMultiplier,
        energyBonus: stats.energyBonus
      },
      newAchievements
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка открытия пачки' });
  }
});

// Получение карточек пользователя
app.get('/api/cards/:userId', (req, res) => {
  const userId = req.params.userId;
  
  db.all('SELECT * FROM cards WHERE user_id = ?', [userId], (err, cards) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения карточек' });
    }
    
    res.json({
      cards
    });
  });
});

// Реферальная система
app.post('/api/use-referral/:userId', async (req, res) => {
  const userId = req.params.userId;
  const { referralCode } = req.body;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (user.referrer_id) {
      return res.status(400).json({ error: 'У вас уже есть реферер' });
    }
    
    // Находим реферера по коду
    const referrer = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [referralCode], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!referrer) {
      return res.status(404).json({ error: 'Реферер не найден' });
    }
    
    if (referrer.id === userId) {
      return res.status(400).json({ error: 'Нельзя использовать свой код' });
    }
    
    // Обновляем данные пользователя и реферера
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET referrer_id = ?, coins = coins + 100 WHERE id = ?',
        [referrer.id, userId],
        resolve
      );
    });
    
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET referrals_count = referrals_count + 1, coins = coins + 200 WHERE id = ?',
        [referrer.id],
        resolve
      );
    });
    
    // Проверяем достижения
    const newAchievements = await checkAchievements(userId, { ...user, coins: user.coins + 100 });
    
    res.json({
      success: true,
      bonus: 100,
      referrerBonus: 200,
      newAchievements
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка использования реферального кода' });
  });
});

// Получение реферального кода
app.get('/api/referral-code/:userId', (req, res) => {
  const userId = req.params.userId;
  
  res.json({
    referralCode: userId,
    referralLink: `https://unlock-rent.online?ref=${userId}`
  });
});

// Система престижа
app.post('/api/prestige/:userId', async (req, res) => {
  const userId = req.params.userId;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (user.level < GAME_CONFIG.PRESTIGE_MIN_LEVEL) {
      return res.status(400).json({ error: `Требуется минимум ${GAME_CONFIG.PRESTIGE_MIN_LEVEL} уровень для престижа` });
    }
    
    const prestigePoints = Math.floor(user.level / 10);
    
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET prestige_level = prestige_level + 1, prestige_points = prestige_points + ?, level = 1, experience = 0, coins = 0, quanhash = 0, tap_power = 1, energy = max_energy, last_prestige = CURRENT_TIMESTAMP WHERE id = ?',
        [prestigePoints, userId],
        resolve
      );
    });
    
    res.json({
      success: true,
      newPrestigeLevel: user.prestige_level + 1,
      prestigePointsGained: prestigePoints
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка престижа' });
  });
});

// Ежедневный бонус
app.post('/api/daily-bonus/:userId', async (req, res) => {
  const userId = req.params.userId;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    const today = new Date().toDateString();
    const lastBonus = user.daily_bonus_claimed ? new Date(user.daily_bonus_claimed).toDateString() : null;
    
    if (lastBonus === today) {
      return res.status(400).json({ error: 'Ежедневный бонус уже получен сегодня' });
    }
    
    // Рассчитываем бонус с учетом серии
    let bonus = GAME_CONFIG.DAILY_BONUS_BASE;
    let newStreak = 1;
    
    if (lastBonus) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();
      
      if (lastBonus === yesterdayStr) {
        newStreak = user.streak_days + 1;
      }
    }
    
    bonus = Math.floor(bonus * Math.pow(GAME_CONFIG.STREAK_MULTIPLIER, Math.min(newStreak - 1, GAME_CONFIG.MAX_STREAK_DAYS - 1)));
    
    await new Promise((resolve) => {
      db.run(
        'UPDATE users SET coins = coins + ?, daily_bonus_claimed = CURRENT_TIMESTAMP, streak_days = ? WHERE id = ?',
        [bonus, newStreak, userId],
        resolve
      );
    });
    
    res.json({
      success: true,
      bonus,
      newStreak,
      newCoins: user.coins + bonus
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения ежедневного бонуса' });
  });
});

// Socket.io для реального времени
io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.id);
  
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
  });
});

// Cron задачи
// Восстановление энергии каждую минуту
cron.schedule('* * * * *', () => {
  db.run(
    'UPDATE users SET energy = MIN(energy + 1, max_energy) WHERE energy < max_energy'
  );
});

// Обновление оффлайн дохода каждые 5 минут
cron.schedule('*/5 * * * *', () => {
  db.all('SELECT * FROM users WHERE offline_income_start IS NOT NULL', (err, users) => {
    if (err) return;
    
    users.forEach(user => {
      // Здесь можно добавить логику автоматического начисления оффлайн дохода
    });
  });
});

// Создание случайных событий каждые 2 часа
cron.schedule('0 */2 * * *', () => {
  const events = Object.values(EVENTS);
  const randomEvent = events[Math.floor(Math.random() * events.length)];
  
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + randomEvent.duration);
  
  db.run(
    'INSERT INTO events (event_type, start_time, end_time, multiplier, description) VALUES (?, ?, ?, ?, ?)',
    [randomEvent.id, startTime.toISOString(), endTime.toISOString(), randomEvent.multiplier, randomEvent.name]
  );
  
  console.log(`Создано событие: ${randomEvent.name}`);
});

// Очистка старых событий каждый час
cron.schedule('0 * * * *', () => {
  db.run('UPDATE events SET is_active = 0 WHERE end_time < CURRENT_TIMESTAMP');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Quantum Nexus сервер запущен на порту ${PORT}`);
  console.log(`⚛️ Квантовая тапалка готова к игре!`);
});