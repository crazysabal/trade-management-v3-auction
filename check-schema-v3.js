const db = require('./backend/config/database');
async function checkSchema() {
    try {
        const [rows] = await db.query('DESCRIBE trade_details');
        const cols = rows.map(r => r.Field).join(', ');
        console.log('COLUMNS: ' + cols);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkSchema();
