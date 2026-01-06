const db = require('./config/database');

async function test() {
    try {
        const [rows] = await db.query('SELECT * FROM companies LIMIT 1');
        console.log('SUCCESS:', rows.length);
    } catch (err) {
        console.error('ERROR:', err.message);
    }
    process.exit(0);
}

test();
