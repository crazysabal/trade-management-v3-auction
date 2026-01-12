import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import useDraggable from '../hooks/useDraggable';

/**
 * MatchingQuantityInputModal (Premium Standard)
 * 
 * 사용자에게 매칭할 수량을 입력받는 모달입니다.
 * Global Premium Modal Standard (App.css)를 따릅니다.
 */
function MatchingQuantityInputModal({
    isOpen,
    onClose,
    saleItem,
    inventory,
    defaultQuantity,
    maxQuantity,
    onConfirm,
    formatProductName,
    formatNumber,
    formatDateShort
}) {
    const [quantity, setQuantity] = useState(defaultQuantity || 0);
    const inputRef = useRef(null);
    const { position, handleMouseDown } = useDraggable();

    // 모달이 열릴 때 수량 초기화 및 포커스
    useEffect(() => {
        if (isOpen) {
            setQuantity(defaultQuantity);
            // 약간의 지연 후 포커스 (애니메이션 고려)
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.select();
                }
            }, 100);
        }
    }, [isOpen, defaultQuantity]);

    // ESC 키 핸들링은 상위 페이지에서 전역적으로 처리하거나 여기서 개별 처리할 수 있음.
    // 여기서는 안전하게 stopPropagation을 포함하여 개별 처리 추가.
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleConfirm();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, quantity]); // quantity 의존성 추가 (handleConfirm 내부 값 참조 위해)

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (quantity <= 0) return;
        onConfirm(quantity);
    };

    const handleQuantityChange = (e) => {
        const val = e.target.value;
        if (val === '' || val === '.') {
            setQuantity('');
        } else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                setQuantity(Math.min(num, maxQuantity));
            }
        }
    };

    return createPortal(
        <div className="premium-modal-overlay" onClick={onClose}>
            <div
                className="premium-modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
            >
                {/* 헤더 */}
                <div
                    className="premium-modal-header"
                >
                    <div
                        className="premium-modal-icon"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: 'grab' }}
                    >
                        <span role="img" aria-label="quantity">📦</span>
                    </div>
                    <h2 className="premium-modal-title">매칭 수량 입력</h2>
                    <p className="premium-modal-subtitle">
                        {saleItem ? formatProductName(saleItem) : ''}
                    </p>
                </div>

                {/* 바디 */}
                <div className="premium-modal-body">
                    {/* 정보 카드 (간소화된 스타일) */}
                    <div style={{
                        backgroundColor: '#f8fafc',
                        borderRadius: '12px',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        fontSize: '0.9rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>품목/중량</span>
                            <span style={{ fontWeight: '600', color: '#334155' }}>
                                {inventory?.product_name} {inventory?.product_weight ? `${parseFloat(inventory?.product_weight)}kg` : ''}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>출하주/등급</span>
                            <span style={{ fontWeight: '600', color: '#334155' }}>
                                {inventory?.sender || '-'} / {inventory?.grade || '-'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>매입처/일자</span>
                            <span style={{ fontWeight: '600', color: '#334155' }}>
                                {inventory?.company_name} <span style={{ color: '#94a3b8', fontWeight: '400' }}>({formatDateShort ? formatDateShort(inventory?.purchase_date) : inventory?.purchase_date?.substring(5, 10)})</span>
                            </span>
                        </div>
                        <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '0.5rem 0' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>미매칭</span>
                            <span style={{ fontWeight: '600', color: '#e74c3c' }}>{formatNumber(saleItem?.unmatched_quantity)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>가용 재고</span>
                            <span style={{ fontWeight: '600', color: '#27ae60' }}>{formatNumber(inventory?.remaining_quantity)}</span>
                        </div>
                    </div>

                    {/* 입력 필드 */}
                    <div className="premium-input-group" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '1rem', alignItems: 'center' }}>
                        <label className="premium-input-label" style={{ marginBottom: 0, whiteSpace: 'nowrap', fontSize: '1rem', color: '#334155' }}>매칭 수량</label>
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="decimal"
                            className="premium-input"
                            value={quantity}
                            onChange={handleQuantityChange}
                            placeholder="0"
                            style={{ padding: '0.5rem', fontSize: '1.2rem' }}
                        />
                        <div style={{ gridColumn: '2', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                            최대 가능 수량: {formatNumber(maxQuantity)}
                        </div>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="premium-modal-footer">
                    <button
                        className="premium-modal-btn premium-btn-secondary"
                        onClick={onClose}
                    >
                        취소
                    </button>
                    <button
                        className="premium-modal-btn premium-btn-primary"
                        onClick={handleConfirm}
                        disabled={!quantity || quantity <= 0}
                        style={{ opacity: (!quantity || quantity <= 0) ? 0.5 : 1 }}
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default MatchingQuantityInputModal;
