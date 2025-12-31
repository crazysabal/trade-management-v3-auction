const db = require('./config/database');

async function test() {
    try {
        const [rows] = await db.query('SELECT * FROM trade_masters WHERE id = ?', [181]);
        if (rows.length > 0) {
            console.log('TRADE 181 FOUND:', JSON.stringify(rows[0]));
        } else {
            console.log('TRADE 181 NOT FOUND');
        }
    } catch (err) {
        console.error('ERROR:', err.message);
    }
    process.exit(0);
}

test();
