# ⚛️ Quantum Nexus - Ultra Crypto Tapper

Крипто-тапалка с добычей QuanHash на базе Node.js и Express, полностью адаптированная под Telegram Web App с полной интеграцией Telegram API.

## 🚀 Быстрый старт

### Локально

```bash
npm install
node server.js
```

Сервер запустится на `http://localhost:3000`

### На сервере Selectel

```bash
cd /var/www/quantum-nexus
git pull origin master
npm install
pm2 restart quantum-nexus
```

## 🔧 Настройка

- **Порт**: 3000 (для Node.js)
- **Nginx**: Проксирует порт 80 → 3000
- **Домен**: https://quantum-nexus.ru
- **Telegram Bot**: https://t.me/qanexus_bot
- **Bot Token**: 8426192106:AAGGlkfOYAhaQKPp-bcL-3oHXBE50tzAMog

## 📁 Структура проекта

```
quantum-nexus/
├── server.js              # Основной сервер (порт 3000)
├── package.json           # Зависимости
├── public/
│   ├── index.html         # Игровой интерфейс (Telegram Web App)
│   └── admin.html         # Админ-панель (десктоп)
└── quantum_nexus.db       # База данных SQLite
```

## 🎮 Основные функции

- ✅ **Полная интеграция Telegram Web App API**
- ✅ **Двухвалютная система** (Coins + QuanHash)
- ✅ **Система уровней и опыта**
- ✅ **Реферальная система**
- ✅ **Ежедневные бонусы**
- ✅ **Автопополнение энергии**
- ✅ **Вывод QuanHash → USDT (BEP20)**
- ✅ **VIP система**
- ✅ **Админ-панель** с полноценной статистикой
- ✅ **Подтверждение подлинности Telegram Web App**

## 🔐 Админ-панель

**URL**: https://quantum-nexus.ru/admin

**Логин**: smartfixnsk  
**Пароль**: Maga1996

## 📦 Развертывание на Selectel

1. **Подключитесь к серверу**:
```bash
ssh root@79.141.79.38
```

2. **Клонируйте репозиторий**:
```bash
cd /var/www
git clone https://github.com/alexshangin96-ux/qwantum-2.0.git quantum-nexus
cd quantum-nexus
```

3. **Установите зависимости**:
```bash
npm install
```

4. **Настройте PM2**:
```bash
pm2 start server.js --name quantum-nexus
pm2 save
pm2 startup
```

5. **Настройте Nginx**:
```bash
sudo nano /etc/nginx/sites-available/quantum-nexus
```

6. **Запустите Nginx**:
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 🔄 Обновление

```bash
cd /var/www/quantum-nexus
git pull origin master
npm install
pm2 restart quantum-nexus
```

## 🗄️ База данных

SQLite база данных создается автоматически в файле `quantum_nexus.db` при первом запуске.

**Таблицы**:
- `users` - информация о пользователях
- `mining_machines` - майнинг машины
- `daily_quests` - ежедневные задания
- `withdrawals` - вывод средств
- `transactions` - история транзакций

## 🔑 API Endpoints

### Пользователь API
- `POST /api/user/data` - Получение данных пользователя
- `POST /api/user/tap` - Тап для заработка
- `POST /api/user/recharge-energy` - Пополнение энергии
- `POST /api/user/daily-bonus` - Ежедневный бонус
- `POST /api/user/withdraw` - Вывод средств

### Админ API
- `POST /api/admin/login` - Вход в админ-панель
- `GET /api/admin/stats` - Статистика
- `GET /api/admin/users` - Список пользователей

## 📱 Telegram Integration

Полная интеграция с Telegram Web App API:
- Валидация `initData` через HMAC SHA256
- Автоматическое определение пользователя
- Haptic feedback
- Popups и alerts
- Кнопка для открытия Web App

## 📝 TODO

- [ ] Добавить больше майнинг машин
- [ ] Расширить систему достижений
- [ ] Добавить PvP режим
- [ ] Добавить гильдии
- [ ] Добавить торговлю

## 📄 License

MIT

## 👤 Автор

SmartFix - https://t.me/smartfixnsk

