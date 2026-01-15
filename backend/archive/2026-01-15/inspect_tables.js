const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/database');

async function check() {
    try {
        console.log('=== trade_masters ===');
        const [mRows] = await db.query("DESCRIBE trade_masters");
        console.table(mRows);

        console.log('\n=== trade_details ===');
        const [dRows] = await db.query("DESCRIBE trade_details");
        console.table(dRows);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
