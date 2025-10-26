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

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('DB error:', err);
            bot.sendMessage(chatId, '❌ Ошибка базы данных');
            return;
        }
        
        if (!user) {
            // Создаем нового пользователя с обработкой ошибок
            db.run('INSERT OR IGNORE INTO users (telegram_id, username, balance, energy) VALUES (?, ?, 0, 100)',
                [userId, username], function(err) {
                    if (err) {
                        console.error('Error creating user:', err);
                        bot.sendMessage(chatId, '❌ Ошибка создания аккаунта');
                        return;
                    }
                    
                    // Проверяем что пользователь был создан
                    if (this.changes === 0) {
                        // Пользователь уже существует, просто показываем меню
                        bot.sendMessage(chatId, `🎮 Добро пожаловать обратно, ${username}!
                        
💰 Баланс: 0
⚡ Энергия: 100

👆 Тапай кнопку ниже, чтобы заработать монеты!`, {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '⚛️ ТАПАЙ!', callback_data: 'tap' }
                                ]]
                            }
                        });
                        return;
                    }
                    
                    bot.sendMessage(chatId, `🎮 Добро пожаловать в Quantum Nexus, ${username}!
                    
💰 Баланс: 0
⚡ Энергия: 100

👆 Тапай кнопку ниже, чтобы заработать монеты!`, {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '⚛️ ТАПАЙ!', callback_data: 'tap' }
                            ]]
                        }
                    });
                });
        } else {
            // Показываем информацию существующему пользователю
            bot.sendMessage(chatId, `🎮 Добро пожаловать обратно, ${username}!
            
💰 Баланс: ${user.balance}
⚡ Энергия: ${user.energy}

👆 Тапай кнопку ниже, чтобы заработать монеты!`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '⚛️ ТАПАЙ!', callback_data: 'tap' }
                    ]]
                }
            });
        }
    });
});

// Обработчик кнопки тапа
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    if (data === 'tap') {
        db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
            if (err || !user) {
                bot.answerCallbackQuery(query.id, { text: '❌ Ошибка загрузки данных' });
                return;
            }
            
            if (user.energy < 1) {
                bot.answerCallbackQuery(query.id, { text: '❌ Недостаточно энергии!' });
                return;
            }
            
            const earned = 10;
            const newBalance = user.balance + earned;
            const newEnergy = user.energy - 1;
            
            db.run('UPDATE users SET balance = ?, energy = ? WHERE telegram_id = ?',
                [newBalance, newEnergy, userId], (err) => {
                    if (err) {
                        bot.answerCallbackQuery(query.id, { text: '❌ Ошибка обновления' });
                        return;
                    }
                    
                    bot.answerCallbackQuery(query.id, { text: `💰 +${earned} монет!` });
                    
                    bot.editMessageText(`💰 Баланс: ${newBalance}
⚡ Энергия: ${newEnergy}

👆 Тапай еще!`, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '⚛️ ТАПАЙ!', callback_data: 'tap' }
                            ]]
                        }
                    });
                });
        });
    }
});

// Admin API
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

// Web App
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
console.log('🚀 Server starting on port:', PORT);
app.listen(PORT, () => {
    console.log('✅ Server running on port', PORT);
    console.log('🤖 Telegram bot connected');
});
