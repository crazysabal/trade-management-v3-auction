/**
 * Settlement Service
 * 정산 관련 비즈니스 로직 분리
 * 
 * [Phase 6-C] settlement.js route에서 분리
 */
const db = require('../config/database');

/**
 * 정산 요약 데이터 조회
 */
async function getSummary(startDate, endDate) {
    // 1. 매출액
    const [revenueResult] = await db.query(`
        SELECT 
            COALESCE(SUM(tm.total_amount), 0) as total_revenue,
            COUNT(tm.id) as trade_count
        FROM trade_masters tm
        WHERE tm.trade_type = 'SALE' AND tm.trade_date BETWEEN ? AND ?
    `, [startDate, endDate]);

    // 2. 매출원가 (COGS)
    const [cogsResult] = await db.query(`
        SELECT 
            COALESCE(SUM(
                COALESCE(
                    (SELECT SUM(spm.matched_quantity * pi.unit_price)
                     FROM sale_purchase_matching spm
                     JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
                     WHERE spm.sale_detail_id = td.id),
                    td.purchase_price * td.quantity,
                    0
                )
            ), 0) as total_cogs,
            COALESCE(SUM(CASE 
                WHEN (SELECT COUNT(*) FROM sale_purchase_matching spm WHERE spm.sale_detail_id = td.id) = 0 
                     AND (td.purchase_price IS NULL OR td.purchase_price = 0) 
                THEN 1 ELSE 0 END), 0) as zero_cost_items
        FROM trade_details td
        JOIN trade_masters tm ON td.trade_master_id = tm.id
        WHERE tm.trade_type = 'SALE' AND tm.trade_date BETWEEN ? AND ?
    `, [startDate, endDate]);

    // 3. 판관비
    const [expensesResult] = await db.query(`
        SELECT 
            COALESCE(SUM(amount), 0) as total_expenses,
            COUNT(id) as expense_count
        FROM expenses WHERE expense_date BETWEEN ? AND ?
    `, [startDate, endDate]);

    // 4. Cash Flow
    const [receiptResult] = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM payment_transactions
        WHERE transaction_type = 'RECEIPT' AND transaction_date BETWEEN ? AND ?
    `, [startDate, endDate]);

    const [paymentResult] = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM payment_transactions
        WHERE transaction_type = 'PAYMENT' AND transaction_date BETWEEN ? AND ?
    `, [startDate, endDate]);

    const [cashExpenseResult] = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM expenses WHERE expense_date BETWEEN ? AND ?
    `, [startDate, endDate]);

    // 5. Period Purchase Cost
    const [purchaseResult] = await db.query(`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM trade_masters
        WHERE trade_type = 'PURCHASE' AND trade_date BETWEEN ? AND ? AND status != 'CANCELLED'
    `, [startDate, endDate]);

    // 6. Inventory Adjustments
    const [adjResult] = await db.query(`
        SELECT COALESCE(SUM(ia.quantity_change * pi.unit_price), 0) as total_val
        FROM inventory_adjustments ia
        JOIN purchase_inventory pi ON ia.purchase_inventory_id = pi.id
        WHERE DATE(ia.adjusted_at) BETWEEN ? AND ?
    `, [startDate, endDate]);

    const revenue = parseFloat(revenueResult[0].total_revenue || 0);
    const cogs = parseFloat(cogsResult[0].total_cogs || 0);
    const expenses = parseFloat(expensesResult[0].total_expenses || 0);
    const periodPurchase = parseFloat(purchaseResult[0].total || 0);
    const adjustmentValue = parseFloat(adjResult[0].total_val || 0);

    const cashFlow = {
        inflow: parseFloat(receiptResult[0].total || 0),
        outflow: parseFloat(paymentResult[0].total || 0),
        expense: parseFloat(cashExpenseResult[0].total || 0)
    };

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses + adjustmentValue;

    return {
        period: { startDate, endDate },
        revenue,
        cogs,
        grossProfit,
        expenses,
        netProfit,
        inventoryLoss: adjustmentValue,
        periodPurchase,
        counts: {
            trades: revenueResult[0].trade_count,
            zeroCostItems: cogsResult[0].zero_cost_items,
            expenses: expensesResult[0].expense_count
        },
        cashFlow
    };
}

/**
 * 자산 현황 조회
 */
async function getAssets() {
    const [inventoryResult] = await db.query(`
        SELECT 
            COALESCE(SUM(remaining_quantity * unit_price), 0) as total_inventory_value,
            COUNT(id) as inventory_count
        FROM purchase_inventory
        WHERE status = 'AVAILABLE' AND remaining_quantity > 0
    `);

    const [receivableResult] = await db.query(`
        SELECT 
            (
                (SELECT COALESCE(SUM(total_price), 0) FROM trade_masters WHERE trade_type = 'SALE' AND status != 'CANCELLED') -
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'RECEIPT')
            ) as total_receivables
    `);

    const [payableResult] = await db.query(`
        SELECT 
            (
                (SELECT COALESCE(SUM(total_price), 0) FROM trade_masters WHERE trade_type = 'PURCHASE' AND status != 'CANCELLED') -
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'PAYMENT')
            ) as total_payables
    `);

    const [cashFlowResult] = await db.query(`
        SELECT
            (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'RECEIPT') as total_receipts,
            (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'PAYMENT') as total_payments,
            (SELECT COALESCE(SUM(amount), 0) FROM expenses) as total_expenses,
            (
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'RECEIPT') -
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'PAYMENT') -
                (SELECT COALESCE(SUM(amount), 0) FROM expenses)
            ) as estimated_cash
    `);

    return {
        inventoryValue: parseFloat(inventoryResult[0].total_inventory_value || 0),
        receivables: parseFloat(receivableResult[0].total_receivables || 0),
        payables: parseFloat(payableResult[0].total_payables || 0),
        estimatedCash: parseFloat(cashFlowResult[0].estimated_cash || 0),
        cashFlow: {
            inflow: parseFloat(cashFlowResult[0].total_receipts || 0),
            outflow: parseFloat(cashFlowResult[0].total_payments || 0),
            expense: parseFloat(cashFlowResult[0].total_expenses || 0)
        }
    };
}

/**
 * 마지막 마감일 조회
 */
async function getLastClosed() {
    const [rows] = await db.query(`
        SELECT * FROM period_closings ORDER BY end_date DESC LIMIT 1
    `);

    if (rows.length === 0) {
        return { lastDate: null, lastInventory: 0 };
    }

    return {
        lastDate: rows[0].end_date,
        lastInventory: rows[0].today_inventory || 0
    };
}

/**
 * 마감 이력 조회
 */
async function getHistory(startDate, endDate) {
    let query = 'SELECT * FROM period_closings';
    const params = [];

    if (startDate && endDate) {
        query += ' WHERE start_date >= ? AND end_date <= ?';
        params.push(startDate, endDate);
    }

    query += ' ORDER BY start_date DESC';

    if (!startDate || !endDate) {
        query += ' LIMIT 60';
    }

    const [rows] = await db.query(query, params);
    return rows;
}

/**
 * 재고 실사 리스트 조회
 */
async function getAuditList() {
    const [rows] = await db.query(`
        SELECT 
            pi.id,
            pi.purchase_date,
            pi.remaining_quantity as system_quantity,
            pi.unit_price,
            pi.warehouse_id,
            pi.sender, 
            p.product_name,
            p.grade,
            p.weight,
            w.name as warehouse_name
        FROM purchase_inventory pi
        JOIN products p ON pi.product_id = p.id
        LEFT JOIN warehouses w ON pi.warehouse_id = w.id
        WHERE pi.remaining_quantity > 0 AND pi.status = 'AVAILABLE'
        ORDER BY p.product_name ASC, pi.purchase_date ASC
    `);
    return rows;
}

/**
 * 재고 실사 반영
 */
async function processAudit(audits) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        for (const item of audits) {
            const diff = parseFloat(item.actual_quantity) - parseFloat(item.system_quantity);
            if (diff === 0) continue;

            await connection.query(`
                INSERT INTO inventory_adjustments 
                (purchase_inventory_id, adjustment_type, quantity_change, reason, notes, created_by)
                VALUES (?, ?, ?, 'AUDIT', ?, 'system')
            `, [
                item.id,
                diff > 0 ? 'INCREASE' : 'DECREASE',
                Math.abs(diff),
                item.reason || '재고 실사 보정'
            ]);

            await connection.query(`
                UPDATE purchase_inventory 
                SET remaining_quantity = ?, 
                    status = IF(? <= 0, 'DEPLETED', 'AVAILABLE')
                WHERE id = ?
            `, [item.actual_quantity, item.actual_quantity, item.id]);
        }

        await connection.commit();
        return { success: true, message: '재고 실사가 반영되었습니다.' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getSummary,
    getAssets,
    getLastClosed,
    getHistory,
    getAuditList,
    processAudit
};
