require('dotenv').config({ path: '../.env' }); // Adjust path to .env if needed
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function fixSchema() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected.');

        console.log('Removing UNIQUE constraint uk_trade_detail...');
        // Try to drop the index. Using try-catch in case it doesn't exist or name is slightly different (though error confirmed it)
        try {
            await connection.query('ALTER TABLE purchase_inventory DROP INDEX uk_trade_detail');
            console.log('Successfully dropped index uk_trade_detail.');
        } catch (err) {
            if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
                console.log('Index uk_trade_detail does not exist or already dropped.');
            } else {
                throw err;
            }
        }

        console.log('Adding non-unique index idx_trade_detail for performance...');
        try {
            await connection.query('ALTER TABLE purchase_inventory ADD INDEX idx_trade_detail (trade_detail_id)');
            console.log('Successfully added index idx_trade_detail.');
        } catch (err) {
            if (err.code === 'ER_DUP_KEYNAME') {
                console.log('Index idx_trade_detail already exists.');
            } else {
                throw err;
            }
        }

        console.log('Schema fix completed successfully.');

    } catch (error) {
        console.error('Schema fix failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

fixSchema();
