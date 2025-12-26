require('dotenv').config();
const db = require('./config/database');

async function repairData() {
    const today = '2025-12-25';
    console.log(`Reparing data for ${today}...`);

    try {
        // 1. Find Trade Details with NO Inventory Transactions
        const [missing] = await db.query(`
            SELECT td.id, td.trade_master_id, td.product_id, td.quantity, td.total_weight, td.unit_price,
                   tm.trade_date, tm.trade_type, tm.trade_number
            FROM trade_details td
            JOIN trade_masters tm ON td.trade_master_id = tm.id
            LEFT JOIN inventory_transactions it ON td.id = it.trade_detail_id
            WHERE tm.trade_date = ? 
              AND it.id IS NULL
              AND tm.status IN ('CONFIRMED', 'COMPLETED')
        `, [today]);

        console.log(`Found ${missing.length} missing transactions.`);

        for (const item of missing) {
            let type = '';
            let before_qty = 0;
            let after_qty = 0;

            // Fetch current inventory qty for before_qty approximation
            // Ideally we should calculate it backwards but for immediate fix, we assume current snapshot helps.
            // Actually, since it's "missing", let's just fetch current inventory or 0.
            const [inv] = await db.query('SELECT quantity FROM inventory WHERE product_id = ?', [item.product_id]);
            const currentQty = inv.length > 0 ? inv[0].quantity : 0;
            // If we assume the inventory table was UPDATED (by the old trigger or manually?)
            // Use 0 as safe default if we can't determine.
            // But valid 'before' is needed for history.
            before_qty = currentQty;

            if (item.trade_type === 'PURCHASE') {
                type = 'IN';
                after_qty = Number(before_qty) + Number(item.quantity);
            } else if (item.trade_type === 'SALE') {
                type = 'OUT';
                after_qty = Number(before_qty) - Number(item.quantity);
            } else {
                continue;
            }

            console.log(`Inserting Missing Transaction for TD ID ${item.id} (${type})`);
            await db.query(`
                INSERT INTO inventory_transactions
                (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
                 before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             `, [
                item.trade_date, type, item.product_id, item.quantity, item.total_weight || 0, item.unit_price,
                before_qty, after_qty, item.id, item.trade_number, 'system-repair'
            ]);
        }

        console.log('Repair Complete.');
    } catch (e) {
        console.error(e);
    }
    process.exit();
}

repairData();
