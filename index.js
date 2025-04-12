require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
<<<<<<< HEAD
    const textMessage = msg.text;

    bot.sendMessage(chatId, `Otrzymałem tekst: ${textMessage}`);
});
=======
    const text = msg.text;

    bot.sendMessage(chatId, `Otrzymałem tekst: ${text}`);
});
>>>>>>> task1
