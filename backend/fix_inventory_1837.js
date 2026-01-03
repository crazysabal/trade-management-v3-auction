const db = require('./config/database');

async function fix() {
    try {
        const id = 1837;
        const correctOriginal = 15;
        const correctRemaining = 0;
        const correctStatus = 'DEPLETED';

        console.log(`Fixing Purchase Inventory ID ${id}...`);

        const [result] = await db.query(
            `UPDATE purchase_inventory 
             SET original_quantity = ?, remaining_quantity = ?, status = ? 
             WHERE id = ?`,
            [correctOriginal, correctRemaining, correctStatus, id]
        );

        console.log('Update Result:', result);
        console.log('Fixed successfully.');

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

fix();
