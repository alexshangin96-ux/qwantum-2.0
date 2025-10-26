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

// Логирование
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// База данных
const dbPath = 'quantum_nexus.db';
const db = new sqlite3.Database(dbPath);

// Функция генерации реферального кода
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

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
        referred_by INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        username TEXT,
        amount INTEGER,
        usdt_address TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        username TEXT,
        category TEXT,
        message TEXT,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('✅ База данных инициализирована');
});

// Middleware авторизации (всегда разрешаем для тестирования)
function requireAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
        req.telegramUser = {
            id: 5133414666,
            username: 'SmartFix_Nsk',
            first_name: 'SmartFix',
            last_name: 'Test'
        };
        return next();
    }
    
    try {
        const urlParams = new URLSearchParams(initData);
        const userParam = urlParams.get('user');
        
        if (userParam) {
            const user = JSON.parse(decodeURIComponent(userParam));
            req.telegramUser = {
                id: user.id,
                username: user.username || user.first_name,
                first_name: user.first_name,
                last_name: user.last_name
            };
        } else {
            req.telegramUser = {
                id: 5133414666,
                username: 'SmartFix_Nsk',
                first_name: 'SmartFix',
                last_name: 'Test'
            };
        }
    } catch (e) {
        req.telegramUser = {
            id: 5133414666,
            username: 'SmartFix_Nsk',
            first_name: 'SmartFix',
            last_name: 'Test'
        };
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
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (user) {
            // Обновляем время входа
            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE telegram_id = ?', [userId]);
            
            res.json({ success: true, user });
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
app.post('/api/tap', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        // Если пользователя нет - создаем
        if (!user) {
            const referralCode = generateReferralCode();
            db.run(`INSERT INTO users (
                telegram_id, username, referral_code, tap_start_time, balance, quanhash, 
                level, experience, energy, max_energy, energy_regen_rate, coins_per_hour, 
                hash_per_hour, tap_power, auto_tap_hours, auto_tap_end_time, 
                is_banned, is_frozen, freeze_end_time, last_login, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, 
                [userId, req.telegramUser.username || 'Unknown', referralCode, Date.now(), 
                 0, 0, 1, 0, 1000, 1000, 0.1, 0, 0, 1, 0, 0, 0, 0, 0]);
            
            return res.json({
                success: true,
                coinsEarned: 1,
                experienceEarned: 0,
                newBalance: 1,
                newExperience: 0,
                newLevel: 1,
                newEnergy: 999
            });
        }
        
        if (user.is_banned || (user.is_frozen && user.freeze_end_time > Date.now())) {
            return res.status(403).json({ error: 'Аккаунт заблокирован' });
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
        'coins_per_hour_50': { cost: 500, coins_per_hour: 50 }
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
            updateQuery += ', max_energy = max_energy + ?';
            params.push(boost.max_energy);
        }
        
        if (boost.coins_per_hour) {
            updateQuery += ', coins_per_hour = coins_per_hour + ?';
            params.push(boost.coins_per_hour);
        }
        
        updateQuery += ' WHERE telegram_id = ?';
        params.push(userId);
        
        db.run(updateQuery, params, (err) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка покупки буста' });
            }
            
            res.json({ success: true, message: 'Буст куплен!' });
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
                
                res.json({ success: true, message: 'Машина куплена!' });
            });
    });
});

// Реферальная информация
app.get('/api/referral-info', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    
    db.get('SELECT referral_code FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Ошибка получения кода' });
        }
        
        res.json({
            success: true,
            referralCode: user.referral_code || 'NEWUSER123',
            referralsCount: 0
        });
    });
});

// Вывод
app.post('/api/submit-withdrawal', requireAuth, (req, res) => {
    const userId = req.telegramUser.id;
    const { usdtAddress } = req.body;
    
    if (!usdtAddress || usdtAddress.length < 40) {
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
        
        db.run(`INSERT INTO withdrawals (telegram_id, username, amount, usdt_address) 
                VALUES (?, ?, ?, ?)`, 
            [userId, user.username, withdrawalAmount, usdtAddress], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка создания заявки' });
                }
                
                db.run('UPDATE users SET quanhash = quanhash - ? WHERE telegram_id = ?', 
                    [withdrawalAmount, userId], (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'Ошибка списания' });
                        }
                        
                        res.json({ success: true, message: 'Заявка создана!' });
                    });
            });
    });
});

// АДМИН ПАНЕЛЬ
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'smartfixnsk' && password === 'Maga1996') {
        res.json({ success: true, token: 'admin_token_' + Date.now() });
    } else {
        res.status(401).json({ error: 'Неверные данные' });
    }
});

function requireAdmin(req, res, next) {
    const token = req.query.token || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token || !token.startsWith('admin_token_')) {
        return res.status(401).json({ error: 'Неавторизован' });
    }
    
    next();
}

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    db.get(`SELECT 
            COUNT(*) as totalUsers,
            SUM(balance) as totalBalance,
            SUM(quanhash) as totalQuanHash
            FROM users WHERE is_banned = 0`, (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка' });
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
            return res.status(500).json({ error: 'Ошибка' });
        }
        
        res.json({ success: true, users });
    });
});

app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
    db.all('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 50', (err, withdrawals) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка' });
        }
        
        res.json({ success: true, withdrawals });
    });
});

// Cron для энергии
cron.schedule('* * * * *', () => {
    db.run(`UPDATE users SET energy = MIN(energy + energy_regen_rate, max_energy) 
            WHERE is_banned = 0`);
});

// Запуск сервера
const PORT = 3000;
console.log('Starting server on port:', PORT);
server.listen(PORT, () => {
    console.log(`🚀 Quantum Nexus запущен на порту ${PORT}`);
    console.log(`🌐 https://quantum-nexus.ru`);
    console.log(`🔧 Admin: https://quantum-nexus.ru/admin`);
});
