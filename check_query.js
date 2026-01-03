const db = require('./backend/config/database');

async function check() {
    try {
        const startDate = '2024-01-01';
        const endDate = '2025-12-31';

        console.log("Checking Cash Flow Query...");
        const [rows1] = await db.query(`
            SELECT 
                pt.transaction_type, 
                COALESCE(pm.name, pt.payment_method, '미지정') as payment_method,
                COALESCE(SUM(pt.amount), 0) as total
            FROM payment_transactions pt
            LEFT JOIN payment_methods pm ON pt.payment_method = pm.code
            WHERE pt.transaction_date BETWEEN ? AND ?
            GROUP BY pt.transaction_type, COALESCE(pm.name, pt.payment_method, '미지정')
        `, [startDate, endDate]);
        console.log("Cash Flow Result:", rows1);

        console.log("Checking Expense Query...");
        const [rows2] = await db.query(`
            SELECT 
                COALESCE(pm.name, e.payment_method, '미지정') as payment_method,
                COALESCE(SUM(e.amount), 0) as total
            FROM expenses e
            LEFT JOIN payment_methods pm ON e.payment_method = pm.code
            WHERE e.expense_date BETWEEN ? AND ?
            GROUP BY COALESCE(pm.name, e.payment_method, '미지정')
        `, [startDate, endDate]);
        console.log("Expense Result:", rows2);

    } catch (err) {
        console.error("Query Failed:", err);
    } finally {
        process.exit();
    }
}

check();
