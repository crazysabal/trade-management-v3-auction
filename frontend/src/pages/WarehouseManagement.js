import React, { useState, useEffect } from 'react';
import { warehousesAPI } from '../services/api';
import WarehouseModal from '../components/WarehouseModal';
import ConfirmModal from '../components/ConfirmModal';
import './Settings.css'; // 설정 페이지 스타일 재사용

const WarehouseManagement = () => {
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    // 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);

    // 삭제 확인 모달 상태
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, name: '' });
    // 경고 모달 상태 (재고 있음)
    const [warningModal, setWarningModal] = useState({ isOpen: false, message: '' });

    // 드래그 앤 드롭 Refs
    const dragItem = React.useRef();
    const dragOverItem = React.useRef();

    const handleDragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
        // 드래그 이미지를 행 전체로 설정
        const row = e.target.closest('tr');
        if (row) {
            e.dataTransfer.setDragImage(row, 0, 0);
        }
        // 드래그 중인 행 스타일링 (선택적)
        if (row) row.classList.add('dragging');
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

    const handleDelete = (warehouse) => {
        if (warehouse.stock_count > 0) {
            setWarningModal({
                isOpen: true,
                message: `현재 이 창고에는 ${warehouse.stock_count}건의 재고가 남아있습니다.\n재고가 있는 창고는 삭제할 수 없습니다.`
            });
            return;
        }
        setDeleteModal({ isOpen: true, id: warehouse.id, name: warehouse.name });
    };

    const confirmDelete = async () => {
        if (!deleteModal.id) return;
        try {
            await warehousesAPI.delete(deleteModal.id);
            showStatus('success', '창고가 삭제되었습니다.');
            fetchWarehouses();
        } catch (error) {
            showStatus('error', error.response?.data?.message || '삭제 중 오류가 발생했습니다.');
        } finally {
            setDeleteModal({ isOpen: false, id: null, name: '' });
        }
    };

    return (
        <div className="warehouse-management" style={{ width: '100%', height: '100%', padding: '0.5rem' }}>
            {/* 상단 버튼 영역 */}
            <div style={{ textAlign: 'right', marginBottom: '0.5rem' }}>
                <button
                    onClick={handleCreate}
                    className="btn btn-primary"
                    style={{
                        fontSize: '0.9rem',
                        padding: '0.4rem 1.2rem',
                        width: 'auto',
                        minWidth: '0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none'
                    }}
                >
                    + 창고 추가
                </button>
            </div>

            <div className="table-container">
                <table className="trade-Table" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '50px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}></th>
                            <th style={{ width: '80px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>순서</th>
                            <th style={{ padding: '0.5rem', fontSize: '0.85rem' }}>창고명</th>
                            <th style={{ width: '80px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>기본</th>
                            <th style={{ width: '100px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>상태</th>
                            <th style={{ padding: '0.5rem', fontSize: '0.85rem' }}>설명</th>
                            <th style={{ width: '140px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {warehouses.length > 0 ? (
                            warehouses.map((wh, index) => (
                                <tr
                                    key={wh.id}
                                    className={!wh.is_active ? 'inactive-row' : 'hover-row'}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                    onDragOver={handleDragOver}
                                    onDragEnd={handleDragEnd}
                                >
                                    <td style={{ textAlign: 'center', color: '#adb5bd', padding: '0.5rem', fontSize: '0.85rem' }}>
                                        <span
                                            className="drag-handle"
                                            draggable={true}
                                            onDragStart={(e) => handleDragStart(e, index)}
                                            style={{ cursor: 'grab', display: 'inline-block', width: '100%', height: '100%' }}
                                            title="드래그하여 순서 변경"
                                        >
                                            ☰
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>{index + 1}</td>
                                    <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{wh.name}</td>
                                    <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>{wh.is_default ? '✅' : ''}</td>
                                    <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>
                                        <span
                                            className={`badge ${wh.is_active ? 'badge-success' : 'badge-secondary'}`}
                                            onClick={() => toggleActive(wh)}
                                        >
                                            {wh.is_active ? '사용' : '미사용'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{wh.description}</td>
                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '0.5rem', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => handleEdit(wh)}
                                                style={{
                                                    fontSize: '0.8rem',
                                                    padding: '2px 8px',
                                                    width: 'auto',
                                                    minWidth: '0',
                                                    height: '28px',
                                                    whiteSpace: 'nowrap',
                                                    flex: 'none'
                                                }}
                                            >
                                                수정
                                            </button>
                                            <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => handleDelete(wh)}
                                                style={{
                                                    fontSize: '0.8rem',
                                                    padding: '2px 8px',
                                                    width: 'auto',
                                                    minWidth: '0',
                                                    height: '28px',
                                                    whiteSpace: 'nowrap',
                                                    flex: 'none'
                                                }}
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
                                    {loading ? '로딩 중...' : '등록된 창고가 없습니다.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#6c757d' }}>
                💡 목록의 ☰ 아이콘을 드래그하여 순서를 변경할 수 있습니다.<br />
                💡 상태 뱃지를 클릭하여 사용 여부를 변경할 수 있습니다.
            </div>

            <WarehouseModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmit}
                initialData={editData}
            />

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
                onConfirm={confirmDelete}
                title="창고 삭제"
                message={`[${deleteModal.name}] 창고를 정말 삭제하시겠습니까?`}
                type="delete"
                confirmText="삭제"
                cancelText="취소"
            />

            <ConfirmModal
                isOpen={warningModal.isOpen}
                onClose={() => setWarningModal({ isOpen: false, message: '' })}
                onConfirm={() => setWarningModal({ isOpen: false, message: '' })}
                title="삭제 불가"
                message={warningModal.message}
                type="warning"
                confirmText="확인"
                showCancel={false}
            />
        </div>
    );
};

export default WarehouseManagement;
