const xlsx = require('xlsx');
const fs = require('fs');

try {
    const filename = 'c:\\Project\\trade-management-v3-auction\\거래처목록(1~233).xls';
    console.log(`Reading file: ${filename}`);
    const workbook = xlsx.readFile(filename);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    console.log(`Total rows: ${jsonData.length}`);

    // Find header row
    let headerRowIndex = -1;
    let typeColumnIndex = -1;

    for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        if (!row) continue;

        const idx = row.findIndex(cell => String(cell).trim() === '구분');
        if (idx !== -1) {
            headerRowIndex = i;
            typeColumnIndex = idx;
            console.log(`Found '구분' header at Row ${i}, Col ${idx}`);
            // Dump header
            fs.writeFileSync('header_dump_2.txt', JSON.stringify(row));
            console.log('Header dumped to header_dump_2.txt');
            break;
        }
    }

    if (typeColumnIndex === -1) {
        console.log("Could not find '구분' column.");
    } else {
        const values = new Set();
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[typeColumnIndex] !== undefined) {
                values.add(String(row[typeColumnIndex]).trim());
            }
        }
        console.log('Unique values in 구분 column:', Array.from(values));
    }

} catch (e) {
    console.error(e);
}
