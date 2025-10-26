const TELEGRAM_CONFIG = {
    BOT_TOKEN: '8426192106:AAGGlkfOYAhaQKPp-bcL-3oHXBE50tzAMog',
    WEB_APP_URL: 'https://quantum-nexus.ru',
    
    // Настройки для Telegram Web App
    WEB_APP_CONFIG: {
        theme: 'dark',
        headerColor: '#1e293b',
        backgroundColor: '#0f172a',
        textColor: '#ffffff',
        buttonColor: '#00ffff',
        buttonTextColor: '#000000'
    },
    
    // Валидация Telegram Web App
    validateWebApp: function(initData) {
        try {
            const urlParams = new URLSearchParams(initData);
            const hash = urlParams.get('hash');
            urlParams.delete('hash');
            
            const dataCheckString = Array.from(urlParams.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            
            const crypto = require('crypto');
            const secretKey = crypto.createHash('sha256').update(this.BOT_TOKEN).digest();
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
            
            return calculatedHash === hash;
        } catch (error) {
            return false;
        }
    },
    
    // Извлечение данных пользователя
    extractUserData: function(initData) {
        try {
            const urlParams = new URLSearchParams(initData);
            const userParam = urlParams.get('user');
            if (!userParam) return null;
            
            const user = JSON.parse(decodeURIComponent(userParam));
            return {
                id: user.id,
                username: user.username || user.first_name,
                first_name: user.first_name,
                last_name: user.last_name,
                language_code: user.language_code
            };
        } catch (error) {
            return null;
        }
    },
    
    // Получение параметров запуска
    getLaunchParams: function(initData) {
        try {
            const urlParams = new URLSearchParams(initData);
            const startParam = urlParams.get('start_param');
            return startParam ? decodeURIComponent(startParam) : null;
        } catch (error) {
            return null;
        }
    },
    
    // Проверка реферального кода
    getReferralCode: function(initData) {
        const startParam = this.getLaunchParams(initData);
        return startParam || null;
    }
};

module.exports = TELEGRAM_CONFIG;