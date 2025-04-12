require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const textMessage = msg.text;

    bot.sendMessage(chatId, `Otrzymałem tekst: ${textMessage}`);
});
