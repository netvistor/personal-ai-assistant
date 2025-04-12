const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateResponse(userMessage, options = {}) {
    const defaultOptions = {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      systemMessage: 'Jesteś pomocnym asystentem. Odpowiadaj w języku użytkownika. Bądź precyzyjny i rzeczowy. Dzisiaj mamy dzień ' + new Date().toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        }),
      maxTokens: 1000,
      ...options
    };

    try {
      const completion = await this.client.chat.completions.create({
        model: defaultOptions.model,
        messages: [
          { role: 'system', content: defaultOptions.systemMessage },
          { role: 'user', content: userMessage }
        ],
        temperature: defaultOptions.temperature,
        max_tokens: defaultOptions.maxTokens
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to generate AI response');
    }
  }
}

module.exports = OpenAIService;