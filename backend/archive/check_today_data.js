require('dotenv').config();
const db = require('./config/database');

async function checkData() {
    const today = '2025-12-25';
    console.log(`Checking data for ${today}...`);

    console.log('\n--- Recent Trade Masters (PURCHASE) ---');
    const [trades] = await db.query(`
        SELECT id, trade_type, trade_date, status, created_at 
        FROM trade_masters 
        WHERE trade_date = ? AND trade_type = 'PURCHASE'
    `, [today]);
    console.table(trades);

    if (trades.length > 0) {
        const tradeIds = trades.map(t => t.id);
        console.log(`\n--- Trade Details- for IDs: ${tradeIds.join(',')} ---`);
        const [details] = await db.query(`
            SELECT id, trade_master_id, product_id, quantity 
            FROM trade_details 
            WHERE trade_master_id IN (?)
        `, [tradeIds]);
        console.table(details);

        if (details.length > 0) {
            const detailIds = details.map(d => d.id);
            console.log(`\n--- Inventory Transactions for Detail IDs: ${detailIds.join(',')} ---`);
            const [inv] = await db.query(`
                SELECT id, transaction_date, transaction_type, trade_detail_id, quantity 
                FROM inventory_transactions 
                WHERE trade_detail_id IN (?)
            `, [detailIds]);
            console.table(inv);
        } else {
            console.log('No trade details found.');
        }
    } else {
        console.log('No PURCHASE trades found for today.');
    }

    /* Check directly by date in inventory_transactions just in case */
    console.log(`\n--- Inventory Transactions on ${today} (All) ---`);
    const [allInv] = await db.query(`
        SELECT id, transaction_date, transaction_type, quantity, trade_detail_id
        FROM inventory_transactions 
        WHERE transaction_date = ?
    `, [today]);
    console.table(allInv);

    process.exit();
}

checkData();
