const db = require('./config/database');

(async () => {
    try {
        const [rows] = await db.query('DESCRIBE inventory_adjustments');
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit();
})();
