const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// База данных
const db = new sqlite3.Database('quantum_nexus.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        balance INTEGER DEFAULT 0,
        quanhash REAL DEFAULT 0,
        energy INTEGER DEFAULT 100,
        MAX 100,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        referral_code TEXT UNIQUE,
        referred_by INTEGER,
        vip_level INTEGER DEFAULT 0,
        last_daily_bonus INTEGER DEFAULT 0,
        total_earned INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS mining_machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        machine_type TEXT,
        hash_power REAL,
        price INTEGER,
        purchased_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS daily_quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        quest_type TEXT,
        target INTEGER,
        progress INTEGER DEFAULT 0,
        reward INTEGER,
        status TEXT DEFAULT 'active',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount REAL,
        wallet TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        amount REAL,
        description TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`);
});

// Telegram Bot
const botToken = '8426192106:AAGGlkfOYAhaQKPp-bcL-3oHXBE50tzAMog';
const bot = new TelegramBot(botToken, { polling: true });

// Проверка подлинности Telegram Web App
function validateWebApp(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const secretKey = crypto.createHash('sha256').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        return calculatedHash === hash;
    } catch (error) {
        return false;
    }
}

// Извлечение данных пользователя из initData
function getUserFromInitData(req) {
    try {
        const initData = req.query['tgWebAppData'] || '';
        const urlParams = new URLSearchParams(initData);
        const userParam = urlParams.get('user');
        if (!userParam) return null;
        
        const user = JSON.parse(decodeURIComponent(userParam));
        return {
            id: user.id,
            username: user.username || user.first_name,
            first_name: user.first_name,
            last_name: user.last_name
        };
    } catch (error) {
        return null;
    }
}

// API для получения данных пользователя
app.post('/api/user/data', (req, res) => {
    const user = getUserFromInitData(req);
    if (!user) {
        return res.json({ success: false, error: 'Invalid user data' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [user.id], (err, userData) => {
        if (err) {
            return res.json({ success: false, error: err.message });
        }
        
        if (!userData) {
            // Создаем нового пользователя
            const referralCode = generateReferralCode();
            const startParam = req.query['start_param'];
            
            db.run('INSERT INTO users (telegram_id, username, referral_code, referred_by) VALUES (?, ?, ?, ?)',
                [user.id, user.username, referralCode, startParam ? parseInt(startParam) : null],
                function(err) {
                    if (err) {
                        return res.json({ success: false, error: err.message });
                    }
                    
                    res.json({
                        success: true,
                        user: {
                            id: user.id,
                            username: userData?.username || user.username,
                            balance: 0,
                            quanhash: 0,
                            energy: 100,
                            level: 1,
                            experience: 0,
                            referral_code: referralCode,
                            vip_level: 0
                        }
                    });
                });
        } else {
            res.json({
                success: true,
                user: userData
            });
        }
    });
});

// API для тапа (заработка)
app.post('/api/user/tap', (req, res) => {
    const user = getUserFromInitData(req);
    if (!user) {
        return res.json({ success: false, error: 'Invalid user data' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [user.id], (err, userData) => {
        if (err || !userData) {
            return res.json({ success: false, error: 'User not found' });
        }
        
        if (userData.energy < 1) {
            return res.json({ success: false, error: 'Not enough energy' });
        }
        
        // Расчет заработанных монет
        const baseEarn = 10;
        const vipMultiplier = 1 + (userData.vip_level * 0.2);
        const earned = Math.floor(baseEarn * vipMultiplier);
        
        const newBalance = userData.balance + earned;
        const newEnergy = userData.energy - 1;
        
        // Проверка на уровень опыта
        let newExp = userData.experience + 1;
        let newLevel = userData.level;
        
        if (newExp >= (userData.level * 100)) {
            newLevel = userData.level + 1;
            newExp = 0;
        }
        
        db.run('UPDATE users SET balance = ?, energy = ?, experience = ?, level = ? WHERE telegram_id = ?',
            [newBalance, newEnergy, newExp, newLevel, user.id], (err) => {
                if (err) {
                    return res.json({ success: false, error: err.message });
                }
                
                // Сохраняем транзакцию
                db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [user.id, 'tap_earn', earned, 'Tap earnings']);
                
                res.json({
                    success: true,
                    earned: earned,
                    balance: newBalance,
                    energy: newEnergy,
                    level: newLevel,
                    experience: newExp
                });
            });
    });
});

// API для пополнения энергии
app.post('/api/user/recharge-energy', (req, res) => {
    const user = getUserFromInitData(req);
    const { amount } = req.body; // amount - количество энергии (стоимость: 100 монет за 50 энергии)
    
    if (!user || !amount) {
        return res.json({ success: false, error: 'Invalid data' });
    }
    
    const cost = amount * 2; // 100 монет за 50 энергии
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [user.id], (err, userData) => {
        if (err || !userData) {
            return res.json({ success: false, error: 'User not found' });
        }
        
        if (userData.balance < cost) {
            return res.json({ success: false, error: 'Not enough balance' });
        }
        
        if (userData.energy + amount > 100) {
            return res.json({ success: false, error: 'Energy limit exceeded' });
        }
        
        const newBalance = userData.balance - cost;
        const newEnergy = userData.energy + amount;
        
        db.run('UPDATE users SET balance = ?, energy = ? WHERE telegram_id = ?',
            [newBalance, newEnergy, user.id], (err) => {
                if (err) {
                    return res.json({ success: false, error: err.message });
                }
                
                db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [user.id, 'energy_recharge', -cost, `Recharge ${amount} energy`]);
                
                res.json({
                    success: true,
                    balance: newBalance,
                    energy: newEnergy
                });
            });
    });
});

// API для ежедневного бонуса
app.post('/api/user/daily-bonus', (req, res) => {
    const user = getUserFromInitData(req);
    if (!user) {
        return res.json({ success: false, error: 'Invalid user data' });
    }
    
    const today = Math.floor(Date.now() / 86400000);
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [user.id], (err, userData) => {
        if (err || !userData) {
            return res.json({ success: false, error: 'User not found' });
        }
        
        if (userData.last_daily_bonus >= today) {
            return res.json({ success: false, error: 'Bonus already claimed today' });
        }
        
        const bonusAmount = 100 + (userData.level * 10);
        const newBalance = userData.balance + bonusAmount;
        
        db.run('UPDATE users SET balance = ?, last_daily_bonus = ? WHERE telegram_id = ?',
            [newBalance, today, user.id], (err) => {
                if (err) {
                    return res.json({ success: false, error: err.message });
                }
                
                db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [user.id, 'daily_bonus', bonusAmount, 'Daily bonus']);
                
                res.json({
                    success: true,
                    bonus: bonusAmount,
                    balance: newBalance
                });
            });
    });
});

// API для вывода средств
app.post('/api/user/withdraw', (req, res) => {
    const user = getUserFromInitData(req);
    const { amount, wallet } = req.body;
    
    if (!user || !amount || !wallet) {
        return res.json({ success: false, error: 'Invalid data' });
    }
    
    if (amount < 100) {
        return res.json({ success: false, error: 'Minimum withdrawal: 100 QuanHash' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [user.id], (err, userData) => {
        if (err || !userData) {
            return res.json({ success: false, error: 'User not found' });
        }
        
        if (userData.quanhash < amount) {
            return res.json({ success: false, error: 'Not enough QuanHash' });
        }
        
        const newQuanHash = userData.quanhash - amount;
        
        db.run('UPDATE users SET quanhash = ? WHERE telegram_id = ?', [newQuanHash, user.id], (err) => {
            if (err) {
                return res.json({ success: false, error: err.message });
            }
            
            db.run('INSERT INTO withdrawals (user_id, amount, wallet, status) VALUES (?, ?, ?, ?)',
                [user.id, amount, wallet, 'pending'], (err) => {
                    if (err) {
                        return res.json({ success: false, error: err.message });
                    }
                    
                    db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                        [user.id, 'withdraw', -amount, `Withdrawal to ${wallet}`]);
                    
                    res.json({
                        success: true,
                        quanhash: newQuanHash
                    });
                });
        });
    });
});

// Генерация реферального кода
function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Телеграм Бот команды
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const startParam = msg.text.split(' ')[1]; // Реферальный код
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('DB error:', err);
            return;
        }
        
        if (!user) {
            // Создаем нового пользователя
            const referralCode = generateReferralCode();
            
            db.run('INSERT INTO users (telegram_id, username, referral_code, referred_by) VALUES (?, ?, ?, ?)',
                [userId, username, referralCode, startParam ? parseInt(startParam) : null],
                function(err) {
                    if (err) {
                        console.error('Error creating user:', err);
                        return;
                    }
                    
                    // Если есть реферал, даем бонус обоим
                    if (startParam) {
                        db.run('UPDATE users SET balance = balance + 50, quanhash = quanhash + 10 WHERE telegram_id = ?', [startParam]);
                    }
                    
                    bot.sendMessage(chatId, `⚛️ Добро пожаловать в Quantum Nexus, ${username}!

💰 Баланс: 0
⚡ Энергия: 100
💎 QuanHash: 0

📱 Откройте веб-приложение для игры!`, {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🚀 Открыть игру', web_app: { url: 'https://quantum-nexus.ru' } },
                                { text: '👥 Мои рефералы', callback_data: 'referrals' }
                            ]]
                        }
                    });
                });
        } else {
            db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, userData) => {
                bot.sendMessage(chatId, `⚛️ Добро пожаловать обратно, ${username}!

💰 Баланс: ${userData.balance}
💎 QuanHash: ${userData.quanhash}
⚡ Энергия: ${userData.energy}

📱 Откройте веб-приложение для игры!`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🚀 Открыть игру', web_app: { url: 'https://quantum-nexus.ru' } },
                            { text: '👥 Мои рефералы', callback_data: 'referrals' }
                        ]]
                    }
                });
            });
        }
    });
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    
    if (query.data === 'referrals') {
        db.get('SELECT referral_code FROM users WHERE telegram_id = ?', [userId], (err, user) => {
            if (!err && user) {
                bot.answerCallbackQuery(query.id);
                bot.sendMessage(chatId, `👥 Ваша реферальная ссылка:

https://t.me/qanexus_bot?start=${userId}

За каждого друга получите 50 монет и 10 QuanHash!`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📤 Поделиться', url: `https://t.me/share/url?url=https://t.me/qanexus_bot?start=${userId}&text=⚛️%20Quantum%20Nexus%20-%20Играй%20и%20зарабатывай!` }
                        ]]
                    }
                });
            }
        });
    }
});

// Админ API
const ADMIN_LOGIN = 'smartfixnsk';
const ADMIN_PASSWORD = 'Maga1996';

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
        const token = crypto.randomBytes(32).toString('hex');
        res.json({ success: true, token });
    } else {
        res.json({ success: false, error: 'Invalid credentials' });
    }
});

app.get('/api/admin/stats', (req, res) => {
    const { token } = req.query;
    
    db.all('SELECT COUNT(*) as total, SUM(balance) as totalBalance, SUM(quanhash) as totalQuanHash FROM users', [], (err, rows) => {
        if (err) {
            return res.json({ success: false, error: err.message });
        }
        
        res.json({
            success: true,
            totalUsers: rows[0]?.total || 0,
            totalBalance: rows[0]?.totalBalance || 0,
            totalQuanHash: rows[0]?.totalQuanHash || 0
        });
    });
});

app.get('/api/admin/users', (req, res) => {
    const { token } = req.query;
    
    db.all('SELECT telegram_id as id, username, balance, quanhash, level FROM users ORDER BY balance DESC LIMIT 100', [], (err, users) => {
        if (err) {
            return res.json({ success: false, error: err.message });
        }
        
        res.json({
            success: true,
            users: users.map(u => ({
                id: u.id,
                username: u.username || 'Unknown',
                balance: u.balance,
                quanhash: u.quanhash,
                level: u.level
            }))
        });
    });
});

// Статические файлы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('✅ Server running on port', PORT);
    console.log('🤖 Telegram bot connected');
});

