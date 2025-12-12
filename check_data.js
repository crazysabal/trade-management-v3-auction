const db = require('./backend/config/database');

async function listPaymentMethods() {
    try {
        console.log('Connecting to database...');
        const [rows] = await db.query('SELECT * FROM payment_methods');
        console.log('Payment Methods Count:', rows.length);
        console.log('Data:', JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        process.exit(1);
    }
}

listPaymentMethods();
