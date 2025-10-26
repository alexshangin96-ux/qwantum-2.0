const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
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

app.set('trust proxy', 1);

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Инициализация базы данных
const dbPath = 'quantum_nexus.db';
const db = new sqlite3.Database(dbPath);

// Создание таблиц
db.serialize(() => {
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

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        telegram_id INTEGER,
        username TEXT,
        amount INTEGER,
        usdt_address TEXT,
        status TEXT DEFAULT 'pending',
        tx_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

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

    db.run(`CREATE TABLE IF NOT EXISTS daily_logins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        login_date DATE,
        streak INTEGER DEFAULT 1,
        claimed INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER,
        referred_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users (id),
        FOREIGN KEY (referred_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS device_fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT,
        telegram_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (telegram_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ip_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT,
        telegram_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (telegram_id) REFERENCES users (id)
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_device_fingerprint ON device_fingerprints (fingerprint)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_device_telegram_id ON device_fingerprints (telegram_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ip_address ON ip_tracking (ip_address)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ip_telegram_id ON ip_tracking (telegram_id)`);
});

// Функция генерации реферального кода
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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
        console.error('Error extracting user data:', error);
        return null;
    }
}

// Функция проверки Telegram Web App (ОТКЛЮЧЕНА)
function validateTelegramWebApp(initData) {
    return true; // ВСЕГДА TRUE ДЛЯ ТЕСТИРОВАНИЯ
}

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    
    console.log('Auth check - initData:', initData ? 'present' : 'missing');
    
    // Если нет initData - создаем тестового пользователя
    if (!initData) {
        console.log('No initData - creating test user');
        req.telegramUser = {
            id: 5133414666,
            username: 'SmartFix_Nsk',
            first_name: 'SmartFix',
            last_name: 'Test'
        };
        return next();
    }
    
    // Валидация отключена
    if (!validateTelegramWebApp(initData)) {
        return res.status(401).json({ 
            error: 'Неверные данные Telegram',
            code: 'INVALID_TELEGRAM_DATA'
        });
    }
    
    // Извлекаем данные пользователя
    req.telegramUser = extractUserData(initData);
    
    if (!req.telegramUser) {
        console.log('Failed to extract user - creating test user');
        req.telegramUser = {
            id: 5133414666,
            username: 'SmartFix_Nsk',
            first_name: 'SmartFix',
            last_name: 'Test'
        };
    }
    
    console.log('User authenticated:', req.telegramUser.username);
    next();
}

// Middleware для админ авторизации
function requireAdmin(req, res, next) {
    const token = req.query.token || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token || !token.startsWith('admin_token_')) {
        return res.status(401).json({ error: 'Неавторизованный доступ' });
    }
    
    next();
}

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/news', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'news.html'));
});

app.get('/support', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'support.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Получение/создание пользователя
app.post('/api/user', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('DB error:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (user) {
            // Обновляем время входа
            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE telegram_id = ?', [userId]);
            
            // Рассчитываем оффлайн доход
            const lastLogin = new Date(user.last_login);
            const now = new Date();
            const hoursOffline = Math.min((now - lastLogin) / (1000 * 60 * 60), 3);
            
            let offlineCoins = 0;
            let offlineHash = 0;
            
            if (hoursOffline > 0) {
                offlineCoins = Math.floor(user.coins_per_hour * hoursOffline);
                offlineHash = Math.floor(user.hash_per_hour * hoursOffline);
                
                db.run('UPDATE users SET balance = balance + ?, quanhash = quanhash + ? WHERE telegram_id = ?', 
                    [offlineCoins, offlineHash, userId]);
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
            
            db.run(`INSERT INTO users (
                telegram_id, username, referral_code, tap_start_time, balance, quanhash, 
                level, experience, energy, max_energy, energy_regen_rate, coins_per_hour, 
                hash_per_hour, tap_power, auto_tap_hours, auto_tap_end_time, 
                is_banned, is_frozen, freeze_end_time, last_login, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, 
                [userId, req.telegramUser.username, referralCode, Date.now(), 
                 0, 0, 1, 0, 1000, 1000, 0.1, 0, 0, 1, 0, 0, 0, 0, 0], 
                function(err) {
                    if (err) {
                        console.error('Error creating user:', err);
                        return res.status(500).json({ error: 'Ошибка создания пользователя' });
                    }
                    
                    res.json({
                        success: true,
                        user: {
                            id: this.lastID,
                            telegram_id: userId,
                            username: req.telegramUser.username,
                            balance: 0,
                            quanhash: 0,
                            level: 1,
                            experience: 0,
                            energy: 1000,
                            max_energy: 1000,
                            offlineCoins: 0,
                            offlineHash: 0,
                            hoursOffline: 0,
                            referral_code: referralCode
                        }
                    });
                });
        }
    });
});

// Тап
app.post('/api/tap', requireAuth, async (req, res) => {
    const userId = req.telegramUser.id;
    
    try {
        db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            if (!user) {
                // Создаем пользователя с данными по умолчанию
                const referralCode = generateReferralCode();
                db.run(`INSERT INTO users (
                    telegram_id, username, referral_code, tap_start_time, balance, quanhash, 
                    level, experience, energy, max_energy, energy_regen_rate, coins_per_hour, 
                    hash_per_hour, tap_power, auto_tap_hours, auto_tap_end_time, 
                    is_banned, is_frozen, freeze_end_time, last_login, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, 
                    [userId, req.telegramUser.username || 'Unknown', referralCode, Date.now(), 
                     0, 0, 1, 0, 1000, 1000, 0.1, 0, 0, 1, 0, 0, 0, 0, 0], 
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Ошибка создания пользователя' });
                        }
                        
                        res.json({
                            success: true,
                            coinsEarned: 1,
                            experienceEarned: 0,
                            newBalance: 1,
                            newExperience: 0,
                            newLevel: 1,
                            newEnergy: 999,
                            newMaxEnergy: 1000
                        });
                    });
                return;
            }
            
            if (user.is_banned || (user.is_frozen && user.freeze_end_time > Date.now())) {
                return res.status(403).json({ error: 'Аккаунт заблокирован или заморожен' });
            }
            
            if (user.energy < 1) {
                return res.status(400).json({ error: 'Недостаточно энергии' });
            }
            
            const coinsEarned = user.tap_power;
            const experienceEarned = Math.floor(coinsEarned / 10);
            
            db.run(`UPDATE users SET 
                    balance = balance + ?, 
                    experience = experience + ?, 
                    energy = energy - 1,
                    last_login = CURRENT_TIMESTAMP
                    WHERE telegram_id = ?`, 
                [coinsEarned, experienceEarned, userId], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка обновления' });
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

// Покупка буста
app.post('/api/buy-boost', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { boostId } = req.body;
    
    const boosts = {
        'tap_power_1': { cost: 100, tap_power: 1 },
        'tap_power_5': { cost: 450, tap_power: 5 },
        'tap_power_10': { cost: 800, tap_power: 10 },
        'energy_capacity_100': { cost: 200, max_energy: 100 },
        'coins_per_hour_50': { cost: 500, coins_per_hour: 50 },
        'auto_tap_1h': { cost: 1000, auto_tap_hours: 1 }
    };
    
    const boost = boosts[boostId];
    if (!boost) {
        return res.status(400).json({ error: 'Неверный ID буста' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных' });
        }
        
        if (user.balance < boost.cost) {
            return res.status(400).json({ error: 'Недостаточно монет' });
        }
        
        let updateQuery = 'UPDATE users SET balance = balance - ?';
        let params = [boost.cost];
        
        if (boost.tap_power) {
            updateQuery += ', tap_power = tap_power + ?';
            params.push(boost.tap_power);
        }
        
        if (boost.max_energy) {
            updateQuery += ', max_energy = max_energy + ?, energy = energy + ?';
            params.push(boost.max_energy, boost.max_energy);
        }
        
        if (boost.coins_per_hour) {
            updateQuery += ', coins_per_hour = coins_per_hour + ?';
            params.push(boost.coins_per_hour);
        }
        
        if (boost.auto_tap_hours) {
            const endTime = Date.now() + (boost.auto_tap_hours * 60 * 60 * 1000);
            updateQuery += ', auto_tap_end_time = ?';
            params.push(endTime);
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
        'quantum_miner': { cost: 375000, hash_per_hour: 30 }
    };
    
    const machine = machines[machineId];
    if (!machine) {
        return res.status(400).json({ error: 'Неверный ID машины' });
    }
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных' });
        }
        
        if (user.balance < machine.cost) {
            return res.status(400).json({ error: 'Недостаточно монет' });
        }
        
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
                    message: 'Майнинг машина куплена!',
                    newBalance: user.balance - machine.cost,
                    newHashPerHour: user.hash_per_hour + machine.hash_per_hour
                });
            });
    });
});

// Получение реферальной информации
app.get('/api/referral-info', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    db.get('SELECT referral_code FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения кода' });
        }
        
        db.get('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?', [userId], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка подсчета рефералов' });
            }
            
            res.json({
                success: true,
                referralCode: user.referral_code,
                referralsCount: result.count || 0
            });
        });
    });
});

// Создание заявки на вывод
app.post('/api/submit-withdrawal', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { usdtAddress } = req.body;
    
    if (!usdtAddress || usdtAddress.length !== 42) {
        return res.status(400).json({ error: 'Неверный адрес USDT' });
    }
    
    const withdrawalAmount = 500000;
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения данных' });
        }
        
        if (user.quanhash < withdrawalAmount) {
            return res.status(400).json({ error: 'Недостаточно QuanHash' });
        }
        
        db.run(`INSERT INTO withdrawals (user_id, telegram_id, username, amount, usdt_address) 
                VALUES (?, ?, ?, ?, ?)`, 
            [userId, userId, user.username, withdrawalAmount, usdtAddress], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка создания заявки' });
                }
                
                db.run('UPDATE users SET quanhash = quanhash - ? WHERE telegram_id = ?', 
                    [withdrawalAmount, userId], (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'Ошибка списания' });
                        }
                        
                        res.json({
                            success: true,
                            message: 'Заявка на вывод создана!',
                            newBalance: user.quanhash - withdrawalAmount
                        });
                    });
            });
    });
});

// АДМИН API
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'smartfixnsk' && password === 'Maga1996') {
        res.json({ success: true, token: 'admin_token_' + Date.now() });
    } else {
        res.status(401).json({ error: 'Неверные учетные данные' });
    }
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    db.get(`SELECT 
            COUNT(*) as totalUsers,
            SUM(balance) as totalBalance,
            SUM(quanhash) as totalQuanHash
            FROM users WHERE is_banned = 0`, (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка получения статистики' });
        }
        
        res.json({
            success: true,
            totalUsers: stats.totalUsers || 0,
            totalBalance: stats.totalBalance || 0,
            totalQuanHash: stats.totalQuanHash || 0
        });
    });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all('SELECT * FROM users ORDER BY created_at DESC LIMIT 50', (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка получения пользователей' });
        }
        
        res.json({ success: true, users });
    });
});

// Cron для обновления энергии
cron.schedule('* * * * *', () => {
    db.run(`UPDATE users SET energy = MIN(energy + energy_regen_rate, max_energy) 
            WHERE is_banned = 0 AND is_frozen = 0`);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
console.log('Starting server on port:', PORT);
server.listen(PORT, () => {
    console.log(`🚀 Quantum Nexus сервер запущен на порту ${PORT}`);
    console.log(`⚛️ Квантовая тапалка готова к игре!`);
    console.log(`🌐 Домен: https://quantum-nexus.ru`);
    console.log(`🔧 Админ панель: https://quantum-nexus.ru/admin`);
});
