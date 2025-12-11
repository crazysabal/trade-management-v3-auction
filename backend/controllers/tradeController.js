const db = require('../config/database');

/**
 * 거래전표 관련 비즈니스 로직을 처리하는 컨트롤러
 */
const TradeController = {
    // 동일 거래처/날짜/전표유형 중복 체크
    checkDuplicate: async (connection, { company_id, trade_date, trade_type, exclude_trade_id }) => {
        let query = `
      SELECT id, trade_number FROM trade_masters 
      WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED'
    `;
        const params = [company_id, trade_date, trade_type];

        if (exclude_trade_id) {
            query += ' AND id != ?';
            params.push(exclude_trade_id);
        }

        const [existingTrade] = await connection.query(query, params);
        return existingTrade;
    },

    // 거래전표 등록
    createTrade: async (tradeData, userData) => {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const { master, details } = tradeData;

            // 1. 중복 검사
            const [existingTrade] = await connection.query(
                `SELECT id, trade_number FROM trade_masters 
                 WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED'`,
                [master.company_id, master.trade_date, master.trade_type]
            );

            if (existingTrade.length > 0) {
                await connection.rollback();
                const tradeTypeName = master.trade_type === 'PURCHASE' ? '매입' : '매출';
                throw {
                    status: 400,
                    message: `해당 거래처에 동일 날짜의 ${tradeTypeName} 전표가 이미 존재합니다.\n\n기존 전표번호: ${existingTrade[0].trade_number}\n\n기존 전표를 수정하거나 다른 날짜를 선택해주세요.`,
                    data: {
                        existingTradeId: existingTrade[0].id,
                        existingTradeNumber: existingTrade[0].trade_number
                    }
                };
            }

            // 2. 전표번호 생성
            const prefix = master.trade_type === 'PURCHASE' ? 'PUR' : 'SAL';
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

            const [lastNumber] = await connection.query(
                `SELECT trade_number FROM trade_masters 
                 WHERE trade_number LIKE ? 
                 ORDER BY trade_number DESC LIMIT 1`,
                [`${prefix}-${today}-%`]
            );

            let seqNo = 1;
            if (lastNumber.length > 0) {
                const lastSeq = parseInt(lastNumber[0].trade_number.split('-')[2]);
                seqNo = lastSeq + 1;
            }

            const tradeNumber = `${prefix}-${today}-${String(seqNo).padStart(3, '0')}`;

            // 3. 마스터 등록
            const [masterResult] = await connection.query(
                `INSERT INTO trade_masters (
                  trade_number, trade_type, trade_date, company_id,
                  total_amount, tax_amount, total_price,
                  payment_method, notes, status, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tradeNumber, master.trade_type, master.trade_date, master.company_id,
                    master.total_amount || 0, master.tax_amount || 0, master.total_price || 0,
                    master.payment_method, master.notes, master.status || 'DRAFT',
                    master.created_by || 'admin'
                ]
            );

            const masterId = masterResult.insertId;

            // 4. 상세 등록
            if (details && details.length > 0) {
                for (let i = 0; i < details.length; i++) {
                    const detail = details[i];
                    const [detailResult] = await connection.query(
                        `INSERT INTO trade_details (
                          trade_master_id, seq_no, product_id,
                          quantity, total_weight, unit_price, supply_amount, tax_amount, total_amount, auction_price, notes,
                          shipper_location, sender, purchase_price
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            masterId, i + 1, detail.product_id, detail.quantity, detail.total_weight || 0,
                            detail.unit_price, detail.supply_amount || 0, detail.tax_amount || 0,
                            detail.total_amount || detail.supply_amount || 0,
                            detail.auction_price || detail.unit_price || 0,
                            detail.notes || '', detail.shipper_location || null,
                            detail.sender_name || detail.sender || null, detail.purchase_price || null
                        ]
                    );

                    // 재고 기반 매출 등록인 경우 매칭 처리
                    if (master.trade_type === 'SALE' && detail.inventory_id && detail.inventory_id !== 'undefined') {
                        const trade_detail_id = detailResult.insertId;

                        // 매칭 정보 생성
                        await connection.query(
                            `INSERT INTO sale_purchase_matching (
                              sale_detail_id, purchase_inventory_id, matched_quantity
                            ) VALUES (?, ?, ?)`,
                            [trade_detail_id, detail.inventory_id, detail.quantity]
                        );

                        // 재고 차감 (트리거가 알아서 할 수도 있지만 명시적으로 함)
                        await connection.query(
                            `UPDATE purchase_inventory SET remaining_quantity = remaining_quantity - ? WHERE id = ?`,
                            [detail.quantity, detail.inventory_id]
                        );

                        // 재고 상태 업데이트
                        await connection.query(
                            `UPDATE purchase_inventory SET status = CASE WHEN remaining_quantity <= 0 THEN 'DEPLETED' ELSE 'AVAILABLE' END WHERE id = ?`,
                            [detail.inventory_id]
                        );

                        // 매칭 상태 업데이트
                        await connection.query(`UPDATE trade_details SET matching_status = 'MATCHED' WHERE id = ?`, [trade_detail_id]);
                    }
                }
            }

            await connection.commit();

            return {
                success: true,
                message: '거래전표가 등록되었습니다.',
                data: { id: masterId, trade_number: tradeNumber }
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // 전표 수정 로직 (트랜잭션 처리 포함)
    updateTrade: async (tradeId, tradeData, userData) => {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const { master, details } = tradeData;

            // 1. 전표 정보 조회
            const [masters] = await connection.query(
                'SELECT trade_type, company_id, trade_date, total_price FROM trade_masters WHERE id = ?',
                [tradeId]
            );

            if (masters.length === 0) {
                await connection.rollback();
                throw { status: 404, message: '거래전표를 찾을 수 없습니다.' };
            }

            const tradeType = masters[0].trade_type;
            const currentCompanyId = masters[0].company_id;
            const currentTradeDate = masters[0].trade_date;

            // 2. 중복 검사
            const newCompanyId = master.company_id;
            const newTradeDate = master.trade_date;

            const normalizedCurrentDate = currentTradeDate instanceof Date
                ? currentTradeDate.toISOString().slice(0, 10)
                : String(currentTradeDate).slice(0, 10);
            const normalizedNewDate = String(newTradeDate).slice(0, 10);

            if (String(newCompanyId) !== String(currentCompanyId) || normalizedNewDate !== normalizedCurrentDate) {
                const [existingTrade] = await connection.query(
                    `SELECT id, trade_number FROM trade_masters 
           WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED' AND id != ?`,
                    [newCompanyId, newTradeDate, tradeType, tradeId]
                );

                if (existingTrade.length > 0) {
                    await connection.rollback();
                    const tradeTypeName = tradeType === 'PURCHASE' ? '매입' : '매출';
                    throw {
                        status: 400,
                        message: `해당 거래처에 동일 날짜의 ${tradeTypeName} 전표가 이미 존재합니다.\n\n기존 전표번호: ${existingTrade[0].trade_number}\n\n기존 전표를 수정하거나 다른 날짜를 선택해주세요.`,
                        data: {
                            existingTradeId: existingTrade[0].id,
                            existingTradeNumber: existingTrade[0].trade_number
                        }
                    };
                }
            }

            // 3. 매입 전표인 경우: 매칭된 내역 확인
            if (tradeType === 'PURCHASE') {
                const matchedItems = await TradeController.checkPurchaseMatching(connection, tradeId);

                if (matchedItems.length > 0) {
                    await connection.rollback();
                    const totalMatchedQty = matchedItems.reduce((sum, item) => sum + parseFloat(item.matched_quantity), 0);
                    throw {
                        status: 400,
                        errorType: 'MATCHING_EXISTS',
                        message: '이미 매출과 매칭된 내역이 있어 수정할 수 없습니다.',
                        matchingData: {
                            totalCount: matchedItems.length,
                            totalQuantity: totalMatchedQty,
                            items: matchedItems.map(item => {
                                let weightStr = '';
                                if (item.product_weight) {
                                    const weight = parseFloat(item.product_weight);
                                    weightStr = ` ${Number.isInteger(weight) ? Math.floor(weight) : weight}kg`;
                                }
                                return {
                                    productName: `${item.product_name}${weightStr}${item.grade ? ` (${item.grade})` : ''}`,
                                    saleTradeNumber: item.sale_trade_number,
                                    saleDate: item.sale_date ? item.sale_date.toString().split('T')[0] : '-',
                                    customerName: item.customer_name,
                                    matchedQuantity: parseFloat(item.matched_quantity)
                                };
                            })
                        }
                    };
                }

                // 매칭되지 않은 경우: 기존 purchase_inventory 삭제
                await connection.query(
                    `DELETE FROM purchase_inventory 
           WHERE trade_detail_id IN (SELECT id FROM trade_details WHERE trade_master_id = ?)`,
                    [tradeId]
                );
            }

            // 4. 매출 전표인 경우: 매칭 확인
            if (tradeType === 'SALE') {
                const matchedItems = await TradeController.checkSaleMatching(connection, tradeId);

                if (matchedItems.length > 0) {
                    await connection.rollback();
                    const totalMatchedQty = matchedItems.reduce((sum, item) => sum + parseFloat(item.matched_quantity), 0);
                    throw {
                        status: 400,
                        errorType: 'MATCHING_EXISTS',
                        message: '이미 매입과 매칭된 내역이 있어 수정할 수 없습니다.',
                        matchingData: {
                            totalCount: matchedItems.length,
                            totalQuantity: totalMatchedQty,
                            items: matchedItems.map(item => {
                                let weightStr = '';
                                if (item.product_weight) {
                                    const weight = parseFloat(item.product_weight);
                                    weightStr = ` ${Number.isInteger(weight) ? Math.floor(weight) : weight}kg`;
                                }
                                return {
                                    productName: `${item.product_name}${weightStr}${item.grade ? ` (${item.grade})` : ''}`,
                                    supplierName: item.supplier_name,
                                    matchedQuantity: parseFloat(item.matched_quantity)
                                };
                            })
                        }
                    };
                }
            }

            // 5. 매출 전표 로직 (매칭 없는 경우만 실행)
            let unmatchedItems = [];
            let existingMap = new Map();

            if (tradeType === 'SALE') {
                const [existingDetails] = await connection.query(
                    `SELECT td.id, td.product_id, td.quantity, td.unit_price,
                  COALESCE(SUM(spm.matched_quantity), 0) as matched_quantity,
                  GROUP_CONCAT(spm.id) as matching_ids,
                  GROUP_CONCAT(spm.purchase_inventory_id) as inventory_ids,
                  GROUP_CONCAT(spm.matched_quantity) as matched_quantities
           FROM trade_details td
           LEFT JOIN sale_purchase_matching spm ON td.id = spm.sale_detail_id
           WHERE td.trade_master_id = ?
           GROUP BY td.id, td.product_id, td.quantity, td.unit_price`,
                    [tradeId]
                );

                existingDetails.forEach(d => existingMap.set(d.product_id, d));

                // 새 품목 목록과 비교
                for (const newDetail of details) {
                    const existing = existingMap.get(newDetail.product_id);

                    if (!existing) {
                        unmatchedItems.push({
                            product_id: newDetail.product_id,
                            quantity: newDetail.quantity,
                            reason: 'NEW'
                        });
                    } else if (parseFloat(existing.quantity) !== parseFloat(newDetail.quantity)) {
                        if (parseFloat(existing.matched_quantity) > 0) {
                            await TradeController.restoreInventory(connection, existing);
                            unmatchedItems.push({
                                product_id: newDetail.product_id,
                                quantity: newDetail.quantity,
                                reason: 'QUANTITY_CHANGED',
                                oldQuantity: existing.quantity
                            });
                        }
                    }
                }

                // 삭제된 품목 처리
                const newProductIds = new Set(details.map(d => d.product_id));
                for (const [productId, existing] of existingMap) {
                    if (!newProductIds.has(productId) && parseFloat(existing.matched_quantity) > 0) {
                        await TradeController.restoreInventory(connection, existing);
                    }
                }
            }

            // 6. 마스터 업데이트
            await connection.query(
                `UPDATE trade_masters SET
          trade_date = ?, company_id = ?,
          total_amount = ?, tax_amount = ?, total_price = ?,
          payment_method = ?, notes = ?, status = ?
        WHERE id = ?`,
                [
                    master.trade_date, master.company_id, master.total_amount,
                    master.tax_amount, master.total_price, master.payment_method,
                    master.notes, master.status, tradeId
                ]
            );

            // 7. 매칭 정보 보존 로직
            const preservedMatchings = new Map();
            let matchingsToRestore = [];

            if (tradeType === 'SALE') {
                // ... (보존 로직 간소화) ...
                for (const [productId, existing] of existingMap) {
                    const newDetail = details.find(d =>
                        String(d.product_id) === String(productId) &&
                        parseFloat(d.quantity) === parseFloat(existing.quantity)
                    );

                    if (newDetail && parseFloat(existing.matched_quantity) > 0) {
                        preservedMatchings.set(String(productId), true);
                    }
                }

                const [allMatchings] = await connection.query(
                    `SELECT spm.*, td.product_id 
           FROM sale_purchase_matching spm
           JOIN trade_details td ON spm.sale_detail_id = td.id
           WHERE td.trade_master_id = ?`,
                    [tradeId]
                );

                for (const matching of allMatchings) {
                    if (preservedMatchings.get(String(matching.product_id))) {
                        matchingsToRestore.push(matching);
                    }
                }
            }

            // 8. 기존 상세 삭제 및 새 상세 등록
            await connection.query('DELETE FROM trade_details WHERE trade_master_id = ?', [tradeId]);

            if (details && details.length > 0) {
                for (let i = 0; i < details.length; i++) {
                    const detail = details[i];
                    const [detailResult] = await connection.query(
                        `INSERT INTO trade_details (
              trade_master_id, seq_no, product_id, quantity, total_weight, 
              unit_price, supply_amount, tax_amount, total_amount, 
              auction_price, notes, shipper_location, sender, purchase_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            tradeId, i + 1, detail.product_id, detail.quantity, detail.total_weight || 0,
                            detail.unit_price, detail.supply_amount || 0, detail.tax_amount || 0,
                            detail.total_amount || detail.supply_amount || 0,
                            detail.auction_price || detail.unit_price || 0,
                            detail.notes || '', detail.shipper_location || null,
                            detail.sender_name || detail.sender || null, detail.purchase_price || null
                        ]
                    );

                    const trade_detail_id = detailResult.insertId;

                    // 매출 전표 매칭 처리
                    if (tradeType === 'SALE') {
                        const restoredMatchings = matchingsToRestore.filter(m => String(m.product_id) === String(detail.product_id));

                        if (restoredMatchings.length > 0) {
                            // 매칭 복원
                            let totalMatched = 0;
                            for (const restored of restoredMatchings) {
                                await connection.query(
                                    `INSERT INTO sale_purchase_matching (sale_detail_id, purchase_inventory_id, matched_quantity) VALUES (?, ?, ?)`,
                                    [trade_detail_id, restored.purchase_inventory_id, restored.matched_quantity]
                                );

                                // 재고 차감 (트리거가 복원한 것을 다시 차감)
                                await connection.query(
                                    `UPDATE purchase_inventory SET remaining_quantity = remaining_quantity - ? WHERE id = ?`,
                                    [restored.matched_quantity, restored.purchase_inventory_id]
                                );

                                // 상태 업데이트
                                await connection.query(
                                    `UPDATE purchase_inventory SET status = CASE WHEN remaining_quantity <= 0 THEN 'DEPLETED' ELSE 'AVAILABLE' END WHERE id = ?`,
                                    [restored.purchase_inventory_id]
                                );

                                totalMatched += parseFloat(restored.matched_quantity);

                                // 중복 방지를 위해 리스트에서 제거
                                const idx = matchingsToRestore.findIndex(m => m.id === restored.id);
                                if (idx > -1) matchingsToRestore.splice(idx, 1);
                            }

                            if (totalMatched >= parseFloat(detail.quantity)) {
                                await connection.query(`UPDATE trade_details SET matching_status = 'MATCHED' WHERE id = ?`, [trade_detail_id]);
                            } else {
                                await connection.query(`UPDATE trade_details SET matching_status = 'PARTIAL' WHERE id = ?`, [trade_detail_id]);
                            }
                        } else if (detail.inventory_id) {
                            // 신규 매칭 (inventory_id가 요청에 포함된 경우)
                            await connection.query(
                                `INSERT INTO sale_purchase_matching (sale_detail_id, purchase_inventory_id, matched_quantity) VALUES (?, ?, ?)`,
                                [trade_detail_id, detail.inventory_id, detail.quantity]
                            );

                            await connection.query(
                                `UPDATE purchase_inventory SET remaining_quantity = remaining_quantity - ? WHERE id = ?`,
                                [detail.quantity, detail.inventory_id]
                            );

                            await connection.query(
                                `UPDATE purchase_inventory SET status = CASE WHEN remaining_quantity <= 0 THEN 'DEPLETED' ELSE 'AVAILABLE' END WHERE id = ?`,
                                [detail.inventory_id]
                            );

                            await connection.query(`UPDATE trade_details SET matching_status = 'MATCHED' WHERE id = ?`, [trade_detail_id]);
                        }
                    }
                }
            }

            await connection.commit();

            return {
                success: true,
                message: '거래전표가 수정되었습니다.',
                needsRematching: unmatchedItems.length > 0,
                unmatchedItems
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // 재고 복원 헬퍼 함수
    restoreInventory: async (connection, existing) => {
        const matchingIds = existing.matching_ids ? existing.matching_ids.split(',') : [];
        const inventoryIds = existing.inventory_ids ? existing.inventory_ids.split(',') : [];
        const matchedQtys = existing.matched_quantities ? existing.matched_quantities.split(',') : [];

        for (let i = 0; i < matchingIds.length; i++) {
            await connection.query(
                `UPDATE purchase_inventory SET remaining_quantity = remaining_quantity + ? WHERE id = ?`,
                [parseFloat(matchedQtys[i]), parseInt(inventoryIds[i])]
            );
            await connection.query(`DELETE FROM sale_purchase_matching WHERE id = ?`, [parseInt(matchingIds[i])]);
        }
    },

    // 매입 매칭 확인 헬퍼
    checkPurchaseMatching: async (connection, tradeId) => {
        const [matchedItems] = await connection.query(
            `SELECT p.product_name, p.grade, p.weight as product_weight, spm.matched_quantity,
              tm_sale.trade_number as sale_trade_number, tm_sale.trade_date as sale_date, c.company_name as customer_name
       FROM trade_details td
       JOIN purchase_inventory pi ON td.id = pi.trade_detail_id
       JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
       JOIN products p ON td.product_id = p.id
       JOIN trade_details td_sale ON spm.sale_detail_id = td_sale.id
       JOIN trade_masters tm_sale ON td_sale.trade_master_id = tm_sale.id
       JOIN companies c ON tm_sale.company_id = c.id
       WHERE td.trade_master_id = ?`,
            [tradeId]
        );
        return matchedItems;
    },

    // 매출 매칭 확인 헬퍼
    checkSaleMatching: async (connection, tradeId) => {
        const [matchedItems] = await connection.query(
            `SELECT p.product_name, p.grade, p.weight as product_weight, spm.matched_quantity,
              pi.id as inventory_id, c_supplier.company_name as supplier_name
       FROM trade_details td
       JOIN sale_purchase_matching spm ON td.id = spm.sale_detail_id
       JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
       JOIN products p ON td.product_id = p.id
       JOIN trade_details td_purchase ON pi.trade_detail_id = td_purchase.id
       JOIN trade_masters tm_purchase ON td_purchase.trade_master_id = tm_purchase.id
       JOIN companies c_supplier ON tm_purchase.company_id = c_supplier.id
       WHERE td.trade_master_id = ?`,
            [tradeId]
        );
        return matchedItems;
    }
};

module.exports = TradeController;
