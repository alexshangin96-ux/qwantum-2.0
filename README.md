# ⚛️ Quantum Nexus - Ultra Crypto Tapper

Крипто-тапалка с добычей QuanHash на базе Node.js и Express, полностью адаптированная под Telegram Web App.

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
- **Telegram Bot**: https://t.me/quantum_nexus_bot

## 📁 Структура проекта

```
quantum-nexus/
├── server.js              # Основной сервер (порт 3000)
├── public/
│   ├── index.html         # Игровой интерфейс (Telegram Web App)
│   ├── admin.html         # Админ-панель (десктоп)
│   ├── news.html          # Новости
│   └── support.html       # Поддержка
├── quantum_nexus.db       # База данных SQLite
├── package.json           # Зависимости
└── README.md              # Этот файл
```

## 🎮 Основные функции

- ✅ Двухвалютная система (Coins + QuanHash)
- ✅ Майнинг с автоминингом
- ✅ Реферальная система
- ✅ Ежедневные задания
- ✅ Ежедневные бонусы
- ✅ Вывод QuanHash → USDT (BEP20)
- ✅ Админ-панель
- ✅ Адаптация под Telegram Web App

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

5. **Настройте Nginx** (если нужно):
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
pm2 restart quantum-nexus
```

## 🗄️ База данных

SQLite база данных создается автоматически в файле `quantum_nexus.db` при первом запуске.

## 📝 TODO

- [ ] Добавить больше майнинг машин
- [ ] Расширить систему достижений
- [ ] Добавить PvP режим
- [ ] Добавить гильдии

## 📄 License

MIT

## 👤 Автор

SmartFix - https://t.me/smartfixnsk
