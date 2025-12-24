const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 품목 목록 조회
router.get('/', async (req, res) => {
  try {
    const { search, category_id, is_active } = req.query;

    let query = `
      SELECT p.*, c.category_name, pc.category_name as parent_category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (p.product_name LIKE ? OR p.product_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category_id) {
      query += ' AND p.category_id = ?';
      params.push(category_id);
    }

    // is_active가 'true' 또는 'false'일 때만 필터링 (빈 문자열이면 전체 조회)
    if (is_active === 'true' || is_active === 'false') {
      query += ' AND p.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY p.sort_order, p.product_code';

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('품목 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 순번 변경 (드래그앤드롭) - /:id보다 먼저 정의해야 함
router.put('/reorder', async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: '잘못된 요청입니다.' });
    }

    // 트랜잭션으로 순번 업데이트
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      for (const item of items) {
        await connection.query(
          'UPDATE products SET sort_order = ? WHERE id = ?',
          [item.sort_order, item.id]
        );
      }
      await connection.commit();
      res.json({ success: true, message: '순번이 변경되었습니다.' });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('순번 변경 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 다음 품목코드 조회 (자동 생성용)
router.get('/next-code', async (req, res) => {
  try {
    // F001, F002... 형태로 생성
    const [rows] = await db.query(
      `SELECT product_code FROM products 
       WHERE product_code REGEXP '^F[0-9]+$' 
       ORDER BY CAST(SUBSTRING(product_code, 2) AS UNSIGNED) DESC 
       LIMIT 1`
    );

    let nextCode = 'F001';
    if (rows.length > 0) {
      const lastCode = rows[0].product_code;
      const lastNum = parseInt(lastCode.substring(1));
      nextCode = 'F' + String(lastNum + 1).padStart(3, '0');
    }

    res.json({ success: true, data: { next_code: nextCode } });
  } catch (error) {
    console.error('품목코드 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, c.category_name, pc.category_name as parent_category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '품목을 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('품목 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 등록 (다중 등급 지원)
router.post('/', async (req, res) => {
  try {
    const { product_name, grades, unit, category_id, weight, notes } = req.body;

    // grades 파싱 (배열 또는 콤마 구분 문자열 지원)
    let gradeList = [req.body.grade || null];
    if (grades) {
      if (Array.isArray(grades) && grades.length > 0) {
        gradeList = grades;
      } else if (typeof grades === 'string' && grades.trim().length > 0) {
        gradeList = grades.split(',').map(g => g.trim()).filter(g => g);
      }
    }

    // weights 파싱 (배열 또는 콤마 구분 문자열 지원)
    let weightList = [weight || null];
    if (req.body.weights) {
      if (Array.isArray(req.body.weights) && req.body.weights.length > 0) {
        weightList = req.body.weights;
      } else if (typeof req.body.weights === 'string' && req.body.weights.trim().length > 0) {
        // 혹시 "[1,2]" 형태의 JSON 문자열로 올 경우 대비
        try {
          const parsed = JSON.parse(req.body.weights);
          if (Array.isArray(parsed)) weightList = parsed;
          else weightList = req.body.weights.split(',').map(w => w.trim());
        } catch (e) {
          weightList = req.body.weights.split(',').map(w => w.trim());
        }
      }
    }

    const createdProducts = [];
    const errors = [];

    // 품목코드 자동 생성을 위해 가장 높은 번호 미리 조회 (루프 밖으로 이동)
    const [codeRows] = await db.query(
      `SELECT product_code FROM products 
       WHERE product_code REGEXP '^F[0-9]+$' 
       ORDER BY CAST(SUBSTRING(product_code, 2) AS UNSIGNED) DESC 
       LIMIT 1`
    );

    let lastNum = 0;
    if (codeRows.length > 0) {
      lastNum = parseInt(codeRows[0].product_code.substring(1));
    }

    // 이중 루프로 모든 등급 x 모든 중량 조합 생성
    for (const grade of gradeList) {
      for (const w of weightList) {
        try {
          // 메모리에서 다음 코드 생성
          lastNum++;
          const nextCode = 'F' + String(lastNum).padStart(3, '0');

          const finalWeight = (w !== null && w !== undefined && w !== '') ? parseFloat(w) : null;

          const [result] = await db.query(
            `INSERT INTO products (product_code, product_name, grade, unit, category_id, weight, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nextCode, product_name, grade || null, unit || 'Box', category_id || null, finalWeight, notes]
          );

          createdProducts.push({
            id: result.insertId,
            product_code: nextCode,
            product_name: product_name,
            grade: grade,
            weight: finalWeight
          });
        } catch (insertError) {
          errors.push({ grade, weight: w, error: insertError.message });
        }
      }
    }

    if (createdProducts.length === 0) {
      return res.status(400).json({
        success: false,
        message: '품목 등록에 실패했습니다.',
        errors
      });
    }

    res.status(201).json({
      success: true,
      message: `${createdProducts.length}개의 품목이 등록되었습니다.`,
      data: createdProducts
    });
  } catch (error) {
    console.error('품목 등록 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 수정
router.put('/:id', async (req, res) => {
  try {
    const { product_code, product_name, grade, unit, category_id, weight, notes, is_active, updateAllGrades, updateAllWeights, originalProductName } = req.body;

    // 품목코드 중복 체크 (자기 자신 제외)
    const [existing] = await db.query(
      'SELECT id FROM products WHERE product_code = ? AND id != ?',
      [product_code, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '이미 존재하는 품목코드입니다.' });
    }

    // 현재 품목 수정
    const [result] = await db.query(
      `UPDATE products SET
        product_code = ?, product_name = ?, grade = ?,
        unit = ?, category_id = ?, weight = ?, notes = ?, is_active = ?
      WHERE id = ?`,
      [product_code, product_name, grade || null, unit, category_id || null, weight || null, notes, is_active, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '품목을 찾을 수 없습니다.' });
    }

    // 같은 품목명의 다른 등급도 함께 변경
    let nameUpdated = 0;
    let weightUpdated = 0;

    // 품목명 및 분류 일괄 변경 (그룹 변경)
    if (updateAllGrades && originalProductName) {
      const [updateResult] = await db.query(
        `UPDATE products SET product_name = ?, category_id = ? WHERE product_name = ? AND id != ?`,
        [product_name, category_id || null, originalProductName, req.params.id]
      );
      nameUpdated = updateResult.affectedRows;
    }

    // 중량 일괄 변경 (원래 품목명 기준 - 품목명이 변경되었어도 원래 그룹의 다른 등급들을 변경)
    if (updateAllWeights) {
      // 품목명 일괄 변경이 실행된 경우 새 품목명으로, 아니면 원래 품목명으로 검색
      const searchProductName = (updateAllGrades && originalProductName && originalProductName !== product_name)
        ? product_name  // 품목명 일괄 변경 후이므로 새 품목명으로 검색
        : originalProductName || product_name;  // 원래 품목명으로 검색

      const [updateResult] = await db.query(
        `UPDATE products SET weight = ? WHERE product_name = ? AND id != ?`,
        [weight || null, searchProductName, req.params.id]
      );
      weightUpdated = updateResult.affectedRows;
    }

    // 메시지 생성
    let message = '품목이 수정되었습니다.';
    const updates = [];
    if (nameUpdated > 0) updates.push(`품목명 ${nameUpdated}개`);
    if (weightUpdated > 0) updates.push(`중량 ${weightUpdated}개`);
    if (updates.length > 0) {
      message = `품목이 수정되었습니다. (같은 품목명의 다른 등급 ${updates.join(', ')} 함께 변경)`;
    }

    res.json({ success: true, message, nameUpdated, weightUpdated });
  } catch (error) {
    console.error('품목 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 순서 변경 (일괄 업데이트)
router.put('/reorder', async (req, res) => {
  try {
    const { items } = req.body; // [{ id, sort_order }, ...]

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: '잘못된 요청입니다.' });
    }

    // 트랜잭션 대신 개별 업데이트 (간단 구현)
    // 성능 이슈 시 Bulk Update Query로 변경 고려:
    // UPDATE products SET sort_order = CASE id WHEN 1 THEN 1 WHEN 2 THEN 2 ... END WHERE id IN (1,2...)

    // For now, simpler await all
    const promises = items.map(item =>
      db.query('UPDATE products SET sort_order = ? WHERE id = ?', [item.sort_order, item.id])
    );

    await Promise.all(promises);

    res.json({ success: true, message: '순서가 변경되었습니다.' });
  } catch (error) {
    console.error('품목 순서 변경 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 그룹 삭제 (일괄 삭제)
router.delete('/group', async (req, res) => {
  try {
    const { product_name } = req.query;

    if (!product_name) {
      return res.status(400).json({ success: false, message: '삭제할 품목명(그룹)이 없습니다.' });
    }

    // 1. 해당 그룹의 모든 ID 조회
    const [products] = await db.query('SELECT id FROM products WHERE product_name = ?', [product_name]);

    if (products.length === 0) {
      return res.status(404).json({ success: false, message: '삭제할 품목이 없습니다.' });
    }

    const ids = products.map(p => p.id);

    // 2. 거래 내역 사용 여부 체크 (하나라도 사용중이면 불가)
    // IN 절 사용
    const [trades] = await db.query(
      `SELECT id FROM trade_details WHERE product_id IN (?) LIMIT 1`,
      [ids]
    );

    if (trades.length > 0) {
      return res.status(400).json({
        success: false,
        message: `선택하신 그룹 "${product_name}"에 포함된 일부 품목이 이미 거래 내역에 존재하여 삭제할 수 없습니다. (미사용 처리 권장)`
      });
    }

    // 3. 일괄 삭제
    const [result] = await db.query('DELETE FROM products WHERE product_name = ?', [product_name]);

    res.json({ success: true, message: `"${product_name}" 그룹의 모든 품목(${result.affectedRows}개)이 삭제되었습니다.` });

  } catch (error) {
    console.error('품목 그룹 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 삭제
router.delete('/:id', async (req, res) => {
  try {
    // 거래 상세에 사용중인지 체크
    const [trades] = await db.query(
      'SELECT id FROM trade_details WHERE product_id = ? LIMIT 1',
      [req.params.id]
    );

    if (trades.length > 0) {
      return res.status(400).json({
        success: false,
        message: '거래 내역에 사용중인 품목은 삭제할 수 없습니다.'
      });
    }

    const [result] = await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '품목을 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '품목이 삭제되었습니다.' });
  } catch (error) {
    console.error('품목 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
