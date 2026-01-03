const db = require('./backend/config/database');

async function updateSchema() {
    const connection = await db.getConnection();
    try {
        console.log("Adding new columns to period_closings...");

        const columns = [
            'ADD COLUMN prev_inventory DECIMAL(15,2) DEFAULT 0',
            'ADD COLUMN purchase_cost DECIMAL(15,2) DEFAULT 0',
            'ADD COLUMN today_inventory DECIMAL(15,2) DEFAULT 0',

            'ADD COLUMN system_cash DECIMAL(15,2) DEFAULT 0',
            'ADD COLUMN actual_cash DECIMAL(15,2) DEFAULT 0',

            'ADD COLUMN cash_inflow DECIMAL(15,2) DEFAULT 0',
            'ADD COLUMN cash_outflow DECIMAL(15,2) DEFAULT 0',
            'ADD COLUMN cash_expense DECIMAL(15,2) DEFAULT 0'
        ];

        for (const col of columns) {
            try {
                await connection.query(`ALTER TABLE period_closings ${col}`);
                console.log(`Executed: ${col}`);
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log(`Skipped (Exists): ${col}`);
                } else {
                    console.error(`Failed: ${col}`, err.message);
                }
            }
        }

        console.log("Schema Update Complete.");

    } catch (err) {
        console.error("Schema Update Fatal Error:", err);
    } finally {
        connection.release();
        process.exit();
    }
}

updateSchema();
