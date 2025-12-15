import React, { useState } from 'react';

const InventoryAdjustmentModal = ({ isOpen, onClose, inventory, onConfirm }) => {
    const [adjustmentType, setAdjustmentType] = useState('DISPOSAL'); // DISPOSAL, LOSS, CORRECTION
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !inventory) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        const qtyNum = Number(quantity);
        if (!qtyNum || qtyNum <= 0) {
            alert('유효한 수량을 입력하세요.');
            return;
        }
        if (qtyNum > Number(inventory.remaining_quantity)) {
            alert('차감하려는 수량이 남은 수량보다 많습니다.');
            return;
        }

        setIsSubmitting(true);
        try {
            // 차감할 것이므로 음수로 변환하여 전달 (API 스펙에 따라 다를 수 있으나 보통 차감량은 양수로 입력받고 서버 전송시 처리하거나, API가 'change'를 원하면 음수)
            // Backend Adjustment API logic expects `quantity_change`. Since these are subtractive actions (Disposal/Loss), send Negative.
            // Correction could be positive, but here let's assume UI is "Subtract".
            // Let's send negative value.
            await onConfirm({
                purchase_inventory_id: inventory.id,
                adjustment_type: adjustmentType,
                quantity_change: -qtyNum,
                reason
            });
            onClose();
        } catch (error) {
            console.error(error);
            alert('조정 처리에 실패했습니다.');
        } finally {
            setIsSubmitting(false);
            setQuantity('');
            setReason('');
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                backgroundColor: 'white', padding: '20px', borderRadius: '8px',
                width: '400px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
                <h3 style={{ marginTop: 0, color: '#e74c3c' }}>📉 재고 조정/폐기</h3>

                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                    <strong>{inventory.product_name}</strong> ({inventory.grade})<br />
                    현재 잔고: <span style={{ color: '#2980b9', fontWeight: 'bold' }}>{inventory.remaining_quantity}</span> 개
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>조정 유형</label>
                        <select
                            value={adjustmentType}
                            onChange={(e) => setAdjustmentType(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                        >
                            <option value="DISPOSAL">폐기 (Disposal)</option>
                            <option value="LOSS">분실 (Loss)</option>
                            <option value="CORRECTION">수량 정정 (Correction)</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>차감 수량</label>
                        <input
                            type="number"
                            step="0.01"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="줄어들 수량 입력 (예: 2)"
                            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            max={inventory.remaining_quantity}
                        />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>사유</label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="예: 부패, 파손 등"
                            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ padding: '8px 16px', border: '1px solid #ddd', backgroundColor: 'white', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                                padding: '8px 16px',
                                border: 'none',
                                backgroundColor: '#e74c3c',
                                color: 'white',
                                borderRadius: '4px',
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                opacity: isSubmitting ? 0.7 : 1
                            }}
                        >
                            {isSubmitting ? '처리 중...' : '조정 실행'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default InventoryAdjustmentModal;
