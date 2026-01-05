import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
// import UserManagement from './UserManagement'; // Separated to standalone menu
// import './Settings.css'; // Assuming styling is handled in global or not needed if file missing

const Settings = ({ ...rest }) => {
    const [activeTab, setActiveTab] = useState('payment'); // 'general', 'payment'
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    // 폼 상태
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [formData, setFormData] = useState({ code: '', name: '', sort_order: '', is_active: true });

    // 드래그 앤 드롭 상태
    const [dragId, setDragId] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);

    useEffect(() => {
        if (activeTab === 'payment') {
            fetchPaymentMethods();
        }
    }, [activeTab]);

    const fetchPaymentMethods = async () => {
        setLoading(true);
        try {
            const response = await settingsAPI.getPaymentMethods();
            if (response.data.success) {
                setPaymentMethods(response.data.data);
            } else {
                console.error('결제 방법 로딩 실패 (API):', response.data);
            }
        } catch (error) {
            console.error('결제 방법 로딩 오류 (Catch):', error);
            showStatus('error', '데이터를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const showStatus = (type, message) => {
        setStatus({ type, message });
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // 빈 문자열인 경우 undefined로 처리하여 백엔드 자동 생성 유도
            const payload = { ...formData };
            if (!payload.sort_order && payload.sort_order !== 0) {
                delete payload.sort_order;
            }

            if (isEditing) {
                // 수정
                await settingsAPI.updatePaymentMethod(editId, payload);
                showStatus('success', '수정되었습니다.');
            } else {
                // 추가
                await settingsAPI.addPaymentMethod(payload);
                showStatus('success', '추가되었습니다.');
            }
            resetForm();
            fetchPaymentMethods();
        } catch (error) {
            showStatus('error', error.response?.data?.message || '처리 중 오류가 발생했습니다.');
        }
    };

    const handleEdit = (method) => {
        setIsEditing(true);
        setEditId(method.id);
        const methodData = {
            code: method.code,
            name: method.name,
            sort_order: method.sort_order,
            is_active: method.is_active === 1 || method.is_active === true
        };
        setFormData(methodData);
    };

    const resetForm = () => {
        setIsEditing(false);
        setEditId(null);
        setFormData({ code: '', name: '', sort_order: '', is_active: true });
    };

    const toggleActive = async (id, currentStatus) => {
        try {
            await settingsAPI.updatePaymentMethod(id, { is_active: !currentStatus });
            fetchPaymentMethods(); // 목록 갱신
        } catch (error) {
            showStatus('error', '상태 변경 실패');
        }
    };

    // 드래그 앤 드롭 핸들러
    const handleDragStart = (e, id) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, id) => {
        e.preventDefault(); // 필수: drop 허용
        if (dragId === id) return;
        setDragOverId(id);
    };

    const handleDrop = async (e, targetId) => {
        e.preventDefault();
        setDragOverId(null);

        if (!dragId || dragId === targetId) return;

        // 순서 재배치 로직
        const dragItemIndex = paymentMethods.findIndex(item => item.id === dragId);
        const targetItemIndex = paymentMethods.findIndex(item => item.id === targetId);

        if (dragItemIndex === -1 || targetItemIndex === -1) return;

        const newItems = [...paymentMethods];
        const [reorderedItem] = newItems.splice(dragItemIndex, 1);
        newItems.splice(targetItemIndex, 0, reorderedItem);

        // UI 즉시 업데이트 (낙관적 업데이트)
        setPaymentMethods(newItems);

        // 순서 번호 재계산 및 서버 전송 데이터 준비
        const reorderedData = newItems.map((item, index) => ({
            id: item.id,
            sort_order: (index + 1) * 10
        }));

        try {
            await settingsAPI.reorderPaymentMethods(reorderedData);
            showStatus('success', '순서가 변경되었습니다.');
            fetchPaymentMethods();
        } catch (error) {
            console.error('순서 변경 오류:', error);
            showStatus('error', '순서 저장 실패');
            fetchPaymentMethods(); // 실패 시 원복
        }

        setDragId(null);
    };

    return (
        <div className="settings-container fade-in">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
                <h1 className="page-title" style={{ margin: 0 }}>⚙️ 시스템 설정</h1>
            </div>

            {status.message && (
                <div className={`status-message ${status.type}`}>
                    {status.message}
                </div>
            )}

            <div className="settings-tabs">
                <button
                    className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                    onClick={() => setActiveTab('general')}
                >
                    일반 설정
                </button>
                <button
                    className={`tab-btn ${activeTab === 'payment' ? 'active' : ''}`}
                    onClick={() => setActiveTab('payment')}
                >
                    결제 방법 관리
                </button>
            </div>

            <div className="settings-content">
                {activeTab === 'general' && (
                    <div className="general-settings">
                        <div className="settings-section">
                            <h2>윈도우 관리 설정</h2>
                            <div className="setting-item" style={{
                                backgroundColor: 'white',
                                padding: '1.5rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                marginBottom: '1rem'
                            }}>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>앱 실행 모드</h3>
                                <div className="radio-group" style={{ display: 'flex', gap: '2rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="windowMode"
                                            value="multi"
                                            checked={rest.windowMode === 'multi'}
                                            onChange={(e) => rest.setWindowMode && rest.setWindowMode(e.target.value)}
                                            style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: '500' }}>다중 창 모드 (기본)</div>
                                            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                                같은 앱을 여러 개 띄울 수 있습니다.
                                            </div>
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="windowMode"
                                            value="single"
                                            checked={rest.windowMode === 'single'}
                                            onChange={(e) => rest.setWindowMode && rest.setWindowMode(e.target.value)}
                                            style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: '500' }}>단일 창 모드</div>
                                            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                                이미 실행 중인 앱이 있으면 해당 창을 맨 앞으로 가져옵니다.
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'payment' && (
                    <div className="payment-settings">
                        <div className="settings-section">
                            <h2>결제 수단 목록</h2>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>순서</th>
                                            <th>코드</th>
                                            <th>표시명</th>
                                            <th>상태</th>
                                            <th>관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paymentMethods.length > 0 ? (
                                            paymentMethods.map(method => (
                                                <tr
                                                    key={method.id}
                                                    className={`
                                                        ${!method.is_active ? 'inactive-row' : ''}
                                                        draggable-row
                                                        ${dragId === method.id ? 'dragging' : ''}
                                                        ${dragOverId === method.id ? 'drag-over' : ''}
                                                    `}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, method.id)}
                                                    onDragOver={(e) => handleDragOver(e, method.id)}
                                                    onDrop={(e) => handleDrop(e, method.id)}
                                                >
                                                    <td style={{ display: 'flex', alignItems: 'center' }}>
                                                        <span className="drag-handle">≡</span>
                                                        {method.sort_order}
                                                    </td>
                                                    <td>{method.code}</td>
                                                    <td>{method.name}</td>
                                                    <td>
                                                        <span
                                                            className={`status-badge ${method.is_active ? 'active' : 'inactive'}`}
                                                            onClick={() => toggleActive(method.id, method.is_active)}
                                                            title={method.is_active ? '클릭하여 비활성화' : '클릭하여 활성화'}
                                                            style={{ cursor: 'pointer' }}
                                                        >
                                                            {method.is_active ? '사용 중' : '미사용'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button className="btn-icon" onClick={() => handleEdit(method)} title="수정">✏️</button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                                                    {loading ? '데이터를 불러오는 중입니다...' : '등록된 결제 방법이 없습니다.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="settings-section form-section">
                            <h2>{isEditing ? '결제 수단 수정' : '새 결제 수단 추가'}</h2>
                            <form onSubmit={handleSubmit} className="settings-form">
                                <div className="form-group">
                                    <label>코드 (고유값)</label>
                                    <input
                                        type="text"
                                        name="code"
                                        value={formData.code}
                                        onChange={handleInputChange}
                                        disabled={isEditing} // 코드는 수정 불가 (마이그레이션 이슈 방지)
                                        placeholder="예: CRYPTO"
                                        required
                                    />
                                    {isEditing && <small className="helper-text">* 코드는 수정할 수 없습니다.</small>}
                                </div>
                                <div className="form-group">
                                    <label>표시명</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        placeholder="예: 가상화폐"
                                        required
                                    />
                                </div>


                                <div className="form-actions">
                                    <button type="submit" className="btn-primary">
                                        {isEditing ? '수정 저장' : '추가하기'}
                                    </button>
                                    {isEditing && (
                                        <button type="button" className="btn-secondary" onClick={resetForm}>
                                            취소
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Settings;
