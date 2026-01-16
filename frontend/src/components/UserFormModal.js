import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModalDraggable } from '../hooks/useModalDraggable';

const UserFormModal = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        passwordConfirm: '',
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
                    passwordConfirm: '',
                    role_id: initialData.role_id || '', // role_id 사용
                    is_active: initialData.is_active !== false
                });
            } else {
                setFormData({
                    username: '',
                    password: '',
                    passwordConfirm: '',
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

        if (formData.password !== formData.passwordConfirm) {
            setError('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
            return;
        }

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
                                autoComplete="new-password"
                                style={{
                                    backgroundColor: (formData.password || formData.passwordConfirm)
                                        ? (formData.password === formData.passwordConfirm ? '#f0fdf4' : '#fef2f2')
                                        : '#fff',
                                    borderColor: (formData.password || formData.passwordConfirm)
                                        ? (formData.password === formData.passwordConfirm ? '#22c55e' : '#ef4444')
                                        : '#cbd5e1',
                                    transition: 'background-color 0.1s ease, border-color 0.1s ease'
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label>비밀번호 확인</label>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <input
                                    type="password"
                                    name="passwordConfirm"
                                    className="form-input"
                                    value={formData.passwordConfirm}
                                    onChange={handleChange}
                                    required={!!formData.password || !initialData}
                                    placeholder="비밀번호 확인"
                                    autoComplete="new-password"
                                    style={{
                                        backgroundColor: (formData.password || formData.passwordConfirm)
                                            ? (formData.password === formData.passwordConfirm ? '#f0fdf4' : '#fef2f2')
                                            : '#fff',
                                        borderColor: (formData.password || formData.passwordConfirm)
                                            ? (formData.password === formData.passwordConfirm ? '#22c55e' : '#ef4444')
                                            : '#cbd5e1',
                                        transition: 'background-color 0.1s ease, border-color 0.1s ease',
                                        width: '100%'
                                    }}
                                />
                                {(formData.password || formData.passwordConfirm) && (
                                    <p style={{
                                        fontSize: '0.75rem',
                                        marginTop: '4px',
                                        color: formData.password === formData.passwordConfirm ? '#166534' : '#991b1b',
                                        whiteSpace: 'nowrap',
                                        fontWeight: '500'
                                    }}>
                                        {formData.password === formData.passwordConfirm ? '✓ 비밀번호가 일치합니다.' : '✗ 비밀번호가 일치하지 않습니다.'}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="form-group" style={{ opacity: initialData?.username === 'admin' ? 0.7 : 1 }}>
                            <label>권한 (역할)</label>
                            <select
                                name="role_id"
                                className="form-select"
                                value={formData.role_id || ''}
                                onChange={handleChange}
                                disabled={initialData?.username === 'admin'}
                                style={{ backgroundColor: initialData?.username === 'admin' ? '#f1f5f9' : '#fff' }}
                            >
                                <option value="">역할 선택</option>
                                {roles.map(role => (
                                    <option key={role.id} value={role.id}>
                                        {role.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group" style={{ opacity: initialData?.username === 'admin' ? 0.7 : 1 }}>
                            {/* Label spacer for alignment */}
                            <div style={{ width: '100px', minWidth: '100px', marginRight: '1rem' }} />
                            <label className="checkbox-label" style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: initialData?.username === 'admin' ? 'not-allowed' : 'pointer',
                                margin: 0
                            }}>
                                <input
                                    type="checkbox"
                                    name="is_active"
                                    checked={formData.is_active}
                                    onChange={handleChange}
                                    disabled={initialData?.username === 'admin'}
                                    style={{ width: 'auto', height: 'auto', flex: 'none' }}
                                />
                                <span>계정 활성화 (접속 허용)</span>
                            </label>
                        </div>
                        {initialData?.username === 'admin' && (
                            <div style={{ fontSize: '0.8rem', color: '#64748b', paddingLeft: '115px', marginTop: '-5px' }}>
                                🛡️ 최고 관리자 계정의 권한 및 상태는 고정되어 있습니다.
                            </div>
                        )}
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
