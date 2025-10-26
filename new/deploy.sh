#!/bin/bash

# Quantum Nexus - Deploy Script
echo "🚀 Starting deployment..."

# Перейти в папку проекта
cd /var/www/quantum-nexus || exit 1

# Остановить текущий процесс
echo "🛑 Stopping current process..."
pm2 stop quantum-nexus 2>/dev/null || true

# Обновить код из GitHub
echo "📥 Pulling latest code..."
git pull origin master

# Установить зависимости
echo "📦 Installing dependencies..."
npm install

# Запустить сервер
echo "✅ Starting server..."
pm2 start server.js --name quantum-nexus

# Сохранить конфигурацию
pm2 save

echo "🎉 Deployment completed!"
pm2 status

