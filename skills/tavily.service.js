// tavily.js
const { tavily } = require("@tavily/core");

// Inicjalizacja klienta Tavily z kluczem API
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

class TavilyService {
  constructor() {

  }

  async searchWeb(query, options = {}) {
    try {
      // console.log('Tavily query:', query);
      const response = await tvly.search(query, options);

      const html = response.results.map((result) => {
        return `${result.content}\n${result.url}\n\n`;
      }).join('');

      console.log('Tavily response:', html);
      return {
        response: response,
        responseTime: response.responseTime,
        images: response.images,
        html: html,
      };

    } catch (error) {
      console.error('Tavily API Error:', error.response?.data || error.message);
      throw new Error('Błąd podczas wyszukiwania w sieci');
    }
  }
}

module.exports = new TavilyService();