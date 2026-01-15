const db = require('./backend/config/database');
async function checkSchema() {
    try {
        const [rows] = await db.query('DESCRIBE trade_details');
        for (const r of rows) {
            console.log('COL:' + r.Field);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkSchema();
