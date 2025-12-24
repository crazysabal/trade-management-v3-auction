const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 지출 내역 조회
router.get('/', async (req, res) => {
    try {
        const { start_date, end_date, category_id, company_id } = req.query;

        let query = `
            SELECT e.*, c.name as category_name, co.company_name as company_name 
            FROM expenses e
            LEFT JOIN expense_categories c ON e.category_id = c.id
            LEFT JOIN companies co ON e.company_id = co.id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            query += ' AND e.expense_date >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND e.expense_date <= ?';
            params.push(end_date);
        }

        if (category_id && category_id !== 'all') {
            query += ' AND e.category_id = ?';
            params.push(category_id);
        }

        if (company_id) {
            query += ' AND e.company_id = ?';
            params.push(company_id);
        }

        query += ' ORDER BY e.expense_date DESC, e.id DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ message: '지출 내역을 불러오는 중 오류가 발생했습니다.' });
    }
});

// 지출 등록
router.post('/', async (req, res) => {
    const { expense_date, category_id, amount, description, payment_method, company_id } = req.body;

    if (!expense_date || !category_id || !amount) {
        return res.status(400).json({ message: '날짜, 항목, 금액은 필수입니다.' });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO expenses 
            (expense_date, category_id, amount, description, payment_method, company_id) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [expense_date, category_id, amount, description || '', payment_method || 'CASH', company_id || null]
        );
        res.json({ id: result.insertId, message: '지출이 등록되었습니다.' });
    } catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({ message: '지출 등록 중 오류가 발생했습니다.' });
    }
});

// 지출 수정
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { expense_date, category_id, amount, description, payment_method, company_id } = req.body;

    if (!expense_date || !category_id || !amount) {
        return res.status(400).json({ message: '날짜, 항목, 금액은 필수입니다.' });
    }

    try {
        await db.query(
            `UPDATE expenses 
            SET expense_date = ?, category_id = ?, amount = ?, description = ?, payment_method = ?, company_id = ?
            WHERE id = ?`,
            [expense_date, category_id, amount, description || '', payment_method || 'CASH', company_id || null, id]
        );
        res.json({ message: '지출 내역이 수정되었습니다.' });
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).json({ message: '지출 수정 중 오류가 발생했습니다.' });
    }
});

// 지출 삭제
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('DELETE FROM expenses WHERE id = ?', [id]);
        res.json({ message: '지출 내역이 삭제되었습니다.' });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ message: '지출 삭제 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
