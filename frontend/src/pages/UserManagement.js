import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom'; // [PORTAL] Required for MDI Modal Standard
import axios from 'axios';
import './UserManagement.css';
import ConfirmModal from '../components/ConfirmModal';
import UserFormModal from '../components/UserFormModal';
import { useModalDraggable } from '../hooks/useModalDraggable';
import { usePermission } from '../hooks/usePermission'; // RBAC Hook

const UserManagement = () => {
    const { hasPermission } = usePermission();
    const [activeTab, setActiveTab] = useState('users'); // 'users', 'history'
    const [users, setUsers] = useState([]);
    const [history, setHistory] = useState([]);

    // Modals
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null); // null for add, {user} for edit
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);

    // Draggable for Reset Password Modal
    const { handleMouseDown: handleResetDrag, draggableStyle: resetDragStyle } = useModalDraggable(isResetModalOpen);

    // Forms
    const [resetTarget, setResetTarget] = useState({ id: null, username: '', newPassword: '' });

    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [errorBanner, setErrorBanner] = useState(''); // [New] Global error banner

    useEffect(() => {
        if (activeTab === 'users') {
            fetchUsers();
        } else {
            fetchHistory();
        }
    }, [activeTab]);

    // [New] Handle ESC key to close modals
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                if (isFormModalOpen) {
                    setIsFormModalOpen(false);
                    setEditingUser(null);
                    setError(''); // Clear modal error
                    e.stopPropagation();
                }
                if (isResetModalOpen) {
                    setIsResetModalOpen(false);
                    setError(''); // Clear modal error
                    e.stopPropagation();
                }
            }
        };

        if (isFormModalOpen || isResetModalOpen) {
            window.addEventListener('keydown', handleEsc);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isFormModalOpen, isResetModalOpen]);

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/users');
            setUsers(response.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await axios.get('/api/users/history');
            setHistory(response.data);
        } catch (err) {
            console.error('History fetch error', err);
        }
    };



    // [New] Delete Confirmation State
    const [deleteTarget, setDeleteTarget] = useState({ id: null, username: '' });
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const openDeleteModal = (id, username) => {
        setDeleteTarget({ id, username });
        setIsDeleteConfirmOpen(true);
    };

    const handleDeleteUser = async () => {
        if (!deleteTarget.id) return;

        try {
            await axios.delete(`/api/users/${deleteTarget.id}`);
            fetchUsers();
            setSuccessMsg('사용자가 삭제되었습니다.');
            setTimeout(() => setSuccessMsg(''), 3000);
            setIsDeleteConfirmOpen(false);
        } catch (err) {
            // [UX] Alert -> Error Banner
            setIsDeleteConfirmOpen(false); // Close confirmation first
            setErrorBanner(err.response?.data?.message || '삭제 실패');
            setTimeout(() => setErrorBanner(''), 4000);
        }
    };

    const openResetModal = (id, username) => {
        setError(''); // Reset error state on open
        setResetTarget({ id, username, newPassword: '' });
        setIsResetModalOpen(true);
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!resetTarget.newPassword) return;

        try {
            await axios.put(`/api/users/${resetTarget.id}/password`, { newPassword: resetTarget.newPassword });
            setSuccessMsg('비밀번호가 변경되었습니다.');
            setIsResetModalOpen(false);
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            // [UX] Alert -> Modal Error
            setError(err.response?.data?.message || '비밀번호 변경 실패');
        }
    };

    // [New] Handle Add/Edit Submit
    const handleFormSubmit = async (formData) => {
        try {
            if (editingUser) {
                // UPDATE
                await axios.put(`/api/users/${editingUser.id}`, {
                    role_id: formData.role_id,
                    is_active: formData.is_active
                });
                setSuccessMsg('사용자 정보가 수정되었습니다.');
            } else {
                // CREATE
                await axios.post('/api/users', formData);
                setSuccessMsg('사용자가 추가되었습니다.');
            }

            setIsFormModalOpen(false);
            setEditingUser(null);
            fetchUsers();
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            // Error handling is inside the modal or passed back
            throw err;
        }
    };

    // Helper to render modal via Portal (MDI Standard)

    return (
        <div className="user-management-container fade-in">
            {/* ... (existing header and list content) ... */}
            <div className="um-header">
                <div className="um-tabs">
                    <button
                        className={`um-tab ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        👥 사용자 목록
                    </button>
                    <button
                        className={`um-tab ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        📜 접속 이력
                    </button>
                </div>
            </div>

            {successMsg && <div className="success-banner">{successMsg}</div>}
            {errorBanner && <div className="error-banner">{errorBanner}</div>}

            <div className="um-content">
                {activeTab === 'users' && (
                    <>
                        <div className="content-actions">
                            <span className="info-text">총 {users.length}명의 사용자가 있습니다.</span>
                            {hasPermission('USER_MANAGEMENT', 'CREATE') && (
                                <button className="add-user-btn" onClick={() => { setEditingUser(null); setIsFormModalOpen(true); }}>
                                    + 사용자 추가
                                </button>
                            )}
                        </div>
                        <div className="user-list-grid">
                            {users.map(user => (
                                <div className="user-card" key={user.id}>
                                    <div className="user-avatar">
                                        {(user.role && user.role.toLowerCase() === 'admin') ? '🛡️' : '👤'}
                                    </div>
                                    <div className="user-info">
                                        <div className="user-main-row">
                                            <span className="user-name">{user.username}</span>
                                            <span className={`role-badge ${user.role}`}>
                                                {user.role || '미지정'}
                                            </span>
                                            {!user.is_active && <span className="status-badge inactive">비활성</span>}
                                        </div>
                                        <span className="user-subinfo">
                                            가입일: {(() => {
                                                const d = new Date(user.created_at);
                                                return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                            })()}
                                        </span>
                                    </div>
                                    <div className="user-actions-row">
                                        {hasPermission('USER_MANAGEMENT', 'UPDATE') && (
                                            <>
                                                <button className="action-btn edit" onClick={() => { setEditingUser(user); setIsFormModalOpen(true); }}>
                                                    정보수정
                                                </button>
                                                <button className="action-btn reset" onClick={() => openResetModal(user.id, user.username)}>
                                                    비번변경
                                                </button>
                                            </>
                                        )}
                                        {hasPermission('USER_MANAGEMENT', 'DELETE') && (
                                            <button className="action-btn delete" onClick={() => openDeleteModal(user.id, user.username)}>
                                                삭제
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* [New] Delete Confirmation Modal */}
                <ConfirmModal
                    isOpen={isDeleteConfirmOpen}
                    onClose={() => setIsDeleteConfirmOpen(false)}
                    onConfirm={handleDeleteUser}
                    title="사용자 삭제"
                    message={
                        <div className="safe-delete-message">
                            <p className="main-warning">
                                <strong>'{deleteTarget.username}'</strong> 사용자를 삭제하시겠습니까?
                            </p>
                            <div className="warning-detail">
                                <p>⚠️ 주의: 사용자가 작성한 전표나 활동 이력이 있을 경우 데이터 무결성에 영향을 줄 수 있습니다.</p>
                                <p>가급적 계정 삭제보다는 비밀번호 변경을 통한 접속 차단을 권장합니다.</p>
                            </div>
                        </div>
                    }
                    type="delete"
                    confirmText="사용자 삭제"
                    cancelText="취소"
                />

                {activeTab === 'history' && (
                    <div className="history-list">
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>시간</th>
                                    <th>사용자</th>
                                    <th>활동</th>
                                    <th>IP 주소</th>
                                    <th>디바이스 정보</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.length > 0 ? history.map(log => {
                                    const d = new Date(log.created_at);
                                    const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                    return (
                                        <tr key={log.id}>
                                            <td>{dateStr}</td>
                                            <td>
                                                {log.username}
                                                <span className={`small-badge ${log.role}`}>{log.role}</span>
                                            </td>
                                            <td>
                                                <span className={`action-badge ${log.action_type}`}>
                                                    {log.action_type === 'LOGIN' ? '로그인' : '로그아웃'}
                                                </span>
                                            </td>
                                            <td>{log.ip_address}</td>
                                            <td title={log.user_agent} className="truncate-cell">{log.user_agent}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="5" className="empty-state">이력이 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* User Form Modal (Add/Edit) */}
            <UserFormModal
                isOpen={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingUser(null); }}
                onSubmit={handleFormSubmit}
                initialData={editingUser}
            />

            {/* Reset Password Modal - Portaled */}
            {isResetModalOpen && renderModal(
                <div className="modal-overlay" onClick={() => setIsResetModalOpen(false)} style={{ zIndex: 10200 }}>
                    <div
                        className="styled-modal um-modal"
                        onClick={e => e.stopPropagation()}
                        style={resetDragStyle}
                    >
                        <div
                            className="modal-header draggable-header"
                            onMouseDown={handleResetDrag}
                        >
                            <h3 className="drag-pointer-none">비밀번호 변경</h3>
                            <button className="close-btn drag-pointer-auto" onClick={() => setIsResetModalOpen(false)}>×</button>
                        </div>
                        <form onSubmit={handleResetPassword}>
                            <div className="modal-body">
                                {error && <p className="error-text">{error}</p>}
                                <p className="modal-desc">
                                    <strong>{resetTarget.username}</strong> 사용자의 새로운 비밀번호를 입력해주세요.
                                </p>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label>새 비밀번호</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={resetTarget.newPassword}
                                        onChange={e => setResetTarget({ ...resetTarget, newPassword: e.target.value })}
                                        required
                                        placeholder="새로운 비밀번호"
                                        autoFocus
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setIsResetModalOpen(false)}>취소</button>
                                <button type="submit" className="modal-btn modal-btn-primary">변경하기</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
