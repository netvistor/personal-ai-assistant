const OpenAI = require("openai");
const { encode } = require("gpt-3-encoder");
const fetch = require("node-fetch");

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Dostępne modele i ich domyślne parametry
    this.supportedModels = {
      "gpt-4": {
        maxTokens: 8192,
        temperature: 0.7,
      },
      "gpt-3.5-turbo": {
        maxTokens: 4096,
        temperature: 0.7,
      },
      "gpt-4-turbo": {
        maxTokens: 128000,
        temperature: 0.7,
      },
      "gpt-4o": {
        maxTokens: 8192,
        temperature: 0.7,
      },
    };
  }

  async generateResponse(conversationHistory, options = {}) {
    const model = options.model || "gpt-3.5-turbo";
    const maxHistoryLength = options.historyLength || 5;

    if (!this.supportedModels[model]) {
      throw new Error(`Model ${model} nie jest obsługiwany`);
    }

    const modelConfig = {
      ...this.supportedModels[model],
      ...options,
    };

    const systemMessage = {
      role: "system",
      content:
        "Jesteś pomocnym asystentem. Odpowiadaj w języku użytkownika. Bądź precyzyjny i rzeczowy. Dzisiaj mamy dzień " +
        new Date().toLocaleDateString("pl-PL", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "long",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Europe/Warsaw",
        }) +
        `Kontekst: ostatnie ${maxHistoryLength} wiadomości`,
    };

    const messages = [
      systemMessage,
      ...conversationHistory.slice(-maxHistoryLength * 2),
    ];

    const usedTokens = this.countTokens(messages); // np. 90
    const maxTokens = modelConfig.maxTokens - usedTokens;

    try {
      const completion = await this.client.chat.completions.create({
        model: model,
        messages: messages,
        temperature: modelConfig.temperature,
        max_tokens: maxTokens,
      });

      return {
        content: completion.choices[0].message.content,
        model: model,
        tokensUsed: completion.usage.total_tokens,
        id: completion.id,
      };
    } catch (error) {
      console.error("OpenAI API Error:", error);
      throw new Error(`Błąd API OpenAI: ${error.message}`);
    }
  }

  getSupportedModels() {
    return Object.keys(this.supportedModels);
  }

  countTokens(messages) {
    let total = 0;

    for (const msg of messages) {
      total += encode(msg.role).length;
      total += encode(msg.content).length;
      total += 4; // narzut tokenów na strukturę wiadomości
    }

    total += 2; // narzut tokenów na zakończenie wiadomości

    return total;
  }

  async analyzeImage(imageUrl, prompt, options = {}) {
    const model = options.model || "gpt-4.1-mini"; // gpt-4o   gpt-4.1-mini
    const maxTokens = options.maxTokens || 1000;

    try {
      const response = await this.client.responses.create({
        model: model,
        input: [
          {
            role: "user",
            content: [
              { 
                type: "input_text", 
                text: prompt 
              },
              { 
                type: "input_image",
                image_url: `${imageUrl}`,
              },
              
            ],
          },
        ],
      });

      return {
        content: response.output_text, // response.choices[0].message.content,
        model: model,
        tokensUsed: response.usage.total_tokens,
      };
    } catch (error) {
      console.error("OpenAI Vision Error:", error);
      throw new Error("Błąd analizy obrazu");
    }
  }

  async downloadAndConvertImage(fileUrl) {
    try {
      const response = await fetch(fileUrl);
      const buffer = await response.buffer();
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    } catch (error) {
      console.error("Image processing error:", error);
      throw new Error("Błąd przetwarzania obrazu");
    }
  }
}

module.exports = OpenAIService;
