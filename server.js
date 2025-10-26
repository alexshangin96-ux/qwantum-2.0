const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// База данных
const db = new sqlite3.Database('game.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        balance INTEGER DEFAULT 0,
        energy INTEGER DEFAULT 100,
        last_tap INTEGER DEFAULT 0
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
            // Создаем нового пользователя
            db.run('INSERT INTO users (telegram_id, username, balance, energy) VALUES (?, ?, 0, 100)',
                [userId, username], (err) => {
                    if (err) {
                        console.error('Error creating user:', err);
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

// Web App
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
console.log('🚀 Server starting on port:', PORT);
app.listen(PORT, () => {
    console.log('✅ Server running on port', PORT);
    console.log('🤖 Telegram bot connected');
});
