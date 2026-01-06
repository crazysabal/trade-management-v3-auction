const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function migrate_daily_to_period() {
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('Migrating daily_closings to period_closings...');

        // 1. Select all daily closings that are NOT already in period_closings
        const [dailyRows] = await connection.query(`
            SELECT * FROM daily_closings
        `);

        console.log(`Found ${dailyRows.length} daily records.`);

        let inserted = 0;
        for (const row of dailyRows) {
            // Check existence
            const [exist] = await connection.query(`
                SELECT id FROM period_closings 
                WHERE start_date = ? AND end_date = ?
            `, [row.closing_date, row.closing_date]);

            if (exist.length === 0) {
                // Insert as 1-day period
                // Note: daily_closings might strictly track "Cash" but "Revenue/COGS" might be implicitly stored or re-calculated.
                // The new period_closings table has revenue/cogs/etc columns.
                // Let's migrate what we can.
                // DAILY TABLE: closing_date, prev_inventory_value, today_purchase_cost, today_inventory_value,
                // calculated_cogs, gross_profit, system_cash_balance, actual_cash_balance, closing_note, closed_at

                // PERIOD TABLE requires: revenue, expenses, net_profit too.
                // We might interpret: revenue = gross_profit + cogs (approx) or just leave 0 if unknown.
                // Better: Use what we have.
                // We'll set Start = End = closing_date

                await connection.query(`
                    INSERT INTO period_closings 
                    (start_date, end_date, cogs, gross_profit, net_profit, note, closed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    row.closing_date, row.closing_date,
                    row.calculated_cogs, row.gross_profit, row.gross_profit, // Net ~ Gross if expense unknown in legacy
                    row.closing_note, row.closed_at
                ]);
                inserted++;
            }
        }

        console.log(`Migrated ${inserted} records.`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate_daily_to_period();
