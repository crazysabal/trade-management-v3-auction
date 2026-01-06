import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom'; // [PORTAL] Required for MDI Modal Standard
import axios from 'axios';
import './UserManagement.css';
import ConfirmModal from '../components/ConfirmModal';
import UserFormModal from '../components/UserFormModal';
import { useModalDraggable } from '../hooks/useModalDraggable';

const UserManagement = () => {
    const [activeTab, setActiveTab] = useState('users'); // 'users', 'history'
    const [users, setUsers] = useState([]);
    const [history, setHistory] = useState([]);

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
                if (isAddModalOpen) {
                    setIsAddModalOpen(false);
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

        if (isAddModalOpen || isResetModalOpen) {
            window.addEventListener('keydown', handleEsc);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isAddModalOpen, isResetModalOpen]);

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

    // Helper to render modal via Portal (MDI Standard)
    const renderModal = (content) => {
        return ReactDOM.createPortal(
            content,
            document.body
        );
    };

    return (
        <div className="user-management-container fade-in">
            {/* ... (existing header and list content) ... */}
            <div className="um-header">
                <h2>사용자/직원 관리</h2>
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
                            <button className="add-user-btn" onClick={() => setIsAddModalOpen(true)}>
                                + 사용자 추가
                            </button>
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
                                                {(user.role && user.role.toLowerCase() === 'admin') ? '관리자' : '직원'}
                                            </span>
                                        </div>
                                        <span className="user-subinfo">
                                            가입일: {new Date(user.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="user-actions-row">
                                        <button className="action-btn reset" onClick={() => openResetModal(user.id, user.username)}>
                                            비번변경
                                        </button>
                                        <button className="action-btn delete" onClick={() => openDeleteModal(user.id, user.username)}>
                                            삭제
                                        </button>
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
                    message={`'${deleteTarget.username}' 사용자를 삭제하시겠습니까?\n(작성한 전표가 있을 경우 문제가 될 수 있습니다.)`}
                    type="delete"
                    confirmText="삭제"
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
                                {history.length > 0 ? history.map(log => (
                                    <tr key={log.id}>
                                        <td>{new Date(log.created_at).toLocaleString()}</td>
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
                                )) : (
                                    <tr>
                                        <td colSpan="5" className="empty-state">이력이 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add User Modal - Extracted */}
            <UserFormModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={() => {
                    setSuccessMsg('사용자가 추가되었습니다.');
                    fetchUsers();
                    setTimeout(() => setSuccessMsg(''), 3000);
                }}
            />

            {/* Reset Password Modal - Portaled */}
            {isResetModalOpen && renderModal(
                <div className="modal-overlay" onClick={() => setIsResetModalOpen(false)} style={{ zIndex: 9999 }}>{/* Enhanced z-index for portal */}
                    <div
                        className="styled-modal um-modal"
                        onClick={e => e.stopPropagation()}
                        style={resetDragStyle}
                    >
                        <div
                            className="modal-header"
                            onMouseDown={handleResetDrag}
                            style={{ cursor: 'grab' }}
                        >
                            <h3 style={{ pointerEvents: 'none' }}>비밀번호 변경</h3>
                            <button className="close-btn" onClick={() => setIsResetModalOpen(false)} style={{ pointerEvents: 'auto' }}>×</button>
                        </div>
                        <form onSubmit={handleResetPassword}>
                            <div className="modal-body">
                                {error && <p className="error-text">{error}</p>}
                                <p className="modal-desc">
                                    <strong>{resetTarget.username}</strong> 사용자의 새로운 비밀번호를 입력해주세요.
                                </p>
                                <div className="form-group">
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
