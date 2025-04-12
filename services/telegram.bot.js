const TelegramBot = require('node-telegram-bot-api');
const OpenAIService = require('./openai.service');

class TelegramBotWrapper {
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    this.aiService = new OpenAIService();
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        const aiResponse = await this.aiService.generateResponse(msg.text);
        this.sendResponse(chatId, aiResponse);
      } catch (error) {
        console.error('Processing error:', error);
        this.bot.sendMessage(chatId, '❌ Wystąpił błąd podczas przetwarzania Twojej wiadomości.');
      }
    });
  }

  sendResponse(chatId, message) {
    // Telegram ma limit 4096 znaków na wiadomość
    if (message.length > 4096) {
      message = message.substring(0, 4093) + '...';
    }
    this.bot.sendMessage(chatId, message);
  }
}

module.exports = TelegramBotWrapper;