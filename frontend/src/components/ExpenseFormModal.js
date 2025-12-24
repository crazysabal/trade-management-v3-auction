import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ConfirmModal from '../components/ConfirmModal'; // ConfirmModal 추가
import '../components/TradePanel.css'; // Modal styles recycled

export default function ExpenseFormModalComponent({ isOpen, onClose, initialData, onSuccess }) {
    const [formData, setFormData] = useState({
        expense_date: new Date().toISOString().split('T')[0],
        category_id: '',
        amount: '',
        description: '',
        payment_method: 'CASH'
    });
    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // 알림 모달 상태
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onConfirm: () => { }
    });

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
            fetchPaymentMethods();
            if (initialData) {
                setFormData({
                    expense_date: initialData.expense_date ? initialData.expense_date.split('T')[0] : new Date().toISOString().split('T')[0],
                    category_id: initialData.category_id || '',
                    amount: initialData.amount || '',
                    description: initialData.description || '',
                    payment_method: initialData.payment_method || 'CASH'
                });
            } else {
                setFormData({
                    expense_date: new Date().toISOString().split('T')[0],
                    category_id: '',
                    amount: '',
                    description: '',
                    payment_method: 'CASH'
                });
            }
        }
    }, [isOpen, initialData]);

    const fetchCategories = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/expense-categories/active');
            if (Array.isArray(res.data)) {
                setCategories(res.data);
            } else {
                setCategories([]);
            }
        } catch (err) {
            console.error(err);
            setCategories([]);
        }
    };

    const fetchPaymentMethods = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/settings/payment-methods?is_active=true');
            if (res.data.success && Array.isArray(res.data.data)) {
                setPaymentMethods(res.data.data);
            } else {
                setPaymentMethods([]);
            }
        } catch (err) {
            console.error('결제 수단 로딩 실패:', err);
            setPaymentMethods([]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const url = initialData
                ? `http://localhost:5000/api/expenses/${initialData.id}`
                : 'http://localhost:5000/api/expenses';
            const method = initialData ? 'put' : 'post';

            await axios[method](url, formData);
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            // alert 대신 커스텀 모달 사용
            setConfirmModal({
                isOpen: true,
                title: '오류',
                message: '저장 중 오류가 발생했습니다.',
                type: 'warning',
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    };

    // 모달 닫기 핸들러
    const closeConfirmModal = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
                <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', width: '500px', maxWidth: '90%', padding: '1.5rem', position: 'relative' }}>
                    <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#2c3e50', fontWeight: '600' }}>{initialData ? '지출 내역 수정' : '지출 내역 등록'}</h3>
                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: '1', color: '#95a5a6', cursor: 'pointer', padding: '0' }}
                        >
                            &times;
                        </button>
                    </div>
                    <div className="modal-body">
                        <form onSubmit={handleSubmit}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#34495e' }}>날짜</label>
                                <input
                                    type="date"
                                    className="trade-input"
                                    value={formData.expense_date}
                                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', height: '38px' }}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#34495e' }}>항목</label>
                                <select
                                    className="trade-input"
                                    value={formData.category_id}
                                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', height: '38px' }}
                                >
                                    <option value="">선택하세요</option>
                                    {Array.isArray(categories) && categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#34495e' }}>금액</label>
                                <input
                                    type="text"
                                    className="trade-input"
                                    value={formData.amount ? Number(formData.amount).toLocaleString() : ''}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/,/g, '');
                                        if (!isNaN(val)) {
                                            setFormData({ ...formData, amount: val });
                                        }
                                    }}
                                    required
                                    placeholder="0"
                                    style={{ width: '100%', padding: '0.5rem', height: '38px', textAlign: 'right' }}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#34495e' }}>적요 (내용)</label>
                                <input
                                    type="text"
                                    className="trade-input"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="지출 상세 내용"
                                    style={{ width: '100%', padding: '0.5rem', height: '38px' }}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#34495e' }}>결제 수단</label>
                                <select
                                    className="trade-input"
                                    value={formData.payment_method}
                                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                    style={{ width: '100%', padding: '0.5rem', height: '38px' }}
                                >
                                    {paymentMethods.length > 0 ? (
                                        paymentMethods.map(pm => (
                                            <option key={pm.id} value={pm.code}>{pm.name}</option>
                                        ))
                                    ) : (
                                        <>
                                            <option value="CASH">현금</option>
                                            <option value="CARD">카드</option>
                                            <option value="TRANSFER">계좌이체</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '2rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onClose}
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    저장
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* 알림 모달 */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={closeConfirmModal}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                showCancel={false} // 알림용이라 취소 버튼 숨김
                confirmText="확인"
            />
        </>
    );
}
