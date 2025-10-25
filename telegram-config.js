// Telegram Web App Configuration
// Этот файл содержит настройки для интеграции с Telegram

const TELEGRAM_CONFIG = {
  BOT_TOKEN: '8426192106:AAGGlkfOYAhaQKPp-bcL-3oHXBE50tzAMog',
  WEB_APP_URL: 'https://unlock-rent.online',
  
  // Настройки Web App
  WEB_APP_SETTINGS: {
    theme: 'dark',
    backgroundColor: '#667eea',
    textColor: '#ffffff',
    buttonColor: '#4ecdc4',
    buttonTextColor: '#ffffff'
  },
  
  // Команды бота
  BOT_COMMANDS: [
    { command: 'start', description: 'Начать игру Quantum Nexus' },
    { command: 'play', description: 'Открыть игру' },
    { command: 'help', description: 'Помощь по игре' },
    { command: 'referral', description: 'Получить реферальный код' }
  ]
};

// Функция для проверки подписи Telegram Web App
function validateTelegramWebAppData(initData, botToken) {
  const crypto = require('crypto');
  
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return calculatedHash === hash;
  } catch (error) {
    console.error('Ошибка валидации Telegram данных:', error);
    return false;
  }
}

module.exports = {
  TELEGRAM_CONFIG,
  validateTelegramWebAppData
};
