const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

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
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 1000, // лимит запросов
    message: 'Слишком много запросов, попробуйте позже'
});
app.use('/api/', limiter);

// Инициализация базы данных
const db = new sqlite3.Database('quantum_nexus.db');

// Создание таблиц
db.serialize(() => {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        balance INTEGER DEFAULT 0,
        quanhash INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        energy INTEGER DEFAULT 1000,
        max_energy INTEGER DEFAULT 1000,
        energy_regen_rate REAL DEFAULT 0.1,
        coins_per_hour INTEGER DEFAULT 0,
        hash_per_hour INTEGER DEFAULT 0,
        tap_power INTEGER DEFAULT 1,
        auto_tap_hours INTEGER DEFAULT 0,
        auto_tap_end_time INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        is_frozen INTEGER DEFAULT 0,
        freeze_end_time INTEGER DEFAULT 0,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        referral_code TEXT,
        referred_by INTEGER,
        achievements TEXT DEFAULT '[]',
        cards TEXT DEFAULT '[]',
        mining_machines TEXT DEFAULT '[]',
        premium_machines TEXT DEFAULT '[]',
        boosts TEXT DEFAULT '[]',
        tap_history TEXT DEFAULT '[]',
        last_tap_time INTEGER DEFAULT 0,
        tap_count INTEGER DEFAULT 0,
        tap_start_time INTEGER DEFAULT 0
    )`);

    // Таблица достижений
    db.run(`CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        achievement_id TEXT,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Таблица карт
    db.run(`CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        card_id TEXT,
        level INTEGER DEFAULT 1,
        passive_income REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Таблица майнинг машин
    db.run(`CREATE TABLE IF NOT EXISTS mining_machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        machine_id TEXT,
        level INTEGER DEFAULT 1,
        hash_per_hour REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Таблица событий
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        type TEXT,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
    )`);

    // Таблица поддержки
    db.run(`CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        telegram_id INTEGER,
        username TEXT,
        category TEXT,
        message TEXT,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Таблица ежедневных заданий
    db.run(`CREATE TABLE IF NOT EXISTS daily_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        task_id TEXT,
        task_type TEXT,
        progress INTEGER DEFAULT 0,
        target INTEGER DEFAULT 1,
        completed INTEGER DEFAULT 0,
        claimed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Таблица ежедневных входов
    db.run(`CREATE TABLE IF NOT EXISTS daily_logins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        login_date DATE,
        streak INTEGER DEFAULT 1,
        claimed INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Таблица рефералов
    db.run(`CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER,
        referred_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users (id),
        FOREIGN KEY (referred_id) REFERENCES users (id)
    )`);

    // Таблица для отслеживания мультиаккаунтов
    db.run(`CREATE TABLE IF NOT EXISTS device_fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT UNIQUE,
        telegram_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (telegram_id) REFERENCES users (id)
    )`);

    // Таблица для отслеживания IP адресов
    db.run(`CREATE TABLE IF NOT EXISTS ip_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT,
        telegram_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (telegram_id) REFERENCES users (id)
    )`);
});

// Функция генерации отпечатка устройства
function generateDeviceFingerprint(req) {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const connection = req.headers['connection'] || '';
    
    const fingerprint = crypto.createHash('sha256')
        .update(userAgent + acceptLanguage + acceptEncoding + connection)
        .digest('hex');
    
    return fingerprint;
}

// Функция проверки мультиаккаунтов
function checkMultiAccount(telegramId, fingerprint, ipAddress, callback) {
    // Проверяем отпечаток устройства
    db.get('SELECT telegram_id FROM device_fingerprints WHERE fingerprint = ? AND telegram_id != ?', 
        [fingerprint, telegramId], (err, deviceResult) => {
            if (err) {
                return callback(err, false);
            }
            
            if (deviceResult) {
                return callback(null, true); // Найден мультиаккаунт по отпечатку
            }
            
            // Проверяем IP адрес
            db.get('SELECT telegram_id FROM ip_tracking WHERE ip_address = ? AND telegram_id != ?', 
                [ipAddress, telegramId], (err, ipResult) => {
                    if (err) {
                        return callback(err, false);
                    }
                    
                    if (ipResult) {
                        return callback(null, true); // Найден мультиаккаунт по IP
                    }
                    
                    callback(null, false); // Мультиаккаунт не найден
                });
        });
}

// Функция сохранения отпечатка устройства и IP
function saveDeviceInfo(telegramId, fingerprint, ipAddress) {
    // Сохраняем отпечаток устройства
    db.run(`INSERT OR REPLACE INTO device_fingerprints (fingerprint, telegram_id, last_seen) 
            VALUES (?, ?, CURRENT_TIMESTAMP)`, [fingerprint, telegramId]);
    
    // Сохраняем IP адрес
    db.run(`INSERT OR REPLACE INTO ip_tracking (ip_address, telegram_id, last_seen) 
            VALUES (?, ?, CURRENT_TIMESTAMP)`, [ipAddress, telegramId]);
}

// Функция проверки Telegram Web App
function validateTelegramWebApp(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const secretKey = crypto.createHash('sha256').update('8426192106:AAGGlkfOYAhaQKPp-bcL-3oHXBE50tzAMog').digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        return calculatedHash === hash;
    } catch (error) {
        return false;
    }
}

// Функция извлечения данных пользователя из Telegram
function extractUserData(initData) {
    try {
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

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData || !validateTelegramWebApp(initData)) {
        return res.status(401).json({ error: 'Неавторизованный доступ' });
    }
    
    req.telegramUser = extractUserData(initData);
    
    // Проверяем мультиаккаунты
    const fingerprint = generateDeviceFingerprint(req);
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    
    checkMultiAccount(req.telegramUser.id, fingerprint, ipAddress, (err, isMultiAccount) => {
        if (err) {
            console.error('Ошибка проверки мультиаккаунта:', err);
            return next();
        }
        
        if (isMultiAccount) {
            return res.status(403).json({ 
                error: 'Обнаружена подозрительная активность. Доступ ограничен.',
                code: 'MULTI_ACCOUNT_DETECTED'
            });
        }
        
        // Сохраняем информацию об устройстве
        saveDeviceInfo(req.telegramUser.id, fingerprint, ipAddress);
        next();
    });
}

// Middleware для админ авторизации
function requireAdmin(req, res, next) {
    const token = req.query.token || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token || !token.startsWith('admin_token_')) {
        return res.status(401).json({ error: 'Неавторизованный доступ' });
    }
    
    next();
}

// Функция проверки анти-кликера
function checkAntiClicker(userId, tapTime) {
    return new Promise((resolve, reject) => {
        db.get('SELECT tap_history, last_tap_time, tap_count, tap_start_time FROM users WHERE telegram_id = ?', [userId], (err, user) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!user) {
                reject(new Error('Пользователь не найден'));
                return;
            }
            
            const now = Date.now();
            const timeSinceLastTap = now - (user.last_tap_time || 0);
            
            // Проверка на слишком быстрый тап (менее 100мс)
            if (timeSinceLastTap < 100) {
                reject(new Error('Слишком быстрый тап! Подозрение на автокликер.'));
                return;
            }
            
            // Проверка на паттерны автокликера
            const tapHistory = JSON.parse(user.tap_history || '[]');
            const recentTaps = tapHistory.filter(tap => now - tap < 10000); // Последние 10 секунд
            
            if (recentTaps.length > 20) {
                reject(new Error('Обнаружена подозрительная активность!'));
                return;
            }
            
            // Обновляем историю тапов
            tapHistory.push(now);
            const updatedHistory = tapHistory.slice(-50); // Храним только последние 50 тапов
            
            db.run('UPDATE users SET tap_history = ?, last_tap_time = ?, tap_count = tap_count + 1 WHERE telegram_id = ?', 
                [JSON.stringify(updatedHistory), now, userId], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(true);
                    }
                });
        });
    });
}

// API Routes

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница новостей
app.get('/news', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'news.html'));
});

// Страница поддержки
app.get('/support', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'support.html'));
});

// Админ панель
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Регистрация/авторизация пользователя
app.post('/api/auth', (req, res) => {
    const { initData } = req.body;
    
    if (!initData || !validateTelegramWebApp(initData)) {
        return res.status(401).json({ error: 'Неверные данные Telegram' });
    }
    
    const telegramUser = extractUserData(initData);
    if (!telegramUser) {
        return res.status(400).json({ error: 'Не удалось извлечь данные пользователя' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramUser.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (user) {
            // Обновляем время последнего входа
            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE telegram_id = ?', [telegramUser.id]);
            
            // Рассчитываем оффлайн доход
            const lastLogin = new Date(user.last_login);
            const now = new Date();
            const hoursOffline = Math.min((now - lastLogin) / (1000 * 60 * 60), 3); // Максимум 3 часа
            
            let offlineCoins = 0;
            let offlineHash = 0;
            
            if (hoursOffline > 0) {
                offlineCoins = Math.floor(user.coins_per_hour * hoursOffline);
                offlineHash = Math.floor(user.hash_per_hour * hoursOffline);
                
                // Обновляем баланс
                db.run('UPDATE users SET balance = balance + ?, quanhash = quanhash + ? WHERE telegram_id = ?', 
                    [offlineCoins, offlineHash, telegramUser.id]);
            }
            
            res.json({
                success: true,
                user: {
                    ...user,
                    offlineCoins,
                    offlineHash,
                    hoursOffline: Math.round(hoursOffline * 10) / 10
                }
            });
        } else {
            // Создаем нового пользователя
            const referralCode = generateReferralCode();
            const referredBy = req.body.referralCode ? 
                db.get('SELECT id FROM users WHERE referral_code = ?', [req.body.referralCode]) : null;
            
            db.run(`INSERT INTO users (telegram_id, username, referral_code, referred_by, tap_start_time) 
                    VALUES (?, ?, ?, ?, ?)`, 
                [telegramUser.id, telegramUser.username, referralCode, referredBy?.id || null, Date.now()], 
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка создания пользователя' });
                    }
                    
                    res.json({
                        success: true,
                        user: {
                            id: this.lastID,
                            telegram_id: telegramUser.id,
                            username: telegramUser.username,
                            balance: 0,
                            quanhash: 0,
                            level: 1,
                            experience: 0,
                            energy: 1000,
                            max_energy: 1000,
                            energy_regen_rate: 0.1,
                            coins_per_hour: 0,
                            hash_per_hour: 0,
                            tap_power: 1,
                            auto_tap_hours: 0,
                            auto_tap_end_time: 0,
                            is_banned: 0,
                            is_frozen: 0,
                            freeze_end_time: 0,
                            referral_code: referralCode,
                            offlineCoins: 0,
                            offlineHash: 0,
                            hoursOffline: 0
                        }
                    });
                });
        }
    });
});

// Тап с улучшенной защитой от автокликера
app.post('/api/tap', requireAuth, async (req, res) => {
    const userId = req.telegramUser.id;
    
    try {
        // Проверяем анти-кликер
        await checkAntiClicker(userId, Date.now());
        
        db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
            if (err || !user) {
                return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
            }
            
            if (user.is_banned) {
                return res.status(403).json({ error: 'Аккаунт заблокирован' });
            }
            
            if (user.is_frozen && user.freeze_end_time > Date.now()) {
                return res.status(403).json({ error: 'Аккаунт заморожен' });
            }
            
            // Проверяем энергию
            if (user.energy < 1) {
                return res.status(400).json({ error: 'Недостаточно энергии' });
            }
            
            // Рассчитываем доход
            const coinsEarned = user.tap_power;
            const experienceEarned = Math.floor(coinsEarned / 10);
            
            // Обновляем данные пользователя
            db.run(`UPDATE users SET 
                    balance = balance + ?, 
                    experience = experience + ?, 
                    energy = energy - 1,
                    last_login = CURRENT_TIMESTAMP
                    WHERE telegram_id = ?`, 
                [coinsEarned, experienceEarned, userId], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка обновления данных' });
                    }
                    
                    res.json({
                        success: true,
                        coinsEarned,
                        experienceEarned,
                        newBalance: user.balance + coinsEarned,
                        newExperience: user.experience + experienceEarned,
                        newEnergy: user.energy - 1
                    });
                });
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Покупка буста с расширенным списком
app.post('/api/buy-boost', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { boostId, boostType } = req.body;
    
    // Расширенный список бустов
    const boosts = {
        // Тап усилители
        'tap_power_1': { cost: 100, effect: { tap_power: 1 }, coins_per_hour: 0 },
        'tap_power_2': { cost: 200, effect: { tap_power: 2 }, coins_per_hour: 0 },
        'tap_power_5': { cost: 450, effect: { tap_power: 5 }, coins_per_hour: 0 },
        'tap_power_10': { cost: 800, effect: { tap_power: 10 }, coins_per_hour: 0 },
        'tap_power_20': { cost: 1500, effect: { tap_power: 20 }, coins_per_hour: 0 },
        'tap_power_50': { cost: 3000, effect: { tap_power: 50 }, coins_per_hour: 0 },
        'tap_power_100': { cost: 6000, effect: { tap_power: 100 }, coins_per_hour: 0 },
        'tap_power_200': { cost: 12000, effect: { tap_power: 200 }, coins_per_hour: 0 },
        'tap_power_500': { cost: 25000, effect: { tap_power: 500 }, coins_per_hour: 0 },
        'tap_power_1000': { cost: 50000, effect: { tap_power: 1000 }, coins_per_hour: 0 },
        
        // Энергия
        'energy_capacity_100': { cost: 200, effect: { max_energy: 100 }, coins_per_hour: 0 },
        'energy_capacity_200': { cost: 400, effect: { max_energy: 200 }, coins_per_hour: 0 },
        'energy_capacity_500': { cost: 800, effect: { max_energy: 500 }, coins_per_hour: 0 },
        'energy_capacity_1000': { cost: 1500, effect: { max_energy: 1000 }, coins_per_hour: 0 },
        'energy_regen_01': { cost: 300, effect: { energy_regen_rate: 0.1 }, coins_per_hour: 0 },
        'energy_regen_02': { cost: 600, effect: { energy_regen_rate: 0.2 }, coins_per_hour: 0 },
        'energy_regen_05': { cost: 1200, effect: { energy_regen_rate: 0.5 }, coins_per_hour: 0 },
        'energy_regen_1': { cost: 2000, effect: { energy_regen_rate: 1.0 }, coins_per_hour: 0 },
        'energy_regen_2': { cost: 4000, effect: { energy_regen_rate: 2.0 }, coins_per_hour: 0 },
        'energy_regen_5': { cost: 8000, effect: { energy_regen_rate: 5.0 }, coins_per_hour: 0 },
        
        // Пассивный доход
        'coins_per_hour_50': { cost: 500, effect: {}, coins_per_hour: 50 },
        'coins_per_hour_100': { cost: 900, effect: {}, coins_per_hour: 100 },
        'coins_per_hour_200': { cost: 1600, effect: {}, coins_per_hour: 200 },
        'coins_per_hour_500': { cost: 3000, effect: {}, coins_per_hour: 500 },
        'coins_per_hour_1000': { cost: 6000, effect: {}, coins_per_hour: 1000 },
        'coins_per_hour_2000': { cost: 12000, effect: {}, coins_per_hour: 2000 },
        'coins_per_hour_5000': { cost: 25000, effect: {}, coins_per_hour: 5000 },
        'coins_per_hour_10000': { cost: 50000, effect: {}, coins_per_hour: 10000 },
        'coins_per_hour_20000': { cost: 100000, effect: {}, coins_per_hour: 20000 },
        'coins_per_hour_50000': { cost: 200000, effect: {}, coins_per_hour: 50000 },
        
        // Автотап
        'auto_tap_1h': { cost: 1000, effect: { auto_tap_hours: 1 }, coins_per_hour: 0 },
        'auto_tap_3h': { cost: 2500, effect: { auto_tap_hours: 3 }, coins_per_hour: 0 },
        'auto_tap_6h': { cost: 4500, effect: { auto_tap_hours: 6 }, coins_per_hour: 0 },
        'auto_tap_12h': { cost: 8000, effect: { auto_tap_hours: 12 }, coins_per_hour: 0 },
        'auto_tap_24h': { cost: 15000, effect: { auto_tap_hours: 24 }, coins_per_hour: 0 },
        'auto_tap_48h': { cost: 28000, effect: { auto_tap_hours: 48 }, coins_per_hour: 0 },
        'auto_tap_72h': { cost: 50000, effect: { auto_tap_hours: 72 }, coins_per_hour: 0 },
        'auto_tap_168h': { cost: 100000, effect: { auto_tap_hours: 168 }, coins_per_hour: 0 },
        'auto_tap_720h': { cost: 500000, effect: { auto_tap_hours: 720 }, coins_per_hour: 0 },
        'auto_tap_infinite': { cost: 1000000, effect: { auto_tap_hours: 999999 }, coins_per_hour: 0 }
    };
    
    const boost = boosts[boostId];
    if (!boost) {
        return res.status(400).json({ error: 'Неверный ID буста' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        if (user.balance < boost.cost) {
            return res.status(400).json({ error: 'Недостаточно монет' });
        }
        
        // Обновляем данные пользователя
        let updateQuery = 'UPDATE users SET balance = balance - ?';
        let params = [boost.cost];
        
        if (boost.effect.tap_power) {
            updateQuery += ', tap_power = tap_power + ?';
            params.push(boost.effect.tap_power);
        }
        
        if (boost.effect.max_energy) {
            updateQuery += ', max_energy = max_energy + ?, energy = energy + ?';
            params.push(boost.effect.max_energy, boost.effect.max_energy);
        }
        
        if (boost.effect.energy_regen_rate) {
            updateQuery += ', energy_regen_rate = energy_regen_rate + ?';
            params.push(boost.effect.energy_regen_rate);
        }
        
        if (boost.coins_per_hour) {
            updateQuery += ', coins_per_hour = coins_per_hour + ?';
            params.push(boost.coins_per_hour);
        }
        
        if (boost.effect.auto_tap_hours) {
            const endTime = Date.now() + (boost.effect.auto_tap_hours * 60 * 60 * 1000);
            updateQuery += ', auto_tap_hours = ?, auto_tap_end_time = ?';
            params.push(boost.effect.auto_tap_hours, endTime);
        }
        
        updateQuery += ' WHERE telegram_id = ?';
        params.push(userId);
        
        db.run(updateQuery, params, (err) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка покупки буста' });
            }
            
            res.json({
                success: true,
                message: 'Буст успешно куплен!',
                newBalance: user.balance - boost.cost
            });
        });
    });
});

// Покупка майнинг машины
app.post('/api/buy-mining-machine', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { machineId } = req.body;
    
    const machines = {
        'basic_miner': { cost: 25000, hash_per_hour: 2 },
        'advanced_miner': { cost: 125000, hash_per_hour: 10 },
        'quantum_miner': { cost: 375000, hash_per_hour: 30 },
        'nexus_miner': { cost: 1250000, hash_per_hour: 100 },
        'ultra_miner': { cost: 3750000, hash_per_hour: 300 },
        'cosmic_miner': { cost: 12500000, hash_per_hour: 1000 },
        'divine_miner': { cost: 37500000, hash_per_hour: 3000 },
        'infinite_miner': { cost: 125000000, hash_per_hour: 10000 },
        'legendary_miner': { cost: 375000000, hash_per_hour: 30000 },
        'mythical_miner': { cost: 1250000000, hash_per_hour: 100000 }
    };
    
    const machine = machines[machineId];
    if (!machine) {
        return res.status(400).json({ error: 'Неверный ID машины' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        if (user.balance < machine.cost) {
            return res.status(400).json({ error: 'Недостаточно монет' });
        }
        
        // Обновляем данные пользователя
        db.run(`UPDATE users SET 
                balance = balance - ?, 
                hash_per_hour = hash_per_hour + ?
                WHERE telegram_id = ?`, 
            [machine.cost, machine.hash_per_hour, userId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка покупки машины' });
                }
                
                res.json({
                    success: true,
                    message: 'Майнинг машина успешно куплена!',
                    newBalance: user.balance - machine.cost,
                    newHashPerHour: user.hash_per_hour + machine.hash_per_hour
                });
            });
    });
});

// Покупка премиум майнинг машины за QuanHash
app.post('/api/buy-premium-machine', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { machineId } = req.body;
    
    const premiumMachines = {
        'quantum_core': { cost: 25000, hash_per_hour: 200 },
        'nexus_core': { cost: 125000, hash_per_hour: 1000 },
        'ultra_core': { cost: 375000, hash_per_hour: 3000 },
        'infinity_core': { cost: 1250000, hash_per_hour: 10000 },
        'cosmic_core': { cost: 3750000, hash_per_hour: 30000 },
        'divine_core': { cost: 12500000, hash_per_hour: 100000 },
        'eternal_core': { cost: 37500000, hash_per_hour: 300000 },
        'legendary_core': { cost: 125000000, hash_per_hour: 1000000 },
        'mythical_core': { cost: 375000000, hash_per_hour: 3000000 },
        'omnipotent_core': { cost: 1250000000, hash_per_hour: 10000000 }
    };
    
    const machine = premiumMachines[machineId];
    if (!machine) {
        return res.status(400).json({ error: 'Неверный ID премиум машины' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        if (user.quanhash < machine.cost) {
            return res.status(400).json({ error: 'Недостаточно QuanHash' });
        }
        
        // Обновляем данные пользователя
        db.run(`UPDATE users SET 
                quanhash = quanhash - ?, 
                hash_per_hour = hash_per_hour + ?
                WHERE telegram_id = ?`, 
            [machine.cost, machine.hash_per_hour, userId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка покупки премиум машины' });
                }
                
                res.json({
                    success: true,
                    message: 'Премиум майнинг машина успешно куплена!',
                    newQuanHash: user.quanhash - machine.cost,
                    newHashPerHour: user.hash_per_hour + machine.hash_per_hour
                });
            });
    });
});

// Добыча QuanHash за энергию
app.post('/api/mine-quanhash', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { energyAmount } = req.body;
    
    if (!energyAmount || energyAmount < 10 || energyAmount > 100) {
        return res.status(400).json({ error: 'Неверное количество энергии (10-100)' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        if (user.energy < energyAmount) {
            return res.status(400).json({ error: 'Недостаточно энергии' });
        }
        
        // Рассчитываем добычу QuanHash (дорого и медленно)
        const hashEarned = Math.floor(energyAmount * 0.1); // 0.1 QuanHash за 1 энергию
        
        // Обновляем данные пользователя
        db.run(`UPDATE users SET 
                quanhash = quanhash + ?, 
                energy = energy - ?
                WHERE telegram_id = ?`, 
            [hashEarned, energyAmount, userId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка добычи QuanHash' });
                }
                
                res.json({
                    success: true,
                    message: 'QuanHash успешно добыт!',
                    hashEarned,
                    newQuanHash: user.quanhash + hashEarned,
                    newEnergy: user.energy - energyAmount
                });
            });
    });
});

// Отправка сообщения в поддержку
app.post('/api/support', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { category, message } = req.body;
    
    if (!category || !message) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    db.get('SELECT username FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        db.run(`INSERT INTO support_tickets (user_id, telegram_id, username, category, message) 
                VALUES (?, ?, ?, ?, ?)`, 
            [userId, userId, user?.username || 'Unknown', category, message], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка отправки сообщения' });
                }
                
                // Здесь можно добавить отправку email на alex.shangin96@gmail.com
                console.log(`Support ticket from ${user?.username}: ${category} - ${message}`);
                
                res.json({
                    success: true,
                    message: 'Сообщение отправлено в поддержку!'
                });
            });
    });
});

// Получение лидерборда
app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    
    db.all(`SELECT username, balance, quanhash, level FROM users 
            WHERE is_banned = 0 ORDER BY balance DESC LIMIT ?`, 
        [limit], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения лидерборда' });
            }
            
            res.json({ success: true, leaderboard: rows });
        });
});

// Получение событий
app.get('/api/events', (req, res) => {
    db.all(`SELECT * FROM events WHERE expires_at > datetime('now') ORDER BY created_at DESC LIMIT 5`, 
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения событий' });
            }
            
            res.json({ success: true, events: rows });
        });
});

// АДМИН ПАНЕЛЬ API

// Админ авторизация
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'smartfixnsk' && password === 'Maga1996') {
        res.json({ success: true, token: 'admin_token_' + Date.now() });
    } else {
        res.status(401).json({ error: 'Неверные учетные данные' });
    }
});

// Статистика админки
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    db.get(`SELECT 
            COUNT(*) as totalUsers,
            SUM(balance) as totalBalance,
            SUM(quanhash) as totalQuanHash,
            COUNT(CASE WHEN last_login > datetime('now', '-1 hour') THEN 1 END) as activeSessions
            FROM users WHERE is_banned = 0`, (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка получения статистики' });
        }
        
        res.json({
            success: true,
            totalUsers: stats.totalUsers || 0,
            totalBalance: stats.totalBalance || 0,
            totalQuanHash: stats.totalQuanHash || 0,
            activeSessions: stats.activeSessions || 0
        });
    });
});

// Получение всех пользователей
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    db.all(`SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`, 
        [limit, offset], (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения пользователей' });
            }
            
            res.json({ success: true, users });
        });
});

// Обновление баланса пользователя
app.post('/api/admin/update-balance', requireAdmin, (req, res) => {
    const { userId, amount } = req.body;
    
    if (!userId || !amount) {
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, userId], function(err) {
        if (err) {
            res.status(500).json({ error: 'Ошибка обновления баланса' });
        } else {
            res.json({ success: true, affectedRows: this.changes });
        }
    });
});

// Добавление QuanHash пользователю
app.post('/api/admin/add-quanhash', requireAdmin, (req, res) => {
    const { userId, amount } = req.body;
    
    if (!userId || !amount) {
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    db.run('UPDATE users SET quanhash = quanhash + ? WHERE id = ?', [amount, userId], function(err) {
        if (err) {
            res.status(500).json({ error: 'Ошибка добавления QuanHash' });
        } else {
            res.json({ success: true, affectedRows: this.changes });
        }
    });
});

// Переключение блокировки
app.post('/api/admin/toggle-ban', requireAdmin, (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    db.get('SELECT is_banned FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const newBanStatus = user.is_banned ? 0 : 1;
        
        db.run('UPDATE users SET is_banned = ? WHERE id = ?', [newBanStatus, userId], function(err) {
            if (err) {
                res.status(500).json({ error: 'Ошибка изменения статуса блокировки' });
            } else {
                res.json({ success: true, banned: newBanStatus === 1 });
            }
        });
    });
});

// Заморозка/разморозка пользователя
app.post('/api/admin/freeze', requireAdmin, (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    db.get('SELECT is_frozen FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const newFreezeStatus = user.is_frozen ? 0 : 1;
        const freezeEndTime = newFreezeStatus ? Date.now() + (24 * 60 * 60 * 1000) : 0; // 24 часа
        
        db.run('UPDATE users SET is_frozen = ?, freeze_end_time = ? WHERE id = ?', 
            [newFreezeStatus, freezeEndTime, userId], function(err) {
                if (err) {
                    res.status(500).json({ error: 'Ошибка изменения статуса заморозки' });
                } else {
                    res.json({ success: true, frozen: newFreezeStatus === 1 });
                }
            });
    });
});

// Дать бонус всем игрокам
app.post('/api/admin/give-bonus-all', requireAdmin, (req, res) => {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Неверная сумма бонуса' });
    }
    
    db.run('UPDATE users SET balance = balance + ?', [amount], function(err) {
        if (err) {
            res.status(500).json({ error: 'Ошибка выдачи бонуса' });
        } else {
            res.json({ success: true, affectedRows: this.changes });
        }
    });
});

// Отправка события
app.post('/api/admin/send-event', requireAdmin, (req, res) => {
    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'Неверное сообщение' });
    }
    
    db.run(`INSERT INTO events (title, description, type, expires_at) 
            VALUES (?, ?, 'global', datetime('now', '+7 days'))`, 
        ['Глобальное уведомление', message], function(err) {
            if (err) {
                res.status(500).json({ error: 'Ошибка создания события' });
            } else {
                res.json({ success: true, eventId: this.lastID });
            }
        });
});

// Массовые действия
app.post('/api/admin/bulk-action', requireAdmin, (req, res) => {
    const { userIds, action, amount } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    let updateQuery = '';
    let params = [];
    
    switch (action) {
        case 'ban':
            updateQuery = 'UPDATE users SET is_banned = 1 WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = userIds;
            break;
        case 'unban':
            updateQuery = 'UPDATE users SET is_banned = 0 WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = userIds;
            break;
        case 'freeze':
            updateQuery = 'UPDATE users SET is_frozen = 1, freeze_end_time = ? WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = [Date.now() + (24 * 60 * 60 * 1000), ...userIds];
            break;
        case 'unfreeze':
            updateQuery = 'UPDATE users SET is_frozen = 0, freeze_end_time = 0 WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = userIds;
            break;
        case 'bonus_coins':
            if (!amount) return res.status(400).json({ error: 'Не указана сумма' });
            updateQuery = 'UPDATE users SET balance = balance + ? WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = [amount, ...userIds];
            break;
        case 'bonus_hash':
            if (!amount) return res.status(400).json({ error: 'Не указана сумма' });
            updateQuery = 'UPDATE users SET quanhash = quanhash + ? WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = [amount, ...userIds];
            break;
        case 'reset':
            updateQuery = 'UPDATE users SET balance = 0, quanhash = 0, level = 1, experience = 0 WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = userIds;
            break;
        case 'level_up':
            if (!amount) return res.status(400).json({ error: 'Не указан уровень' });
            updateQuery = 'UPDATE users SET level = level + ? WHERE id IN (' + userIds.map(() => '?').join(',') + ')';
            params = [amount, ...userIds];
            break;
        default:
            return res.status(400).json({ error: 'Неверное действие' });
    }
    
    db.run(updateQuery, params, function(err) {
        if (err) {
            res.status(500).json({ error: 'Ошибка выполнения массового действия' });
        } else {
            res.json({ success: true, affectedRows: this.changes });
        }
    });
});

// Сброс всех данных
app.post('/api/admin/reset-all', requireAdmin, (req, res) => {
    db.serialize(() => {
        db.run('DELETE FROM users');
        db.run('DELETE FROM achievements');
        db.run('DELETE FROM cards');
        db.run('DELETE FROM mining_machines');
        db.run('DELETE FROM events');
        db.run('DELETE FROM support_tickets');
        
        res.json({ success: true, message: 'Все данные сброшены' });
    });
});

// Экспорт данных
app.get('/api/admin/export-data', requireAdmin, (req, res) => {
    db.all('SELECT * FROM users', (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка экспорта данных' });
        }
        
        res.json({ success: true, users });
    });
});

// НОВЫЕ API ENDPOINTS

// Получение ежедневных заданий
app.get('/api/daily-tasks', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    // Генерируем случайные задания на сегодня
    const taskTypes = [
        { id: 'tap_100', title: 'Тап-мастер', description: 'Сделайте 100 тапов', target: 100, reward: '+500 монет' },
        { id: 'tap_500', title: 'Тап-эксперт', description: 'Сделайте 500 тапов', target: 500, reward: '+1000 монет' },
        { id: 'tap_1000', title: 'Тап-легенда', description: 'Сделайте 1000 тапов', target: 1000, reward: '+2000 монет' },
        { id: 'mine_energy', title: 'Энергетик', description: 'Потратьте 50 энергии на добычу', target: 50, reward: '+100 QuanHash' },
        { id: 'buy_boost', title: 'Покупатель', description: 'Купите любой буст', target: 1, reward: '+300 монет' },
        { id: 'level_up', title: 'Развитие', description: 'Повысьте уровень', target: 1, reward: '+1000 монет' }
    ];
    
    // Выбираем 3 случайных задания
    const selectedTasks = taskTypes.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    const tasks = selectedTasks.map(task => {
        const progress = Math.floor(Math.random() * task.target);
        const completed = progress >= task.target;
        
        return {
            id: task.id,
            title: task.title,
            description: task.description,
            target: task.target,
            current: Math.min(progress, task.target),
            progress: Math.min((progress / task.target) * 100, 100),
            reward: task.reward,
            completed: completed
        };
    });
    
    res.json({ success: true, tasks });
});

// Получение награды за задание
app.post('/api/claim-task', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { taskId } = req.body;
    
    const taskRewards = {
        'tap_100': { coins: 500, hash: 0 },
        'tap_500': { coins: 1000, hash: 0 },
        'tap_1000': { coins: 2000, hash: 0 },
        'mine_energy': { coins: 0, hash: 100 },
        'buy_boost': { coins: 300, hash: 0 },
        'level_up': { coins: 1000, hash: 0 }
    };
    
    const reward = taskRewards[taskId];
    if (!reward) {
        return res.status(400).json({ error: 'Неверный ID задания' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        db.run(`UPDATE users SET 
                balance = balance + ?, 
                quanhash = quanhash + ?
                WHERE telegram_id = ?`, 
            [reward.coins, reward.hash, userId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка выдачи награды' });
                }
                
                res.json({
                    success: true,
                    message: `Награда получена: ${reward.coins > 0 ? '+' + reward.coins + ' монет' : ''}${reward.hash > 0 ? '+' + reward.hash + ' QuanHash' : ''}`,
                    newBalance: user.balance + reward.coins,
                    newQuanHash: user.quanhash + reward.hash
                });
            });
    });
});

// Получение ежедневного бонуса за вход
app.post('/api/claim-login-bonus', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const today = new Date().toISOString().split('T')[0];
    
    db.get('SELECT * FROM daily_logins WHERE user_id = ? AND login_date = ?', [userId, today], (err, login) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка проверки входа' });
        }
        
        if (login && login.claimed) {
            return res.status(400).json({ error: 'Бонус уже получен сегодня' });
        }
        
        // Рассчитываем стрик
        db.get('SELECT MAX(streak) as max_streak FROM daily_logins WHERE user_id = ?', [userId], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка расчета стрика' });
            }
            
            const streak = (result.max_streak || 0) + 1;
            const bonus = Math.min(100 + (streak * 50), 2000); // От 100 до 2000 монет
            
            db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
                if (err || !user) {
                    return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
                }
                
                db.run(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`, [bonus, userId], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка выдачи бонуса' });
                    }
                    
                    // Сохраняем информацию о входе
                    if (login) {
                        db.run('UPDATE daily_logins SET claimed = 1 WHERE user_id = ? AND login_date = ?', [userId, today]);
                    } else {
                        db.run('INSERT INTO daily_logins (user_id, login_date, streak, claimed) VALUES (?, ?, ?, 1)', [userId, today, streak]);
                    }
                    
                    res.json({
                        success: true,
                        message: `Ежедневный бонус получен: +${bonus} монет (стрик: ${streak} дней)`,
                        newBalance: user.balance + bonus,
                        newStreak: streak
                    });
                });
            });
        });
    });
});

// Получение реферальной информации
app.get('/api/referral-info', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    db.get('SELECT referral_code FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения реферального кода' });
        }
        
        db.get('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?', [userId], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка подсчета рефералов' });
            }
            
            const referralsCount = result.count || 0;
            const referralEarnings = referralsCount * 1000; // 1000 монет за каждого реферала
            
            res.json({
                success: true,
                referralCode: user.referral_code,
                referralsCount: referralsCount,
                referralEarnings: referralEarnings
            });
        });
    });
});

// НОВЫЕ API ENDPOINTS ДЛЯ СИСТЕМЫ ВЫВОДА

// Получение информации о выводе
app.get('/api/withdrawal-info', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    db.get('SELECT quanhash FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения баланса' });
        }
        
        res.json({
            success: true,
            balance: user.quanhash
        });
    });
});

// История выводов
app.get('/api/withdrawal-history', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    db.all('SELECT * FROM withdrawals WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 10', [userId], (err, withdrawals) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка получения истории выводов' });
        }
        
        res.json({
            success: true,
            history: withdrawals || []
        });
    });
});

// Создание заявки на вывод
app.post('/api/submit-withdrawal', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { usdtAddress } = req.body;
    
    if (!usdtAddress || !usdtAddress.startsWith('0x') || usdtAddress.length !== 42) {
        return res.status(400).json({ error: 'Неверный формат USDT адреса' });
    }
    
    const withdrawalAmount = 500000; // Фиксированная сумма
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных пользователя' });
        }
        
        if (user.quanhash < withdrawalAmount) {
            return res.status(400).json({ error: 'Недостаточно QuanHash для вывода' });
        }
        
        // Создаем заявку на вывод
        db.run(`INSERT INTO withdrawals (user_id, telegram_id, username, amount, usdt_address) 
                VALUES (?, ?, ?, ?, ?)`, 
            [userId, userId, user.username, withdrawalAmount, usdtAddress], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка создания заявки на вывод' });
                }
                
                // Списываем QuanHash
                db.run('UPDATE users SET quanhash = quanhash - ? WHERE telegram_id = ?', 
                    [withdrawalAmount, userId], (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'Ошибка списания QuanHash' });
                        }
                        
                        res.json({
                            success: true,
                            message: 'Заявка на вывод создана! Ожидайте обработки.',
                            newBalance: user.quanhash - withdrawalAmount
                        });
                    });
            });
    });
});

// АДМИН API ДЛЯ ВЫВОДОВ

// Получение всех заявок на вывод
app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    db.all(`SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT ? OFFSET ?`, 
        [limit, offset], (err, withdrawals) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения заявок на вывод' });
            }
            
            res.json({ success: true, withdrawals });
        });
});

// Обновление статуса заявки на вывод
app.post('/api/admin/update-withdrawal', requireAdmin, (req, res) => {
    const { withdrawalId, status, txHash } = req.body;
    
    if (!withdrawalId || !status) {
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    const validStatuses = ['pending', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неверный статус' });
    }
    
    let updateQuery = 'UPDATE withdrawals SET status = ?';
    let params = [status];
    
    if (status === 'completed' && txHash) {
        updateQuery += ', processed_at = CURRENT_TIMESTAMP, tx_hash = ?';
        params.push(txHash);
    } else if (status === 'failed') {
        updateQuery += ', processed_at = CURRENT_TIMESTAMP';
    }
    
    updateQuery += ' WHERE id = ?';
    params.push(withdrawalId);
    
    db.run(updateQuery, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Ошибка обновления статуса заявки' });
        }
        
        res.json({ success: true, affectedRows: this.changes });
    });
});

// Получение заявок поддержки для админа
app.get('/api/admin/support-tickets', requireAdmin, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    db.all(`SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ? OFFSET ?`, 
        [limit, offset], (err, tickets) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения заявок поддержки' });
            }
            
            res.json({ success: true, tickets });
        });
});

// Обновление статуса заявки поддержки
app.post('/api/admin/update-support-ticket', requireAdmin, (req, res) => {
    const { ticketId, status } = req.body;
    
    if (!ticketId || !status) {
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неверный статус' });
    }
    
    db.run('UPDATE support_tickets SET status = ? WHERE id = ?', [status, ticketId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Ошибка обновления статуса заявки' });
        }
        
        res.json({ success: true, affectedRows: this.changes });
    });
});

// Socket.IO для реального времени
io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
    });
});

// Cron задачи
// Обновление энергии каждую минуту
cron.schedule('* * * * *', () => {
    db.run(`UPDATE users SET energy = MIN(energy + energy_regen_rate, max_energy) 
            WHERE is_banned = 0 AND is_frozen = 0`);
});

// Автотап каждые 5 минут
cron.schedule('*/5 * * * *', () => {
    db.run(`UPDATE users SET balance = balance + tap_power * 5 
            WHERE auto_tap_end_time > ? AND is_banned = 0 AND is_frozen = 0`, 
        [Date.now()]);
});

// Очистка истекших автотапов
cron.schedule('0 * * * *', () => {
    db.run(`UPDATE users SET auto_tap_hours = 0, auto_tap_end_time = 0 
            WHERE auto_tap_end_time < ?`, [Date.now()]);
});

// Очистка истекших заморозок
cron.schedule('0 * * * *', () => {
    db.run(`UPDATE users SET is_frozen = 0, freeze_end_time = 0 
            WHERE freeze_end_time < ? AND freeze_end_time > 0`, [Date.now()]);
});

// Запуск сервера
const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
    console.log(`🚀 Quantum Nexus сервер запущен на порту ${PORT}`);
    console.log(`⚛️ Квантовая тапалка готова к игре!`);
    console.log(`🌐 Домен: https://quantum-nexus.ru`);
    console.log(`🔧 Админ панель: https://quantum-nexus.ru/admin`);
});