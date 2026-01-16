import React, { useState, useEffect, useCallback, useRef } from 'react';
import { settingsAPI } from '../services/api';
import PaymentMethodModal from '../components/PaymentMethodModal';
import { useConfirmModal } from '../components/ConfirmModal';
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

    // 드래그 앤 드롭 핸들러 (지출 관리와 동일한 로직)
    const handleDragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
        const row = e.target.closest('tr');
        if (row) e.dataTransfer.setDragImage(row, 0, 0);
    };

    const handleDragEnter = (e, position) => {
        dragOverItem.current = position;
    };

    const handleDrop = async (e) => {
        if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return;

        const copyItems = [...paymentMethods];
        const dragContent = copyItems[dragItem.current];

        copyItems.splice(dragItem.current, 1);
        copyItems.splice(dragOverItem.current, 0, dragContent);

        dragItem.current = null;
        dragOverItem.current = null;

        setPaymentMethods(copyItems);

        const reorderedData = copyItems.map((item, index) => ({
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

    return (
        <div className="payment-methods-mgmt" style={{ width: '100%', height: '100%', padding: '0.5rem' }}>
            {/* 상단 액션 바 */}
            <div style={{ textAlign: 'right', marginBottom: '0.5rem' }}>
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
                <div className="table-container">
                    <table className="trade-Table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '50px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}></th>
                                <th style={{ width: '80px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>순서</th>
                                <th style={{ padding: '0.5rem', fontSize: '0.85rem', textAlign: 'left' }}>결제 방법 명칭</th>
                                <th style={{ width: '100px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>상태</th>
                                <th style={{ width: '150px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paymentMethods.length > 0 ? (
                                paymentMethods.map((method, index) => (
                                    <tr
                                        key={method.id}
                                        onDragEnter={(e) => handleDragEnter(e, index)}
                                        onDragEnd={handleDrop}
                                        onDragOver={(e) => e.preventDefault()}
                                        className={`hover-row ${!method.is_active ? 'inactive-row' : ''}`}
                                    >
                                        <td style={{ textAlign: 'center', color: '#adb5bd', padding: '0.5rem' }}>
                                            <span
                                                className="drag-handle"
                                                draggable={true}
                                                onDragStart={(e) => handleDragStart(e, index)}
                                                style={{ cursor: 'grab', display: 'inline-block' }}
                                                title="드래그하여 순서 변경"
                                            >
                                                ☰
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', color: '#64748b' }}>
                                            {index + 1}
                                        </td>
                                        <td style={{ padding: '0.5rem', fontSize: '0.85rem', fontWeight: '500' }}>
                                            {method.name}
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                                            <span
                                                className={`badge ${method.is_active ? 'badge-success' : 'badge-secondary'}`}
                                                onClick={() => toggleActive(method)}
                                                title="클릭하여 상태 변경"
                                            >
                                                {method.is_active ? '사용' : '미사용'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '0.5rem' }}>
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
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                        등록된 결제 방법이 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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
