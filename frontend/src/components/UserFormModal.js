import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModalDraggable } from '../hooks/useModalDraggable';

const UserFormModal = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role_id: '',
        is_active: true
    });
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);
    const [error, setError] = useState('');

    const [roles, setRoles] = useState([]);

    useEffect(() => {
        // Fetch roles for dropdown
        const fetchRoles = async () => {
            try {
                const response = await axios.get('/api/roles');
                setRoles(response.data);
            } catch (error) {
                console.error('Failed to fetch roles', error);
            }
        };
        if (isOpen) {
            fetchRoles();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    username: initialData.username || '',
                    password: '', // 비밀번호는 수정 시 비워둠 (입력 시에만 변경)
                    role_id: initialData.role_id || '', // role_id 사용
                    is_active: initialData.is_active !== false
                });
            } else {
                setFormData({
                    username: '',
                    password: '',
                    role_id: '',
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await onSubmit(formData);
        } catch (err) {
            setError(err.response?.data?.message || '저장 중 오류가 발생했습니다.');
        }
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
        <div className="modal-overlay" style={{ zIndex: 10100 }}>
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
                    <div className="modal-body">
                        {error && <div className="error-message" style={{ color: '#d32f2f', backgroundColor: '#ffebee', padding: '8px', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' }}>{error}</div>}
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
                            <label>권한 (역할)</label>
                            <select
                                name="role_id"
                                className="form-select"
                                value={formData.role_id || ''}
                                onChange={handleChange}
                            >
                                <option value="">역할 선택</option>
                                {roles.map(role => (
                                    <option key={role.id} value={role.id}>
                                        {role.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="checkbox-label" style={{ justifyContent: 'flex-start', marginLeft: '100px' }}>
                                <input
                                    type="checkbox"
                                    name="is_active"
                                    checked={formData.is_active}
                                    onChange={handleChange}
                                />
                                계정 활성화 (접속 허용)
                            </label>
                        </div>
                    </div>
                    <div className="modal-footer">
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
