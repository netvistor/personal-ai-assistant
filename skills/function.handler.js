const tavilyService = require('./tavily.service');

const availableFunctions = {
  search_web: {
    description: 'Jeśli użytkownik poprosi o wyszukuje informacje w internecie w czasie rzeczywistym',
    parameters: {
      query: {
        type: 'string',
        description: 'Fraza do wyszukania'
      }
    },
    execute: async ({ query }) => {
      return await tavilyService.searchWeb(query, {includeAnswer: "basic"});
    }
  }
};

module.exports = {
  getFunctionDefinitions: () => {
    return Object.entries(availableFunctions).map(([name, config]) => ({
      name,
      description: config.description,
      parameters: {
        type: 'object',
        properties: config.parameters,
        required: Object.keys(config.parameters)
      }
    }));
  },

  executeFunction: async (name, args) => {
    if (!availableFunctions[name]) {
      throw new Error(`Funkcja ${name} nie istnieje`);
    }
    return await availableFunctions[name].execute(args);
  }
};