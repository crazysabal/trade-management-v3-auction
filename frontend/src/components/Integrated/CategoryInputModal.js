import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { categoryAPI } from '../../services/api';
import { useModalDraggable } from '../../hooks/useModalDraggable';
import ConfirmModal from '../ConfirmModal';

// Reusing ModalShell pattern (Ideally extract to common)
const CategoryInputModal = ({ isOpen, onClose, onSuccess, initialData, parentId }) => {
    // Fix: check for ID to determine if it's an edit operations
    const isEdit = !!(initialData && initialData.id);
    const [formData, setFormData] = useState({
        category_name: '',
        parent_id: null
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
            if (isEdit && initialData) {
                setFormData({
                    category_name: initialData.category_name,
                    parent_id: initialData.parent_id
                });
            } else {
                // Add Mode
                setFormData({
                    category_name: '',
                    parent_id: parentId
                });
            }
        }
    }, [isOpen, initialData, isEdit, parentId]);

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.category_name.trim()) return;

        try {
            if (isEdit) {
                // Update only name, keeping other fields intact from initialData logic
                await categoryAPI.update(initialData.id, {
                    ...initialData,
                    category_name: formData.category_name
                });
            } else {
                // Create with name, defaults for others
                await categoryAPI.create({
                    ...formData,
                    sort_order: 0, // Default for new, DnD reorders later
                    is_active: true // Default active
                });
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            setConfirmModal({
                isOpen: true,
                type: 'error',
                title: '저장 실패',
                message: '분류 저장 중 오류가 발생했습니다.',
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                showCancel: false
            });
        }
    };

    const inputStyle = {
        padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%', fontSize: '0.9rem', marginBottom: '1rem'
    };
    const labelStyle = { display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.3rem', color: '#334155' };

    return createPortal(
        <div className="modal-overlay">
            <div
                className="styled-modal"
                style={{ width: '400px', ...draggableStyle }}
                onClick={e => e.stopPropagation()}
            >
                <div
                    className="modal-header draggable-header"
                    onMouseDown={handleMouseDown}
                >
                    <h3 className="drag-pointer-none">📁 {isEdit ? '분류 수정' : '분류 추가'}</h3>
                    <button className="close-btn drag-pointer-auto" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <form id="category-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label style={{ width: '80px', minWidth: '80px' }}>분류명</label>
                            <input
                                type="text"
                                value={formData.category_name}
                                onChange={e => setFormData({ ...formData, category_name: e.target.value })}
                                placeholder="분류명을 입력하세요"
                                autoFocus
                                required
                            />
                        </div>
                    </form>
                </div>

                <div className="modal-footer">
                    <button className="modal-btn modal-btn-cancel" onClick={onClose}>취소</button>
                    <button className="modal-btn modal-btn-primary" type="submit" form="category-form">
                        {isEdit ? '수정' : '등록'}
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

export default CategoryInputModal;
