const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/database');

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

        const [items] = await db.query('SELECT * FROM inventory_audit_items WHERE audit_id = ?', [audit.id]);
        console.log(`Found ${items.length} items for Audit ID ${audit.id}`);

        if (items.length > 0) {
            console.log('Sample Item:', items[0]);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkLatestAudit();
