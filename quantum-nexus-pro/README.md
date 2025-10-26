# ⚛️ Quantum Nexus Pro v3.0

Next-Generation Crypto Tapper Game - Улучшенная версия с продвинутыми возможностями!

## 🚀 Основные улучшения

### ✨ Новые функции
- **Система уровней** - прокачивайтесь и получайте бонусы
- **Достижения** - разблокируйте уникальные достижения
- **Улучшенный автомайнинг** - пассивный доход QuanHash
- **Реферальная программа** - приглашайте друзей и получайте бонусы
- **Магазин улучшений** - покупайте усиления
- **WebSocket** - обновления в реальном времени
- **Ежедневные бонусы** - заходите каждый день
- **Современный UI** - красивые анимации и эффекты

### 🎮 Игровые механики
- 💰 **Coins** - основная валюта для покупок
- ⚛️ **QuanHash** - криптовалюта для вывода
- ⚡ **Энергия** - ресурс для тапов
- 🆙 **Опыт** - повышайте уровень
- 💪 **Сила тапа** - больше монет за тап

## 📦 Быстрый старт

### Установка зависимостей
```bash
npm install
```

### Запуск
```bash
npm start
```

Сервер запустится на `http://localhost:3000`

### Разработка (с автоперезагрузкой)
```bash
npm run dev
```

## 🔧 Настройка

### Telegram Bot
Измените токен бота в `server.js`:
```javascript
const botToken = 'YOUR_BOT_TOKEN';
```

### Админ-панель
**URL**: http://localhost:3000/admin

**Данные по умолчанию:**
- Логин: `smartfixnsk`
- Пароль: `Maga1996`

### База данных
SQLite база создается автоматически в `quantum_nexus_pro.db`

## 📁 Структура проекта

```
quantum-nexus-pro/
├── server.js              # Основной сервер
├── public/                # Frontend файлы
│   ├── index.html         # Игровой интерфейс
│   └── admin.html         # Админ-панель
├── quantum_nexus_pro.db   # База данных SQLite
├── package.json           # Зависимости
└── README.md              # Документация
```

## 🎯 API Endpoints

### Игровые
- `POST /api/tap` - совершить тап
- `GET /api/user/:userId` - получить данные пользователя

### Админ
- `POST /api/admin/login` - вход в админ-панель
- `GET /api/admin/stats` - статистика
- `GET /api/admin/users` - список пользователей

## 🎮 Telegram Bot Commands

- `/start` - начать игру
- Реферальная ссылка: `t.me/bot?start=USER_ID`
- Кнопки: Профиль, Майнинг, Достижения, Бонусы

## 🔐 Безопасность

- Helmet для защиты от основных уязвимостей
- CORS защита
- Compression для оптимизации
- bcrypt для хеширования паролей
- JWT для токенов админ-панели

## 🚀 Развертывание на сервере

### Nginx конфигурация
```nginx
server {
    listen 80;
    server_name quantum-nexus.ru;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### PM2 для автозапуска
```bash
pm2 start server.js --name quantum-nexus-pro
pm2 save
pm2 startup
```

## 📊 База данных

### Таблица users
- `telegram_id` - ID пользователя
- `level` - Уровень игрока
- `experience` - Опыт
- `coins` - Монеты
- `quanhash` - QuanHash
- `energy` - Энергия
- `tap_power` - Сила тапа
- `mining_level` - Уровень майнинга
- `auto_mining` - Автомайнинг вкл/выкл
- `referrer_id` - Кто пригласил
- `referrals` - Количество рефералов

### Таблица achievements
- Достижения игроков

### Таблица transactions
- История транзакций

## 🎨 Особенности UI

- Градиентный фон с анимацией
- Анимированная кнопка тапа
- Прогресс-бары для уровня
- Попап-уведомления
- Анимация монет при тапе
- Темный дизайн в стиле Quantum
- WebSocket для real-time обновлений

## 🔄 Обновление

```bash
git pull origin master
npm install
pm2 restart quantum-nexus-pro
```

## 💡 Будущие обновления

- [ ] Система PvP
- [ ] Гибльды
- [ ] Турниры
- [ ] Вывод USDT
- [ ] NFT интеграция
- [ ] Мобильное приложение

## 📝 Лицензия

MIT

## 👤 Автор

SmartFix - https://t.me/smartfixnsk

---

**Quantum Nexus Pro v3.0** - Next Generation Crypto Tapper! ⚛️

