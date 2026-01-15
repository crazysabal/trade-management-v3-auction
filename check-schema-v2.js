const db = require('./backend/config/database');
async function checkSchema() {
    try {
        const [rows] = await db.query('DESCRIBE trade_details');
        console.log('COLUMNS:');
        rows.forEach(r => console.log(`- ${r.Field} (${r.Type})`));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkSchema();
