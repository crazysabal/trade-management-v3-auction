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
            sender,             // [NEW] Result Sender
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
            VALUES (?, 'PRODUCTION', NOW(), ?, ?, ?, 'SYSTEM')`,
            [tradeNumber, companyId, warehouseId, totalCost]
        );
        const tradeMasterId = tradeResult.insertId;

        // 3. Create Trade Detail
        const [detailResult] = await connection.query(
            `INSERT INTO trade_details 
            (trade_master_id, seq_no, product_id, quantity, unit_price, supply_amount, tax_amount, total_amount, sender) 
            VALUES (?, 1, ?, ?, ?, ?, 0, ?, ?)`,
            [tradeMasterId, output_product_id, output_quantity, newUnitPrice, totalCost, totalCost, sender]
        );
        const tradeDetailId = detailResult.insertId;

        // 4. Create Purchase Inventory (This is the Result Item)
        // [NEW] Handle display_order inheritance/shift (Based on FIRST ingredient)
        let targetDisplayOrder = null;
        if (ingredients.length > 0) {
            const firstIng = ingredients[0];
            const [sourceRows] = await connection.query('SELECT id, display_order, remaining_quantity FROM purchase_inventory WHERE id = ?', [firstIng.inventory_id]);
            if (sourceRows.length > 0) {
                const source = sourceRows[0];
                if (source.display_order !== null) {
                    const isFullConsumption = Number(source.remaining_quantity) === Number(firstIng.use_quantity);
                    if (isFullConsumption) {
                        // Inherit the order of the primary ingredient
                        targetDisplayOrder = source.display_order;
                    } else {
                        // Partial consumption: Shift items that logically follow the source
                        // (either higher display_order OR same display_order with higher ID)
                        await connection.query(
                            'UPDATE purchase_inventory SET display_order = display_order + 1 WHERE (display_order > ?) OR (display_order = ? AND id > ?)',
                            [source.display_order, source.display_order, source.id]
                        );
                        // Assign same order as source. Due to secondary sort 'id ASC', small ID (source) comes first.
                        targetDisplayOrder = source.display_order;
                    }
                }
            }
        }

        // Let's Insert.
        const [invResult] = await connection.query(
            `INSERT INTO purchase_inventory 
            (trade_detail_id, product_id, company_id, warehouse_id, 
             purchase_date, original_quantity, remaining_quantity, 
             unit_price, sender, status, display_order, created_at) 
            VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, 'AVAILABLE', ?, NOW())`,
            [tradeDetailId, output_product_id, companyId, warehouseId,
                output_quantity, output_quantity, newUnitPrice, sender, targetDisplayOrder]
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
        let seqNo = 2; // Start from 2 because Output is 1
        for (const ing of ingredients) {
            // Decrement
            await connection.query(
                `UPDATE purchase_inventory 
                 SET remaining_quantity = remaining_quantity - ?,
                     status = CASE WHEN remaining_quantity <= 0 THEN 'DEPLETED' ELSE status END
                 WHERE id = ?`,
                [ing.use_quantity, ing.inventory_id]
            );

            // Log Ingredient usage (Table for production history)
            await connection.query(
                `INSERT INTO inventory_production_ingredients 
                (production_id, used_inventory_id, used_quantity) 
                VALUES (?, ?, ?)`,
                [productionId, ing.inventory_id, ing.use_quantity]
            );

            // [NEW] Log Ingredient usage in Trade Details (Ledger)
            // Fetch unit price again is inefficient but safe, or use pre-calculated cost?
            // We need 'product_id' of the ingredient which is in purchase_inventory.
            // Earlier we fetched rows but didn't correct 'ing' object with product_id.
            // Let's refactor step 1 slightly or just fetch here?
            // Step 1 loop was: for (const ing of ingredients) { SELECT * ... }
            // Let's re-fetch OR assume we can query it. 
            // Re-fetching inside loop is bad for perf but ok for low volume.

            const [localRows] = await connection.query('SELECT product_id, unit_price, sender FROM purchase_inventory WHERE id = ?', [ing.inventory_id]);
            const item = localRows[0];
            const usageCost = Number(item.unit_price) * Number(ing.use_quantity);

            await connection.query(
                `INSERT INTO trade_details 
                (trade_master_id, seq_no, product_id, quantity, unit_price, supply_amount, tax_amount, total_amount, sender) 
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                [
                    tradeMasterId,
                    seqNo++,
                    item.product_id,
                    -Number(ing.use_quantity), // Negative Quantity
                    item.unit_price,
                    -usageCost, // Negative Amount
                    -usageCost,
                    item.sender
                ]
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



/**
 * 재고 작업 취소 (DELETE)
 * DELETE /api/inventory-production/:id
 */
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const productionId = req.params.id;

        // 1. Fetch Production Record & Validation
        const [prodRows] = await connection.query(
            'SELECT * FROM inventory_productions WHERE id = ? FOR UPDATE',
            [productionId]
        );

        if (prodRows.length === 0) {
            throw new Error('작업 이력을 찾을 수 없습니다.');
        }

        const production = prodRows[0];
        const outputInventoryId = production.output_inventory_id;

        // 2. Check if Output Inventory is untouched
        const [invRows] = await connection.query(
            'SELECT * FROM purchase_inventory WHERE id = ? FOR UPDATE',
            [outputInventoryId]
        );

        if (invRows.length === 0) {
            throw new Error('생산된 재고 정보를 찾을 수 없습니다.');
        }

        const inventory = invRows[0];

        // Validation: Original quantity must match Remaining quantity
        if (Number(inventory.original_quantity) !== Number(inventory.remaining_quantity)) {
            throw new Error('생산된 재고가 이미 사용되었거나 판매되어 취소할 수 없습니다.');
        }

        if (inventory.status !== 'AVAILABLE') {
            throw new Error('생산된 재고 상태가 변경되어 취소할 수 없습니다.');
        }

        // 3. Restore Ingredients
        const [ingredients] = await connection.query(
            'SELECT * FROM inventory_production_ingredients WHERE production_id = ?',
            [productionId]
        );

        for (const ing of ingredients) {
            await connection.query(
                `UPDATE purchase_inventory 
                 SET remaining_quantity = remaining_quantity + ?,
                     status = 'AVAILABLE'
                 WHERE id = ?`,
                [ing.used_quantity, ing.used_inventory_id]
            );
        }

        // 4. Delete Records (Reverse Order)

        // 4-1. Delete Production Ingredients Log
        await connection.query('DELETE FROM inventory_production_ingredients WHERE production_id = ?', [productionId]);

        // 4-2. Delete Production Log
        await connection.query('DELETE FROM inventory_productions WHERE id = ?', [productionId]);

        // 4-3. Delete Output Inventory
        await connection.query('DELETE FROM purchase_inventory WHERE id = ?', [outputInventoryId]);

        // 4-4. Delete Trade Details & Master (Input & Output)
        // Note: purchase_inventory has `trade_detail_id`.
        const tradeDetailId = inventory.trade_detail_id;

        if (tradeDetailId) {
            const [detailRows] = await connection.query('SELECT trade_master_id FROM trade_details WHERE id = ?', [tradeDetailId]);
            if (detailRows.length > 0) {
                const tradeMasterId = detailRows[0].trade_master_id;

                // Delete ALL details (Output + Ingredients) linked to this master
                await connection.query('DELETE FROM trade_details WHERE trade_master_id = ?', [tradeMasterId]);

                // Delete Master
                await connection.query('DELETE FROM trade_masters WHERE id = ?', [tradeMasterId]);
            }
        }

        await connection.commit();

        res.json({ success: true, message: '작업이 취소되었습니다.' });

    } catch (error) {
        await connection.rollback();
        console.error('Cancellation Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

/**
 * 최근 재고 작업 이력 조회 (상위 10건)
 * GET /api/inventory-production/recent
 * 주의: /:id 라우트보다 먼저 정의되어야 함
 */
router.get('/recent', async (req, res) => {
    try {
        const query = `
            SELECT 
                ip.id,
                ip.created_at,
                ip.memo,
                ip.additional_cost,
                p.product_name AS output_product_name,
                p.grade AS output_product_grade,
                p.weight AS output_product_weight,
                pi.original_quantity AS output_quantity,

                pi.unit_price AS unit_cost
            FROM inventory_productions ip
            LEFT JOIN purchase_inventory pi ON ip.output_inventory_id = pi.id
            LEFT JOIN products p ON pi.product_id = p.id
            ORDER BY ip.created_at DESC
            LIMIT 10
        `;
        const [rows] = await db.query(query);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Recent History Load Error:', error);
        res.status(500).json({ success: false, message: '최근 이력 조회 실패: ' + error.message });
    }
});

/**
 * 재고 작업 이력 목록 조회
 * GET /api/inventory-production
 */
router.get('/', async (req, res) => {
    try {
        const { start_date, end_date, product_id } = req.query;

        let query = `
            SELECT 
                ip.id,
                ip.created_at,
                ip.memo,
                ip.additional_cost,
                p.product_name AS output_product_name,
                p.grade AS output_product_grade,
                p.weight AS output_product_weight,
                pi.original_quantity AS output_quantity,

                pi.unit_price AS unit_cost
            FROM inventory_productions ip
            LEFT JOIN purchase_inventory pi ON ip.output_inventory_id = pi.id
            LEFT JOIN products p ON pi.product_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            query += ' AND ip.created_at >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND ip.created_at <= ?';
            params.push(end_date + ' 23:59:59');
        }

        if (product_id) {
            query += ' AND pi.product_id = ?';
            params.push(product_id);
        }

        query += ' ORDER BY ip.created_at DESC';

        console.log('[DEBUG] Query:', query);
        console.log('[DEBUG] Params:', params);

        let rows = [];
        try {
            const [result] = await db.query(query, params);
            rows = result;
            console.log(`[DEBUG] Production History Rows: ${rows.length}`);
        } catch (sqlErr) {
            console.error('[DEBUG] SQL Error:', sqlErr);
            throw sqlErr;
        }

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Production History Load Error:', error);
        res.status(500).json({ success: false, message: '이력 조회 실패: ' + error.message });
    }
});

/**
 * 재고 작업 상세 조회
 * GET /api/inventory-production/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. 기본 정보 조회
        const [rows] = await db.query(`
            SELECT 
                ip.id,
                ip.created_at,
                ip.memo,
                ip.additional_cost,
                p.product_name AS output_product_name,
                p.grade AS output_product_grade,
                p.weight AS output_product_weight,
                pi.original_quantity AS output_quantity,
                pi.unit_price AS unit_cost,
                pi.id as output_inventory_id,
                pi.sender as output_sender,
                w.name as output_warehouse_name
            FROM inventory_productions ip
            JOIN purchase_inventory pi ON ip.output_inventory_id = pi.id
            JOIN products p ON pi.product_id = p.id
            LEFT JOIN warehouses w ON pi.warehouse_id = w.id
            WHERE ip.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '작업 내역을 찾을 수 없습니다.' });
        }

        const production = rows[0];

        // 2. 투입 재료 목록 조회
        const [ingredients] = await db.query(`
            SELECT 
                ipi.id,
                ipi.production_id,
                ipi.used_quantity,
                pi.unit_price,
                (pi.unit_price * ipi.used_quantity) as total_cost,
                pi.product_id,
                pi.purchase_date,
                pi.sender,
                p.product_name,
                p.grade,
                p.weight,
                c.company_name
            FROM inventory_production_ingredients ipi
            JOIN purchase_inventory pi ON ipi.used_inventory_id = pi.id
            JOIN products p ON pi.product_id = p.id
            LEFT JOIN companies c ON pi.company_id = c.id
            WHERE ipi.production_id = ?
        `, [id]);

        res.json({
            success: true,
            data: {
                ...production,
                ingredients
            }
        });
    } catch (error) {
        console.error('Production Detail Load Error:', error);
        res.status(500).json({ success: false, message: '상세 조회 실패' });
    }
});

module.exports = router;
