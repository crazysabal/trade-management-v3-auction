const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 품목분류 목록 조회 (계층형)
router.get('/', async (req, res) => {
  try {
    const { is_active, parent_id, flat } = req.query;
    
    let query = `
      SELECT c.*, p.category_name as parent_name
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    if (is_active === 'true' || is_active === 'false') {
      query += ' AND c.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    
    // 특정 부모의 자식만 조회
    if (parent_id === 'null') {
      query += ' AND c.parent_id IS NULL';
    } else if (parent_id) {
      query += ' AND c.parent_id = ?';
      params.push(parent_id);
    }
    
    query += ' ORDER BY c.level, c.parent_id, c.sort_order, c.category_name';
    
    const [rows] = await db.query(query, params);
    
    // flat=true면 평탄화된 배열 반환, 아니면 계층 구조로 변환
    if (flat === 'true') {
      res.json({ success: true, data: rows });
    } else {
      // 계층 구조로 변환
      const hierarchical = buildHierarchy(rows);
      res.json({ success: true, data: rows, tree: hierarchical });
    }
  } catch (error) {
    console.error('품목분류 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 계층 구조 빌드 헬퍼 함수
function buildHierarchy(flatData) {
  const map = {};
  const roots = [];
  
  // 먼저 모든 항목을 맵에 저장
  flatData.forEach(item => {
    map[item.id] = { ...item, children: [] };
  });
  
  // 부모-자식 관계 설정
  flatData.forEach(item => {
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id]);
    } else if (!item.parent_id) {
      roots.push(map[item.id]);
    }
  });
  
  return roots;
}

// 품목분류 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, p.category_name as parent_name
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '품목분류를 찾을 수 없습니다.' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('품목분류 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목분류 등록
router.post('/', async (req, res) => {
  try {
    const { category_name, parent_id, sort_order } = req.body;
    
    if (!category_name) {
      return res.status(400).json({ success: false, message: '분류명은 필수입니다.' });
    }
    
    // 중복 체크
    const [existing] = await db.query('SELECT id FROM categories WHERE category_name = ?', [category_name]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '이미 존재하는 분류명입니다.' });
    }
    
    // 레벨 결정
    let level = 1;
    if (parent_id) {
      const [parent] = await db.query('SELECT level FROM categories WHERE id = ?', [parent_id]);
      if (parent.length > 0) {
        level = parent[0].level + 1;
      }
    }
    
    const [result] = await db.query(
      'INSERT INTO categories (category_name, parent_id, level, sort_order) VALUES (?, ?, ?, ?)',
      [category_name, parent_id || null, level, sort_order || 0]
    );
    
    res.status(201).json({
      success: true,
      message: '품목분류가 등록되었습니다.',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('품목분류 등록 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목분류 수정
router.put('/:id', async (req, res) => {
  try {
    const { category_name, parent_id, sort_order, is_active } = req.body;
    
    if (!category_name) {
      return res.status(400).json({ success: false, message: '분류명은 필수입니다.' });
    }
    
    // 중복 체크 (자기 자신 제외)
    const [existing] = await db.query(
      'SELECT id FROM categories WHERE category_name = ? AND id != ?',
      [category_name, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '이미 존재하는 분류명입니다.' });
    }
    
    // 자기 자신을 부모로 설정하는 것 방지
    if (parent_id && parseInt(parent_id) === parseInt(req.params.id)) {
      return res.status(400).json({ success: false, message: '자기 자신을 상위 분류로 설정할 수 없습니다.' });
    }
    
    // 레벨 결정
    let level = 1;
    if (parent_id) {
      const [parent] = await db.query('SELECT level FROM categories WHERE id = ?', [parent_id]);
      if (parent.length > 0) {
        level = parent[0].level + 1;
      }
    }
    
    const [result] = await db.query(
      'UPDATE categories SET category_name = ?, parent_id = ?, level = ?, sort_order = ?, is_active = ? WHERE id = ?',
      [category_name, parent_id || null, level, sort_order || 0, is_active !== false, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '품목분류를 찾을 수 없습니다.' });
    }
    
    res.json({ success: true, message: '품목분류가 수정되었습니다.' });
  } catch (error) {
    console.error('품목분류 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목분류 삭제
router.delete('/:id', async (req, res) => {
  try {
    // 하위 분류가 있는지 체크
    const [children] = await db.query(
      'SELECT id FROM categories WHERE parent_id = ? LIMIT 1',
      [req.params.id]
    );
    
    if (children.length > 0) {
      return res.status(400).json({
        success: false,
        message: '하위 분류가 있어 삭제할 수 없습니다. 먼저 하위 분류를 삭제하세요.'
      });
    }
    
    // 사용중인 품목이 있는지 체크
    const [products] = await db.query(
      'SELECT id FROM products WHERE category_id = ? LIMIT 1',
      [req.params.id]
    );
    
    if (products.length > 0) {
      return res.status(400).json({
        success: false,
        message: '해당 분류를 사용하는 품목이 있어 삭제할 수 없습니다.'
      });
    }
    
    const [result] = await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '품목분류를 찾을 수 없습니다.' });
    }
    
    res.json({ success: true, message: '품목분류가 삭제되었습니다.' });
  } catch (error) {
    console.error('품목분류 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
