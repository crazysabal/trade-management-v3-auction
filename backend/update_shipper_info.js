const db = require('./config/database');

async function updateShipperInfo() {
  try {
    console.log('출하지/출하주 정보 업데이트 시작...');
    
    // 매핑 정보를 통해 auction_raw_data와 inventory를 연결
    // auction_raw_data의 product_name, grade, weight를 product_mapping과 매칭
    // 매칭된 system_product_id로 inventory 업데이트
    
    const updateQuery = `
      UPDATE inventory i
      INNER JOIN products p ON i.product_id = p.id
      INNER JOIN product_mapping pm ON pm.system_product_id = p.id
      SET 
        i.shipper_location = (
          SELECT ard.shipper_location 
          FROM auction_raw_data ard 
          WHERE ard.product_name = pm.auction_product_name 
            AND ard.grade = pm.auction_grade
            AND CAST(ard.weight AS DECIMAL(10,2)) = CAST(pm.auction_weight AS DECIMAL(10,2))
          LIMIT 1
        ),
        i.sender = (
          SELECT ard.sender 
          FROM auction_raw_data ard 
          WHERE ard.product_name = pm.auction_product_name 
            AND ard.grade = pm.auction_grade
            AND CAST(ard.weight AS DECIMAL(10,2)) = CAST(pm.auction_weight AS DECIMAL(10,2))
          LIMIT 1
        )
      WHERE i.shipper_location IS NULL OR i.sender IS NULL
    `;
    
    const [result] = await db.query(updateQuery);
    console.log(`inventory 업데이트: ${result.affectedRows}건`);
    
    // trade_details도 업데이트
    const updateTradeQuery = `
      UPDATE trade_details td
      INNER JOIN products p ON td.product_id = p.id
      INNER JOIN product_mapping pm ON pm.system_product_id = p.id
      SET 
        td.shipper_location = (
          SELECT ard.shipper_location 
          FROM auction_raw_data ard 
          WHERE ard.product_name = pm.auction_product_name 
            AND ard.grade = pm.auction_grade
            AND CAST(ard.weight AS DECIMAL(10,2)) = CAST(pm.auction_weight AS DECIMAL(10,2))
          LIMIT 1
        ),
        td.sender = (
          SELECT ard.sender 
          FROM auction_raw_data ard 
          WHERE ard.product_name = pm.auction_product_name 
            AND ard.grade = pm.auction_grade
            AND CAST(ard.weight AS DECIMAL(10,2)) = CAST(pm.auction_weight AS DECIMAL(10,2))
          LIMIT 1
        )
      WHERE td.shipper_location IS NULL OR td.sender IS NULL
    `;
    
    const [result2] = await db.query(updateTradeQuery);
    console.log(`trade_details 업데이트: ${result2.affectedRows}건`);
    
    // 결과 확인
    const [inventory] = await db.query(`
      SELECT i.id, p.product_name, p.grade, i.shipper_location, i.sender 
      FROM inventory i 
      JOIN products p ON i.product_id = p.id
    `);
    console.log('\n=== 업데이트된 inventory ===');
    inventory.forEach(item => {
      console.log(`${item.product_name} (${item.grade}): 출하지=${item.shipper_location || '-'}, 출하주=${item.sender || '-'}`);
    });
    
    console.log('\n업데이트 완료!');
    process.exit(0);
  } catch (error) {
    console.error('업데이트 오류:', error);
    process.exit(1);
  }
}

updateShipperInfo();


















