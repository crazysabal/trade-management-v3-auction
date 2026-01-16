import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalDraggable } from '../hooks/useModalDraggable';

const PaymentMethodModal = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState({
        name: '',
        is_active: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Draggable Modal Hook
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    name: initialData.name || '',
                    is_active: initialData.is_active === 1 || initialData.is_active === true
                });
            } else {
                setFormData({
                    name: '',
                    is_active: true
                });
            }
            setError('');
        }
    }, [isOpen, initialData]);

    // ESC handling
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await onSubmit(formData);
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || '저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 11000
        }} onClick={onClose}>
            <div
                className="styled-modal"
                style={{
                    width: '400px',
                    background: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                    ...draggableStyle
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header (Draggable) */}
                <div
                    className="modal-header draggable-header"
                    onMouseDown={handleMouseDown}
                    style={{
                        padding: '1.25rem',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'move',
                        borderTopLeftRadius: '12px',
                        borderTopRightRadius: '12px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.25rem' }}>💳</span>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>
                            {initialData ? '결제 방법 수정' : '새 결제 방법 추가'}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b', lineHeight: 1 }}
                    >
                        &times;
                    </button>
                </div>

                {/* Form Body */}
                <div className="modal-body" style={{ padding: '1.5rem' }}>
                    <form id="payment-method-form" onSubmit={handleSubmit}>
                        {error && (
                            <div style={{ marginBottom: '1rem', padding: '10px', borderRadius: '6px', backgroundColor: '#fff5f5', color: '#c53030', fontSize: '0.85rem', border: '1px solid #feb2b2' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                            <label style={{ width: '80px', minWidth: '80px', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>명칭</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="예: 우리은행, 국민카드, 현금 등"
                                required
                                autoFocus
                                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                            />
                        </div>

                        <div className="form-group" style={{ display: 'flex', alignItems: 'center' }}>
                            <label style={{ width: '80px', minWidth: '80px', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>상태</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    name="is_active"
                                    checked={formData.is_active}
                                    onChange={handleChange}
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <span style={{ fontSize: '0.9rem', color: '#475569' }}>현재 사용함</span>
                            </label>
                        </div>
                    </form>
                </div>

                {/* Footer Actions */}
                <div className="modal-footer" style={{ padding: '1.25rem', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose} disabled={loading} style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
                        취소
                    </button>
                    <button type="submit" form="payment-method-form" className="modal-btn modal-btn-primary" disabled={loading} style={{
                        padding: '8px 24px', borderRadius: '6px', border: 'none',
                        background: loading ? '#94a3b8' : '#3b82f6', color: 'white', fontWeight: '600',
                        cursor: 'pointer', fontSize: '0.9rem'
                    }}>
                        {loading ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PaymentMethodModal;
