const fs = require('fs');
const path = require('path');

const backendNodeModules = path.join(__dirname, 'backend', 'node_modules');
if (fs.existsSync(backendNodeModules)) {
    module.paths.push(backendNodeModules);
}

const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

async function check() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });

    let output = '';
    const log = (msg) => { console.log(msg); output += msg + '\n'; };

    log('--- [FINAL GLOBAL SYNC] ---');

    // Clear first
    await connection.query('UPDATE inventory SET quantity = 0, weight = 0');

    // Sync from Lots
    const syncSQL = `
        INSERT INTO inventory (product_id, quantity, weight, purchase_price)
        SELECT 
            pi.product_id, 
            SUM(pi.remaining_quantity) as total_qty, 
            SUM(pi.remaining_quantity * IFNULL(p.weight, 0)) as total_weight,
            MAX(pi.unit_price) as last_price
        FROM purchase_inventory pi
        JOIN products p ON pi.product_id = p.id
        WHERE pi.status != 'DEPLETED' OR pi.remaining_quantity > 0
        GROUP BY pi.product_id
        ON DUPLICATE KEY UPDATE
            quantity = VALUES(quantity),
            weight = VALUES(weight),
            purchase_price = VALUES(purchase_price)
    `;
    await connection.query(syncSQL);
    log('Final sync completed.');

    const [inv] = await connection.query('SELECT * FROM inventory WHERE product_id = 100');
    log('Verified Inventory 100: ' + JSON.stringify(inv[0]));

    fs.writeFileSync(path.join(__dirname, 'final_audit.txt'), output + '\n' + JSON.stringify(inv[0]));
    await connection.end();
}

check().catch(console.error);
