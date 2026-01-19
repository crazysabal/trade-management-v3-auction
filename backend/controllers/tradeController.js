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

    // 반품 수량 한도 체크
    validateReturnLimits: async (connection, details, excludeDetailIds = []) => {
        for (const detail of details) {
            if (detail.parent_detail_id && detail.quantity < 0) {
                // 1. 원본 매출 수량 조회
                const [parents] = await connection.query(
                    'SELECT ABS(quantity) as origin_qty, product_id FROM trade_details WHERE id = ?',
                    [detail.parent_detail_id]
                );

                if (parents.length === 0) continue;
                const originQty = parseFloat(parents[0].origin_qty);

                // 2. 다른 전표에 있는 동일 원본 대상 반품들 합계 조회 (현재 수정 중인 항목들 제외)
                let query = `
                    SELECT COALESCE(SUM(ABS(td.quantity)), 0) as total_returned
                    FROM trade_details td
                    JOIN trade_masters tm ON td.trade_master_id = tm.id
                    WHERE td.parent_detail_id = ? 
                      AND tm.status != 'CANCELLED'
                `;
                const params = [detail.parent_detail_id];

                if (excludeDetailIds.length > 0) {
                    query += ` AND td.id NOT IN (?)`;
                    params.push(excludeDetailIds);
                }

                const [result] = await connection.query(query, params);
                const otherReturned = parseFloat(result[0].total_returned);

                // 3. 현재 입력/수정하려는 수량 포함 합계 계산
                const currentReturn = Math.abs(parseFloat(detail.quantity));

                if (currentReturn + otherReturned > originQty) {
                    const [prod] = await connection.query('SELECT product_name FROM products WHERE id = ?', [parents[0].product_id]);
                    const productName = prod.length > 0 ? prod[0].product_name : '해당';
                    throw {
                        status: 400,
                        message: `[${productName}] 품목의 반품 수량이 매출 수량을 초과합니다.\n\n원본 매출: ${originQty}\n기존 반품 합계: ${otherReturned}\n현재 입력: ${currentReturn}\n(최대 ${Math.max(0, originQty - otherReturned)}개까지 가능)`,
                        data: { detail }
                    };
                }
            }
        }
    },

    // 거래전표 등록

    createTrade: async (tradeData, userData) => {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const { master, details } = tradeData;

            // 0. 반품 한도 검사
            await TradeController.validateReturnLimits(connection, details);

            // 1. 중복 검사

            const [existingTrade] = await connection.query(
                `SELECT id, trade_number FROM trade_masters 
                 WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED'`,
                [master.company_id, master.trade_date, master.trade_type]
            );

            if (existingTrade.length > 0) {
                await connection.rollback();
                const tradeTypeName = master.trade_type === 'PURCHASE' ? '매입' : (master.trade_type === 'PRODUCTION' ? '생산' : '매출');
                throw {
                    status: 400,
                    message: `해당 거래처에 동일 날짜의 ${tradeTypeName} 전표가 이미 존재합니다.\n\n기존 전표번호: ${existingTrade[0].trade_number}\n\n기존 전표를 수정하거나 다른 날짜를 선택해주세요.`,
                    data: {
                        existingTradeId: existingTrade[0].id,
                        existingTradeNumber: existingTrade[0].trade_number
                    }
                };
            }

            const prefix = master.trade_type === 'PURCHASE' ? 'PUR' : (master.trade_type === 'PRODUCTION' ? 'PRO' : 'SAL');
            const tradeDateStr = String(master.trade_date).slice(0, 10).replace(/-/g, '');
            const today = tradeDateStr;

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
                  payment_method, notes, status, created_by, warehouse_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tradeNumber, master.trade_type, master.trade_date, master.company_id,
                    master.total_amount || 0, master.tax_amount || 0, master.total_price || 0,
                    master.payment_method, master.notes, master.status || 'DRAFT',
                    master.created_by || 'admin', master.warehouse_id || null
                ]
            );

            const masterId = masterResult.insertId;

            // 4. 상세 등록
            if (details && details.length > 0) {
                for (let i = 0; i < details.length; i++) {
                    const detail = details[i];
                    const [detailResult] = await connection.query(
                        `INSERT INTO trade_details (
                          trade_master_id, seq_no, product_id, parent_detail_id,
                          quantity, total_weight, weight_unit, unit_price, supply_amount, tax_amount, total_amount, auction_price, notes,
                          shipper_location, sender, purchase_price
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            masterId, i + 1, detail.product_id, detail.parent_detail_id || null,
                            detail.quantity, detail.total_weight || 0, detail.weight_unit || 'kg', detail.unit_price, detail.supply_amount || 0, detail.tax_amount || 0,
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

                        // 재고 차감 (음수 방지 가드 포함)
                        const [invResult] = await connection.query(
                            `UPDATE purchase_inventory 
                             SET remaining_quantity = remaining_quantity - ? 
                             WHERE id = ? AND remaining_quantity >= ?`,
                            [detail.quantity, detail.inventory_id, detail.quantity]
                        );

                        if (invResult.affectedRows === 0) {
                            await connection.rollback();
                            throw { status: 400, message: '재고가 부족하여 등록할 수 없습니다.' };
                        }

                        // 재고 상태 업데이트
                        await connection.query(
                            `UPDATE purchase_inventory 
                             SET status = CASE WHEN remaining_quantity <= 0 THEN 'DEPLETED' ELSE 'AVAILABLE' END 
                             WHERE id = ?`,
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

            // 2. 반품 한도 검사
            const existingDetailIds = details.filter(d => d.id).map(d => d.id);
            await TradeController.validateReturnLimits(connection, details, existingDetailIds);

            // 3. 중복 검사

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
                    const tradeTypeName = tradeType === 'PURCHASE' ? '매입' : (tradeType === 'PRODUCTION' ? '생산' : '매출');
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

            // 3. 매입 전표인 경우: 매칭된 내역 유효성 검사 (Upsert 전략 준비)
            let existingInventoryMap = new Map(); // id -> { remaining, matched, ... }

            if (tradeType === 'PURCHASE') {
                // 기존 상세 및 재고/매칭 정보 조회
                const [existingRows] = await connection.query(
                    `SELECT td.id as detail_id, td.product_id, td.quantity as trade_quantity, pi.id as inventory_id, 
                     pi.original_quantity, pi.remaining_quantity,
                     COALESCE(SUM(spm.matched_quantity), 0) as matched_quantity
                     FROM trade_details td
                     JOIN purchase_inventory pi ON td.id = pi.trade_detail_id
                     LEFT JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
                     WHERE td.trade_master_id = ?
                     GROUP BY td.id, td.product_id, pi.id`,
                    [tradeId]
                );

                existingRows.forEach(row => {
                    const key = String(row.detail_id);
                    if (!existingInventoryMap.has(key)) {
                        existingInventoryMap.set(key, []);
                    }
                    existingInventoryMap.get(key).push(row);
                });

                // A. 유효성 검사 루프
                // A-1. 삭제된 항목 검사 (입력에 없는 기존 항목)
                const inputIds = new Set(details.filter(d => d.id).map(d => String(d.id)));
                for (const [detailId, rows] of existingInventoryMap) {
                    if (!inputIds.has(detailId)) {
                        // 삭제하려는 항목의 모든 재고(분할 포함)에 대해 매칭 검사
                        for (const row of rows) {
                            if (parseFloat(row.matched_quantity) > 0) {
                                await connection.rollback();
                                throw {
                                    status: 400,
                                    message: `이미 출고(매칭)된 내역이 있는 품목은 삭제할 수 없습니다.\n(Item ID: ${detailId}, Matched: ${row.matched_quantity})`,
                                    data: { matched_quantity: row.matched_quantity, detailId }
                                };
                            }
                        }
                    }
                }

                // A-2. 수정된 항목 검사
                for (const newDetail of details) {
                    if (newDetail.id) {
                        const existingList = existingInventoryMap.get(String(newDetail.id));
                        if (existingList) {
                            const isSplit = existingList.length > 1;
                            const tradeQty = parseFloat(existingList[0].trade_quantity);
                            const newQty = parseFloat(newDetail.quantity);

                            // 분할된 재고(이동 등)가 있는 경우 수량/중량 변경 제한
                            if (isSplit && Math.abs(tradeQty - newQty) > 0.0001) {
                                await connection.rollback();
                                throw {
                                    status: 400,
                                    message: '창고 이동 등으로 분할된 재고는 전표에서 수량을 변경할 수 없습니다.\n이동 내역을 취소하거나 먼저 복원해주세요.'
                                };
                            }

                            for (const existing of existingList) {
                                // 품목 변경 불가 (매칭된 경우)
                                if (String(existing.product_id) !== String(newDetail.product_id) && parseFloat(existing.matched_quantity) > 0) {
                                    await connection.rollback();
                                    throw { status: 400, message: '이미 매칭된 내역이 있는 품목은 다른 품목으로 변경할 수 없습니다.' };
                                }

                                // 수량 감소 제한 (단일 재고인 경우 검사, 분할인 경우 위에서 수량 변경 막음)
                                if (!isSplit && parseFloat(newDetail.quantity) < parseFloat(existing.matched_quantity)) {
                                    await connection.rollback();
                                    throw {
                                        status: 400,
                                        message: `수량을 이미 매칭된 수량(${existing.matched_quantity})보다 적게 수정할 수 없습니다.`
                                    };
                                }
                            }
                        }
                    }
                }
            }

            // 4. 매출 전표인 경우: 매칭 확인 (수정 허용을 위해 제한 해제 - 기존 로직 유지)
            // ... (생략: 기존 코드에서 이미 주석 처리됨)

            // 5. 매출 전표 로직 (매칭 없는 경우만 실행 - 기존 로직 유지)
            let unmatchedItems = [];
            let existingMap = new Map();

            if (tradeType === 'SALE') {
                const [existingDetails] = await connection.query(
                    `SELECT td.id, td.product_id, td.quantity, td.unit_price, td.purchase_price,
                  COALESCE(SUM(spm.matched_quantity), 0) as matched_quantity,
                  GROUP_CONCAT(spm.id) as matching_ids,
                  GROUP_CONCAT(spm.purchase_inventory_id) as inventory_ids,
                  GROUP_CONCAT(spm.matched_quantity) as matched_quantities
           FROM trade_details td
           LEFT JOIN sale_purchase_matching spm ON td.id = spm.sale_detail_id
           WHERE td.trade_master_id = ?
           GROUP BY td.id, td.product_id, td.quantity, td.unit_price, td.purchase_price`,
                    [tradeId]
                );


                existingDetails.forEach(d => {
                    if (!existingMap.has(d.product_id)) {
                        existingMap.set(d.product_id, []);
                    }
                    existingMap.get(d.product_id).push(d);
                });

                // 새 품목 목록과 비교 (Clone map for consumption)
                const validationMap = new Map();
                existingMap.forEach((val, key) => validationMap.set(key, [...val])); // Shallow copy arrays

                for (const newDetail of details) {
                    const existingList = validationMap.get(newDetail.product_id);
                    const existing = existingList && existingList.length > 0 ? existingList.shift() : null;

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

                // 삭제된 품목 처리 (Check remaining items in validationMap)
                const newProductIds = new Set(details.map(d => d.product_id)); // This set logic is insufficient for duplicates, but we rely on validationMap remainders

                for (const [productId, remainingItems] of validationMap) {
                    for (const existing of remainingItems) {
                        if (parseFloat(existing.matched_quantity) > 0) {
                            await TradeController.restoreInventory(connection, existing);
                        }
                    }
                }
            }

            // 6. 마스터 업데이트
            await connection.query(
                `UPDATE trade_masters SET
          trade_date = ?, company_id = ?,
          total_amount = ?, tax_amount = ?, total_price = ?,
          payment_method = ?, notes = ?, status = ?, warehouse_id = ?
        WHERE id = ?`,
                [
                    master.trade_date, master.company_id, master.total_amount,
                    master.tax_amount, master.total_price, master.payment_method,
                    master.notes, master.status, master.warehouse_id || null, tradeId
                ]
            );

            // 7. 매칭 정보 보존 로직 (SALE 전표용)
            // 중복 품목 처리를 위해 Map<productId, List<matchingItem>> 구조 사용
            const matchingsToRestore = [];

            if (tradeType === 'SALE') {
                const [allMatchings] = await connection.query(
                    `SELECT spm.*, td.product_id, td.quantity as old_detail_qty
                     FROM sale_purchase_matching spm
                     JOIN trade_details td ON spm.sale_detail_id = td.id
                     WHERE td.trade_master_id = ?`,
                    [tradeId]
                );

                // 현재 입력된 상세 내역과 매칭 (수량/품목 기준)
                const detailPool = details.map(d => ({ ...d, matched: false }));

                for (const matching of allMatchings) {
                    // 이 매칭을 수용할 수 있는 신규 상세 행 찾기
                    // 조건: 품목 일치 + 아직 매칭 안 됨 + (선택사항) 수량 일관성? 
                    // 수량이 바뀌었더라도 일단 품목이 같으면 매칭을 명시적으로 넘겨주지 않는 한 
                    // 기존 매칭을 최대한 유지하되 수량 초과분은 하단에서 걸러짐
                    const targetDetail = detailPool.find(d =>
                        !d.matched &&
                        String(d.product_id) === String(matching.product_id) &&
                        parseFloat(d.quantity) >= parseFloat(matching.matched_quantity)
                    );

                    if (targetDetail) {
                        matchingsToRestore.push({
                            ...matching,
                            new_detail_seq: detailPool.indexOf(targetDetail) + 1 // 매칭될 상세의 순번 저장
                        });
                        // 해당 상세 행의 잔여 수량 관리 (한 행에 여러 매칭 가능)
                        // 여기서는 단순화를 위해 1:1 또는 1:N 대응.
                        // 일단 보존 대상으로 등록
                    }
                }
            }

            // 8. 상세 내역 업데이트 (Upsert 전략)
            if (tradeType === 'PURCHASE') {
                // 8-A. PURCHASE 전표: in-place 업데이트

                // 삭제 대상 처리 (Delete missing items)
                const inputIdsStep8 = new Set(details.filter(d => d.id).map(d => String(d.id)));
                for (const [detailId, rows] of existingInventoryMap) {
                    if (!inputIdsStep8.has(detailId)) {
                        // 삭제: 모든 연결된 재고 삭제
                        for (const row of rows) {
                            await connection.query('DELETE FROM purchase_inventory WHERE id = ?', [row.inventory_id]);
                        }
                        await connection.query('DELETE FROM trade_details WHERE id = ?', [detailId]);
                    }
                }

                // Upsert 루프
                for (let i = 0; i < details.length; i++) {
                    const detail = details[i];

                    if (detail.id && existingInventoryMap.has(String(detail.id))) {
                        // UPDATE
                        const existingList = existingInventoryMap.get(String(detail.id));
                        const isSplit = existingList.length > 1;

                        await connection.query(
                            `UPDATE trade_details SET
                               seq_no = ?, product_id = ?, parent_detail_id = ?, quantity = ?, total_weight = ?, weight_unit = ?,
                              unit_price = ?, supply_amount = ?, tax_amount = ?, total_amount = ?,
                              auction_price = ?, notes = ?, shipper_location = ?, sender = ?, purchase_price = ?
                              WHERE id = ?`,
                            [
                                i + 1, detail.product_id, detail.parent_detail_id || null,
                                detail.quantity, detail.total_weight || 0, detail.weight_unit || 'kg', detail.unit_price, detail.supply_amount || 0, detail.tax_amount || 0,
                                detail.total_amount || detail.supply_amount || 0,
                                detail.auction_price || detail.unit_price || 0,
                                detail.notes || '', detail.shipper_location || null,
                                detail.sender_name || detail.sender || null,
                                detail.purchase_price !== undefined ? detail.purchase_price : (existingList[0].purchase_price || null),
                                detail.id
                            ]
                        );

                        // Purchase Inventory 업데이트 (Linked List 전체 업데이트)
                        for (const existing of existingList) {
                            if (isSplit) {
                                // 분할된 경우: 수량/중량은 변경 불가(위에서 검증됨), 메타데이터만 업데이트
                                await connection.query(
                                    `UPDATE purchase_inventory SET
                                       product_id = ?,
                                       unit_price = ?, weight_unit = ?,
                                      shipper_location = ?, sender = ?
                                      WHERE id = ?`,
                                    [
                                        detail.product_id, detail.unit_price, detail.weight_unit || 'kg', detail.shipper_location || null, detail.sender_name || detail.sender || null, existing.inventory_id
                                    ]
                                );
                            } else {
                                // 단일 재고: 수량 등 전체 업데이트
                                const matchedQty = parseFloat(existing.matched_quantity) || 0;
                                const newQty = parseFloat(detail.quantity);
                                const newRemaining = newQty - matchedQty;
                                const newUniqueStatus = newRemaining <= 0 ? 'DEPLETED' : 'AVAILABLE';

                                await connection.query(
                                    `UPDATE purchase_inventory SET
                                       product_id = ?,
                                       original_quantity = ?, remaining_quantity = ?,
                                       unit_price = ?, weight_unit = ?, status = ?,
                                      shipper_location = ?, sender = ?
                                      WHERE id = ?`,
                                    [
                                        detail.product_id, newQty, newRemaining, detail.unit_price, detail.weight_unit || 'kg', newUniqueStatus,
                                        detail.shipper_location || null, detail.sender_name || detail.sender || null,
                                        existing.inventory_id
                                    ]
                                );
                            }
                        }

                    } else {
                        // INSERT (New Item)
                        const [detailResult] = await connection.query(
                            `INSERT INTO trade_details (
                               trade_master_id, seq_no, product_id, parent_detail_id, quantity, total_weight, weight_unit, 
                               unit_price, supply_amount, tax_amount, total_amount, 
                               auction_price, notes, shipper_location, sender, purchase_price
                             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                tradeId, i + 1, detail.product_id, detail.parent_detail_id || null,
                                detail.quantity, detail.total_weight || 0, detail.weight_unit || 'kg', detail.unit_price, detail.supply_amount || 0, detail.tax_amount || 0,
                                detail.total_amount || detail.supply_amount || 0,
                                detail.auction_price || detail.unit_price || 0,
                                detail.notes || '', detail.shipper_location || null,
                                detail.sender_name || detail.sender || null, detail.purchase_price || null
                            ]
                        );
                        // Trigger handles inventory creation
                    }
                }

            } else {
                // 8-B. SALE / PRODUCTION 등: 기존 방식 (Delete All & Insert) 유지
                // Why? SALE is complicated with re-matching logic implemented in Step 5/7/8.
                // Keeping it as-is to avoid regression on SALE logic which is not the target of this fix.

                await connection.query('DELETE FROM trade_details WHERE trade_master_id = ?', [tradeId]);

                if (details && details.length > 0) {
                    for (let i = 0; i < details.length; i++) {
                        const detail = details[i];
                        const existing = existingMap.get(detail.product_id);
                        const [detailResult] = await connection.query(
                            `INSERT INTO trade_details (
                  trade_master_id, seq_no, product_id, parent_detail_id, quantity, total_weight, weight_unit, 
                  unit_price, supply_amount, tax_amount, total_amount, 
                  auction_price, notes, shipper_location, sender, purchase_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                tradeId, i + 1, detail.product_id, detail.parent_detail_id || null,
                                detail.quantity, detail.total_weight || 0, detail.weight_unit || 'kg', detail.unit_price, detail.supply_amount || 0, detail.tax_amount || 0,
                                detail.total_amount || detail.supply_amount || 0,
                                detail.auction_price || detail.unit_price || 0,
                                detail.notes || '', detail.shipper_location || null,
                                detail.sender_name || detail.sender || null,
                                detail.purchase_price !== undefined ? detail.purchase_price : (existing ? existing.purchase_price : null)
                            ]
                        );

                        const trade_detail_id = detailResult.insertId;

                        // 매출 전표 매칭 처리
                        if (tradeType === 'SALE') {
                            // 보존된 매칭 중 현재 순번(i+1)에 해당하는 것들 찾기
                            const restoredMatchings = matchingsToRestore.filter(m => m.new_detail_seq === (i + 1));

                            if (restoredMatchings.length > 0) {
                                // 매칭 복원
                                let totalMatched = 0;
                                for (const restored of restoredMatchings) {
                                    // 신규 매출 수량을 초과하지 않도록 조정
                                    const canMatchQty = Math.min(parseFloat(restored.matched_quantity), parseFloat(detail.quantity) - totalMatched);

                                    if (canMatchQty > 0) {
                                        await connection.query(
                                            `INSERT INTO sale_purchase_matching (sale_detail_id, purchase_inventory_id, matched_quantity) VALUES (?, ?, ?)`,
                                            [trade_detail_id, restored.purchase_inventory_id, canMatchQty]
                                        );

                                        // 재고 차감 (음수 방지 가드 포함)
                                        const [invUpd] = await connection.query(
                                            `UPDATE purchase_inventory 
                                             SET remaining_quantity = remaining_quantity - ? 
                                             WHERE id = ? AND remaining_quantity >= ?`,
                                            [canMatchQty, restored.purchase_inventory_id, canMatchQty]
                                        );

                                        if (invUpd.affectedRows === 0) {
                                            // 이미 수동/자동 매칭 등으로 재고가 소진되었을 수 있음 -> 그냥 스킵하거나 에러
                                            // 복원 로직이므로 최대한 시도
                                            console.warn(`[Inventory Sync] Lot ${restored.purchase_inventory_id} restoration failed due to insufficient stock.`);
                                        }

                                        // 상태 업데이트
                                        await connection.query(
                                            `UPDATE purchase_inventory SET status = CASE WHEN remaining_quantity <= 0 THEN 'DEPLETED' ELSE 'AVAILABLE' END WHERE id = ?`,
                                            [restored.purchase_inventory_id]
                                        );

                                        totalMatched += canMatchQty;
                                    }
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
