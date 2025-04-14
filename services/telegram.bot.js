const TelegramBot = require('node-telegram-bot-api');
const OpenAIService = require('./openai.service');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class TelegramBotWrapper {
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
    this.aiService = new OpenAIService();
    this.userSettings = new Map(); // Przechowuje ustawienia per użytkownik
    this.setupHandlers();
  }

  async setupHandlers() {

    // Inicjalizacja bazy danych
    await this.initializeDatabase();
    
    this.bot.onText(/\/model (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const modelName = match[1].toLowerCase();
      
      if (this.aiService.getSupportedModels().includes(modelName)) {
        this.userSettings.set(chatId, { model: modelName });
        this.bot.sendMessage(chatId, `✅ Model zmieniony na: ${modelName}`);
      } else {
        const availableModels = this.aiService.getSupportedModels().join(', ');
        this.bot.sendMessage(chatId, `❌ Nieobsługiwany model. Dostępne opcje:\n${availableModels}`);
      }
    });

    // Nowa komenda do ustawienia długości historii
    this.bot.onText(/\/history_length (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const length = parseInt(match[1]);
        
        if (length > 0 && length <= 20) {
            await db.query(
            'UPDATE users SET history_length = ? WHERE chat_id = ?',
            [length, chatId]
            );
            this.bot.sendMessage(chatId, `✅ Pamięć konwersacji ustawiona na ${length} ostatnich wiadomości`);
        } else {
            this.bot.sendMessage(chatId, '❌ Nieprawidłowa wartość. Podaj liczbę między 1 a 20');
        }
    });

    // Komenda do rozpoczynania nowej sesji
    this.bot.onText(/\/new_session/, async (msg) => {
        const chatId = msg.chat.id;
        const sessionId = uuidv4();
        await this.createNewSession(chatId, sessionId);
        this.bot.sendMessage(chatId, '🔄 Rozpoczęto nową sesję konwersacyjną');
    });

    // Obsługa komendy /models
    this.bot.onText(/\/models/, (msg) => {
      const chatId = msg.chat.id;
      const modelsList = this.aiService.getSupportedModels()
        .map(m => `• ${m}`)
        .join('\n');
      this.bot.sendMessage(chatId, `📚 Dostępne modele:\n${modelsList}`);
    });

    // Obsługa zwykłych wiadomości
    this.bot.on('message', async (msg) => {
      if (msg.text.startsWith('/')) return;
      
      const chatId = msg.chat.id;
      const userSettings = this.userSettings.get(chatId) || {};
      const user = await this.getOrCreateUser(chatId, msg.from.username);
      const sessionId = await this.getCurrentSessionId(user.id);

      try {
        // Pobierz historię konwersacji
        const history = await this.getConversationHistory(user.id, sessionId, user.history_length);
        
        // Generuj odpowiedź z pamięcią kontekstu
        const response = await this.aiService.generateResponse(
            [...history, { role: 'user', content: msg.text }],
            {
                model: user.current_model,
                historyLength: user.history_length
            }
        );

        // Zapisz konwersację
        await this.saveConversation(user.id, sessionId, msg.text, response);
        
        this.sendResponse(chatId, response.content);
      } catch (error) {
        console.error('Processing error:', error);
        this.bot.sendMessage(chatId, `❌ Błąd: ${error.message}`);
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

  async initializeDatabase() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id BIGINT UNIQUE,
        username VARCHAR(255),
        current_model VARCHAR(50) DEFAULT 'gpt-4',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        message TEXT,
        response TEXT,
        model_used VARCHAR(50),
        tokens_used INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  }

  async getOrCreateUser(chatId, username) {
    const [user] = await db.query(
      'SELECT * FROM users WHERE chat_id = ?', 
      [chatId]
    );

    if (!user) {
      const [result] = await db.query(
        'INSERT INTO users (chat_id, username) VALUES (?, ?)',
        [chatId, username]
      );
      return { id: result.insertId, chat_id: chatId, current_model: 'gpt-4' };
    }

    return user;
  }

  async updateUserModel(chatId, modelName) {
    await db.query(
      'UPDATE users SET current_model = ? WHERE chat_id = ?',
      [modelName, chatId]
    );
  }

  async createNewSession(userId, sessionId) {
    await db.query(
      'INSERT INTO sessions (user_id, session_id) VALUES (?, ?)',
      [userId, sessionId]
    );
    return sessionId;
  }

  async getCurrentSessionId(userId) {
    const [session] = await db.query(
      `SELECT session_id FROM sessions 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );
    return session ? session.session_id : await this.createNewSession(userId, uuidv4());
  }

  async getConversationHistory(userId, sessionId, limit) {

    let query = 
    `SELECT role, content FROM (
      SELECT 'user' as role, message as content, created_at 
      FROM conversations 
      WHERE user_id = ? AND session_id = ?
      UNION ALL
      SELECT 'assistant' as role, response as content, created_at 
      FROM conversations 
      WHERE user_id = ? AND session_id = ?
     ) AS combined
     ORDER BY created_at DESC
     LIMIT ?`;

    // const [messages, metadata] 
    const messages = await db.query(query, [userId, sessionId, userId, sessionId, limit * 2]);
    
    if (!messages) return [];
    if (messages.length <= 1) return [];

    let msg = Array.isArray(messages) ? messages.reverse().map(m => ({
        role: m.role,
        content: m.content
    })) : [];
    
    return msg;
  }

  async saveConversation(userId, sessionId, message, response) {
    await db.query(
      `INSERT INTO conversations 
       (user_id, session_id, message, response, model_used, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, sessionId, message, response.content, response.model, response.tokensUsed]
    );
  }
}

module.exports = TelegramBotWrapper;