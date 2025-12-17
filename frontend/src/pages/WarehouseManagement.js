import React, { useState, useEffect } from 'react';
import { warehousesAPI } from '../services/api';
import WarehouseModal from '../components/WarehouseModal';
import './Settings.css'; // 설정 페이지 스타일 재사용

const WarehouseManagement = () => {
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    // 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);

    // 드래그 앤 드롭 Refs
    const dragItem = React.useRef();
    const dragOverItem = React.useRef();

    const handleDragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
        // 드래그 중인 행 스타일링 (선택적)
        e.target.classList.add('dragging');
    };

    const handleDragEnter = (e, position) => {
        dragOverItem.current = position;
        e.preventDefault();
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        return false;
    };

    const handleDragEnd = async (e) => {
        e.target.classList.remove('dragging');

        const startIdx = dragItem.current;
        const endIdx = dragOverItem.current;

        if (startIdx === undefined || endIdx === undefined || startIdx === endIdx) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const newWarehouses = [...warehouses];
        const draggedItemContent = newWarehouses[startIdx];

        // 배열 재정렬
        newWarehouses.splice(startIdx, 1);
        newWarehouses.splice(endIdx, 0, draggedItemContent);

        dragItem.current = null;
        dragOverItem.current = null;

        // UI 즉시 업데이트
        setWarehouses(newWarehouses);

        // 서버 저장
        try {
            const orderedIds = newWarehouses.map(w => w.id);
            await warehousesAPI.reorder(orderedIds);
            // 성공 시 조용히 넘어감 (이미 UI는 반영됨)
        } catch (error) {
            showStatus('error', '순서 저장 실패 (새로고침 더미)');
            fetchWarehouses(); // 실패 시 원복
        }
    };

    useEffect(() => {
        fetchWarehouses();
    }, []);

    const fetchWarehouses = async () => {
        setLoading(true);
        try {
            const response = await warehousesAPI.getAll();
            if (response.data.success) {
                setWarehouses(response.data.data);
            }
        } catch (error) {
            showStatus('error', '창고 목록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const showStatus = (type, message) => {
        setStatus({ type, message });
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleCreate = () => {
        setEditData(null);
        setIsModalOpen(true);
    };

    const handleEdit = (warehouse) => {
        setEditData(warehouse);
        setIsModalOpen(true);
    };

    const handleModalSubmit = async (formData) => {
        try {
            if (editData) {
                await warehousesAPI.update(editData.id, formData);
                showStatus('success', '창고 정보가 수정되었습니다.');
            } else {
                await warehousesAPI.create(formData);
                showStatus('success', '새로운 창고가 추가되었습니다.');
            }
            setIsModalOpen(false);
            fetchWarehouses();
        } catch (error) {
            showStatus('error', '처리 중 오류가 발생했습니다.');
        }
    };

    const toggleActive = async (warehouse) => {
        try {
            await warehousesAPI.update(warehouse.id, {
                ...warehouse,
                is_active: !warehouse.is_active
            });
            fetchWarehouses();
        } catch (error) {
            showStatus('error', '상태 변경 실패');
        }
    };

    return (
        <div className="settings-container fade-in">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
                <h1 className="page-title" style={{ margin: 0 }}>🏭 창고 관리</h1>
            </div>



            <div className="settings-content">
                <div className="payment-settings">
                    <div className="settings-section" style={{ width: '100%', maxWidth: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ marginBottom: 0 }}>창고 목록</h2>
                            <button
                                className="btn-primary"
                                onClick={handleCreate}
                                style={{
                                    padding: '0.5rem 1rem',
                                    width: 'auto',
                                    flex: 'none', // Prevent flex-grow from css
                                    fontSize: '0.9rem',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginTop: 0 // Remove any default margins
                                }}
                            >
                                + 새 창고 추가
                            </button>
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '50px', textAlign: 'center' }}>순서</th>
                                        <th>ID</th>
                                        <th>창고명</th>
                                        <th>기본</th>
                                        <th>상태</th>
                                        <th>설명</th>
                                        <th>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {warehouses.length > 0 ? (
                                        warehouses.map((wh, index) => (
                                            <tr
                                                key={wh.id}
                                                className={!wh.is_active ? 'inactive-row' : ''}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, index)}
                                                onDragEnter={(e) => handleDragEnter(e, index)}
                                                onDragOver={handleDragOver}
                                                onDragEnd={handleDragEnd}
                                                style={{ cursor: 'move' }}
                                            >
                                                <td style={{ textAlign: 'center', color: '#aaa', cursor: 'grab' }}>
                                                    ☰
                                                </td>
                                                <td>{wh.id}</td>
                                                <td>{wh.name}</td>
                                                <td>{wh.is_default ? '✅' : ''}</td>
                                                <td>
                                                    <span
                                                        className={`status-badge ${wh.is_active ? 'active' : 'inactive'}`}
                                                        onClick={() => toggleActive(wh)}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {wh.is_active ? '사용 중' : '미사용'}
                                                    </span>
                                                </td>
                                                <td>{wh.description}</td>
                                                <td>
                                                    <button className="btn-icon" onClick={() => handleEdit(wh)} title="수정">✏️</button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                                                {loading ? '로딩 중...' : '등록된 창고가 없습니다.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <WarehouseModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmit}
                initialData={editData}
            />
        </div>
    );
};

export default WarehouseManagement;
