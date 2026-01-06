const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
const db = require('./backend/config/database');

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

        const [items] = await db.query('SELECT product_name, sender, grade, system_quantity FROM inventory_audit_items WHERE audit_id = ?', [audit.id]);
        console.log(`Found ${items.length} items for Audit ID ${audit.id}`);

        const appleItems = items.filter(i => i.product_name.includes('사과'));
        console.log('--- Apple Items (사과) ---');
        console.table(appleItems);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkLatestAudit();
