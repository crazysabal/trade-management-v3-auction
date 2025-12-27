import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { warehousesAPI, inventoryTransferAPI } from '../services/api';
import SearchableSelect from './SearchableSelect';

const StockTransferModal = ({ isOpen, onClose, inventory, inventoryList = [], onSuccess, defaultToWarehouseId }) => {
    const [warehouses, setWarehouses] = useState([]);
    const [toWarehouseId, setToWarehouseId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const quantityInputRef = React.useRef(null);
    const isBulk = inventoryList.length > 0;
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
            const response = await warehousesAPI.getAll();
            // 현재 창고 제외 (단일 이동 시)
            const currentWhId = isBulk ? targetItems[0]?.warehouse_id : inventory?.warehouse_id;
            const filtered = response.data.data.filter(w => String(w.id) !== String(currentWhId));
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
                await Promise.all(targetItems.map(item =>
                    inventoryTransferAPI.transfer({
                        purchase_inventory_id: item.id,
                        to_warehouse_id: toWarehouseId,
                        quantity: parseFloat(item.remaining_quantity), // 전체 수량
                        notes: notes
                    })
                ));
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
        <div className="stock-transfer-modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
            <div className="stock-transfer-modal-container" onClick={e => e.stopPropagation()} style={{
                backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', width: '400px', maxWidth: '90%',
                position: 'relative', top: 'auto', left: 'auto', transform: 'none',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
                <h3 style={{ marginTop: 0, color: '#2c3e50' }}>
                    {isBulk ? `📦 일괄 재고 이동 (${targetItems.length}건)` : '📦 재고 이동'}
                </h3>

                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                    {isBulk ? (
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#34495e' }}>
                            {targetItems.map(item => (
                                <li key={item.id}>
                                    {item.product_name} ({Number(item.remaining_quantity)}개)
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <>
                            <div style={{ fontWeight: '600', color: '#34495e' }}>{inventory.product_name}</div>
                            <div style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>
                                현재 창고: {inventory.warehouse_name || '미지정'} | 잔여: {Number(inventory.remaining_quantity)}
                            </div>
                        </>
                    )}
                </div>

                {error && (
                    <div style={{ padding: '0.5rem', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                        {error}
                    </div>
                )}

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>이동할 창고</label>
                    <SearchableSelect
                        options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                        value={toWarehouseId}
                        onChange={o => setToWarehouseId(o ? o.value : '')}
                        placeholder="창고 선택..."
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>이동 수량</label>
                    <input
                        ref={quantityInputRef}
                        type="text"
                        value={quantity}
                        disabled={isBulk}
                        onChange={e => {
                            if (isBulk) return;
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            const parts = val.split('.');
                            if (parts.length > 2) return; // 점 두개 이상 방지
                            const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                            const formatted = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
                            setQuantity(formatted);
                        }}
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: isBulk ? '#f1f2f6' : 'white' }}
                        placeholder="수량 입력"
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                handleSubmit();
                            }
                        }}
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>비고</label>
                    <input
                        type="text"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px' }}
                        placeholder="이동 사유 등..."
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button onClick={onClose} className="btn btn-secondary">취소</button>
                    <button onClick={handleSubmit} className="btn btn-primary" disabled={loading}>
                        {loading ? '처리 중...' : '이동 실행'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default StockTransferModal;
