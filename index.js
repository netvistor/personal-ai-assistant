require('dotenv').config();
const TelegramBotWrapper = require('./services/telegram.bot');

// Inicjalizacja bota
new TelegramBotWrapper();

console.log('🤖 Bot został uruchomiony...');