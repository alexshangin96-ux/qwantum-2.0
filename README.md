# ⚛️ Quantum Nexus 2.0 - Ultra Quantum Tapper

![Quantum Nexus](https://img.shields.io/badge/Quantum-Nexus-6366f1?style=for-the-badge&logo=atom&logoColor=white)
![Version](https://img.shields.io/badge/version-2.0.0-success?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

**Невероятная квантовая тапалка с ультра-современным дизайном для Telegram Web App**

🌐 **Домен:** https://quantum-nexus.ru  
🤖 **Telegram Bot:** @QuantumNexusBot  
📱 **Telegram Web App:** Полностью адаптирован под мобильные устройства

## 🚀 Особенности

### 🎮 Игровые механики
- **⚡ Система энергии** - Лимит 1000 единиц с возможностью расширения
- **💰 Двойная валюта** - Монеты для покупок, QuanHash для премиум контента
- **⛏️ Майнинг система** - Обычные машины за монеты, премиум за QuanHash
- **🔄 Автотап** - На 1, 3, 12 и 24 часа
- **📈 Пассивный доход** - Доход в час даже оффлайн (до 3 часов)
- **🃏 Коллекция карт** - С пассивным доходом
- **🏆 Лидерборды** - По монетам и QuanHash

### 🛒 Магазин бустов
- **Тап усилители** - Увеличение силы тапа
- **Энергия** - Расширение лимита и ускорение восстановления
- **Пассивный доход** - Генерация монет каждый час
- **Автотап** - Автоматический тап на разные периоды

### ⛏️ Майнинг система
- **Обычные машины** - Покупаются за монеты
- **Премиум машины** - Покупаются за QuanHash
- **Ручная добыча** - QuanHash за энергию (дорого и медленно)

### 🎯 Админ панель
- **👥 Управление пользователями** - Просмотр, редактирование, блокировка
- **💰 Управление балансами** - Добавление/отнятие монет и QuanHash
- **🔒 Модерация** - Блокировка, заморозка, разблокировка
- **🎉 События** - Глобальные сообщения и бонусы
- **📊 Аналитика** - Статистика и экспорт данных
- **⚙️ Система** - Перезапуск, бэкапы, сброс данных

## 🛠️ Технологии

- **Backend:** Node.js + Express
- **Database:** SQLite3
- **Real-time:** Socket.io
- **Frontend:** HTML5 + CSS3 + JavaScript
- **Security:** Helmet, Rate Limiting, CORS
- **Scheduling:** Node-cron для автоматических задач

## 📦 Установка

### Требования
- Node.js 16+
- npm 8+

### Быстрый старт

```bash
# Клонирование репозитория
git clone https://github.com/alexshangin96-ux/qwantum-2.0.git
cd qwantum-2.0

# Установка зависимостей
npm install

# Запуск сервера
npm start
```

### Разработка

```bash
# Запуск в режиме разработки
npm run dev
```

## ⚙️ Конфигурация

### Переменные окружения
```bash
PORT=80                    # Порт сервера (по умолчанию 80)
NODE_ENV=production        # Режим работы
```

### Telegram Bot
- **Token:** `8426192106:AAGGlkfOYAhaQKPp-bcL-3oHXBE50tzAMog`
- **Web App URL:** `https://quantum-nexus.ru`

### Админ панель
- **Логин:** `smartfixnsk`
- **Пароль:** `Maga1996`
- **URL:** `https://quantum-nexus.ru/admin`

## 🗂️ Структура проекта

```
quantum-nexus/
├── server.js              # Основной сервер
├── telegram-config.js      # Конфигурация Telegram
├── package.json           # Зависимости проекта
├── quantum_nexus.db       # База данных SQLite
├── public/                # Статические файлы
│   ├── index.html         # Главная страница игры
│   ├── admin.html         # Админ панель
│   ├── news.html          # Страница новостей
│   └── support.html       # Страница поддержки
└── README.md             # Документация
```

## 🎮 Игровые механики

### Система энергии
- **Лимит:** 1000 единиц (расширяется бустами)
- **Восстановление:** 0.1 единицы в секунду (ускоряется бустами)
- **Использование:** 1 единица за тап, 10-100 за добычу QuanHash

### Валюты
- **💰 Монеты** - Основная валюта для покупки бустов и машин
- **⛏️ QuanHash** - Криптовалюта для премиум машин и будущего листинга

### Майнинг
- **Обычные машины:** 10-1500 QuanHash/час за монеты
- **Премиум машины:** 1000-150000 QuanHash/час за QuanHash
- **Ручная добыча:** 0.1 QuanHash за 1 энергию

### Автотап
- **1 час:** 1000 монет
- **3 часа:** 2500 монет
- **12 часов:** 8000 монет
- **24 часа:** 15000 монет

## 🔧 API Endpoints

### Игровые API
- `POST /api/auth` - Авторизация пользователя
- `POST /api/tap` - Тап по кнопке
- `POST /api/buy-boost` - Покупка буста
- `POST /api/buy-mining-machine` - Покупка майнинг машины
- `POST /api/buy-premium-machine` - Покупка премиум машины
- `POST /api/mine-quanhash` - Ручная добыча QuanHash
- `POST /api/support` - Отправка сообщения в поддержку
- `GET /api/leaderboard` - Получение лидерборда
- `GET /api/events` - Получение событий

### Админ API
- `POST /api/admin/login` - Вход в админ панель
- `GET /api/admin/stats` - Статистика
- `GET /api/admin/users` - Список пользователей
- `POST /api/admin/update-balance` - Изменение баланса
- `POST /api/admin/add-quanhash` - Добавление QuanHash
- `POST /api/admin/toggle-ban` - Блокировка/разблокировка
- `POST /api/admin/freeze` - Заморозка/разморозка
- `POST /api/admin/give-bonus-all` - Массовый бонус
- `POST /api/admin/send-event` - Отправка события
- `POST /api/admin/bulk-action` - Массовые действия
- `POST /api/admin/reset-all` - Сброс всех данных
- `GET /api/admin/export-data` - Экспорт данных

## 🚀 Развертывание

### На сервере (Selectel)
```bash
# Обновление кода
git pull origin master

# Установка зависимостей
npm install

# Перезапуск PM2
pm2 restart quantum-nexus
```

### Nginx конфигурация
```nginx
server {
    listen 80;
    server_name quantum-nexus.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📊 Мониторинг

### PM2 команды
```bash
pm2 status                 # Статус процессов
pm2 logs quantum-nexus     # Логи приложения
pm2 restart quantum-nexus  # Перезапуск
pm2 stop quantum-nexus     # Остановка
pm2 delete quantum-nexus   # Удаление
```

### Логи
- **PM2 логи:** `pm2 logs quantum-nexus`
- **Nginx логи:** `/var/log/nginx/error.log`

## 🔒 Безопасность

- **Rate Limiting:** 1000 запросов в 15 минут
- **Helmet:** Защита заголовков
- **CORS:** Настроенная политика
- **Валидация Telegram:** Проверка подписи Web App
- **Анти-чит:** Серверная валидация всех действий

## 📈 Планы развития

### Фаза 1: Запуск (Январь 2025) ✅
- [x] Запуск Quantum Nexus 2.0
- [x] Система энергии и майнинга
- [x] Улучшенный UI/UX дизайн
- [x] Стабилизация серверов

### Фаза 2: Расширение (Февраль 2025) 🔄
- [ ] Система достижений и наград
- [ ] Гильдии и командная игра
- [ ] Еженедельные турниры
- [ ] Новые типы карт и бустов

### Фаза 3: Листинг (Март 2025) 📅
- [ ] Листинг QuanHash на Binance и Coinbase
- [ ] Стейкинг QuanHash
- [ ] NFT коллекции
- [ ] DeFi интеграции

### Фаза 4: Мобильные приложения (Апрель-Май 2025) 📅
- [ ] iOS приложение
- [ ] Android приложение
- [ ] Push-уведомления
- [ ] Оффлайн режим

### Фаза 5: Метавселенная (Июнь-Декабрь 2025) 📅
- [ ] 3D виртуальные миры
- [ ] Социальные функции
- [ ] Виртуальная недвижимость
- [ ] Игровые мини-игры

## 🤝 Поддержка

- **📧 Email:** support@quantum-nexus.ru
- **💬 Telegram:** @QuantumNexusSupport
- **🆘 В игре:** Раздел "Поддержка"
- **⏱️ Время ответа:** 2-48 часов в зависимости от приоритета

## 📄 Лицензия

MIT License - см. файл [LICENSE](LICENSE)

## 👥 Команда

- **👨‍💻 Александр Шангин** - Основатель и CEO
- **👩‍💼 Мария Квантова** - CTO
- **👨‍🎨 Дмитрий Нексус** - Lead Designer
- **👩‍🚀 Анна Космос** - Marketing Director

## 🙏 Благодарности

Спасибо всем игрокам Quantum Nexus за поддержку и отзывы!

---

**⚛️ Quantum Nexus - Будущее крипто-игр уже здесь!**