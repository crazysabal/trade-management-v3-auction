const fs = require('fs');
const path = require('path');

// 모듈 경로 추가
const backendNodeModules = path.join(__dirname, 'backend', 'node_modules');
if (fs.existsSync(backendNodeModules)) {
    module.paths.push(backendNodeModules);
}

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

async function diagnose() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    const envPath = path.join(__dirname, 'backend', '.env');
    if (!fs.existsSync(envPath)) {
        log('❌ .env 파일을 찾을 수 없습니다. backend/.env 위치를 확인하세요.');
        return;
    }

    require('dotenv').config({ path: envPath });

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });

    try {
        log('=== [홍다 비즈 1.0.20 인벤토리 진단 및 복구 리포트] ===\n');

        // [0] 긴급 복구 실행 (Sync)
        log('[0] 재고 정합성 자동 복구 (Sync) 실행 중...');
        await connection.query('UPDATE inventory SET quantity = 0, weight = 0');
        const syncSQL = `
            INSERT INTO inventory (product_id, quantity, weight, purchase_price)
            SELECT 
                pi.product_id, 
                SUM(pi.remaining_quantity) as total_qty, 
                SUM(pi.remaining_quantity * IFNULL(p.weight, 0)) as total_weight,
                MAX(pi.unit_price) as last_price
            FROM purchase_inventory pi
            JOIN products p ON pi.product_id = p.id
            WHERE pi.status != 'DEPLETED' OR pi.remaining_quantity > 0
            GROUP BY pi.product_id
            ON DUPLICATE KEY UPDATE
                quantity = VALUES(quantity),
                weight = VALUES(weight),
                purchase_price = VALUES(purchase_price)
        `;
        await connection.query(syncSQL);
        log('✅ 재고 복구가 완료되었습니다.');

        // 3. 특정 품목 (ID 100) 데이터 정밀 점검
        const targetProductId = 100;
        log(`\n[3] 품목 ID ${targetProductId} 정밀 점검:`);

        const [inventoryRow] = await connection.query('SELECT * FROM inventory WHERE product_id = ?', [targetProductId]);
        log(` - [inventory 테이블] 현재 데이터: ${JSON.stringify(inventoryRow[0] || '데이터 없음')}`);

        const [purchaseLots] = await connection.query('SELECT id, product_id, original_quantity, remaining_quantity, status, trade_detail_id, created_at FROM purchase_inventory WHERE product_id = ?', [targetProductId]);
        log(`\n[3.1] 모든 Lot 내역 (purchase_inventory):`);
        purchaseLots.forEach(l => log(` - ID:${l.id} | 잔량:${l.remaining_quantity}/${l.original_quantity} | 상태:${l.status} | 전표상세ID:${l.trade_detail_id} | 생성일:${l.created_at}`));

        const [mismatch] = await connection.query(`
            SELECT 
                (SELECT IFNULL(quantity, 0) FROM inventory WHERE product_id = ?) - 
                (SELECT IFNULL(SUM(remaining_quantity), 0) FROM purchase_inventory WHERE product_id = ? AND status != "DEPLETED") as diff
        `, [targetProductId, targetProductId]);
        log(`\n[3.2] 불일치 분석 오차: ${mismatch[0]?.diff || 0}`);

        // 4. 모든 전표 이력 (삭제/취소 포함)
        log(`\n[4] 품목 ID ${targetProductId} 모든 흔적 점검 (trade_details):`);
        const [allPossible] = await connection.query(`
            SELECT tm.id, tm.trade_type, tm.trade_date, td.id as detail_id, td.quantity, td.seq_no, tm.status
            FROM trade_details td
            JOIN trade_masters tm ON td.trade_master_id = tm.id
            WHERE td.product_id = ?
            ORDER BY tm.trade_date DESC, tm.id DESC
        `, [targetProductId]);
        if (allPossible.length > 0) {
            allPossible.forEach(t => log(` - [${t.status}] [${t.trade_type}] MasterID:${t.id} | DetailID:${t.detail_id} | ${t.trade_date.toISOString().slice(0, 10)} | 수량: ${t.quantity} (seq:${t.seq_no})`));
        } else {
            log(' - 어떤 전표에서도 해당 품목을 찾을 수 없습니다.');
        }

        const [productInfo] = await connection.query('SELECT * FROM products WHERE id = ?', [targetProductId]);
        log(`\n[6] 품목 정보: ${JSON.stringify(productInfo[0] || '품목 없음')}`);

        // 8. 시스템 설정 확인
        log('\n[8] 시스템 설정 점검:');
        const [settings] = await connection.query('SELECT * FROM system_settings');
        settings.forEach(s => log(` - ${s.setting_key}: ${s.setting_value}`));

        // 9. 재고 수불부 상세 확인
        log(`\n[9] 품목 ID ${targetProductId} 재고 수불부 상세:`);
        const [trans] = await connection.query('SELECT * FROM inventory_transactions WHERE product_id = ? ORDER BY id DESC LIMIT 20', [targetProductId]);
        if (trans.length > 0) {
            trans.forEach(tr => log(` - [${tr.transaction_type}] ID:${tr.id} | ${tr.transaction_date} | 수량:${tr.quantity} | Before:${tr.before_quantity} | After:${tr.after_quantity} | DetailID:${tr.trade_detail_id}`));
        } else {
            log(' - 수불부 기록이 전혀 없습니다.');
        }

        // 7. 특정 전표 (ID 53) 상태 점검
        log('\n[7] 문제의 전표 (ID 53) 상세 점검:');
        const [trade53] = await connection.query('SELECT * FROM trade_masters WHERE id = 53');
        if (trade53.length > 0) {
            log(` - 마스터 정보: ID:${trade53[0].id} | 번호:${trade53[0].trade_number} | 유형:${trade53[0].trade_type} | 상태:${trade53[0].status}`);

            const [details53] = await connection.query(`
                SELECT td.*, p.product_name 
                FROM trade_details td 
                JOIN products p ON td.product_id = p.id 
                WHERE td.trade_master_id = 53
                ORDER BY td.seq_no
            `);
            log(` - 상세 항목 수: ${details53.length}건`);
            details53.forEach(d => log(`   - seq:${d.seq_no} | 품목:${d.product_name}(ID:${d.product_id}) | 수량:${d.quantity}`));
        } else {
            log(' - 전표 ID 53을 찾을 수 없습니다.');
        }

        log('\n=============================================');
        fs.writeFileSync(path.join(__dirname, 'diagnostic_results.txt'), output);
    } catch (err) {
        log('\n❌ 진단 중 오류 발생: ' + err.message);
        fs.writeFileSync(path.join(__dirname, 'diagnostic_results.txt'), output);
    } finally {
        await connection.end();
    }
}

diagnose();
