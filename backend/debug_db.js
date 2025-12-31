
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'trade_management',
        port: process.env.DB_PORT || 3306
    });

    try {
        console.log('--- Checking Audit Dependencies for Trade 174 ---');

        const [rows] = await connection.query(`
            SELECT ia.id as audit_id, ia.status, iai.id as audit_item_id, iai.inventory_id
            FROM inventory_audit_items iai
            JOIN inventory_audits ia ON iai.audit_id = ia.id
            JOIN purchase_inventory pi ON iai.inventory_id = pi.id
            JOIN trade_details td ON pi.trade_detail_id = td.id
            WHERE td.trade_master_id = 174
        `);

        if (rows.length > 0) {
            console.log('FOUND DEPENDENCIES:');
            console.log(JSON.stringify(rows, null, 2));
        } else {
            console.log('No audit dependencies found for Trade 174.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

main();
