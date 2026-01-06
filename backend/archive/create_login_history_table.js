const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management'
};

async function createLoginHistoryTable() {
    try {
        const connection = await mysql.createConnection(dbConfig);

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS login_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                ip_address VARCHAR(100),
                user_agent VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;

        const [result] = await connection.execute(createTableQuery);
        console.log('Create Table Result:', result);

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

createLoginHistoryTable();
