const db = require('./config/database');

async function fix() {
    try {
        const id = 1868;
        const correctRemaining = 15;
        const correctStatus = 'AVAILABLE';

        console.log(`Correcting Inventory ID ${id}...`);

        const [result] = await db.query(
            `UPDATE purchase_inventory 
             SET remaining_quantity = ?, status = ? 
             WHERE id = ?`,
            [correctRemaining, correctStatus, id]
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
