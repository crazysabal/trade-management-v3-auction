import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { warehousesAPI, inventoryTransferAPI } from '../services/api';
import SearchableSelect from './SearchableSelect';
import { useModalDraggable } from '../hooks/useModalDraggable';

const StockTransferModal = ({ isOpen, onClose, inventory, inventoryList = [], onSuccess, defaultToWarehouseId }) => {
    const [warehouses, setWarehouses] = useState([]);
    const [toWarehouseId, setToWarehouseId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    const quantityInputRef = React.useRef(null);
    const isBulk = inventoryList.length > 1;
    const targetItems = isBulk ? inventoryList : (inventory ? [inventory] : []);

    useEffect(() => {
        if (isOpen) {
            loadWarehouses();

            if (isBulk) {
                setQuantity('전체 수량 (일괄 이동)');
            } else {
                setQuantity(inventory ? Number(inventory.remaining_quantity).toLocaleString() : '');
            }

            setNotes('');
            setToWarehouseId(defaultToWarehouseId || '');
            setError('');

            // Focus and Select All text
            setTimeout(() => {
                if (quantityInputRef.current) {
                    quantityInputRef.current.focus();
                    if (!isBulk) quantityInputRef.current.select();
                }
            }, 100);

            const handleKeyDown = (e) => {
                if (e.key === 'Escape') onClose();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, defaultToWarehouseId, inventory, inventoryList, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        if (isBulk) return; // Bulk mode skips quantity validation

        if (quantity) {
            const numVal = parseFloat(quantity.replace(/,/g, ''));
            const maxVal = parseFloat(inventory?.remaining_quantity || 0);

            if (numVal > maxVal) {
                setError(`잔여 수량(${Number(maxVal)}개)을 초과할 수 없습니다.`);
            } else if (numVal <= 0) {
                setError('');
            } else {
                setError('');
            }
        } else {
            setError('');
        }
    }, [quantity, inventory, isOpen, isBulk]);

    const loadWarehouses = async () => {
        try {
            const response = await warehousesAPI.getAll({ active_only: 'true' });
            // 현재 창고 제외 (단일 이동 시에만)
            let filtered = response.data.data;
            if (!isBulk) {
                const currentWhId = inventory?.warehouse_id;
                filtered = response.data.data.filter(w => String(w.id) !== String(currentWhId));
            }
            setWarehouses(filtered);
        } catch (err) {
            console.error('창고 목록 로드 실패:', err);
            setError('창고 목록을 불러오지 못했습니다.');
        }
    };

    const handleSubmit = async () => {
        if (!toWarehouseId) {
            setError('이동할 창고를 선택해주세요.');
            return;
        }

        if (!isBulk) {
            if (!quantity || parseFloat(quantity.replace(/,/g, '')) <= 0) {
                setError('올바른 수량을 입력해주세요.');
                return;
            }
            if (parseFloat(quantity.replace(/,/g, '')) > parseFloat(inventory.remaining_quantity)) {
                setError('잔여 수량을 초과할 수 없습니다.');
                return;
            }
        }

        setLoading(true);
        try {
            if (isBulk) {
                // 일괄 이동 (전체 수량)
                // 이미 해당 창고에 있는 아이템은 제외하고 이동
                const itemsToMove = targetItems.filter(item => String(item.warehouse_id) !== String(toWarehouseId));

                if (itemsToMove.length === 0) {
                    setError('선택된 모든 품목이 이미 해당 창고에 있습니다.');
                    setLoading(false);
                    return;
                }

                // 순서는 선택된 순서(targetItems)대로 들어가야 함.
                // targetItems: [A, B, C] (A가 먼저 선택됨)
                // 목표: A가 제일 위, B가 그 다음, C가 그 다음.
                // 로직: item이 추가될 때마다 최상단(min - 1)으로 들어감.
                // 따라서 C를 먼저 넣으면 C가 맨 위. 그 다음 B를 넣으면 B가 B, C보다 위(B, C). A 넣으면 A, B, C.
                // 즉, 선택된 순서의 역순으로 넣어야 A가 가장 마지막에 최상단으로 가서 1등이 됨.
                // -> 역순으로 순회 (C -> B -> A)

                const itemsToProcess = [...itemsToMove].reverse();

                for (const item of itemsToProcess) {
                    await inventoryTransferAPI.transfer({
                        purchase_inventory_id: item.id,
                        to_warehouse_id: toWarehouseId,
                        quantity: parseFloat(item.remaining_quantity), // 전체 수량
                        notes: notes
                    });
                }
            } else {
                // 단일 이동
                await inventoryTransferAPI.transfer({
                    purchase_inventory_id: inventory.id,
                    to_warehouse_id: toWarehouseId,
                    quantity: parseFloat(quantity.replace(/,/g, '')),
                    notes: notes
                });
            }

            onSuccess();
            onClose();
        } catch (err) {
            console.error('재고 이동 실패:', err);
            setError(err.response?.data?.message || '재고 이동에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || (!inventory && !isBulk)) return null;

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div
                className="styled-modal"
                onClick={e => e.stopPropagation()}
                style={draggableStyle}
            >
                <div
                    className="modal-header draggable-header"
                    onMouseDown={handleMouseDown}
                >
                    <h3 className="drag-pointer-none">
                        {isBulk ? `📦 일괄 재고 이동 (${targetItems.length}건)` : '📦 재고 이동'}
                    </h3>
                    <button className="close-btn drag-pointer-auto" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', maxHeight: '150px', overflowY: 'auto' }}>
                        {isBulk ? (
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#475569' }}>
                                {targetItems.map(item => (
                                    <li key={item.id} style={{ marginBottom: '0.25rem' }}>
                                        {item.product_name} {Number(item.product_weight) > 0 ? `${Number(item.product_weight)}kg` : ''} {item.sender} {item.grade} ({Number(item.remaining_quantity)}개)
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <>
                                <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0.25rem' }}>{inventory.product_name}</div>
                                <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                    현재 창고: {inventory.warehouse_name || '미지정'} | 잔여: {Number(inventory.remaining_quantity)}
                                </div>
                            </>
                        )}
                    </div>

                    {error && (
                        <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>
                            ⚠️ {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label>이동할 창고</label>
                        <SearchableSelect
                            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                            value={toWarehouseId}
                            onChange={o => setToWarehouseId(o ? o.value : '')}
                            placeholder="창고 선택..."
                        />
                    </div>

                    <div className="form-group">
                        <label>이동 수량</label>
                        <input
                            ref={quantityInputRef}
                            type="text"
                            value={quantity}
                            disabled={isBulk}
                            onChange={e => {
                                if (isBulk) return;
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                const parts = val.split('.');
                                if (parts.length > 2) return;
                                const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                                const formatted = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
                                setQuantity(formatted);
                            }}
                            placeholder="수량 입력"
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSubmit();
                            }}
                            style={isBulk ? { backgroundColor: '#f1f5f9', color: '#94a3b8' } : {}}
                        />
                    </div>

                    <div className="form-group">
                        <label>비고</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="이동 사유 등..."
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="modal-btn modal-btn-cancel" onClick={onClose}>취소</button>
                    <button className="modal-btn modal-btn-primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? '처리 중...' : '이동 실행'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default StockTransferModal;
