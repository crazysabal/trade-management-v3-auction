const xlsx = require('xlsx');
try {
    const workbook = xlsx.readFile('c:\\Project\\trade-management-v3-auction\\거래처 목록 양식.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const fs = require('fs');

    // Get first 5 rows
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 }).slice(0, 5);

    let output = '';
    output += '----- ROW 3 Header -----\n';
    output += JSON.stringify(rows[3]) + '\n';
    output += '------------------------\n';

    // Check Merges
    if (worksheet['!merges']) {
        output += 'MERGES:\n' + JSON.stringify(worksheet['!merges']);
    }

    fs.writeFileSync('headers_dump.txt', output);
    console.log('Dump saved to headers_dump.txt');

} catch (e) {
    console.error(e);
}
