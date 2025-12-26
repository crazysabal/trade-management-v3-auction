require('dotenv').config();
const db = require('./config/database');

async function runDebug() {
    // defined params for testing
    const start_date = '2025-12-24';
    const end_date = '2025-12-24';
    const params = []; // for simple test, manual params in query or use empty

    // Query 1 Partial
    const query1 = `
      SELECT 
        it.id,
        CONVERT(CASE 
          WHEN it.transaction_type = 'IN' THEN '입고'
          WHEN it.transaction_type = 'OUT' THEN '출고'
          WHEN it.transaction_type = 'ADJUST' THEN '조정'
          ELSE CONVERT(it.transaction_type USING utf8mb4)
        END USING utf8mb4) as type_label,
        CONVERT(it.transaction_type USING utf8mb4) as type,
        CONVERT(it.notes USING utf8mb4) as notes,
        CONVERT(it.created_by USING utf8mb4) as created_by,
        it.created_at,
        CONVERT(p.product_code USING utf8mb4) as product_code,
        CONVERT(p.product_name USING utf8mb4) as product_name,
        CONVERT(p.grade USING utf8mb4) as grade,
        CONVERT(p.unit USING utf8mb4) as unit,
        CONVERT(p.category USING utf8mb4) as category,
        CONVERT(c.company_name USING utf8mb4) as rel_company,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as from_warehouse_name,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as to_warehouse_name,
        CONVERT(w.name USING utf8mb4) as warehouse_name
      FROM inventory_transactions it
      INNER JOIN products p ON it.product_id = p.id
      LEFT JOIN trade_details td ON it.trade_detail_id = td.id
      LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id 
      LEFT JOIN companies c ON tm.company_id = c.id
      LEFT JOIN warehouses w ON tm.warehouse_id = w.id
      LIMIT 1
    `;

    // Query 2 Partial
    const query2 = `
      SELECT 
        wt.id,
        CONVERT('이동출고' USING utf8mb4) as type_label,
        CONVERT('TRANSFER_OUT' USING utf8mb4) as type,
        CONVERT(wt.notes USING utf8mb4) as notes,
        CONVERT(wt.created_by USING utf8mb4) as created_by,
        wt.created_at,
        CONVERT(p.product_code USING utf8mb4) as product_code,
        CONVERT(p.product_name USING utf8mb4) as product_name,
        CONVERT(p.grade USING utf8mb4) as grade,
        CONVERT(p.unit USING utf8mb4) as unit,
        CONVERT(p.category USING utf8mb4) as category,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as rel_company,
        CONVERT(w1.name USING utf8mb4) as from_warehouse_name,
        CONVERT(w2.name USING utf8mb4) as to_warehouse_name,
        CONVERT(w1.name USING utf8mb4) as warehouse_name
      FROM warehouse_transfers wt
      INNER JOIN products p ON wt.product_id = p.id
      INNER JOIN warehouses w1 ON wt.from_warehouse_id = w1.id
      INNER JOIN warehouses w2 ON wt.to_warehouse_id = w2.id
      LIMIT 1
    `;

    console.log("--- Testing Query 1 ---");
    try {
        const [rows1] = await db.query(query1);
        console.log("Q1 Success:", rows1);
    } catch (e) { console.error("Q1 Fail:", e.message); }

    console.log("--- Testing Query 2 ---");
    try {
        const [rows2] = await db.query(query2);
        console.log("Q2 Success:", rows2);
    } catch (e) { console.error("Q2 Fail:", e.message); }

    console.log("--- Testing UNION ---");
    const unionQuery = `(${query1}) UNION ALL (${query2})`;
    try {
        const [rowsU] = await db.query(unionQuery);
        console.log("UNION Success");
    } catch (e) {
        console.error("UNION Fail:", e.message);
        console.error("Code:", e.code);
    }

    process.exit();
}

runDebug();
