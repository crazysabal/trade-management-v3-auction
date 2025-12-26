const db = require('./config/database');

async function debug_matching() {
    const trade_master_id = 149;
    console.log(`Debugging Matching for Trade ${trade_master_id}...`);
    try {
        const connection = await db.getConnection();

        // 1. Query Sale Details
        console.log('Running Query 1 (Sale Details)...');
        const [saleDetails] = await connection.query(`
      SELECT 
        td.id as sale_detail_id,
        td.seq_no,
        td.product_id,
        td.quantity,
        td.unit_price,
        td.supply_amount,
        td.notes,
        td.matching_status,
        IFNULL(
          (SELECT SUM(matched_quantity) FROM sale_purchase_matching WHERE sale_detail_id = td.id),
          0
        ) as matched_quantity,
        p.product_name,
        p.grade,
        p.weight as product_weight

      FROM trade_details td
      JOIN products p ON td.product_id = p.id
      WHERE td.trade_master_id = ?
      ORDER BY td.seq_no ASC
    `, [trade_master_id]);
        console.log(`Query 1 Success. Found ${saleDetails.length} items.`);

        // 2. Query Existing Matchings
        const saleDetailIds = saleDetails.map(d => d.sale_detail_id);
        console.log(`Sale Detail IDs: ${saleDetailIds.join(',')}`);

        if (saleDetailIds.length > 0) {
            console.log('Running Query 2 (Existing Matchings)...');
            const [matchings] = await connection.query(`
            SELECT 
            spm.id as matching_id,
            spm.sale_detail_id,
            spm.purchase_inventory_id,
            spm.matched_quantity,
            pi.purchase_date,
            pi.unit_price as purchase_unit_price,
            pi.shipper_location,
            pi.sender,
            p.product_name,
            p.grade,
            p.weight as product_weight,
            c.company_name as purchase_company
            FROM sale_purchase_matching spm
            JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
            JOIN products p ON pi.product_id = p.id
            JOIN trade_details td ON pi.trade_detail_id = td.id
            JOIN trade_masters tm ON td.trade_master_id = tm.id
            JOIN companies c ON tm.company_id = c.id
            WHERE spm.sale_detail_id IN (?)
            ORDER BY spm.id ASC
        `, [saleDetailIds]);
            console.log(`Query 2 Success. Found ${matchings.length} matchings.`);
        } else {
            console.log('Skipping Query 2 (No Sale Details).');
        }

        // 3. Query All Inventory
        console.log('Running Query 3 (All Inventory)...');
        const [allInventory] = await connection.query(`
      SELECT 
        pi.id,
        pi.product_id,
        pi.purchase_date,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.unit_price,
        pi.shipper_location,
        pi.sender,
        p.product_name,
        p.grade,
        p.weight as product_weight,
        tm.trade_number,
        c.company_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN companies c ON tm.company_id = c.id
      WHERE pi.status = 'AVAILABLE' 
        AND pi.remaining_quantity > 0
      ORDER BY pi.purchase_date ASC, pi.id ASC
    `);
        console.log(`Query 3 Success. Found ${allInventory.length} inventory items.`);

        // STRICT JSON CHECK
        try {
            const fullJson = JSON.stringify({
                items: saleDetails,
                inventory: allInventory
            });
            console.log('JSON.stringify SUCCEEDED.');
        } catch (e) {
            console.error('JSON.stringify FAILED:', e);
        }

        console.log('ALL QUERIES PASSED.');
        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('DEBUG FAILED:', error);
        process.exit(1);
    }
}

debug_matching();
