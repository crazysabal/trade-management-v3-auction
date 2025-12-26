require('dotenv').config();
const db = require('./config/database');

async function checkData() {
    const today = '2025-12-25';
    console.log(`Checking data for ${today}...`);

    try {
        const [trades] = await db.query(`
            SELECT id, trade_type, trade_date, status
            FROM trade_masters 
            WHERE trade_date = ? AND trade_type = 'PURCHASE'
        `, [today]);
        console.log("Trades (PURCHASE):", JSON.stringify(trades, null, 2));

        if (trades.length > 0) {
            const tradeIds = trades.map(t => t.id);
            const [details] = await db.query(`
                SELECT id, trade_master_id, product_id, quantity 
                FROM trade_details 
                WHERE trade_master_id IN (?)
            `, [tradeIds]);
            console.log("Trade Details:", JSON.stringify(details, null, 2));

            if (details.length > 0) {
                const detailIds = details.map(d => d.id);
                const [inv] = await db.query(`
                    SELECT id, transaction_type, trade_detail_id, quantity 
                    FROM inventory_transactions 
                    WHERE trade_detail_id IN (?)
                `, [detailIds]);
                console.log("Inventory Transactions (Linked):", JSON.stringify(inv, null, 2));
            }
        }

        const [triggers] = await db.query("SHOW TRIGGERS LIKE 'trade_details'");
        console.log("Triggers on trade_details:", JSON.stringify(triggers, null, 2));

    } catch (e) {
        console.error(e);
    }
    process.exit();
}

checkData();
