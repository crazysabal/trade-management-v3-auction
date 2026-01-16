require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function createTable() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connecting to database...');

        // 1. inventory_productions (작업 마스터)
        const sqlProductions = `
            CREATE TABLE IF NOT EXISTS inventory_productions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                output_inventory_id INT NOT NULL COMMENT '생성된 결과물 재고 ID',
                additional_cost DECIMAL(15,2) DEFAULT 0 COMMENT '부자재/박스 비용 등 추가 비용 (화폐단위)',
                memo VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (output_inventory_id) REFERENCES purchase_inventory(id)
            )
        `;
        await connection.query(sqlProductions);
        console.log('Created table: inventory_productions');

        // 2. inventory_production_ingredients (작업 투입 재료)
        // Future-proof: This can link to Fruit Inventory OR Material Inventory
        const sqlIngredients = `
            CREATE TABLE IF NOT EXISTS inventory_production_ingredients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                production_id INT NOT NULL,
                used_inventory_id INT NOT NULL COMMENT '사용된 원본 재고 ID (과일 or 부자재)',
                used_quantity DECIMAL(10,2) NOT NULL COMMENT '사용된 수량',
                FOREIGN KEY (production_id) REFERENCES inventory_productions(id),
                FOREIGN KEY (used_inventory_id) REFERENCES purchase_inventory(id)
            )
        `;
        await connection.query(sqlIngredients);
        console.log('Created table: inventory_production_ingredients');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

createTable();
