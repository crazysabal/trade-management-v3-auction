const express = require('express');
const router = express.Router();
const db = require('../config/database');
const multer = require('multer');
const xlsx = require('xlsx-js-style');

// 파일 업로드 설정 (메모리 저장)
const upload = multer({ storage: multer.memoryStorage() });

// 거래처 목록 조회
router.get('/', async (req, res) => {
  try {
    const { search, type, is_active } = req.query;

    let query = 'SELECT * FROM companies WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (company_name LIKE ? OR company_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (type) {
      // SUPPLIER 조회 시 SUPPLIER 또는 BOTH, CUSTOMER 조회 시 CUSTOMER 또는 BOTH
      if (type === 'SUPPLIER') {
        query += ' AND company_type_flag IN (?, ?)';
        params.push('SUPPLIER', 'BOTH');
      } else if (type === 'CUSTOMER') {
        query += ' AND company_type_flag IN (?, ?)';
        params.push('CUSTOMER', 'BOTH');
      } else {
        query += ' AND company_type_flag = ?';
        params.push(type);
      }
    }

    // is_active가 'true' 또는 'false'일 때만 필터링 (빈 문자열이면 전체 조회)
    if (is_active === 'true' || is_active === 'false') {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY sort_order, company_code';

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('거래처 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 엑셀 내보내기
router.get('/export-excel', async (req, res) => {
  try {
    const { search, type, is_active } = req.query;

    let query = 'SELECT * FROM companies WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (company_name LIKE ? OR company_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (type) {
      if (type === 'SUPPLIER') {
        query += ' AND company_type_flag IN (?, ?)';
        params.push('SUPPLIER', 'BOTH');
      } else if (type === 'CUSTOMER') {
        query += ' AND company_type_flag IN (?, ?)';
        params.push('CUSTOMER', 'BOTH');
      } else {
        query += ' AND company_type_flag = ?';
        params.push(type);
      }
    }

    if (is_active === 'true' || is_active === 'false') {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY sort_order, company_code';

    const [rows] = await db.query(query, params);

    // 엑셀 데이터 생성 (2차원 배열 방식)
    const excelRows = [];

    // Row 1: 사업자 정보 (고정값)
    excelRows.push(["사업자 등록번호", "504-81-93859", "상호", "팔공청과（주）", "대표자 명", "홍율흠"]);

    // Row 2: 공백 (템플릿 상 1번, 로직상 1번 인덱스)
    excelRows.push([]);

    // Row 3 (Index 2): 그룹 헤더 (거래처, 담당자)
    const groupHeader = new Array(19).fill("");
    groupHeader[0] = "거래처";
    groupHeader[8] = "담당자";
    excelRows.push(groupHeader);

    // Row 4 (Index 3): 상세 헤더 (New XLSX Format)
    const headers = [
      "순번", "거래처등록번호", "종사업장번호", "거래처 상호", "대표자명",
      "사업자주소", "업태", "종목", "부서명", "성명",
      "전화번호", "휴대전화번호", "팩스번호", "이메일주소", "비고",
      "구분", "등록일자", "거래처 별칭", "매입/매출 구분", "전자계산서", "사용여부"
    ];
    excelRows.push(headers);

    // Row 5~: 데이터
    excelRows.push([
      index + 1,                                  // 순번
      item.business_number,                       // 거래처등록번호
      "",                                         // 종사업장번호 (Empty)
      item.business_name,                         // 거래처 상호 (법인명) [CHANGED]
      item.ceo_name,                              // 대표자명
      item.address,                               // 사업자주소
      item.company_type,                          // 업태
      item.company_category,                      // 종목
      "",                                         // 부서명 (Empty)
      item.contact_person,                        // 성명 (담당자)
      item.phone,                                 // 전화번호
      item.contact_phone,                         // 휴대전화번호
      item.fax,                                   // 팩스번호
      item.email,                                 // 이메일주소
      item.notes,                                 // 비고
      "",                                         // 구분 (이전 위치: 비워둠)
      item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : "", // 등록일자
      item.company_name || "",                    // 거래처 별칭 (시스템상 company_name) [CHANGED]
      item.company_type_flag === 'CUSTOMER' ? '매출처' : (item.company_type_flag === 'SUPPLIER' ? '매입처' : '매입/매출'), // 매입/매출 구분
      item.e_tax_invoice ? "발행" : "미발행",     // 전자계산서 (발행 여부)
      item.is_active ? "사용" : "미사용"          // 사용여부
    ]);

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(excelRows); // json_to_sheet 대신 aoa_to_sheet 사용

    // 컬럼 너비 설정
    const wscols = [
      { wch: 6 },  // 순번
      { wch: 15 }, // 등록번호
      { wch: 5 },  // 종사업장
      { wch: 25 }, // 상호
      { wch: 10 }, // 대표자
      { wch: 40 }, // 주소
      { wch: 15 }, // 업태
      { wch: 15 }, // 종목
      { wch: 10 }, // 부서 [MOVED]
      { wch: 10 }, // 성명 [MOVED]
      { wch: 15 }, // 전화
      { wch: 15 }, // 휴대전화
      { wch: 15 }, // 팩스
      { wch: 25 }, // 이메일
      { wch: 30 }, // 비고
      { wch: 8 },  // 구분
      { wch: 12 }, // 등록일자
      { wch: 20 }, // 거래처 별칭 [NEW]
      { wch: 8 },  // 매입/매출 구분
      { wch: 10 }, // 전자계산서
      { wch: 8 }   // 사용여부
    ];
    worksheet['!cols'] = wscols;

    // 셀 병합 설정
    // s: start, e: end, r: row index, c: col index
    worksheet['!merges'] = [
      // Row 3 (Index 2) 그룹 헤더 병합
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },   // 거래처 (순번 ~ 종목)
      { s: { r: 2, c: 8 }, e: { r: 2, c: 16 } },  // 담당자 (부서명 ~ 등록일자)
      { s: { r: 2, c: 17 }, e: { r: 2, c: 20 } }  // 별칭 ~ 사용여부 [EXTENDED]
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, '거래처목록');

    // 스타일 적용 (모든 셀에 테두리)
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const borderStyle = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" }
    };

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_address = xlsx.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cell_address]) continue;

        if (!worksheet[cell_address].s) worksheet[cell_address].s = {};
        worksheet[cell_address].s.border = borderStyle;

        // 헤더 행 (Row 3, 4) 정렬 및 배경색 추가 (옵션)
        if (R === 2 || R === 3) {
          worksheet[cell_address].s.alignment = { horizontal: "center", vertical: "center" };
          worksheet[cell_address].s.fill = { fgColor: { rgb: "EFEFEF" } };
          worksheet[cell_address].s.font = { bold: true };
        }
      }
    }

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 파일명 생성 (YYYY-MM-DD_HHmmss)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const fileName = `companies_${year}-${month}-${day}_${hours}${minutes}${seconds}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('엑셀 내보내기 오류:', error);
    res.status(500).json({ success: false, message: '엑셀 생성 중 오류가 발생했습니다.' });
  }
});

// 거래처 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM companies WHERE id = ?', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '거래처를 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('거래처 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 거래처 코드 자동 생성 함수
async function generateCompanyCode() {
  const [rows] = await db.query(
    `SELECT company_code FROM companies 
     WHERE company_code REGEXP '^C[0-9]+$' 
     ORDER BY CAST(SUBSTRING(company_code, 2) AS UNSIGNED) DESC 
     LIMIT 1`
  );

  if (rows.length === 0) {
    return 'C001';
  }

  const lastCode = rows[0].company_code;
  const lastNum = parseInt(lastCode.substring(1), 10);
  const nextNum = lastNum + 1;
  return `C${nextNum.toString().padStart(3, '0')}`;
}

// 거래처 등록
router.post('/', async (req, res) => {
  try {
    const {
      company_name, business_name, business_number, ceo_name, // [CHANGED] alias 제거, business_name 추가
      company_type, company_category, address, phone, fax, email,
      contact_person, contact_phone, company_type_flag, notes,
      bank_name, account_number, account_holder, e_tax_invoice
    } = req.body;

    // 거래처코드 자동 생성
    const company_code = await generateCompanyCode();

    // 별칭(거래처명) 중복 체크
    // [CHANGED] 이제 company_name이 별칭임
    if (company_name) {
      const [existingAlias] = await db.query(
        'SELECT id FROM companies WHERE company_name = ?',
        [company_name]
      );
      if (existingAlias.length > 0) {
        return res.status(400).json({ success: false, message: `이미 사용 중인 거래처 명(별칭)입니다: ${company_name}` });
      }
    }

    // [CHANGED] sort_order 계산 (맨 뒤에 추가)
    const [maxOrder] = await db.query('SELECT MAX(sort_order) as max_order FROM companies');
    const sort_order = (maxOrder[0].max_order || 0) + 1;

    // [CHANGED] INSERT 쿼리 수정 (business_name 추가, alias 제거)
    const [result] = await db.query(
      `INSERT INTO companies (
        company_code, company_name, business_name, business_number, ceo_name,
        company_type, company_category, address, phone, fax, email,
        contact_person, contact_phone, company_type_flag, notes,
        bank_name, account_number, account_holder, e_tax_invoice, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_code, company_name, business_name, business_number, ceo_name,
        company_type, company_category, address, phone, fax, email,
        contact_person, contact_phone, company_type_flag || 'BOTH', notes,
        bank_name, account_number, account_holder, e_tax_invoice ? 1 : 0,
        sort_order
      ]
    );

    res.status(201).json({
      success: true,
      message: '거래처가 등록되었습니다.',
      data: { id: result.insertId, company_code }
    });
  } catch (error) {
    console.error('거래처 등록 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 엑셀 내보내기
router.get('/export-excel', async (req, res) => {
  try {
    const { search, type, is_active } = req.query;

    let query = 'SELECT * FROM companies WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (company_name LIKE ? OR company_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (type) {
      if (type === 'SUPPLIER') {
        query += ' AND company_type_flag IN (?, ?)';
        params.push('SUPPLIER', 'BOTH');
      } else if (type === 'CUSTOMER') {
        query += ' AND company_type_flag IN (?, ?)';
        params.push('CUSTOMER', 'BOTH');
      } else {
        query += ' AND company_type_flag = ?';
        params.push(type);
      }
    }

    if (is_active === 'true' || is_active === 'false') {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY sort_order, company_code';

    const [rows] = await db.query(query, params);

    // 엑셀 데이터 생성 (2차원 배열 방식)
    const excelRows = [];

    // Row 1: 사업자 정보 (고정값)
    excelRows.push(["사업자 등록번호", "504-81-93859", "상호", "팔공청과（주）", "대표자 명", "홍율흠"]);

    // Row 2, 3: 공백 (또는 필요한 내용)
    excelRows.push([]);
    excelRows.push([]);

    // Row 4: 헤더 (New XLSX Format)
    const headers = [
      "순번", "거래처등록번호", "종사업장번호", "거래처 상호", "대표자명",
      "사업자주소", "업태", "종목", "부서명", "성명",
      "전화번호", "휴대전화번호", "팩스번호", "이메일주소", "비고",
      "구분", "등록일자", "거래처 별칭", "구분"
    ];
    excelRows.push(headers);

    // Row 5~: 데이터
    rows.forEach((item, index) => {
      excelRows.push([
        index + 1,                                  // 순번
        item.business_number,                       // 거래처등록번호
        "",                                         // 종사업장번호 (Empty)
        item.business_name,                         // 거래처 상호 (법인명) [CHANGED]
        item.ceo_name,                              // 대표자명
        item.address,                               // 사업자주소
        item.company_type,                          // 업태
        item.company_category,                      // 종목
        "",                                         // 부서명 (Empty)
        item.contact_person,                        // 성명 (담당자)
        item.phone,                                 // 전화번호
        item.contact_phone,                         // 휴대전화번호
        item.fax,                                   // 팩스번호
        item.email,                                 // 이메일주소
        item.notes,                                 // 비고
        item.company_type_flag === 'CUSTOMER' ? '매출처' : (item.company_type_flag === 'SUPPLIER' ? '매입처' : '매입/매출'), // 구분
        item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : "", // 등록일자
        item.company_name || "",                    // 거래처 별칭 (시스템상 company_name) [CHANGED]
        ""                                          // 구분 (마지막 컬럼 - 용도 불명확하므로 빈값)
      ]);
    });

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(excelRows); // json_to_sheet 대신 aoa_to_sheet 사용

    // 컬럼 너비 설정
    const wscols = [
      { wch: 6 },  // 순번
      { wch: 15 }, // 등록번호
      { wch: 5 },  // 종사업장
      { wch: 25 }, // 상호
      { wch: 10 }, // 대표자
      { wch: 40 }, // 주소
      { wch: 15 }, // 업태
      { wch: 15 }, // 종목
      { wch: 10 }, // 부서 [MOVED]
      { wch: 10 }, // 성명 [MOVED]
      { wch: 15 }, // 전화
      { wch: 15 }, // 휴대전화
      { wch: 15 }, // 팩스
      { wch: 25 }, // 이메일
      { wch: 30 }, // 비고
      { wch: 8 },  // 구분
      { wch: 12 }, // 등록일자
      { wch: 20 }, // 거래처 별칭 [NEW]
      { wch: 8 }   // 구분
    ];
    worksheet['!cols'] = wscols;

    // 셀 병합 (상단 사업자 정보) - B1:C1 처럼 보이지만 A1,B1,C1... 인덱스 기준
    // A1:"사업자 등록번호", B1:"504...", C1:"상호", D1:"팔공...", E1:"대표자 명", F1:"홍율흠"
    // 병합 필요 여부는 템플릿에 따라 다르나, 보통은 1:1 매칭되어 있을 것임.

    xlsx.utils.book_append_sheet(workbook, worksheet, '거래처목록');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `companies_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('엑셀 내보내기 오류:', error);
    res.status(500).json({ success: false, message: '엑셀 생성 중 오류가 발생했습니다.' });
  }
});

// 엑셀 파일 업로드 및 미리보기
router.post('/upload-preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '파일이 없습니다.' });
    }

    // 엑셀 파일 파싱
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length < 2) {
      return res.status(400).json({ success: false, message: '데이터가 없습니다.' });
    }

    // 헤더 행 찾기 (일반적으로 첫 번째 행이지만, 특수한 경우 다른 행일 수 있음)
    let headerRowIndex = 0;
    let headers = jsonData[0];

    // 헤더에 '거래처상호' 또는 '거래처명'이 포함된 행을 찾기
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (row && row.some(cell =>
        cell && (String(cell).includes('거래처상호') ||
          String(cell).includes('거래처명') ||
          String(cell).includes('사업자번호') ||
          String(cell).includes('거래처등록번호'))
      )) {
        headerRowIndex = i;
        headers = row;
        console.log('헤더 행 발견 (index:', i, '):', headers);
        break;
      }
    }

    const rows = jsonData.slice(headerRowIndex + 1).filter(row => row.length > 0 && row.some(cell => cell));
    console.log('데이터 행 수:', rows.length);

    // 헤더 매핑 (엑셀 컬럼명 -> DB 컬럼명) - 다양한 형식 지원
    const headerMapping = {
      // 기본 형식
      '거래처명': 'company_name', // 별칭
      '별칭': 'company_name',     // 별칭 (호환성)
      '사업자명': 'business_name',
      '상호': 'business_name',
      '사업자번호': 'business_number',
      '대표자': 'ceo_name',
      '업태': 'company_type',
      '종목': 'company_category',
      '주소': 'address',
      '전화번호': 'phone',
      '팩스': 'fax',
      '이메일': 'email',
      '담당자': 'contact_person',
      '담당자연락처': 'contact_phone',
      '구분': 'company_type_flag',
      '비고': 'notes',
      '은행명': 'bank_name',
      '계좌번호': 'account_number',
      '예금주': 'account_holder',
      // 대구청과 형식
      '거래처상호': 'business_name', // [CHANGED] 상호는 법인명이므로 business_name
      '거래처등록번호': 'business_number',
      '대표자명': 'ceo_name',
      '사업자주소': 'address',
      '팩스번호': 'fax',
      '이메일주소': 'email',
      '성명': 'contact_person',
      '휴대전화번호': 'contact_phone',
      // 내보내기 양식 호환
      '거래처 상호': 'business_name', // [CHANGED]
      '거래처 별칭': 'company_name',  // [CHANGED]
      '매입/매출 구분': 'company_type_flag',
      '전자계산서': 'e_tax_invoice',
      '사용여부': 'is_active'
    };

    // 헤더 인덱스 찾기
    const headerIndices = {};
    headers.forEach((header, index) => {
      const trimmedHeader = String(header).trim();
      if (headerMapping[trimmedHeader]) {
        headerIndices[headerMapping[trimmedHeader]] = index;
      }
    });

    // 데이터 변환
    const companies = rows.map((row, rowIndex) => {
      const company = { _rowNum: rowIndex + 2 }; // 엑셀 행 번호 (헤더 제외)

      Object.entries(headerIndices).forEach(([field, index]) => {
        company[field] = row[index] !== undefined ? String(row[index]).trim() : '';
      });

      // 구분 값 변환 (기본값: 매출처)
      if (company.company_type_flag) {
        const typeMap = {
          '매출처': 'CUSTOMER',
          '매출': 'CUSTOMER',
          '매입처': 'SUPPLIER',
          '매입': 'SUPPLIER',
          '매입/매출': 'BOTH',
          '매입매출': 'BOTH',
          '둘다': 'BOTH'
        };
        company.company_type_flag = typeMap[company.company_type_flag] || 'CUSTOMER';
      } else {
        company.company_type_flag = 'CUSTOMER';
      }

      // 전자계산서 변환
      if (company.e_tax_invoice) {
        company.e_tax_invoice = (company.e_tax_invoice === '발행' || company.e_tax_invoice === 'Y' || company.e_tax_invoice === '1');
      } else {
        company.e_tax_invoice = false;
      }

      // 사용여부 변환
      if (company.is_active) {
        company.is_active = (company.is_active === '사용' || company.is_active === 'Y' || company.is_active === '1');
      } else {
        company.is_active = true; // 기본값 사용
      }

      return company;
    });

    res.json({
      success: true,
      data: {
        headers: Object.keys(headerIndices),
        companies,
        totalCount: companies.length
      }
    });
  } catch (error) {
    console.error('엑셀 파싱 오류:', error);
    res.status(500).json({ success: false, message: '엑셀 파일 처리 중 오류가 발생했습니다.' });
  }
});

// 엑셀 데이터 일괄 등록
router.post('/bulk-import', async (req, res) => {
  try {
    const { companies } = req.body;

    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ success: false, message: '등록할 데이터가 없습니다.' });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const company of companies) {
      try {
        // 거래처코드 자동 생성
        const company_code = await generateCompanyCode();

        // sort_order 가져오기
        const [maxOrder] = await db.query('SELECT MAX(sort_order) as max_order FROM companies');
        const sort_order = (maxOrder[0].max_order || 0) + 1;

        await db.query(
          `INSERT INTO companies (
            company_code, company_name, business_name, business_number, ceo_name,
            company_type, company_category, address, phone, fax, email,
            contact_person, contact_phone, company_type_flag, notes,
            bank_name, account_number, account_holder, e_tax_invoice, is_active, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            company_code,
            company_code,
            company.company_name || '', // 별칭
            company.business_name || company.company_name || '', // 법인명 (없으면 별칭으로 채움) [CHANGED]
            company.business_number || '',
            company.ceo_name || '',
            company.company_type || '',
            company.company_category || '',
            company.address || '',
            company.phone || '',
            company.fax || '',
            company.email || '',
            company.contact_person || '',
            company.contact_phone || '',
            company.company_type_flag || 'BOTH',
            company.notes || '',
            company.bank_name || '',
            company.account_number || '',
            company.account_holder || '',
            company.e_tax_invoice ? 1 : 0,
            company.is_active === undefined ? 1 : (company.is_active ? 1 : 0),
            sort_order
          ]
        );

        results.success.push({
          rowNum: company._rowNum,
          company_name: company.company_name,
          company_code
        });
      } catch (err) {
        results.failed.push({
          rowNum: company._rowNum,
          company_name: company.company_name,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      message: `${results.success.length}개 등록 성공, ${results.failed.length}개 실패`,
      data: results
    });
  } catch (error) {
    console.error('일괄 등록 오류:', error);
    res.status(500).json({ success: false, message: '일괄 등록 중 오류가 발생했습니다.' });
  }
});

// 거래처 순번 변경 (/:id 라우트보다 먼저 정의되어야 함)
router.put('/reorder', async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '정렬할 거래처 데이터가 없습니다.' });
    }

    for (const item of items) {
      await db.query(
        'UPDATE companies SET sort_order = ? WHERE id = ?',
        [item.sort_order, item.id]
      );
    }

    res.json({ success: true, message: '거래처 순서가 저장되었습니다.' });
  } catch (error) {
    console.error('거래처 순번 변경 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 거래처 수정
router.put('/:id', async (req, res) => {
  try {
    const {
      company_code, company_name, business_name, business_number, ceo_name, // [CHANGED] alias -> business_name (의미상 분리)
      company_type, company_category, address, phone, fax, email,
      contact_person, contact_phone, company_type_flag, notes, is_active,
      bank_name, account_number, account_holder, e_tax_invoice
    } = req.body;

    // 거래처코드 중복 체크 (자기 자신 제외)
    const [existing] = await db.query(
      'SELECT id FROM companies WHERE company_code = ? AND id != ?',
      [company_code, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '이미 존재하는 거래처코드입니다.' });
    }

    // 별칭(거래처명) 중복 체크 (자기 자신 제외)
    if (company_name) {
      const [existingAlias] = await db.query(
        'SELECT id FROM companies WHERE company_name = ? AND id != ?',
        [company_name, req.params.id]
      );
      if (existingAlias.length > 0) {
        return res.status(400).json({ success: false, message: `이미 사용 중인 거래처 명(별칭)입니다: ${company_name}` });
      }
    }

    const [result] = await db.query(
      `UPDATE companies SET
        company_code = ?, company_name = ?, business_name = ?, business_number = ?, ceo_name = ?,
        company_type = ?, company_category = ?, address = ?, phone = ?, fax = ?,
        email = ?, contact_person = ?, contact_phone = ?, company_type_flag = ?,
        notes = ?, is_active = ?,
        bank_name = ?, account_number = ?, account_holder = ?, e_tax_invoice = ?
      WHERE id = ?`,
      [
        company_code, company_name, business_name, business_number, ceo_name,
        company_type, company_category, address, phone, fax, email,
        contact_person, contact_phone, company_type_flag, notes, is_active,
        bank_name, account_number, account_holder, e_tax_invoice ? 1 : 0,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '거래처를 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '거래처가 수정되었습니다.' });
  } catch (error) {
    console.error('거래처 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 거래처 삭제
router.delete('/:id', async (req, res) => {
  try {
    // 거래 전표에 사용중인지 체크
    const [trades] = await db.query(
      'SELECT id FROM trade_masters WHERE company_id = ? LIMIT 1',
      [req.params.id]
    );

    if (trades.length > 0) {
      return res.status(400).json({
        success: false,
        message: '거래 전표에 사용중인 거래처는 삭제할 수 없습니다.'
      });
    }

    const [result] = await db.query('DELETE FROM companies WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '거래처를 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '거래처가 삭제되었습니다.' });
  } catch (error) {
    console.error('거래처 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
