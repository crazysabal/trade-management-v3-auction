require('dotenv').config();
const db = require('./config/database');

async function repair() {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        console.log('--- Starting Inventory Repair ---');

        // 1. Find all purchase inventory items
        // We will recalculate remaining_quantity for ALL items to be safe, 
        // or at least for those where remaining > original (the symptom).
        // Let's target the problematic ones first to be efficient.

        const [candidates] = await connection.query(`
      SELECT id, product_id, original_quantity, remaining_quantity 
      FROM purchase_inventory 
      WHERE remaining_quantity > original_quantity
    `);

        console.log(`Found ${candidates.length} inflated records.`);

        for (const item of candidates) {
            // Calculate active usage from Sales
            const [saleUsage] = await connection.query(`
        SELECT COALESCE(SUM(matched_quantity), 0) as total
        FROM sale_purchase_matching
        WHERE purchase_inventory_id = ?
      `, [item.id]);

            // Calculate active usage from Production
            const [prodUsage] = await connection.query(`
        SELECT COALESCE(SUM(used_quantity), 0) as total
        FROM inventory_production_ingredients
        WHERE used_inventory_id = ?
      `, [item.id]);

            const totalUsed = parseFloat(saleUsage[0].total) + parseFloat(prodUsage[0].total);
            const correctRemaining = parseFloat(item.original_quantity) - totalUsed;

            console.log(`Repairing ID ${item.id}: Original ${item.original_quantity}, Current ${item.remaining_quantity} -> Correct ${correctRemaining}`);

            // Update
            await connection.query(`
        UPDATE purchase_inventory 
        SET remaining_quantity = ?,
            status = CASE WHEN ? <= 0 THEN 'DEPLETED' ELSE 'AVAILABLE' END
        WHERE id = ?
      `, [correctRemaining, correctRemaining, item.id]);
        }

        await connection.commit();
        console.log('--- Repair Completed Successfully ---');

    } catch (e) {
        await connection.rollback();
        console.error(e);
    } finally {
        connection.release();
        process.exit();
    }
}
repair();
