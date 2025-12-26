import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { warehousesAPI, inventoryTransferAPI } from '../services/api';
import SearchableSelect from './SearchableSelect';

const StockTransferModal = ({ isOpen, onClose, inventory, onSuccess, defaultToWarehouseId }) => {
    const [warehouses, setWarehouses] = useState([]);
    const [toWarehouseId, setToWarehouseId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const quantityInputRef = React.useRef(null);

    useEffect(() => {
        if (isOpen) {
            loadWarehouses();
            setQuantity(inventory ? Number(inventory.remaining_quantity).toLocaleString() : ''); // 기본값을 잔여 수량으로 설정 (소수점 처리 및 콤마)
            setNotes('');
            setToWarehouseId(defaultToWarehouseId || '');
            setError('');

            // Focus and Select All text
            setTimeout(() => {
                if (quantityInputRef.current) {
                    quantityInputRef.current.focus();
                    quantityInputRef.current.select();
                }
            }, 100);

            // ESC key handler
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') onClose();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, defaultToWarehouseId, inventory, onClose]);

    useEffect(() => {
        if (!isOpen) return;

        // Real-time validation
        if (quantity) {
            const numVal = parseFloat(quantity.replace(/,/g, ''));
            const maxVal = parseFloat(inventory?.remaining_quantity || 0);

            if (numVal > maxVal) {
                setError(`잔여 수량(${Number(maxVal)}개)을 초과할 수 없습니다.`);
            } else if (numVal <= 0) {
                // 0 이하는 입력 중간일 수 있으므로 상황에 따라 다를 수 있지만, 사용자가 명시적으로 0을 입력했다면 에러 표시
                // 여기서는 0을 입력하면 에러를 보여주지는 않고, 제출 시에만 체크하거나, 
                // 엄격하게 하려면 setError('올바른 수량을 입력해주세요.');
                // UX상 보통 초과만 즉시 알려주는게 덜 성가심. 0은 지우고 다시 쓰는 과정일 수 있음.
                // 사용자가 '숫자를 입력하면서 바로 체크'라고 했으니 초과 체크에 집중.
                setError('');
            } else {
                setError('');
            }
        } else {
            setError('');
        }

    }, [quantity, inventory, isOpen]);

    const loadWarehouses = async () => {
        try {
            const response = await warehousesAPI.getAll();
            // 현재 창고 제외
            const filtered = response.data.data.filter(w => w.id !== inventory?.warehouse_id);
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
        if (!quantity || parseFloat(quantity.replace(/,/g, '')) <= 0) {
            setError('올바른 수량을 입력해주세요.');
            return;
        }
        if (parseFloat(quantity.replace(/,/g, '')) > parseFloat(inventory.remaining_quantity)) {
            setError('잔여 수량을 초과할 수 없습니다.');
            return;
        }

        setLoading(true);
        try {
            await inventoryTransferAPI.transfer({
                purchase_inventory_id: inventory.id,
                to_warehouse_id: toWarehouseId,
                quantity: parseFloat(quantity.replace(/,/g, '')),
                notes: notes
            });
            onSuccess();
            onClose();
        } catch (err) {
            console.error('재고 이동 실패:', err);
            setError(err.response?.data?.message || '재고 이동에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !inventory) return null;

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
                <h3 style={{ marginTop: 0, color: '#2c3e50' }}>📦 재고 이동</h3>

                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', color: '#34495e' }}>{inventory.product_name}</div>
                    <div style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>
                        현재 창고: {inventory.warehouse_name || '미지정'} | 잔여: {Number(inventory.remaining_quantity)}
                    </div>
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
                        onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            const parts = val.split('.');
                            if (parts.length > 2) return; // 점 두개 이상 방지
                            const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                            const formatted = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
                            setQuantity(formatted);
                        }}
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px' }}
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
