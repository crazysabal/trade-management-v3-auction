const db = require('./config/database');

async function reorderCentral() {
    try {
        const connection = await db.getConnection();
        console.log('Database connected.');

        // 1. Fetch all 'Central' companies
        const [companies] = await connection.query(`
      SELECT id, alias, sort_order 
      FROM companies 
      WHERE alias LIKE '중앙%'
    `);

        console.log(`Found ${companies.length} companies starting with '중앙'.`);

        // 2. Sort them numerically based on the number in alias
        // Regex to extract number: /중앙\s*(\d+)번?/
        const sortedCompanies = companies.sort((a, b) => {
            const getNumber = (str) => {
                const match = str.match(/중앙\s*(\d+)/);
                return match ? parseInt(match[1], 10) : 999999; // Fallback for non-numeric
            };

            const numA = getNumber(a.alias);
            const numB = getNumber(b.alias);

            return numA - numB;
        });

        console.log('Sorted Order Preview (First 5):');
        sortedCompanies.slice(0, 5).forEach(c => console.log(`${c.alias}`));

        // 3. Update sort_order
        // We need to decide where to start the sort_order. 
        // Ideally, we preserve their relative range or just start from 1 if they are the main list.
        // Let's check the current min/max sort_order for these items to stay in valid range, 
        // OR just use a 1-based index if they are the primary items. 
        // Assuming we want them strictly ordered 1..N among themselves.

        // Let's shift them to start at 1000 or keep them in current "slot"? 
        // Safest is to just update them sequentially starting from 1 (or the lowest existing sort_order of the group).

        // Find min current sort order to use as base, or just reorder all companies?
        // User request is specific to "Central". 
        // I will simply assign them sort_order = index + 1, assuming distinct block.
        // To avoid collision with others, maybe large number? 
        // Actually, usually sort_order is relative. 
        // Let's use a transaction.

        await connection.beginTransaction();

        let startOrder = 1;

        for (const company of sortedCompanies) {
            await connection.query(
                'UPDATE companies SET sort_order = ? WHERE id = ?',
                [startOrder, company.id]
            );
            startOrder++;
        }

        await connection.commit();
        console.log(`Updated sort_order for ${sortedCompanies.length} companies.`);

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

reorderCentral();
