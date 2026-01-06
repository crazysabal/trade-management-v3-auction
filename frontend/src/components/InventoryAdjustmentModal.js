import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalDraggable } from '../hooks/useModalDraggable';

const InventoryAdjustmentModal = ({ isOpen, onClose, inventory, onConfirm }) => {
    const [adjustmentType, setAdjustmentType] = useState('DISPOSAL'); // DISPOSAL, LOSS, CORRECTION
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    // ESC handling
    React.useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

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

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div
                className="styled-modal"
                style={{
                    maxWidth: '450px',
                    ...draggableStyle
                }}
                onClick={e => e.stopPropagation()}
            >
                <div
                    className="modal-header draggable-header"
                    onMouseDown={handleMouseDown}
                >
                    <h3 className="drag-pointer-none" style={{ margin: 0, color: '#e74c3c' }}>📉 재고 조정/폐기</h3>
                    <button className="close-btn drag-pointer-auto" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                            <strong>{inventory.product_name}</strong> ({inventory.grade})
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                            현재 잔고: <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{inventory.remaining_quantity}</span> 개
                        </div>
                    </div>

                    <form id="adjustment-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>조정 유형</label>
                            <select
                                value={adjustmentType}
                                onChange={(e) => setAdjustmentType(e.target.value)}
                            >
                                <option value="DISPOSAL">폐기 (Disposal)</option>
                                <option value="LOSS">분실 (Loss)</option>
                                <option value="CORRECTION">수량 정정 (Correction)</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>차감 수량</label>
                            <input
                                type="number"
                                step="0.01"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                placeholder="차감할 수량 입력"
                                max={inventory.remaining_quantity}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>사유</label>
                            <input
                                type="text"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="예: 부패, 파손 등"
                            />
                        </div>
                    </form>
                </div>

                <div className="modal-footer">
                    <button
                        type="button"
                        className="modal-btn modal-btn-cancel"
                        onClick={onClose}
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        form="adjustment-form"
                        className="modal-btn modal-btn-primary"
                        disabled={isSubmitting}
                        style={{ backgroundColor: '#e74c3c' }}
                    >
                        {isSubmitting ? '처리 중...' : '조정 실행'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default InventoryAdjustmentModal;
