const express = require('express');
const router = express.Router();
const db = require('../config/database');
const settlementService = require('../services/settlementService');

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
        // trade_details의 purchase_price는 캐시 컬럼으로, 매칭 시 업데이트되지만 누락될 가능성 있음.
        // 따라서 sale_purchase_matching 테이블의 실제 매칭 기록을 1순위로 조회하고, 없을 경우 purchase_price를 참조함.
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

        // [NEW] 4. Cash Flow (Period-Specific)
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
            FROM expenses
            WHERE expense_date BETWEEN ? AND ?
        `, [startDate, endDate]);

        // [NEW] 5. Period Purchase Cost (For Asset Flow Equation)
        const [purchaseResult] = await db.query(`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM trade_masters
            WHERE trade_type = 'PURCHASE' AND trade_date BETWEEN ? AND ? AND status != 'CANCELLED'
        `, [startDate, endDate]);

        // inventory_adjustments table: adjusted_at (timestamp) used for filtering
        // Join purchase_inventory to get unit_price
        const [adjResult] = await db.query(`
            SELECT 
                COALESCE(SUM(ia.quantity_change * pi.unit_price), 0) as total_val
            FROM inventory_adjustments ia
            JOIN purchase_inventory pi ON ia.purchase_inventory_id = pi.id
            WHERE DATE(ia.adjusted_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        const revenue = parseFloat(revenueResult[0].total_revenue || 0);
        const cogs = parseFloat(cogsResult[0].total_cogs || 0);
        const expenses = parseFloat(expensesResult[0].total_expenses || 0);
        const periodPurchase = parseFloat(purchaseResult[0].total || 0);

        // Cash Flow values
        const cashFlow = {
            inflow: parseFloat(receiptResult[0].total || 0),
            outflow: parseFloat(paymentResult[0].total || 0),
            expense: parseFloat(cashExpenseResult[0].total || 0)
        };

        const adjustmentValue = parseFloat(adjResult[0].total_val || 0);
        // adjustmentValue is usually negative for loss.
        // Net Profit = Gross Profit - Expenses + Adjustment (if negative, it reduces profit)

        // 매출총이익
        const grossProfit = revenue - cogs;
        // 영업이익 (순이익) -> Adjusted Net Profit
        const netProfit = grossProfit - expenses + adjustmentValue;

        res.json({
            success: true,
            data: {
                period: { startDate, endDate },
                revenue,
                cogs,
                grossProfit,
                expenses,
                netProfit,
                inventoryLoss: adjustmentValue, // Return raw value (negative for loss)
                periodPurchase, // [NEW]
                counts: {
                    trades: revenueResult[0].trade_count,
                    zeroCostItems: cogsResult[0].zero_cost_items, // 원가 0원인 항목 수 (리스크 지표)
                    expenses: expensesResult[0].expense_count
                },
                cashFlow, // [NEW] Period Cash Flow
                cashFlowDetails: await (async () => {
                    const [methods] = await db.query('SELECT code, name FROM payment_methods');
                    const methodMap = methods.reduce((acc, m) => { acc[m.code] = m.name; return acc; }, {});

                    const [rows] = await db.query(`
                        SELECT 
                            pt.transaction_type, 
                            pt.payment_method, 
                            pt.amount,
                            c.company_name,
                            pt.notes
                        FROM payment_transactions pt
                        LEFT JOIN companies c ON pt.company_id = c.id
                        WHERE pt.transaction_date BETWEEN ? AND ?
                    `, [startDate, endDate]);

                    return rows.map(r => ({
                        transaction_type: r.transaction_type,
                        payment_method: methodMap[r.payment_method] || r.payment_method || '미지정',
                        amount: parseFloat(r.amount),
                        detail: r.company_name || r.notes || '상세없음'
                    }));
                })(),
                expenseDetails: await (async () => {
                    const [methods] = await db.query('SELECT code, name FROM payment_methods');
                    const methodMap = methods.reduce((acc, m) => { acc[m.code] = m.name; return acc; }, {});

                    const [rows] = await db.query(`
                        SELECT 
                            e.payment_method,
                            e.amount,
                            ec.name as category_name,
                            e.description
                        FROM expenses e
                        LEFT JOIN expense_categories ec ON e.category_id = ec.id
                        WHERE e.expense_date BETWEEN ? AND ?
                    `, [startDate, endDate]);

                    return rows.map(r => ({
                        payment_method: methodMap[r.payment_method] || r.payment_method || '미지정',
                        amount: parseFloat(r.amount),
                        detail: `[${r.category_name || '기타'}] ${r.description || ''}`.trim()
                    }));
                })()
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
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'RECEIPT') as total_receipts,
                (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'PAYMENT') as total_payments,
                (SELECT COALESCE(SUM(amount), 0) FROM expenses) as total_expenses,
                (
                    (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'RECEIPT') -
                    (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE transaction_type = 'PAYMENT') -
                    (SELECT COALESCE(SUM(amount), 0) FROM expenses)
                ) as estimated_cash
        `); // expenses 테이블은 별도이므로 차감 필요

        // expenses 테이블의 지출도 차감해야 함.
        // 위 쿼리에서 expenses를 뺐음.

        res.json({
            success: true,
            data: {
                inventoryValue: parseFloat(inventoryResult[0].total_inventory_value || 0),
                receivables: parseFloat(receivableResult[0].total_receivables || 0),
                payables: parseFloat(payableResult[0].total_payables || 0),
                estimatedCash: parseFloat(cashFlowResult[0].estimated_cash || 0),
                // Detailed Cash Flow Components
                cashFlow: {
                    inflow: parseFloat(cashFlowResult[0].total_receipts || 0),
                    outflow: parseFloat(cashFlowResult[0].total_payments || 0),
                    expense: parseFloat(cashFlowResult[0].total_expenses || 0)
                }
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

        // [FIX] 마감 데이터가 있더라도, today_inventory_value가 0이면 플레이스홀더로 간주하고 역산 수행
        // (정산 확정 시 플레이스홀더만 생성되고 값이 채워지지 않는 경우 대응)
        const hasValidClosingData = closingRows.length > 0
            && parseFloat(closingRows[0].today_inventory_value || 0) > 0;

        if (hasValidClosingData) {
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
        // [MODIFIED] 우선 daily_closing_stocks 스냅샷을 확인하고, 없으면 수불부(inventory_transactions)를 기반으로 역산함.
        let todayInventory = 0;
        let isReconstructed = false;

        // 3-1. 저장된 스냅샷(상세) 확인
        const [snapshotRows] = await db.query(
            `SELECT COALESCE(SUM(total_value), 0) as total FROM daily_closing_stocks WHERE closing_date = ?`,
            [date]
        );

        // 실시간 재고 (비교용)
        const [liveInvRows] = await db.query(
            `SELECT COALESCE(SUM(remaining_quantity * unit_price), 0) as total FROM purchase_inventory WHERE status = 'AVAILABLE'`
        );
        const liveInventoryValue = parseFloat(liveInvRows[0]?.total || 0);

        if (snapshotRows[0].total > 0) {
            todayInventory = parseFloat(snapshotRows[0].total);
            isReconstructed = false; // 저장된 실제 기록임
        } else {
            // 오늘 날짜인지 확인
            const todayStr = new Date().toISOString().split('T')[0];

            if (date === todayStr) {
                todayInventory = liveInventoryValue;
            } else {
                // 과거 날짜인 경우: 현재 실시간 재고에서 정산일 이후의 수량 변동을 역산 (Method D: Matched Cost)
                // 단순히 평균단가를 쓰는 것이 아니라, 매칭된 원가(Sale Purchase Matching)를 우선 적용하여 정확도 향상

                // 1. 기준일 이후의 모든 재고 변동 내역 조회
                const [txs] = await db.query(`
                    SELECT 
                        it.id, it.transaction_type, it.quantity, it.unit_price, 
                        it.trade_detail_id, it.after_quantity, it.before_quantity, it.product_id,
                        (it.after_quantity - it.before_quantity) as qty_change,
                        tm.trade_type
                    FROM inventory_transactions it
                    LEFT JOIN trade_details td ON it.trade_detail_id = td.id
                    LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id
                    JOIN products p ON it.product_id = p.id
                    WHERE DATE(it.transaction_date) > ? AND p.is_active = 1
                `, [date]);

                if (txs.length === 0) {
                    todayInventory = liveInventoryValue;
                } else {
                    // 2. 해당 내역 중 'SALE' 건에 대한 매칭 정보를 일괄 조회
                    const saleDetailIds = txs
                        .filter(t => t.trade_type === 'SALE' && t.trade_detail_id)
                        .map(t => t.trade_detail_id);

                    let matchMap = {};
                    if (saleDetailIds.length > 0) {
                        const [matches] = await db.query(`
                            SELECT spm.sale_detail_id, spm.matched_quantity, pi.unit_price
                            FROM sale_purchase_matching spm
                            JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
                            WHERE spm.sale_detail_id IN (?)
                        `, [saleDetailIds]);

                        matches.forEach(m => {
                            if (!matchMap[m.sale_detail_id]) matchMap[m.sale_detail_id] = [];
                            matchMap[m.sale_detail_id].push(m);
                        });
                    }

                    // 3. Fallback용 단가 조회 보강
                    // AVAILABLE 상태뿐만 아니라, 품절된(SOLD_OUT) 내역까지 포함하여 해당 품목의 가장 최근 입고 단가를 조회 (Method E)
                    const [latestPriceRows] = await db.query(`
                        SELECT pi.product_id, pi.unit_price
                        FROM purchase_inventory pi
                        INNER JOIN (
                            SELECT product_id, MAX(id) as max_id
                            FROM purchase_inventory
                            GROUP BY product_id
                        ) latest ON pi.id = latest.max_id
                    `);
                    const fallbackPriceMap = {};
                    latestPriceRows.forEach(r => fallbackPriceMap[r.product_id] = parseFloat(r.unit_price || 0));

                    // 현재 재고 테이블의 수동 설정 단가 (2차 백업)
                    const [prodRows] = await db.query('SELECT product_id, purchase_price FROM inventory');
                    const inventoryPriceMap = {};
                    prodRows.forEach(r => inventoryPriceMap[r.product_id] = parseFloat(r.purchase_price || 0));

                    // 4. 변동 가액 합산
                    let netValueChange = 0;

                    for (const tx of txs) {
                        const qtyChange = parseFloat(tx.qty_change);
                        if (qtyChange === 0) continue;
                        const qtyAbs = Math.abs(qtyChange);
                        const pid = tx.product_id;

                        let cost = 0;

                        if (tx.trade_type === 'SALE') {
                            // CASE 1: Sale (OUT) - 매칭된 원가 사용
                            const matchedList = matchMap[tx.trade_detail_id] || [];
                            let matchedCost = 0;
                            let matchedQty = 0;

                            for (const m of matchedList) {
                                const q = parseFloat(m.matched_quantity);
                                matchedCost += q * parseFloat(m.unit_price);
                                matchedQty += q;
                            }

                            const remaining = qtyAbs - matchedQty;
                            if (remaining > 0) {
                                // 개선된 Fallback: 최근 입고가 우선, 없으면 재고 테이블 설정가 (Method E)
                                const fbPrice = fallbackPriceMap[pid] || inventoryPriceMap[pid] || 0;
                                matchedCost += remaining * fbPrice;
                            }

                            // 매출로 재고가 감소했으므로 가액 변동은 음수
                            cost = -matchedCost;

                        } else if (tx.trade_type === 'PURCHASE') {
                            // CASE 2: Purchase (IN) - 매입 단가(unit_price) 사용
                            // (트랜잭션에 기록된 unit_price는 매입단가임)
                            cost = qtyChange * parseFloat(tx.unit_price);

                        } else {
                            // CASE 3: Others (Adjust, Production) - 트랜잭션 단가 우선, 없으면 최근 입고가/재고 설정가 순 (Method F)
                            const txPrice = parseFloat(tx.unit_price || 0);
                            const fbPrice = txPrice > 0 ? txPrice : (fallbackPriceMap[pid] || inventoryPriceMap[pid] || 0);
                            cost = qtyChange * fbPrice;
                        }

                        netValueChange += (Number.isNaN(cost) ? 0 : cost);
                    }

                    // 역산: 기준일 재고 = 현재 - 변동분
                    const rawInventory = liveInventoryValue - netValueChange;
                    todayInventory = Math.max(0, Number.isNaN(rawInventory) ? liveInventoryValue : rawInventory);

                    console.log(`[RECON DEBUG] date: ${date}, live: ${liveInventoryValue}, net: ${netValueChange}, result: ${todayInventory}`);
                }
                isReconstructed = true;
            }
        }

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

        // 6. 현금 시재 확인용 (결제 수단별 누적 잔액 계산)
        // [IMPORTANT] 결제 수단 매핑 (명칭 -> 코드) 정규화
        const [methodMapRows] = await db.query('SELECT code, name FROM payment_methods');
        const nameToCode = {};
        methodMapRows.forEach(m => {
            nameToCode[m.name] = m.code;
            nameToCode[m.code] = m.code; // 코드 자체로 들어있는 경우 대비
        });

        const normalizeMethod = (m) => nameToCode[m] || m;

        // 누적 입금
        const [receiptGroupRows] = await db.query(`
            SELECT payment_method, COALESCE(SUM(amount), 0) as total 
            FROM payment_transactions 
            WHERE transaction_type = 'RECEIPT' AND transaction_date <= ?
            GROUP BY payment_method
        `, [date]);

        // 누적 출금
        const [paymentGroupRows] = await db.query(`
            SELECT payment_method, COALESCE(SUM(amount), 0) as total 
            FROM payment_transactions 
            WHERE transaction_type = 'PAYMENT' AND transaction_date <= ?
            GROUP BY payment_method
        `, [date]);

        // 누적 지출
        const [expenseGroupRows] = await db.query(`
            SELECT payment_method, COALESCE(SUM(amount), 0) as total 
            FROM expenses 
            WHERE expense_date <= ?
            GROUP BY payment_method
        `, [date]);

        // 수단별 맵 구성 (코드로 통일)
        const methodBalances = {};
        receiptGroupRows.forEach(r => {
            const code = normalizeMethod(r.payment_method);
            methodBalances[code] = (methodBalances[code] || 0) + parseFloat(r.total);
        });
        paymentGroupRows.forEach(r => {
            const code = normalizeMethod(r.payment_method);
            methodBalances[code] = (methodBalances[code] || 0) - parseFloat(r.total);
        });
        expenseGroupRows.forEach(r => {
            const code = normalizeMethod(r.payment_method);
            methodBalances[code] = (methodBalances[code] || 0) - parseFloat(r.total);
        });

        // 전체 통합 잔액
        const systemCashBalance = Object.values(methodBalances).reduce((sum, val) => sum + val, 0);

        // [FIX] 개별 총계 계산 (기존 receiptRows 등 누락 대응)
        const totalInflow = receiptGroupRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
        const totalOutflow = paymentGroupRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
        const totalExpense = expenseGroupRows.reduce((sum, r) => sum + parseFloat(r.total), 0);

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
                closing_note: '',

                // [NEW] 
                method_balances: methodBalances,
                is_reconstructed: isReconstructed,
                live_inventory_value: liveInventoryValue,

                // [NEW] Cash Flow Breakdown (Cumulative)
                cashFlow: {
                    inflow: totalInflow,
                    outflow: totalOutflow,
                    expense: totalExpense
                }
            }
        });

    } catch (error) {
        console.error('일일 마감 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 마감 이력 목록 조회
 * GET /api/settlement/history
 * Query: type ('daily' | 'period')
 */
/**
 * 마지막 마감일 조회
 * GET /api/settlement/last-closed
 */
router.get('/last-closed', async (req, res) => {
    try {
        const result = await settlementService.getLastClosed();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('마지막 마감일 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 마감 이력 조회 (Unified)
 * GET /api/settlement/history
 */
router.get('/history', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const rows = await settlementService.getHistory(startDate, endDate);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('마감 이력 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// [MIGRATION] Add missing columns if they don't exist
(async () => {
    const columns = [
        'ADD COLUMN prev_inventory DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN purchase_cost DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN today_inventory DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN system_cash DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN actual_cash DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN cash_inflow DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN cash_outflow DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN cash_expense DECIMAL(15,2) DEFAULT 0',
        'ADD COLUMN inventory_loss DECIMAL(15,2) DEFAULT 0'
    ];
    for (const col of columns) {
        try {
            await db.query(`ALTER TABLE period_closings ${col}`);
        } catch (e) {
            // Ignore (Duplicate column)
        }
    }
})();

/**
 * 정산 마감 (Unified)
 * POST /api/settlement/close
 */
router.post('/close', async (req, res) => {
    const { startDate, endDate, summaryData, note } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. period_closings 저장
        await connection.query(`
            INSERT INTO period_closings 
            (
                start_date, end_date, revenue, cogs, gross_profit, expenses, net_profit, note, closed_at,
                prev_inventory, purchase_cost, today_inventory,
                system_cash, actual_cash, cash_inflow, cash_outflow, cash_expense, inventory_loss
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            revenue = VALUES(revenue),
            cogs = VALUES(cogs),
            gross_profit = VALUES(gross_profit),
            expenses = VALUES(expenses),
            net_profit = VALUES(net_profit),
            note = VALUES(note),
            closed_at = NOW(),
            prev_inventory = VALUES(prev_inventory),
            purchase_cost = VALUES(purchase_cost),
            today_inventory = VALUES(today_inventory),
            system_cash = VALUES(system_cash),
            actual_cash = VALUES(actual_cash),
            cash_inflow = VALUES(cash_inflow),
            cash_outflow = VALUES(cash_outflow),
            cash_expense = VALUES(cash_expense),
            inventory_loss = VALUES(inventory_loss)
        `, [
            startDate, endDate,
            summaryData.revenue, summaryData.cogs, summaryData.grossProfit,
            summaryData.expenses, summaryData.netProfit,
            note || '',
            // New Fields
            summaryData.prev_inventory_value || 0,
            summaryData.today_purchase_cost || 0,
            summaryData.today_inventory_value || 0,
            summaryData.system_cash_balance || 0,
            summaryData.actual_cash_balance || 0,
            summaryData.cash_inflow || 0,
            summaryData.cash_outflow || 0,
            summaryData.cash_expense || 0,
            summaryData.inventoryLoss || 0
        ]);

        // 1.5 daily_closings 플레이스홀더 확인 (외래키 제약조건 방지)
        await connection.query(`
            INSERT IGNORE INTO daily_closings (closing_date, closed_by, closing_note)
            VALUES (?, 'system', '정산 자동 생성')
        `, [endDate]);

        // 2. 해당 종료일에 대한 상세 재고 스냅샷 저장
        // 기존 스냅샷이 없거나 정산일에 맞게 갱신함
        await connection.query(`DELETE FROM daily_closing_stocks WHERE closing_date = ?`, [endDate]);
        await connection.query(`
            INSERT INTO daily_closing_stocks 
            (closing_date, purchase_inventory_id, system_quantity, actual_quantity, unit_price, total_value)
            SELECT 
                ?, id, remaining_quantity, remaining_quantity, unit_price, (remaining_quantity * unit_price)
            FROM purchase_inventory
            WHERE status = 'AVAILABLE' AND remaining_quantity > 0
        `, [endDate]);

        await connection.commit();
        res.json({ success: true, message: '정산이 완료되었으며 재고 스냅샷이 저장되었습니다.' });

    } catch (error) {
        await connection.rollback();
        console.error('정산 저장 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

/**
 * 최신 정산 취소 (마지막 정산 건만 삭제 가능)
 * DELETE /api/settlement/last
 */
router.delete('/last', async (req, res) => {
    try {
        // 1. 가장 최근 정산 건 확인
        const [rows] = await db.query(`SELECT id, end_date FROM period_closings ORDER BY end_date DESC LIMIT 1`);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '삭제할 정산 내역이 없습니다.' });
        }

        const lastId = rows[0].id;

        // 2. 삭제 수행
        await db.query(`DELETE FROM period_closings WHERE id = ?`, [lastId]);

        res.json({ success: true, message: '최근 정산이 취소되었습니다.' });

    } catch (error) {
        console.error('정산 취소 오류:', error);
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

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. daily_closings 저장
            await connection.query(`
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

            // 2. daily_closing_stocks 스냅샷 저장 (품목별 상세 재고)
            // 기존 스냅샷 삭제 후 재입력
            await connection.query(`DELETE FROM daily_closing_stocks WHERE closing_date = ?`, [date]);

            await connection.query(`
                INSERT INTO daily_closing_stocks 
                (closing_date, purchase_inventory_id, system_quantity, actual_quantity, unit_price, total_value)
                SELECT 
                    ?, id, remaining_quantity, remaining_quantity, unit_price, (remaining_quantity * unit_price)
                FROM purchase_inventory
                WHERE status = 'AVAILABLE' AND remaining_quantity > 0
            `, [date]);

            await connection.commit();
            res.json({ success: true, message: '마감 데이터 및 재고 스냅샷이 저장되었습니다.' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

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
        const rows = await settlementService.getAuditList();
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
    try {
        const { audits } = req.body;
        const result = await settlementService.processAudit(audits);
        res.json(result);
    } catch (error) {
        console.error('재고 실사 반영 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
