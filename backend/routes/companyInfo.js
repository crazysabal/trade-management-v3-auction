const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 본사 정보 조회
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM company_info LIMIT 1');
    
    if (rows.length === 0) {
      // 기본 데이터 생성
      const [result] = await db.query(
        `INSERT INTO company_info (company_name) VALUES ('우리 회사')`
      );
      const [newRows] = await db.query('SELECT * FROM company_info WHERE id = ?', [result.insertId]);
      return res.json({ success: true, data: newRows[0] });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('본사 정보 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 본사 정보 수정
router.put('/', async (req, res) => {
  try {
    const {
      company_name, business_number, ceo_name,
      company_type, company_category, address, address2,
      phone, fax, email,
      bank_name, account_number, account_holder,
      logo_url, stamp_url, notes
    } = req.body;
    
    // 기존 데이터가 있는지 확인
    const [existing] = await db.query('SELECT id FROM company_info LIMIT 1');
    
    if (existing.length === 0) {
      // INSERT
      await db.query(
        `INSERT INTO company_info (
          company_name, business_number, ceo_name,
          company_type, company_category, address, address2,
          phone, fax, email,
          bank_name, account_number, account_holder,
          logo_url, stamp_url, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          company_name, business_number, ceo_name,
          company_type, company_category, address, address2 || null,
          phone, fax, email,
          bank_name, account_number, account_holder,
          logo_url, stamp_url, notes
        ]
      );
    } else {
      // UPDATE
      await db.query(
        `UPDATE company_info SET
          company_name = ?, business_number = ?, ceo_name = ?,
          company_type = ?, company_category = ?, address = ?, address2 = ?,
          phone = ?, fax = ?, email = ?,
          bank_name = ?, account_number = ?, account_holder = ?,
          logo_url = ?, stamp_url = ?, notes = ?
        WHERE id = ?`,
        [
          company_name, business_number, ceo_name,
          company_type, company_category, address, address2 || null,
          phone, fax, email,
          bank_name, account_number, account_holder,
          logo_url, stamp_url, notes,
          existing[0].id
        ]
      );
    }
    
    res.json({ success: true, message: '본사 정보가 저장되었습니다.' });
  } catch (error) {
    console.error('본사 정보 저장 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;












