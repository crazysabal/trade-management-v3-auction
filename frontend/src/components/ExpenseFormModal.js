import React, { useState, useEffect } from 'react';
import { expenseAPI, expenseCategoryAPI, settingsAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal'; // ConfirmModal 추가
import { useModalDraggable } from '../hooks/useModalDraggable';


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
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

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
            const res = await expenseCategoryAPI.getAll({ is_active: true });
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
            const res = await settingsAPI.getPaymentMethods({ is_active: true });
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
            if (initialData) {
                await expenseAPI.update(initialData.id, formData);
            } else {
                await expenseAPI.create(formData);
            }
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

    // ESC handling
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay">
                <div
                    className="styled-modal"
                    style={{ width: '500px', ...draggableStyle }}
                    onClick={e => e.stopPropagation()}
                >
                    <div
                        className="modal-header"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: 'grab' }}
                    >
                        <h3 style={{ pointerEvents: 'none' }}>💸 {initialData ? '지출 내역 수정' : '새 지출 내역 등록'}</h3>
                        <button className="close-btn" onClick={onClose} style={{ pointerEvents: 'auto' }}>&times;</button>
                    </div>

                    <div className="modal-body">
                        <form id="expense-form" onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>지출 일자</label>
                                <input
                                    type="date"
                                    value={formData.expense_date}
                                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>계정 과목</label>
                                <select
                                    value={formData.category_id}
                                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                                    required
                                >
                                    <option value="">(선택)</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name || cat.category_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>금액</label>
                                <input
                                    type="text"
                                    value={formData.amount ? Number(formData.amount).toLocaleString() : ''}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/,/g, '');
                                        if (!isNaN(val)) setFormData({ ...formData, amount: val });
                                    }}
                                    required
                                    placeholder="0"
                                    style={{ textAlign: 'right' }}
                                />
                            </div>

                            <div className="form-group">
                                <label>적요 (내용)</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="지출 상세 내용"
                                />
                            </div>

                            <div className="form-group">
                                <label>결제 수단</label>
                                <select
                                    value={formData.payment_method}
                                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
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
                        </form>
                    </div>

                    <div className="modal-footer">
                        <button className="modal-btn modal-btn-cancel" onClick={onClose}>취소</button>
                        <button className="modal-btn modal-btn-primary" type="submit" form="expense-form">저장</button>
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
                showCancel={false}
                confirmText="확인"
            />
        </>
    );
}
