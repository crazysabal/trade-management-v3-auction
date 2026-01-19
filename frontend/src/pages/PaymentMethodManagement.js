import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { settingsAPI } from '../services/api';
import PaymentMethodModal from '../components/PaymentMethodModal';
import { useConfirmModal } from '../components/ConfirmModal';
import useTableDnd from '../hooks/useTableDnd';
import TableDndRow from '../components/TableDndRow';
import '../components/TradePanel.css'; // 공통 테이블 스타일 사용

const PaymentMethodManagement = ({ isWindow }) => {
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loading, setLoading] = useState(false);

    // 모달 상태
    const [modalConfig, setModalConfig] = useState({ isOpen: false, initialData: null });
    const { openModal: openConfirm, ConfirmModalComponent } = useConfirmModal();

    // 드래그 앤 드롭 상태
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    const fetchPaymentMethods = async () => {
        setLoading(true);
        try {
            const response = await settingsAPI.getPaymentMethods();
            if (response.data.success) {
                setPaymentMethods(response.data.data);
            }
        } catch (error) {
            console.error('결제 방법 로딩 오류:', error);
            openConfirm({
                type: 'warning',
                title: '로딩 실패',
                message: '데이터를 불러오는데 실패했습니다.',
                showCancel: false
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPaymentMethods();
    }, []);

    const handleAdd = () => {
        setModalConfig({ isOpen: true, initialData: null });
    };

    const handleEdit = (method) => {
        setModalConfig({ isOpen: true, initialData: method });
    };

    const handleModalSubmit = async (formData) => {
        try {
            if (modalConfig.initialData) {
                await settingsAPI.updatePaymentMethod(modalConfig.initialData.id, formData);
            } else {
                await settingsAPI.addPaymentMethod(formData);
            }
            setModalConfig({ isOpen: false, initialData: null });
            fetchPaymentMethods();
        } catch (error) {
            openConfirm({
                type: 'warning',
                title: '처리 실패',
                message: error.response?.data?.message || '처리 중 오류가 발생했습니다.',
                showCancel: false
            });
            throw error;
        }
    };

    const toggleActive = async (method) => {
        try {
            await settingsAPI.updatePaymentMethod(method.id, {
                name: method.name,
                is_active: !method.is_active,
                sort_order: method.sort_order
            });
            fetchPaymentMethods();
        } catch (error) {
            console.error('상태 변경 실패:', error);
        }
    };

    const handleDelete = (method) => {
        openConfirm({
            type: 'delete',
            title: '결제 방법 삭제',
            message: `[${method.name}] 결제 방법을 삭제하시겠습니까?\n해당 방법을 사용한 거래 내역이 있는 경우 삭제가 제한될 수 있습니다.`,
            confirmText: '삭제',
            onConfirm: async () => {
                try {
                    await settingsAPI.deletePaymentMethod(method.id);
                    fetchPaymentMethods();
                } catch (error) {
                    openConfirm({
                        type: 'warning',
                        title: '삭제 실패',
                        message: error.response?.data?.message || '삭제 중 오류가 발생했습니다.',
                        showCancel: false
                    });
                }
            }
        });
    };

    // 드래그 앤 드롭 Refs - 제거됨 (Standard 35.30 useTableDnd 사용)

    const handleReorder = async (newItems) => {
        const reorderedData = newItems.map((item, index) => ({
            id: item.id,
            sort_order: (index + 1) * 10
        }));

        try {
            await settingsAPI.reorderPaymentMethods(reorderedData);
        } catch (error) {
            console.error('순서 저장 실패:', error);
            fetchPaymentMethods();
        }
    };

    const {
        localItems: displayedPaymentMethods,
        columnWidths,
        onDragStart,
        onDragEnd
    } = useTableDnd(paymentMethods, handleReorder);

    return (
        <div className="payment-methods-mgmt" style={{
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
                    onClick={handleAdd}
                    className="btn btn-primary"
                    style={{ fontSize: '0.9rem', padding: '0.4rem 1rem', width: 'auto' }}
                >
                    + 결제 방법 추가
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>로딩 중...</div>
            ) : (
                <div className="table-container" style={{ overflow: 'visible' }}>
                    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
                        <table className="trade-Table" style={{ width: '100%', tableLayout: 'fixed' }}>
                            <thead style={{ position: 'sticky', top: '54px', zIndex: 10 }}>
                                <tr>
                                    <th style={{ width: '50px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}></th>
                                    <th style={{ width: '80px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>순서</th>
                                    <th style={{ padding: '0.5rem', fontSize: '0.85rem', textAlign: 'left' }}>결제 방법 명칭</th>
                                    <th style={{ width: '100px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>상태</th>
                                    <th style={{ width: '150px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>관리</th>
                                </tr>
                            </thead>
                            <Droppable droppableId="payment-methods">
                                {(provided) => (
                                    <tbody ref={provided.innerRef} {...provided.droppableProps}>
                                        {displayedPaymentMethods.length > 0 ? (
                                            displayedPaymentMethods.map((method, index) => (
                                                <Draggable key={method.id} draggableId={String(method.id)} index={index}>
                                                    {(provided, snapshot) => (
                                                        <TableDndRow provided={provided} snapshot={snapshot}>
                                                            <tr
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className={`hover-row ${!method.is_active ? 'inactive-row' : ''}`}
                                                                style={{
                                                                    ...provided.draggableProps.style,
                                                                    backgroundColor: snapshot.isDragging ? '#f8fafc' : (index % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                                                    boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
                                                                    opacity: snapshot.isDragging ? 0.9 : 1
                                                                }}
                                                            >
                                                                <td
                                                                    className="drag-handle"
                                                                    {...provided.dragHandleProps}
                                                                    style={{
                                                                        textAlign: 'center',
                                                                        color: snapshot.isDragging ? '#3182ce' : '#adb5bd',
                                                                        padding: '0.5rem',
                                                                        cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                                                                        width: snapshot.isDragging ? columnWidths[0] : '50px'
                                                                    }}
                                                                >
                                                                    ☰
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', color: '#64748b', ...(snapshot.isDragging ? { width: columnWidths[1] } : {}) }}>
                                                                    {index + 1}
                                                                </td>
                                                                <td style={{ padding: '0.5rem', fontSize: '0.85rem', fontWeight: '500', ...(snapshot.isDragging ? { width: columnWidths[2] } : {}) }}>
                                                                    {method.name}
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '0.5rem', ...(snapshot.isDragging ? { width: columnWidths[3] } : {}) }}>
                                                                    <span
                                                                        className={`badge ${method.is_active ? 'badge-success' : 'badge-secondary'}`}
                                                                        onClick={() => toggleActive(method)}
                                                                        title="클릭하여 상태 변경"
                                                                        style={{ cursor: 'pointer' }}
                                                                    >
                                                                        {method.is_active ? '사용' : '미사용'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '0.5rem', ...(snapshot.isDragging ? { width: columnWidths[4] } : {}) }}>
                                                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                                                        <button
                                                                            onClick={() => handleEdit(method)}
                                                                            className="btn btn-sm btn-primary"
                                                                            style={{
                                                                                padding: '2px 8px',
                                                                                fontSize: '0.8rem',
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
                                                                            onClick={() => handleDelete(method)}
                                                                            className="btn btn-sm btn-danger"
                                                                            style={{
                                                                                padding: '2px 8px',
                                                                                fontSize: '0.8rem',
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
                                                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                                    등록된 결제 방법이 없습니다.
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
            )}

            <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#6c757d' }}>
                💡 목록의 ☰ 아이콘을 드래그하여 순서를 변경할 수 있습니다.<br />
                💡 상태 뱃지를 클릭하여 사용 여부를 즉시 변경할 수 있습니다.
            </div>

            {/* Modal Component */}
            {modalConfig.isOpen && (
                <PaymentMethodModal
                    isOpen={modalConfig.isOpen}
                    onClose={() => setModalConfig({ isOpen: false, initialData: null })}
                    onSubmit={handleModalSubmit}
                    initialData={modalConfig.initialData}
                />
            )}

            {ConfirmModalComponent}
        </div>
    );
};

export default PaymentMethodManagement;
