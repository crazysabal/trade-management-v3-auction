const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * 정산 요약 조회 (기간별 손익계산서)
 * GET /api/settlement/summary
 * Query: startDate, endDate
 */
router.get('/summary', async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: '시작일과 종료일은 필수입니다.' });
    }

    try {
        // 1. 매출액 (Revenue) - 공급가액 기준
        // trade_masters의 trade_date 기준
        const [revenueResult] = await db.query(`
            SELECT 
                COALESCE(SUM(tm.total_amount), 0) as total_revenue,
                COUNT(tm.id) as trade_count
            FROM trade_masters tm
            WHERE tm.trade_type = 'SALE'
            AND tm.trade_date BETWEEN ? AND ?
        `, [startDate, endDate]);

        // 2. 매출원가 (COGS)
        // trade_details의 purchase_price * quantity
        // purchase_price가 NULL이면 0으로 처리 (User Warning 사항)
        const [cogsResult] = await db.query(`
            SELECT 
                COALESCE(SUM(td.purchase_price * td.quantity), 0) as total_cogs,
                COALESCE(SUM(CASE WHEN td.purchase_price IS NULL OR td.purchase_price = 0 THEN 1 ELSE 0 END), 0) as zero_cost_items
            FROM trade_details td
            JOIN trade_masters tm ON td.trade_master_id = tm.id
            WHERE tm.trade_type = 'SALE'
            AND tm.trade_date BETWEEN ? AND ?
        `, [startDate, endDate]);

        // 3. 판관비 (Expenses)
        // expenses 테이블의 transaction_date 기준
        const [expensesResult] = await db.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as total_expenses,
                COUNT(id) as expense_count
            FROM expenses
            WHERE expense_date BETWEEN ? AND ?
        `, [startDate, endDate]);

        const revenue = parseFloat(revenueResult[0].total_revenue || 0);
        const cogs = parseFloat(cogsResult[0].total_cogs || 0);
        const expenses = parseFloat(expensesResult[0].total_expenses || 0);

        // 매출총이익
        const grossProfit = revenue - cogs;
        // 영업이익 (순이익)
        const netProfit = grossProfit - expenses;

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                revenue,
                cogs,
                grossProfit,
                expenses,
                netProfit,
                counts: {
                    trades: revenueResult[0].trade_count,
                    zeroCostItems: cogsResult[0].zero_cost_items, // 원가 0원인 항목 수 (리스크 지표)
                    expenses: expensesResult[0].expense_count
                }
            }
        });

    } catch (error) {
        console.error('정산 요약 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 자산 현황 조회 (현재 시점 기준)
 * GET /api/settlement/assets
 */
router.get('/assets', async (req, res) => {
    try {
        // 1. 재고 자산 가치
        // remaining_quantity * unit_price (매입단가)
        const [inventoryResult] = await db.query(`
            SELECT 
                COALESCE(SUM(remaining_quantity * unit_price), 0) as total_inventory_value,
                COUNT(id) as inventory_count
            FROM purchase_inventory
            WHERE status = 'AVAILABLE' AND remaining_quantity > 0
        `);

        // 2. 매출 채권 (미수금) - 받을 돈
        // (총 매출액 - 총 입금액)
        const [receivableResult] = await db.query(`
            SELECT 
                (
                    (SELECT COALESCE(SUM(total_price), 0) FROM trade_masters WHERE trade_type = 'SALE' AND status != 'CANCELLED') -
                    (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'RECEIPT')
                ) as total_receivables
        `);

        // 3. 매입 채무 (미지급금) - 줄 돈
        // (총 매입액 - 총 출금액)
        const [payableResult] = await db.query(`
            SELECT 
                (
                    (SELECT COALESCE(SUM(total_price), 0) FROM trade_masters WHERE trade_type = 'PURCHASE' AND status != 'CANCELLED') -
                    (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'PAYMENT')
                ) as total_payables
        `);

        // 4. 현금성 자산 (현재 보유 현금) - 추정치
        // 정확한 현금 시재는 Bank Account 연동 없이는 불가능하므로, 
        // 총 매출수금 - 총 매입지급 - 총 지출로 단순 계산 (누적)
        // (이건 옵션으로 제공하거나 생략 가능. 여기서는 정보 제공용으로 계산)
        const [cashFlowResult] = await db.query(`
            SELECT
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'RECEIPT') -
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'PAYMENT') -
                (SELECT COALESCE(SUM(amount), 0) FROM expenses) as estimated_cash
        `); // expenses 테이블은 별도이므로 차감 필요

        // expenses 테이블의 지출도 차감해야 함.
        // 위 쿼리에서 expenses를 뺐음.

        res.json({
            success: true,
            data: {
                inventoryValue: parseFloat(inventoryResult[0].total_inventory_value || 0),
                receivables: parseFloat(receivableResult[0].total_receivables || 0),
                payables: parseFloat(payableResult[0].total_payables || 0),
                estimatedCash: parseFloat(cashFlowResult[0].estimated_cash || 0)
            }
        });

    } catch (error) {
        console.error('자산 현황 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 일일 시재 마감 상세 조회 (특정 날짜)
 * GET /api/settlement/closing/:date
 */
router.get('/closing/:date', async (req, res) => {
    try {
        const { date } = req.params;

        // 1. 기존 마감 데이터 조회
        const [closingRows] = await db.query(
            `SELECT * FROM daily_closings WHERE closing_date = ?`,
            [date]
        );

        // 만약 이미 마감된 데이터가 있다면 그대로 반환
        if (closingRows.length > 0) {
            return res.json({
                success: true,
                created: true,
                data: closingRows[0],
                // 편의상 summary 필드도 같이 내려줌 (프론트 호환성)
                summary: {
                    sales: closingRows[0].today_sales_revenue,
                    grossProfit: closingRows[0].gross_profit
                }
            });
        }

        // ==========================================
        // 마감 데이터가 없을 경우: 시스템 실시간 계산
        // ==========================================

        // 1. 전일 재고 (Prev Inventory)
        // 전날의 'today_inventory_value'를 가져옴. 없으면 0.
        const [prevRows] = await db.query(
            `SELECT today_inventory_value FROM daily_closings WHERE closing_date = DATE_SUB(?, INTERVAL 1 DAY)`,
            [date]
        );
        const prevInventory = parseFloat(prevRows[0]?.today_inventory_value || 0);

        // 2. 금일 매입 (Today Purchase)
        // trade_masters WHERE trade_type='PURCHASE' AND trade_date = date
        const [purchaseRows] = await db.query(
            `SELECT COALESCE(SUM(total_amount), 0) as total FROM trade_masters WHERE trade_type = 'PURCHASE' AND DATE(trade_date) = ? AND status != 'CANCELLED'`,
            [date]
        );
        const todayPurchase = parseFloat(purchaseRows[0]?.total || 0);

        // 3. 금일 재고 (System Inventory)
        // 현재 purchase_inventory 테이블의 총 자산 가치
        // 주의: 과거 날짜 조회 시에도 '현재' 재고를 가져오는 한계가 있음 (Snapshot 부재). 
        // -> 사장님이 "전산상의 재고"라고 했으므로 현재 시스템 재고를 신뢰함.
        const [invRows] = await db.query(
            `SELECT COALESCE(SUM(remaining_quantity * unit_price), 0) as total FROM purchase_inventory WHERE status = 'AVAILABLE'`
        );
        const todayInventory = parseFloat(invRows[0]?.total || 0);

        // 4. 금일 매출 (Today Sales)
        // trade_masters WHERE trade_type='SALE' AND trade_date = date
        const [salesRows] = await db.query(
            `SELECT COALESCE(SUM(total_amount), 0) as total FROM trade_masters WHERE trade_type = 'SALE' AND DATE(trade_date) = ? AND status != 'CANCELLED'`,
            [date]
        );
        const todaySales = parseFloat(salesRows[0]?.total || 0);

        // 5. 계산 로직 (Legacy System Logic)
        // 총액 = 전일재고 + 금일매입
        // 매출원가(금일매출) = 총액 - 금일재고
        // 마진(차액) = 매출합계(판매가) - 매출원가

        const totalAsset = prevInventory + todayPurchase;
        const calculatedCogs = totalAsset - todayInventory;
        const grossProfit = todaySales - calculatedCogs;

        // 6. 현금 시재 확인용 (기존 로직 유지)
        const [receiptRows] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payment_transactions WHERE transaction_type = 'RECEIPT' AND transaction_date <= ?`, [date]);
        const [paymentRows] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payment_transactions WHERE transaction_type = 'PAYMENT' AND transaction_date <= ?`, [date]);
        const [expenseRows] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date <= ?`, [date]);

        const systemCashBalance = parseFloat(receiptRows[0].total) - parseFloat(paymentRows[0].total) - parseFloat(expenseRows[0].total);

        // 응답 구성
        res.json({
            success: true,
            created: false,
            data: {
                closing_date: date,

                // Inventory Logic Fields
                prev_inventory_value: prevInventory,
                today_purchase_cost: todayPurchase,
                today_inventory_value: todayInventory,
                calculated_cogs: calculatedCogs,
                today_sales_revenue: todaySales,
                gross_profit: grossProfit,

                // Cash Logic Fields (Legacy compatibility)
                system_cash_balance: systemCashBalance,
                actual_cash_balance: 0,
                difference: 0,
                closing_note: ''
            }
        });

    } catch (error) {
        console.error('일일 마감 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 일일 시재 마감 저장 (Upsert)
 * POST /api/settlement/closing
 */
router.post('/closing', async (req, res) => {
    try {
        const { date, closingData } = req.body;

        const {
            prev_inventory_value,
            today_purchase_cost,
            today_inventory_value,
            calculated_cogs,
            today_sales_revenue,
            gross_profit,
            actual_cash_balance,
            closing_note
        } = closingData;

        // 1. 시스템 잔액 재계산 (데이터 무결성 확인용)
        const [receiptRows] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payment_transactions WHERE transaction_type = 'RECEIPT' AND DATE(transaction_date) <= ?`, [date]);
        const [paymentRows] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payment_transactions WHERE transaction_type = 'PAYMENT' AND DATE(transaction_date) <= ?`, [date]);
        const [expenseRows] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE DATE(expense_date) <= ?`, [date]);

        const systemCashBalance = parseFloat(receiptRows[0].total) - parseFloat(paymentRows[0].total) - parseFloat(expenseRows[0].total);

        await db.query(`
            INSERT INTO daily_closings 
            (
                closing_date, 
                prev_inventory_value, today_purchase_cost, today_inventory_value,
                calculated_cogs, today_sales_revenue, gross_profit,
                system_cash_balance, actual_cash_balance, closing_note, closed_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system')
            ON DUPLICATE KEY UPDATE
            prev_inventory_value = VALUES(prev_inventory_value),
            today_purchase_cost = VALUES(today_purchase_cost),
            today_inventory_value = VALUES(today_inventory_value),
            calculated_cogs = VALUES(calculated_cogs),
            today_sales_revenue = VALUES(today_sales_revenue),
            gross_profit = VALUES(gross_profit),
            system_cash_balance = VALUES(system_cash_balance),
            actual_cash_balance = VALUES(actual_cash_balance),
            closing_note = VALUES(closing_note),
            closed_at = CURRENT_TIMESTAMP
        `, [
            date,
            prev_inventory_value, today_purchase_cost, today_inventory_value,
            calculated_cogs, today_sales_revenue, gross_profit,
            systemCashBalance, actual_cash_balance, closing_note
        ]);

        res.json({ success: true, message: '마감 데이터가 저장되었습니다.' });

    } catch (error) {
        console.error('일일 마감 저장 오류:', error);
        res.status(500).json({ success: false, message: '저장에 실패했습니다.' });
    }
});
/**
 * 재고 실사 리스트 조회 (활성 재고)
 * GET /api/settlement/audit/list
 */
router.get('/audit/list', async (req, res) => {
    try {
        const query = `
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
        `;
        const [rows] = await db.query(query);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('재고 실사 리스트 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 재고 실사 반영 (대량 조정)
 * POST /api/settlement/audit
 */
router.post('/audit', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { audits } = req.body; // Array of { id, system_quantity, actual_quantity, reason }

        for (const item of audits) {
            const diff = parseFloat(item.actual_quantity) - parseFloat(item.system_quantity);

            // 차이가 없으면 스킵
            if (diff === 0) continue;

            // 1. Inventory Adjustment 기록
            await connection.query(`
                INSERT INTO inventory_adjustments 
                (purchase_inventory_id, adjustment_date, adjustment_type, quantity, reason, notes, created_by)
                VALUES (?, CURDATE(), ?, ?, 'AUDIT', ?, 'system')
            `, [
                item.id,
                diff > 0 ? 'INCREASE' : 'DECREASE',
                Math.abs(diff),
                item.reason || '재고 실사 보정'
            ]);

            // 2. Purchase Inventory 업데이트
            await connection.query(`
                UPDATE purchase_inventory 
                SET remaining_quantity = ?, 
                    status = IF(? <= 0, 'DEPLETED', 'AVAILABLE')
                WHERE id = ?
            `, [item.actual_quantity, item.actual_quantity, item.id]);
        }

        await connection.commit();
        res.json({ success: true, message: '재고 실사가 반영되었습니다.' });

    } catch (error) {
        await connection.rollback();
        console.error('재고 실사 반영 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

module.exports = router;
