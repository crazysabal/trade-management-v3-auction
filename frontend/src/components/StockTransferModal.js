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

    useEffect(() => {
        if (isOpen) {
            loadWarehouses();
            setQuantity('');
            setNotes('');
            // defaultToWarehouseId가 있으면 설정, 없으면 빈 값
            setToWarehouseId(defaultToWarehouseId || '');
            setError('');
        }
    }, [isOpen, defaultToWarehouseId]);

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
        if (!quantity || parseFloat(quantity) <= 0) {
            setError('올바른 수량을 입력해주세요.');
            return;
        }
        if (parseFloat(quantity) > parseFloat(inventory.remaining_quantity)) {
            setError('잔여 수량을 초과할 수 없습니다.');
            return;
        }

        setLoading(true);
        try {
            await inventoryTransferAPI.transfer({
                purchase_inventory_id: inventory.id,
                to_warehouse_id: toWarehouseId,
                quantity: parseFloat(quantity),
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
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
            <div className="modal-container" onClick={e => e.stopPropagation()} style={{
                backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', width: '400px', maxWidth: '90%'
            }}>
                <h3 style={{ marginTop: 0, color: '#2c3e50' }}>📦 재고 이동</h3>

                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', color: '#34495e' }}>{inventory.product_name}</div>
                    <div style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>
                        현재 창고: {inventory.warehouse_name || '미지정'} | 잔여: {inventory.remaining_quantity}
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
                        type="number"
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px' }}
                        placeholder="수량 입력"
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
