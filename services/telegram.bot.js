const TelegramBot = require('node-telegram-bot-api');
const OpenAIService = require('./openai.service');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const fetch = require("node-fetch");
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

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

      this.bot.on('note', async (msg) => {
        const chatId = msg.chat.id;
        console.log('Note command received:', msg);
        this.bot.sendMessage(chatId, `👋 Note przesłane`)
      });
    
      // Obsługa wiadomości głosowych
      this.bot.on('voice', async (msg) => {
        console.log('Voice received:', msg);
        await this.processVoiceMessage(msg);
      });
    

    // Obsługa zwykłych wiadomości
    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;
      console.log('Message received:', msg);
      await this.processMessage(msg);
      /*
      if (!msg.text || msg.text.startsWith('/')) return;

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
      */
    });

    // Obsługa komendy /vision
    this.bot.onText(/\/vision (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const prompt = match[1];
      
      if (msg.reply_to_message && msg.reply_to_message.photo) {
        await this.processImage(chatId, msg.reply_to_message, prompt);
      } else {
        this.bot.sendMessage(chatId, '❌ Odpowiedz na zdjęcie komendą /vision <prompt>');
      }
    });

    // Obsługa zwykłych zdjęć
    this.bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(chatId, '🖼 Otrzymałem zdjęcie! Użyj komendy /vision <prompt> odpowiadając na to zdjęcie, aby je przeanalizować.');
    });

    // end of setupHandlers
  }

  sendResponse(chatId, message) {
    // Telegram ma limit 4096 znaków na wiadomość
    if (message.length > 4096) {
      message = message.substring(0, 4093) + '...';
    }
    this.bot.sendMessage(chatId, message);
  }

  async processMessage(msg)
  {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    // const userSettings = this.userSettings.get(chatId) || {};
    const user = await this.getOrCreateUser(chatId, msg.from.username);
    const sessionId = await this.getCurrentSessionId(user.id);

    console.log('user.current_model', user.current_model);

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

  async processImage(chatId, msg, prompt) {
    try {
      const user = await this.getOrCreateUser(chatId, msg.from.username);
      const sessionId = await this.getCurrentSessionId(user.id);
      
      // Pobierz największą dostępną wersję zdjęcia
      const photo = msg.photo[msg.photo.length - 1];
      const fileInfo = await this.bot.getFile(photo.file_id);
      const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${fileInfo.file_path}`;

      // Sprawdź rozmiar obrazu
      if (fileInfo.file_size > process.env.MAX_IMAGE_SIZE * 1024 * 1024) {
        this.bot.sendMessage(chatId, `❌ Obraz jest zbyt duży (max ${process.env.MAX_IMAGE_SIZE}MB)`);
        return;
      }

      // Sprawdź rozszerzenie pliku
      const allowedExtensions = ['jpg', 'jpeg']; //, 'png', 'webp'
      const fileExtension = this.getFileExtension(fileInfo.file_path);

      if (!fileExtension || !allowedExtensions.includes(fileExtension.toLowerCase())) {
        return this.bot.sendMessage(
          chatId,
          `❌ Nieobsługiwany format pliku. Dozwolone formaty: ${allowedExtensions.join(', ')}`
        );
      }

      const response2 = await fetch(imageUrl);
      const arrayBuffer = await response2.arrayBuffer();
      const buffer2 = Buffer.from(arrayBuffer);

      // Sprawdź magiczne liczby
      const isFormatValid = this.validateImageFormat(buffer2, fileExtension);

      if (!isFormatValid) {
        return this.bot.sendMessage(
          chatId,
          `❌ Nieprawidłowa zawartość pliku dla rozszerzenia .${fileExtension}`
        );
      }

      // Analiza obrazu
      const analysis = await this.aiService.analyzeImage(
        await this.aiService.downloadAndConvertImage(imageUrl),
        prompt || 'Co widzisz na tym obrazku?'
      );

      // Zapisz główną konwersację
      const conversationResult = await db.query(
        `INSERT INTO conversations 
          (user_id, message, response, model_used, tokens_used, has_image, compilation_id, session_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, prompt, analysis.content, analysis.model, analysis.tokensUsed, true, chatId, sessionId]
      );

      // Zapisz szczegóły obrazu
      await db.query(
        `INSERT INTO images 
          (conversation_id, file_id, file_path, analysis) 
          VALUES (?, ?, ?, ?)`,
        [conversationResult.id, photo.file_id, fileInfo.file_path, analysis.content]
      );

      this.sendResponse(chatId, `📸 Analiza obrazu (${analysis.model}):\n${analysis.content}`);
    } catch (error) {
      console.error('Image processing error:', error);
      this.bot.sendMessage(chatId, '❌ Błąd analizy obrazu');
    }
    
  }

  getFileExtension(filePath) {
    return filePath?.split('.').pop()?.toLowerCase().split(/[#?]/)[0];
  }

  validateImageFormat(buffer, extension) {
    const fileSignature = buffer.slice(0, 12);
    
    const signatures = {
      jpg: [0xFF, 0xD8, 0xFF],
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
      webp: {
        header: [0x52, 0x49, 0x46, 0x46], // "RIFF"
        format: [0x57, 0x45, 0x42, 0x50]  // "WEBP"
      }
    };

    switch(extension) {
      case 'jpg':
      case 'jpeg':
        return this.checkSignature(fileSignature, signatures.jpg, 3);
      
      case 'png':
        return this.checkSignature(fileSignature, signatures.png, 8);
      
      case 'webp':
        const isHeaderValid = this.checkSignature(fileSignature, signatures.webp.header, 4);
        const isFormatValid = this.checkSignature(fileSignature.slice(8,12), signatures.webp.format, 4);
        return isHeaderValid && isFormatValid;
      
      default:
        return false;
    }
  }

  checkSignature(buffer, expectedBytes, length) {
    const signature = Buffer.from(expectedBytes);
    return buffer.slice(0, length).equals(signature);
  }

  async processVoiceMessage(msg) {
    const chatId = msg.chat.id;
    const tempDir = './temp_audio';
    const model = 'whisper-1';

    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const fileId = msg.voice.file_id;
      const fileInfo = await this.bot.getFile(fileId);
      const audioUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      
      // Pobierz plik
      const response = await fetch(audioUrl);
      const buffer = await response.buffer();
      const oggPath = path.join(tempDir, `${fileId}.ogg`);
      fs.writeFileSync(oggPath, buffer);

      // Konwertuj do MP3
      const mp3Path = path.join(tempDir, `${fileId}.mp3`);
      await this.aiService.convertAudio(oggPath, mp3Path);

      // Transkrybuj
      const transcription = await this.aiService.transcribeAudio(mp3Path, model);

      // Zapisz do bazy
      await this.saveAudioToDatabase(fileId, fileInfo.file_path, mp3Path, transcription, model, chatId, msg);

      
      this.sendResponse(chatId, `🎤 Transkrypcja:\n${transcription.text}`);
      
      msg.text = transcription.text;
      console.log('msg.text z voice', msg.text);
      await this.processMessage(msg);

    } catch (error) {
      console.error('Voice processing error:', error);
      this.bot.sendMessage(chatId, `❌ Błąd: ${error.message}`);
    } finally {
      this.cleanTempFiles(tempDir);
    }
  }

  async saveAudioToDatabase(fileId, originalPath, convertedPath, transcription, model, chatId, msg) {
      
    const user = await this.getOrCreateUser(chatId, msg.from.username);
    const sessionId = await this.getCurrentSessionId(user.id);

    const conversationResult = await db.query(
      `INSERT INTO conversations 
        (user_id, message, response, model_used, tokens_used, has_image, compilation_id, session_id, has_audio) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [user.id, originalPath, transcription.text, model, 0 , false, chatId, sessionId]
    );
    //transcription.segments[0].tokens
    await db.query(
      `INSERT INTO audio 
        (conversation_id, file_id, file_path, transcription)
        VALUES (?, ?, ?, ?)`,
      [conversationResult.id, fileId, convertedPath, transcription.text]
    );
  }

  cleanTempFiles(dir) {
    // ... czyszczenie plików tymczasowych ...
  }

}

module.exports = TelegramBotWrapper;