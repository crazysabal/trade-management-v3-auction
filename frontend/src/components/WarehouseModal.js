import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalDraggable } from '../hooks/useModalDraggable';
import ConfirmModal from './ConfirmModal';

const WarehouseModal = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState({
        name: '',
        type: 'STORAGE',
        is_default: false,
        is_active: true,
        description: '',
        address: ''
    });
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        type: 'warning',
        title: '',
        message: '',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
    });
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    name: initialData.name,
                    type: initialData.type || 'STORAGE',
                    is_default: initialData.is_default === 1,
                    is_active: initialData.is_active === 1,
                    description: initialData.description || '',
                    address: initialData.address || ''
                });
            } else {
                setFormData({
                    name: '',
                    type: 'STORAGE',
                    is_default: false,
                    is_active: true,
                    description: '',
                    address: ''
                });
            }
        }
    }, [isOpen, initialData]);

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

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = () => {
        if (!formData.name.trim()) {
            setConfirmModal({
                isOpen: true,
                type: 'warning',
                title: '입력 확인',
                message: '창고명을 입력해주세요.',
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                showCancel: false
            });
            return;
        }
        onSubmit(formData);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 10100 }}>
            <div
                className="styled-modal"
                style={{
                    width: '500px',
                    ...draggableStyle
                }}
                onClick={e => e.stopPropagation()}
            >
                <div
                    className="modal-header draggable-header"
                    onMouseDown={handleMouseDown}
                >
                    <h3 className="drag-pointer-none">📦 {initialData ? '창고 수정' : '새 창고 등록'}</h3>
                    <button className="close-btn drag-pointer-auto" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <form id="warehouse-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
                        <div className="form-group">
                            <label>창고명</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="예: 제1창고, 부산 물류센터"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>주소</label>
                            <input
                                type="text"
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                placeholder="주소 입력"
                            />
                        </div>

                        <div className="form-group align-top">
                            <label style={{ marginTop: '0.6rem' }}>설명</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                rows="3"
                                placeholder="창고에 대한 설명..."
                                style={{ flex: 1, minHeight: '6rem' }}
                            />
                        </div>

                        <div className="form-group">
                            <label>기본창고</label>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    name="is_default"
                                    checked={formData.is_default}
                                    onChange={handleChange}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer', margin: 0 }}
                                />
                                <span style={{ marginLeft: '10px', fontSize: '0.85rem', color: '#666' }}>
                                    💡 체크 시 입고/이동 시 기본 선택됨
                                </span>
                            </div>
                        </div>
                    </form>
                </div>

                <div className="modal-footer">
                    <button className="modal-btn modal-btn-cancel" onClick={onClose}>취소</button>
                    <button className="modal-btn modal-btn-primary" type="submit" form="warehouse-form">
                        {initialData ? '저장' : '추가'}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                type={confirmModal.type}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                confirmText="확인"
                showCancel={false}
            />
        </div>,
        document.body
    );
};

export default WarehouseModal;
