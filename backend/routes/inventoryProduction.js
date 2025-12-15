const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * 재고 작업 (Repacking/Production) 생성
 * POST /api/inventory-production
 */
router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            ingredients,        // Array<{ inventory_id, use_quantity }>
            output_product_id,  // Result Product ID
            output_quantity,    // Result Quantity
            additional_cost,    // Extra Cost (Money)
            memo
        } = req.body;

        // Validation
        if (!ingredients || ingredients.length === 0) throw new Error('재료가 선택되지 않았습니다.');
        if (!output_product_id) throw new Error('생산할 품목이 선택되지 않았습니다.');
        if (!output_quantity || output_quantity <= 0) throw new Error('생산 수량이 유효하지 않습니다.');

        // 1. Calculate Costs & Validate Ingredients
        let totalIngredientCost = 0;
        let companyId = null; // Use the company of the first ingredient
        let warehouseId = null; // Use the warehouse of the first ingredient (Output location)

        for (const ing of ingredients) {
            const [rows] = await connection.query('SELECT * FROM purchase_inventory WHERE id = ? FOR UPDATE', [ing.inventory_id]);
            if (rows.length === 0) throw new Error(`재고 ID ${ing.inventory_id}를 찾을 수 없습니다.`);

            const inventory = rows[0];
            if (inventory.remaining_quantity < ing.use_quantity) {
                throw new Error(`재고 부족: ${inventory.product_name} (잔고: ${inventory.remaining_quantity}, 필요: ${ing.use_quantity})`);
            }

            // Cost Calculation (Weighted Average based on usage)
            // Cost = Unit Price * Used Qty
            totalIngredientCost += Number(inventory.unit_price) * Number(ing.use_quantity);

            if (!companyId) companyId = inventory.company_id;
            if (!warehouseId) warehouseId = inventory.warehouse_id;
        }

        const totalCost = totalIngredientCost + Number(additional_cost || 0);
        const newUnitPrice = totalCost / Number(output_quantity);

        // 2. Create Dummy Trade Master (To satisfy FK constraints)
        const tradeNumber = `PROD-${Date.now()}`;
        const [tradeResult] = await connection.query(
            `INSERT INTO trade_masters 
            (trade_number, trade_type, trade_date, company_id, warehouse_id, total_amount, created_by) 
            VALUES (?, 'PURCHASE', NOW(), ?, ?, ?, 'SYSTEM')`,
            [tradeNumber, companyId, warehouseId, totalCost]
        );
        const tradeMasterId = tradeResult.insertId;

        // 3. Create Trade Detail
        const [detailResult] = await connection.query(
            `INSERT INTO trade_details 
            (trade_master_id, product_id, quantity, unit_price, total_price) 
            VALUES (?, ?, ?, ?, ?)`,
            [tradeMasterId, output_product_id, output_quantity, newUnitPrice, totalCost]
        );
        const tradeDetailId = detailResult.insertId;

        // 4. Create Purchase Inventory (This is the Result Item)
        // Fetch Product Name/Grade/Weight for denormalization if needed?
        // Actually purchase_inventory doesn't store Name/Grade directly (joins), 
        // but it stores trade_detail_id, product_id, company_id.
        // Wait, earlier I saw purchase_inventory has product_id.

        // Let's Insert.
        const [invResult] = await connection.query(
            `INSERT INTO purchase_inventory 
            (trade_detail_id, product_id, company_id, warehouse_id, 
             purchase_date, original_quantity, remaining_quantity, 
             unit_price, status, created_at) 
            VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 'AVAILABLE', NOW())`,
            [tradeDetailId, output_product_id, companyId, warehouseId,
                output_quantity, output_quantity, newUnitPrice]
        );
        const newInventoryId = invResult.insertId;

        // 5. Create Inventory Production Record (The "Job" Log)
        const [prodResult] = await connection.query(
            `INSERT INTO inventory_productions 
            (output_inventory_id, additional_cost, memo) 
            VALUES (?, ?, ?)`,
            [newInventoryId, additional_cost || 0, memo]
        );
        const productionId = prodResult.insertId;

        // 6. Process Ingredients (Decrement & Log)
        for (const ing of ingredients) {
            // Decrement
            await connection.query(
                `UPDATE purchase_inventory 
                 SET remaining_quantity = remaining_quantity - ?,
                     status = CASE WHEN remaining_quantity <= 0 THEN 'DEPLETED' ELSE status END
                 WHERE id = ?`,
                [ing.use_quantity, ing.inventory_id]
            );

            // Log Ingredient usage
            await connection.query(
                `INSERT INTO inventory_production_ingredients 
                (production_id, used_inventory_id, used_quantity) 
                VALUES (?, ?, ?)`,
                [productionId, ing.inventory_id, ing.use_quantity]
            );
        }

        await connection.commit();

        res.json({
            success: true,
            message: '작업이 완료되었습니다.',
            data: {
                inventory_id: newInventoryId,
                trade_number: tradeNumber
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Production Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
