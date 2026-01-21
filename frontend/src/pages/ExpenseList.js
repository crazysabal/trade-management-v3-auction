import React, { useState, useEffect } from 'react';
import { expenseAPI } from '../services/api';
import ExpenseFormModal from '../components/ExpenseFormModal';
import ConfirmModal from '../components/ConfirmModal'; // ConfirmModal 임포트
import '../components/TradePanel.css';

import { formatLocalDate } from '../utils/dateUtils'; // [FIX] Import date utility

const ExpenseList = ({ isWindow }) => {
    // [FIX] Use local date instead of UTC
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1); // 1일
        return formatLocalDate(d);
    });
    const [endDate, setEndDate] = useState(formatLocalDate(new Date())); // 오늘
    const [loading, setLoading] = useState(false);

    // 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);

    // 알림/확인 모달 상태
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'confirm', // confirm, delete, success, warning, error(info)
        onConfirm: () => { },
        showCancel: true
    });

    // 요약 정보 계산
    const totalAmount = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const totalCount = expenses.length;

    useEffect(() => {
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const res = await expenseAPI.getAll({
                start_date: startDate,
                end_date: endDate
            });
            setExpenses(res.data);
        } catch (err) {
            console.error(err);
            showModal('오류', '지출 내역을 불러오는 중 오류가 발생했습니다.', 'warning', null, false);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchExpenses();
    };

    const handleEdit = (expense) => {
        setEditingExpense(expense);
        setIsModalOpen(true);
    };

    // 삭제 버튼 클릭 시 모달 호출
    const handleDeleteClick = (id) => {
        showModal(
            '지출 내역 삭제',
            '정말 이 지출 내역을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.',
            'delete',
            () => handleDeleteConfirm(id),
            true
        );
    };

    // 실제 삭제 로직
    const handleDeleteConfirm = async (id) => {
        try {
            await expenseAPI.delete(id);
            fetchExpenses();
            // showModal('삭제 완료', '지출 내역이 삭제되었습니다.', 'success', null, false); // 너무 빈번한 팝업 방지 위해 생략 가능
        } catch (err) {
            console.error(err);
            showModal('오류', '삭제 중 오류가 발생했습니다.', 'warning', null, false);
        }
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setEditingExpense(null);
    };

    const handleSuccess = () => {
        fetchExpenses();
    };

    // 공통 모달 표시 함수
    const showModal = (title, message, type = 'info', onConfirm = () => { }, showCancel = true) => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            type,
            onConfirm,
            showCancel
        });
    };

    // 모달 닫기
    const closeConfirmModal = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
    };

    // 결제 수단 한글 변환
    const getPaymentMethodName = (method) => {
        const map = { 'CASH': '현금', 'CARD': '카드', 'TRANSFER': '계좌이체' };
        return map[method] || method;
    };

    return (
        <div className="expense-list-page" style={{ padding: '0.5rem', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 헤더 섹션 */}
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                <div className="header-actions">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                    >
                        + 지출 등록
                    </button>
                </div>
            </div>

            {/* 필터 및 요약 카드 */}
            <div className="card" style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between' }}>

                    {/* 검색 폼 */}
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="trade-input"
                            style={{ padding: '0.4rem' }}
                        />
                        <span style={{ color: '#6c757d' }}>~</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="trade-input"
                            style={{ padding: '0.4rem' }}
                        />
                        <button type="submit" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', whiteSpace: 'nowrap' }}>조회</button>
                    </form>

                    {/* 요약 정보 */}
                    <div className="summary-info" style={{ display: 'flex', gap: '20px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        <div>총 건수: <span style={{ color: '#007bff' }}>{totalCount}건</span></div>
                        <div>총 지출액: <span style={{ color: '#dc3545' }}>{totalAmount.toLocaleString()}원</span></div>
                    </div>
                </div>
            </div>

            {/* 리스트 테이블 카드 */}
            <div className="card" style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '0.5rem' }}>
                <div className="content-area">
                    <table className="trade-Table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ padding: '12px' }}>날짜</th>
                                <th style={{ padding: '12px' }}>항목</th>
                                <th style={{ padding: '12px' }}>적요</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>결제 수단</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>금액</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}>로딩 중...</td></tr>
                            ) : expenses.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>기간 내 지출 내역이 없습니다.</td></tr>
                            ) : (
                                expenses.map((item) => (
                                    <tr key={item.id} className="hover-row">
                                        <td>{item.expense_date.split('T')[0]}</td>
                                        <td>
                                            <span className="badge" style={{ background: '#e9ecef', color: '#495057', fontSize: '0.85rem', fontWeight: '500', padding: '0.3em 0.6em' }}>
                                                {item.category_name}
                                            </span>
                                        </td>
                                        <td>{item.description}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{ fontSize: '0.9rem', color: '#666' }}>{getPaymentMethodName(item.payment_method)}</span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#2c3e50' }}>{Number(item.amount).toLocaleString()}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleEdit(item)}
                                                className="btn btn-sm btn-info"
                                                style={{ marginRight: '5px', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                            >
                                                수정
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(item.id)}
                                                className="btn btn-sm btn-danger"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                            >
                                                삭제
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 등록/수정 모달 */}
            <ExpenseFormModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                initialData={editingExpense}
                onSuccess={handleSuccess}
            />

            {/* 알림/확인 모달 */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={closeConfirmModal}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                showCancel={confirmModal.showCancel}
            />
        </div>
    );
};

export default ExpenseList;

