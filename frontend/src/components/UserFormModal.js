import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalDraggable } from '../hooks/useModalDraggable';

const UserFormModal = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'user',
        is_active: true
    });
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    username: initialData.username || '',
                    password: '', // 비밀번호는 수정 시 비워둠 (입력 시에만 변경)
                    role: initialData.role || 'user',
                    is_active: initialData.is_active !== false
                });
            } else {
                setFormData({
                    username: '',
                    password: '',
                    role: 'user',
                    is_active: true
                });
            }
        }
    }, [isOpen, initialData]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    // ESC 키로 닫기
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div
                className="styled-modal"
                onClick={e => e.stopPropagation()}
                style={{ width: '400px', ...draggableStyle }}
            >
                <div
                    className="modal-header draggable-header"
                    onMouseDown={handleMouseDown}
                >
                    <h3 className="drag-pointer-none">👤 {initialData ? '사용자 정보 수정' : '새 사용자 추가'}</h3>
                    <button className="close-btn drag-pointer-auto" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ padding: '1.5rem' }}>
                        <div className="form-group">
                            <label>사용자 아이디</label>
                            <input
                                type="text"
                                name="username"
                                className="form-input"
                                value={formData.username}
                                onChange={handleChange}
                                required
                                disabled={!!initialData}
                                placeholder="아이디"
                            />
                        </div>
                        <div className="form-group">
                            <label>비밀번호 {initialData && '(변경 시에만 입력)'}</label>
                            <input
                                type="password"
                                name="password"
                                className="form-input"
                                value={formData.password}
                                onChange={handleChange}
                                required={!initialData}
                                placeholder="비밀번호"
                            />
                        </div>
                        <div className="form-group">
                            <label>권한</label>
                            <select
                                name="role"
                                className="form-select"
                                value={formData.role}
                                onChange={handleChange}
                            >
                                <option value="user">일반 사용자</option>
                                <option value="admin">관리자</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    name="is_active"
                                    checked={formData.is_active}
                                    onChange={handleChange}
                                    style={{ marginRight: '8px' }}
                                />
                                계정 활성화
                            </label>
                        </div>
                    </div>
                    <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '1rem 1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>취소</button>
                        <button type="submit" className="modal-btn modal-btn-primary">저장</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default UserFormModal;
