const path = require('path');
require('dotenv').config();
const db = require('./config/database');

async function checkLatestAudit() {
    try {
        console.log('Checking latest audit...');
        const [audits] = await db.query('SELECT * FROM inventory_audits ORDER BY id DESC LIMIT 1');

        if (audits.length === 0) {
            console.log('No audits found.');
            return;
        }

        const audit = audits[0];
        console.log('Latest Audit:', audit);

        // Run the exact query from the API (with the fix) to verify
        const sql = `
            SELECT 
                ai.id,
                p.product_name,
                td.sender,
                pi.remaining_quantity
            FROM inventory_audit_items ai
            LEFT JOIN products p ON ai.product_id = p.id
            LEFT JOIN purchase_inventory pi ON ai.inventory_id = pi.id
            LEFT JOIN trade_details td ON pi.trade_detail_id = td.id
            WHERE ai.audit_id = ?
        `;

        const [items] = await db.query(sql, [audit.id]);
        console.log(`Found ${items.length} items with JOIN query`);

        const appleItems = items.filter(i => i.product_name && i.product_name.includes('사과'));
        console.log('--- Apple Items (Sender Check) ---');
        console.table(appleItems);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkLatestAudit();
