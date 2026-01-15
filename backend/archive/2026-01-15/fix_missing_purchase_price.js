require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function fixMissingPurchasePrices() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);

        console.log('Finding trade details with missing purchase price...');

        // Find sales that are matched (or partial) but have no purchase_price
        const [rows] = await connection.query(`
            SELECT id, matching_status
            FROM trade_details 
            WHERE matching_status IN ('MATCHED', 'PARTIAL') 
            AND purchase_price IS NULL
        `);

        console.log(`Found ${rows.length} items to fix.`);

        let fixedCount = 0;
        let errorCount = 0;

        for (const row of rows) {
            try {
                // Calculate weighted average price
                const [avgResult] = await connection.query(`
                    SELECT SUM(spm.matched_quantity * pi.unit_price) / SUM(spm.matched_quantity) as weighted_avg_price
                    FROM sale_purchase_matching spm
                    JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
                    WHERE spm.sale_detail_id = ?
                `, [row.id]);

                const purchasePrice = avgResult[0]?.weighted_avg_price;

                if (purchasePrice !== null && purchasePrice !== undefined) {
                    await connection.query(`
                        UPDATE trade_details 
                        SET purchase_price = ? 
                        WHERE id = ?
                    `, [purchasePrice, row.id]);

                    fixedCount++;
                    // console.log(`Fixed Item ID ${row.id}: Price set to ${purchasePrice}`);
                } else {
                    console.warn(`Could not calculate price for Item ID ${row.id}`);
                }

            } catch (err) {
                console.error(`Error fixing Item ID ${row.id}:`, err);
                errorCount++;
            }
        }

        console.log('-------------------');
        console.log(`Total Found: ${rows.length}`);
        console.log(`Fixed: ${fixedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log('Done.');

    } catch (error) {
        console.error('Script error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

fixMissingPurchasePrices();
