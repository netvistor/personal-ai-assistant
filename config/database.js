const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

class Database {
  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  async query(sql, params) {
    const connection = await this.pool.getConnection();
    try {
      const [results] = await connection.query(sql, params);
      return results;
    } finally {
      connection.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new Database();