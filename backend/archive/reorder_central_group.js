const db = require('./config/database');

async function reorderCentralGroup() {
    try {
        const connection = await db.getConnection();
        console.log('Database connected. Fetching all companies...');

        // 1. Fetch ALL companies
        const [allCompanies] = await connection.query(`
      SELECT id, alias, sort_order 
      FROM companies 
    `);

        // 2. Separate into "Central" and "Others"
        const centralCompanies = [];
        const otherCompanies = [];

        const centralRegex = /중앙\s*(\d+)번?/;

        for (const company of allCompanies) {
            if (company.alias && company.alias.startsWith('중앙')) {
                centralCompanies.push(company);
            } else {
                otherCompanies.push(company);
            }
        }

        console.log(`Found ${centralCompanies.length} Central companies and ${otherCompanies.length} Others.`);

        // 3. Sort Central companies numerically
        centralCompanies.sort((a, b) => {
            const getNumber = (str) => {
                const match = str.match(centralRegex);
                return match ? parseInt(match[1], 10) : 999999;
            };
            return getNumber(a.alias) - getNumber(b.alias);
        });

        // 4. Sort Others by their existing sort_order (to preserve stability)
        otherCompanies.sort((a, b) => {
            if (a.sort_order === b.sort_order) {
                return (a.alias || '').localeCompare(b.alias || '');
            }
            return (a.sort_order || 0) - (b.sort_order || 0);
        });

        // 5. Update sort_order for ALL 
        // Central companies get 1..N
        // Others get N+1...M

        await connection.beginTransaction();

        let currentOrder = 1;

        // Update Central Group
        console.log('Updating Central companies...');
        for (const company of centralCompanies) {
            await connection.query(
                'UPDATE companies SET sort_order = ? WHERE id = ?',
                [currentOrder, company.id]
            );
            currentOrder++;
        }

        // Update Others Group
        console.log('Updating Other companies...');
        for (const company of otherCompanies) {
            await connection.query(
                'UPDATE companies SET sort_order = ? WHERE id = ?',
                [currentOrder, company.id]
            );
            currentOrder++;
        }

        await connection.commit();
        console.log(`Successfully reordered ${allCompanies.length} companies. Central companies are now at the top.`);

        // Preview
        console.log('Top 10 Companies:');
        centralCompanies.slice(0, 5).forEach((c, i) => console.log(`${i + 1}. ${c.alias}`));
        if (otherCompanies.length > 0) {
            console.log('...');
            otherCompanies.slice(0, 3).forEach((c, i) => console.log(`${centralCompanies.length + i + 1}. ${c.alias}`));
        }

        connection.release();
    } catch (err) {
        console.error(err);
        if (db) await db.end(); // Close pool if possible, though process.exit handles it
    } finally {
        process.exit();
    }
}

reorderCentralGroup();
