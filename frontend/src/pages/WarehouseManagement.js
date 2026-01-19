import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { warehousesAPI } from '../services/api';
import WarehouseModal from '../components/WarehouseModal';
import ConfirmModal from '../components/ConfirmModal';
import useTableDnd from '../hooks/useTableDnd';
import TableDndRow from '../components/TableDndRow';
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

    // 드래그 앤 드롭 Refs - 제거됨 (Standard 35.30: useTableDnd 사용)

    const handleReorder = async (newItems) => {
        const orderedIds = newItems.map(w => w.id);
        try {
            await warehousesAPI.reorder(orderedIds);
        } catch (error) {
            showStatus('error', '순서 저장 실패');
            fetchWarehouses();
        }
    };

    const {
        localItems: displayedWarehouses,
        columnWidths,
        onDragStart,
        onDragEnd
    } = useTableDnd(warehouses, handleReorder);

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
        <div className="warehouse-management" style={{
            display: 'block',
            height: 'auto',
            padding: '0.5rem',
            overflow: 'visible'
        }}>
            {/* Standard 35.31: Sticky Utility Bar */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 110,
                backgroundColor: 'white',
                padding: '0.5rem',
                borderBottom: '1px solid #e5e7eb',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                marginBottom: '0.5rem',
                textAlign: 'right'
            }}>
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

            <div className="table-container" style={{ overflow: 'visible' }}>
                <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
                    <table className="trade-Table" style={{ width: '100%', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: '54px', zIndex: 10 }}>
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
                        <Droppable droppableId="warehouse-list">
                            {(provided) => (
                                <tbody ref={provided.innerRef} {...provided.droppableProps}>
                                    {displayedWarehouses.length > 0 ? (
                                        displayedWarehouses.map((wh, index) => (
                                            <Draggable key={wh.id} draggableId={String(wh.id)} index={index}>
                                                {(provided, snapshot) => (
                                                    <TableDndRow provided={provided} snapshot={snapshot}>
                                                        <tr
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            className={!wh.is_active ? 'inactive-row' : 'hover-row'}
                                                            style={{
                                                                ...provided.draggableProps.style,
                                                                backgroundColor: snapshot.isDragging ? '#f8fafc' : (index % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                                                boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
                                                                opacity: snapshot.isDragging ? 0.9 : 1
                                                            }}
                                                        >
                                                            <td
                                                                {...provided.dragHandleProps}
                                                                style={{
                                                                    textAlign: 'center',
                                                                    color: snapshot.isDragging ? '#3182ce' : '#cbd5e0',
                                                                    padding: '0.5rem',
                                                                    fontSize: '1.2rem',
                                                                    cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                                                                    width: snapshot.isDragging ? columnWidths[0] : '50px'
                                                                }}
                                                            >
                                                                ☰
                                                            </td>
                                                            <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[1] } : {}) }}>{index + 1}</td>
                                                            <td style={{ padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[2] } : {}) }}>{wh.name}</td>
                                                            <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[3] } : {}) }}>{wh.is_default ? '✅' : ''}</td>
                                                            <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[4] } : {}) }}>
                                                                <span
                                                                    className={`badge ${wh.is_active ? 'badge-success' : 'badge-secondary'}`}
                                                                    onClick={() => toggleActive(wh)}
                                                                    style={{ cursor: 'pointer' }}
                                                                >
                                                                    {wh.is_active ? '사용' : '미사용'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[5] } : {}) }}>{wh.description}</td>
                                                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[6] } : {}) }}>
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
                                                    </TableDndRow>
                                                )}
                                            </Draggable>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
                                                {loading ? '로딩 중...' : '등록된 창고가 없습니다.'}
                                            </td>
                                        </tr>
                                    )}
                                    {provided.placeholder}
                                </tbody>
                            )}
                        </Droppable>
                    </table>
                </DragDropContext>
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
