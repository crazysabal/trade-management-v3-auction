const db = require('./config/database');

async function test() {
    try {
        let query = 'SELECT * FROM companies WHERE 1=1';
        const params = [];
        query += ' AND company_type_flag IN (?, ?)';
        params.push('CUSTOMER', 'BOTH');
        query += ' AND is_active = ?';
        params.push(1);
        query += ' ORDER BY sort_order, company_code';

        const [rows] = await db.query(query, params);
        console.log('SUCCESS:', rows.length);
    } catch (err) {
        console.error('ERROR:', err.message);
    }
    process.exit(0);
}

test();
