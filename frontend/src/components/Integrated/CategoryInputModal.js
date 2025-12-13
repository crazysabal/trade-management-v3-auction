
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { categoryAPI } from '../../services/api';

// Reusing ModalShell pattern (Ideally extract to common)
const ModalShell = ({ isOpen, onClose, title, children }) => {
    useEffect(() => {
        if (isOpen) {
            const previousActiveElement = document.activeElement;
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    onClose();
                }
            };
            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                if (previousActiveElement?.focus) previousActiveElement.focus();
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div style={{
                backgroundColor: 'white', borderRadius: '12px', width: '90%', maxWidth: '400px',
                display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{title}</h3>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

const CategoryInputModal = ({ isOpen, onClose, onSuccess, initialData, parentId }) => {
    const isEdit = !!initialData;
    const [formData, setFormData] = useState({
        category_name: '',
        parent_id: null
    });

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
            alert('저장 중 오류가 발생했습니다.');
        }
    };

    const inputStyle = {
        padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%', fontSize: '0.9rem', marginBottom: '1rem'
    };
    const labelStyle = { display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.3rem', color: '#334155' };

    return (
        <ModalShell isOpen={isOpen} onClose={onClose} title={isEdit ? '분류 수정' : '분류 추가'}>
            <form onSubmit={handleSubmit}>
                <div>
                    <label style={labelStyle}>분류명</label>
                    <input
                        type="text"
                        value={formData.category_name}
                        onChange={e => setFormData({ ...formData, category_name: e.target.value })}
                        style={inputStyle}
                        placeholder="분류명을 입력하세요"
                        autoFocus
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <button type="button" onClick={onClose} style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: 'white', cursor: 'pointer' }}>취소</button>
                    <button type="submit" style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                        {isEdit ? '수정' : '등록'}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
};

export default CategoryInputModal;
