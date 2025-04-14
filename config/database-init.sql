CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_id BIGINT UNIQUE,
  username VARCHAR(255),
  current_model VARCHAR(50) DEFAULT 'gpt-4',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  message TEXT,
  response TEXT,
  model_used VARCHAR(50),
  tokens_used INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);


ALTER TABLE users
ADD COLUMN history_length INT DEFAULT 5;

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  session_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE conversations
ADD COLUMN session_id VARCHAR(36),
ADD INDEX idx_session (session_id);