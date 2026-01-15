const db = require('./config/database');

async function checkSchema() {
    try {
        const [rows] = await db.query("DESCRIBE warehouse_transfers");
        console.log("COLUMNS:", rows.map(r => r.Field).join(", "));
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkSchema();
