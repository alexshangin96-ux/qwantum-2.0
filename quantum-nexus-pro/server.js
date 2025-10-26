const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

const ADMIN_USERNAME = 'smartfixnsk';
const ADMIN_PASSWORD_HASH = '$2b$10$K8j9K6K3K7K6K7K8K9K0Ku/y/x/z/A/B/C/D/E/F/G/H/I/J/K/L/M';
const JWT_SECRET = 'quantum_nexus_pro_secret_2025';

// База данных
const db = new sqlite3.Database('quantum_nexus_pro.db');

// Инициализация базы данных
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        coins INTEGER DEFAULT 0,
        quanhash REAL DEFAULT 0,
        energy INTEGER DEFAULT 100,
        max_energy INTEGER DEFAULT 100,
        tap_power INTEGER DEFAULT 10,
        mining_level INTEGER DEFAULT 0,
        auto_mining INTEGER DEFAULT 0,
        total_taps INTEGER DEFAULT 0,
        total_earned INTEGER DEFAULT 0,
        referrer_id INTEGER,
        referrals INTEGER DEFAULT 0,
        achievements TEXT DEFAULT '',
        last_tap INTEGER DEFAULT 0,
        last_bonus INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS upgrades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        upgrade_type TEXT,
        level INTEGER DEFAULT 1,
        purchased_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        achievement_id TEXT,
        unlocked_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        amount REAL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`);
});

// Telegram Bot
const botToken = '8426192106:AAGGlkfOYAhaQKPp-bcL-3oHXBE50tzAMog';
const bot = new TelegramBot(botToken, { polling: true });

// WebSocket Server
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'register') {
                ws.userId = data.userId;
            }
        } catch (e) {
            console.error('WS error:', e);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Функция для отправки обновлений через WebSocket
function broadcastUpdate(userId, data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.userId === userId) {
            client.send(JSON.stringify(data));
        }
    });
}

// Команда /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const firstName = msg.from.first_name;
    const refCode = match[1];

    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], async (err, user) => {
        if (err) {
            console.error('DB error:', err);
            bot.sendMessage(chatId, '❌ Ошибка базы данных');
            return;
        }

        if (!user) {
            // Создаем нового пользователя
            const query = `
                INSERT INTO users (telegram_id, username, first_name, level, experience, coins, energy, max_energy, tap_power)
                VALUES (?, ?, ?, 1, 0, 50, 100, 100, 10)
            `;

            db.run(query, [userId, username, firstName], function(err) {
                if (err) {
                    console.error('Error creating user:', err);
                    bot.sendMessage(chatId, '❌ Ошибка создания аккаунта');
                    return;
                }

                // Обработка реферального кода
                if (refCode && !isNaN(refCode) && parseInt(refCode) !== userId) {
                    const referrerId = parseInt(refCode);
                    db.run('UPDATE users SET referrer_id = ? WHERE telegram_id = ?', [referrerId, userId], () => {
                        db.run('UPDATE users SET referrals = referrals + 1 WHERE telegram_id = ?', [referrerId]);
                    });

                    bot.sendMessage(referrerId, `🎉 Новый реферал! @${username} присоединился по вашей ссылке!`);
                }

                const welcomeMsg = `⚛️ Добро пожаловать в Quantum Nexus Pro, ${firstName}!

🎮 Это улучшенная версия крипто-тапалки!

📊 Ваш профиль:
🆙 Уровень: 1
💰 Монеты: 50
⚡ Энергия: 100/100
⚛️ QuanHash: 0

🎯 Ваша реферальная ссылка:
t.me/quantum_nexus_bot?start=${userId}

Участвуйте в реферальной программе и получайте бонусы!`;

                bot.sendMessage(chatId, welcomeMsg, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⚛️ ИГРАТЬ', web_app: { url: 'https://quantum-nexus.ru/game' } }],
                            [{ text: '📊 Профиль', callback_data: 'profile' }, { text: '🏆 Достижения', callback_data: 'achievements' }],
                            [{ text: '⚙️ Майнинг', callback_data: 'mining' }, { text: '🎁 Бонусы', callback_data: 'bonus' }]
                        ]
                    }
                });
            });
        } else {
            // Приветствие существующего пользователя
            const profileMsg = `⚛️ Добро пожаловать обратно, ${firstName}!

📊 Ваш профиль:
🆙 Уровень: ${user.level}
💎 EXP: ${user.experience}/${user.level * 100}
💰 Монеты: ${user.coins}
⚡ Энергия: ${user.energy}/${user.max_energy}
⚛️ QuanHash: ${user.quanhash.toFixed(4)}
📊 Всего тапов: ${user.total_taps}
👥 Рефералов: ${user.referrals}

🎯 Ваша реферальная ссылка:
t.me/quantum_nexus_bot?start=${userId}`;

            bot.sendMessage(chatId, profileMsg, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⚛️ ИГРАТЬ', web_app: { url: 'https://quantum-nexus.ru/game' } }],
                        [{ text: '📊 Профиль', callback_data: 'profile' }, { text: '🏆 Достижения', callback_data: 'achievements' }],
                        [{ text: '⚙️ Майнинг', callback_data: 'mining' }, { text: '🎁 Бонусы', callback_data: 'bonus' }],
                        [{ text: '🎁 Ежедневный бонус', callback_data: 'daily_bonus' }]
                    ]
                }
            });
        }
    });
});

// Обработчик кнопок
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (data === 'profile') {
        showProfile(chatId, userId);
    } else if (data === 'achievements') {
        showAchievements(chatId, userId);
    } else if (data === 'mining') {
        showMining(chatId, userId);
    } else if (data === 'bonus') {
        showBonusMenu(chatId, userId);
    } else if (data === 'daily_bonus') {
        claimDailyBonus(chatId, userId);
    }
});

// Функция показа профиля
function showProfile(chatId, userId) {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            return;
        }

        const expToNext = user.level * 100 - user.experience;
        const profileText = `📊 Ваш профиль:

🆙 Уровень: ${user.level}
💎 EXP: ${user.experience}/${user.level * 100} (${expToNext} до нового уровня)
💰 Монеты: ${user.coins}
⚡ Энергия: ${user.energy}/${user.max_energy}
⚛️ QuanHash: ${user.quanhash.toFixed(4)}
💪 Сила тапа: ${user.tap_power}
⛏️ Уровень майнинга: ${user.mining_level}
🤖 Автомайнинг: ${user.auto_mining ? 'ВКЛ' : 'ВЫКЛ'}
📊 Всего тапов: ${user.total_taps}
💰 Всего заработано: ${user.total_earned}
👥 Рефералов: ${user.referrals}`;

        bot.answerCallbackQuery(query.id);
        bot.editMessageText(profileText, {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    });
}

// Функция показа достижений
function showAchievements(chatId, userId) {
    db.all('SELECT * FROM achievements WHERE user_id = ?', [userId], (err, achievements) => {
        let achievementsText = '🏆 Достижения:\n\n';

        const allAchievements = [
            { id: 'first_tap', name: 'Первые шаги', desc: 'Сделайте первый тап' },
            { id: 'tapper_100', name: 'Упорный тапер', desc: 'Сделайте 100 тапов' },
            { id: 'tapper_1000', name: 'Мастер тапов', desc: 'Сделайте 1000 тапов' },
            { id: 'level_10', name: 'Опытный игрок', desc: 'Достигните 10 уровня' },
            { id: 'level_50', name: 'Профессионал', desc: 'Достигните 50 уровня' }
        ];

        if (achievements.length > 0) {
            achievements.forEach(ach => {
                const achInfo = allAchievements.find(a => a.id === ach.achievement_id);
                if (achInfo) {
                    achievementsText += `✅ ${achInfo.name}\n${achInfo.desc}\n\n`;
                }
            });
        } else {
            achievementsText += 'У вас пока нет достижений. Играйте больше!';
        }

        bot.answerCallbackQuery(query.id);
        bot.editMessageText(achievementsText, {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    });
}

// Функция показа майнинга
function showMining(chatId, userId) {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            return;
        }

        const miningText = `⛏️ Майнинг QuanHash:

Текущий уровень: ${user.mining_level}
QuanHash/час: ${(user.mining_level * 0.5).toFixed(2)}
Автомайнинг: ${user.auto_mining ? '✅ ВКЛ' : '❌ ВЫКЛ'}

${user.auto_mining ? '🤖 Автомайнинг активен!' : '💡 Купите автомайнинг для пассивного дохода!'}`;

        bot.answerCallbackQuery(query.id);
        bot.editMessageText(miningText, {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    });
}

// Функция ежедневного бонуса
function claimDailyBonus(chatId, userId) {
    const now = Date.now();
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            return;
        }

        const lastBonus = user.last_bonus || 0;
        const timeDiff = now - lastBonus;
        const dayInMs = 24 * 60 * 60 * 1000;

        if (timeDiff < dayInMs) {
            const hoursLeft = Math.floor((dayInMs - timeDiff) / (60 * 60 * 1000));
            bot.answerCallbackQuery(query.id, { text: `⏳ Вы уже получили бонус! Следующий через ${hoursLeft}ч` });
            return;
        }

        const bonusCoins = 100 + (user.level * 10);
        const bonusQuanHash = user.mining_level > 0 ? 0.1 : 0;
        const newBalance = user.coins + bonusCoins;
        const newQuanHash = parseFloat(user.quanhash) + bonusQuanHash;

        db.run('UPDATE users SET coins = ?, quanhash = ?, last_bonus = ? WHERE telegram_id = ?',
            [newBalance, newQuanHash, now, userId],
            () => {
                bot.answerCallbackQuery(query.id, { text: `🎁 Бонус получен! +${bonusCoins} монет` });
            }
        );
    });
}

function showBonusMenu(chatId, userId) {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, '🎁 Ежедневный бонус доступен!', {
        reply_markup: {
            inline_keyboard: [[
                { text: '🎁 Получить бонус', callback_data: 'daily_bonus' }
            ]]
        }
    });
}

// API Routes
app.post('/api/tap', async (req, res) => {
    const { userId } = req.body;
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], async (err, user) => {
        if (err || !user) {
            return res.json({ success: false, error: 'User not found' });
        }

        if (user.energy < 1) {
            return res.json({ success: false, error: 'Not enough energy' });
        }

        const earned = user.tap_power;
        const newBalance = user.coins + earned;
        const newEnergy = user.energy - 1;
        const newExp = user.experience + 1;
        const newTotalTaps = user.total_taps + 1;
        const newTotalEarned = user.total_earned + earned;

        // Проверка уровня
        let newLevel = user.level;
        const expNeeded = user.level * 100;
        
        if (newExp >= expNeeded) {
            newLevel += 1;
            // Бонус за новый уровень
            const levelBonus = newLevel * 50;
            db.run('UPDATE users SET coins = coins + ? WHERE telegram_id = ?', [levelBonus, userId]);
        }

        db.run(`
            UPDATE users 
            SET coins = ?, energy = ?, experience = ?, 
                total_taps = ?, total_earned = ?, level = ?
            WHERE telegram_id = ?
        `, [newBalance, newEnergy, newExp, newTotalTaps, newTotalEarned, newLevel, userId], (err) => {
            if (err) {
                return res.json({ success: false, error: 'Update failed' });
            }

            // Отправка обновления через WebSocket
            broadcastUpdate(userId, {
                type: 'tap',
                coins: newBalance,
                energy: newEnergy,
                earned: earned,
                level: newLevel,
                experience: newExp
            });

            // Проверка достижений
            checkAchievements(userId, newTotalTaps, newLevel);

            res.json({
                success: true,
                coins: newBalance,
                energy: newEnergy,
                earned: earned,
                level: newLevel,
                experience: newExp
            });
        });
    });
});

// Функция проверки достижений
function checkAchievements(userId, totalTaps, level) {
    const achToCheck = [
        { id: 'first_tap', check: () => totalTaps >= 1 },
        { id: 'tapper_100', check: () => totalTaps >= 100 },
        { id: 'tapper_1000', check: () => totalTaps >= 1000 },
        { id: 'level_10', check: () => level >= 10 },
        { id: 'level_50', check: () => level >= 50 }
    ];

    db.all('SELECT * FROM achievements WHERE user_id = ?', [userId], (err, userAchievements) => {
        const unlockedAch = userAchievements.map(a => a.achievement_id);

        achToCheck.forEach(ach => {
            if (ach.check() && !unlockedAch.includes(ach.id)) {
                db.run('INSERT INTO achievements (user_id, achievement_id) VALUES (?, ?)', [userId, ach.id]);
                // Уведомление пользователю
                db.get('SELECT telegram_id FROM users WHERE telegram_id = ?', [userId], (err, user) => {
                    if (user) {
                        bot.sendMessage(user.telegram_id, `🏆 Достижение разблокировано: ${ach.id}`);
                    }
                });
            }
        });
    });
}

// API для получения данных пользователя
app.get('/api/user/:userId', (req, res) => {
    const userId = req.params.userId;

    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.json({ success: false, error: 'User not found' });
        }

        res.json({ success: true, user });
    });
});

// Admin API
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USERNAME && await bcrypt.compare(password, ADMIN_PASSWORD_HASH)) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.json({ success: false, error: 'Invalid credentials' });
    }
});

app.get('/api/admin/stats', (req, res) => {
    const token = req.query.token;

    try {
        jwt.verify(token, JWT_SECRET);
        
        db.all('SELECT COUNT(*) as total, SUM(coins) as totalCoins, SUM(quanhash) as totalQuanHash FROM users', (err, rows) => {
            if (err) {
                return res.json({ success: false, error: 'Database error' });
            }

            res.json({
                success: true,
                totalUsers: rows[0].total || 0,
                totalBalance: rows[0].totalCoins || 0,
                totalQuanHash: rows[0].totalQuanHash || 0
            });
        });
    } catch (e) {
        res.json({ success: false, error: 'Invalid token' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Quantum Nexus Pro запущен на порту ${PORT}`);
    console.log('🤖 Telegram bot подключен');
    console.log('🔌 WebSocket сервер активен');
});

