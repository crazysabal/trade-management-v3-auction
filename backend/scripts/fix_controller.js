const fs = require('fs');
const path = require('path');

const targetPath = 'c:/Project/hongda-biz/backend/controllers/tradeController.js';
if (!fs.existsSync(targetPath)) {
    console.error('File not found:', targetPath);
    process.exit(1);
}

let content = fs.readFileSync(targetPath, 'utf8');

console.log('--- tradeController.js 보정 시작 ---');

// 1. purchase_inventory UPDATE (isSplit)
content = content.replace(
    /`UPDATE purchase_inventory SET\s+product_id = \?,\s+unit_price = \?,/g,
    "`UPDATE purchase_inventory SET\n                                       product_id = ?,\n                                       unit_price = ?, weight_unit = ?,"
);

// 2. purchase_inventory UPDATE (single)
content = content.replace(
    /`UPDATE purchase_inventory SET\s+product_id = \?,\s+original_quantity = \?, remaining_quantity = \?,\s+unit_price = \?, status = \?,/g,
    "`UPDATE purchase_inventory SET\n                                       product_id = ?,\n                                       original_quantity = ?, remaining_quantity = ?,\n                                       unit_price = ?, weight_unit = ?, status = ?,"
);

// 3. trade_details UPDATE
content = content.replace(
    /`UPDATE trade_details SET\s+seq_no = \?, product_id = \?, parent_detail_id = \?, quantity = \?, total_weight = \?,/g,
    "`UPDATE trade_details SET\n                               seq_no = ?, product_id = ?, parent_detail_id = ?, quantity = ?, total_weight = ?, weight_unit = ?,"
);

// 4. trade_details INSERT
content = content.replace(
    /INSERT INTO trade_details \(([^)]*?)\btotal_weight\b/g,
    (match, p1) => {
        if (p1.includes('weight_unit')) return match;
        return `INSERT INTO trade_details (${p1}total_weight, weight_unit`;
    }
);

// 5. VALUES clause
content = content.replace(
    /\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/g,
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

// 6. Params arrays (Using generalized regex to cope with whitespace)
// a. Purchase detail UPDATE params
content = content.replace(
    /(detail\.quantity, detail\.total_weight \|\| 0,)\s+(detail\.unit_price)/g,
    "$1 detail.weight_unit || 'kg', $2"
);

// b. Purchase inventory UPDATE params
content = content.replace(
    /(detail\.product_id,)\s+(detail\.unit_price,)\s+(detail\.shipper_location \|\| null, detail\.sender_name \|\| detail\.sender \|\| null,)\s+(existing\.inventory_id)/g,
    "$1 $2 detail.weight_unit || 'kg', $3 $4"
);

// c. Single purchase inventory UPDATE params
content = content.replace(
    /(detail\.product_id,)\s+(newQty, newRemaining,)\s+(detail\.unit_price,)( newUniqueStatus,)/g,
    "$1 $2 $3 detail.weight_unit || 'kg',$4"
);

// d. Insert params (handle both paths)
// Look for pattern ending in detail.total_weight || 0,
// and followed by detail.unit_price
content = content.replace(
    /(detail\.quantity, detail\.total_weight \|\| 0,)\s+(detail\.unit_price, detail\.supply_amount \|\| 0, detail\.tax_amount \|\| 0,)/g,
    "$1 detail.weight_unit || 'kg', $2"
);

fs.writeFileSync(targetPath, content, 'utf8');
console.log('✅ tradeController.js 보정 완료');
