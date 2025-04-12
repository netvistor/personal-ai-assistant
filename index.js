require('dotenv').config();
// Aplikacja została podzielona na różne pliki, aby poprawić czytelność i zarządzanie kodem
// klasa TelegramBotWrapper zajmuje się komunikacją z Telegramem
// w klasie TelegramBotWrapper inicjowana jest klasa OpenAIService, która zajmuje się komunikacją z OpenAI API i obsługą odpowiedzi
// W pliku index.js inicjalizowany jest bot Telegrama i uruchamiana jest aplikacja
const TelegramBotWrapper = require('./services/telegram.bot');

// Inicjalizacja bota
new TelegramBotWrapper();

console.log('🤖 Bot został uruchomiony...');