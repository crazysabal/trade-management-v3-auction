import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
// import './MatchingHistoryModal.css'; // Removed: Styles promoted to App.css
import useDraggable from '../hooks/useDraggable';

/**
 * 매칭 내역 모달 컴포넌트
 * [Global Style Alignment] "매칭 수량 입력" 모달의 프리미엄 스타일(CSS)을 완벽하게 적용
 * - 중앙 정렬 아이콘 헤더
 * - 둥근 모서리와 그림자
 * - 하단 단일 버튼 (확인)
 */
function MatchingHistoryModal({
    isOpen,
    onClose,
    saleItem,
    matchings = [],
    onCancelMatching,
    formatProductName,
    formatNumber,
    formatCurrency,
    formatDateShort
}) {
    const { position, handleMouseDown } = useDraggable();

    // ESC 키로 닫기
    useEffect(() => {
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

    // 모달이 열려있을 때 바디 스크롤 방지
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div className="premium-modal-overlay" onClick={onClose}>
            <div
                className="premium-modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{ transform: `translate(${position.x}px, ${position.y}px)`, maxWidth: '500px' }}
            >
                {/* 헤더: 아이콘 + 제목 + 부제목 */}
                <div
                    className="premium-modal-header"
                >
                    <div
                        className="premium-modal-icon"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: 'grab' }}
                    >
                        <span role="img" aria-label="history">📋</span>
                    </div>
                    <h2 className="premium-modal-title">매칭 내역</h2>
                    <p className="premium-modal-subtitle">
                        {saleItem && formatProductName ? formatProductName(saleItem) : '-'}
                    </p>
                </div>

                {/* 바디: 리스트 */}
                <div className="premium-modal-body">
                    {matchings.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#9ca3af' }}>
                            매칭된 내역이 없습니다.
                        </div>
                    ) : (
                        <div className="matching-history-list" style={{ display: 'flex', flexDirection: 'column' }}>
                            {matchings.map((m) => (
                                <div key={m.matching_id} className="matching-history-card">
                                    {/* 정보 영역 */}
                                    <div className="matching-card-info" style={{ gap: '0' }}>
                                        <div className="matching-card-row" style={{ gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, color: '#2d3748' }}>{m.product_name}</span>
                                            <span style={{ color: '#475569' }}>{parseFloat(m.product_weight)}{m.product_weight_unit || m.weight_unit || m.unit || 'kg'}</span>
                                            <span style={{ color: '#3b82f6', fontWeight: 500 }}>{m.sender || '-'}</span>
                                            {m.grade && (
                                                <span style={{
                                                    color: '#3b82f6',
                                                    backgroundColor: '#eff6ff',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 'bold',
                                                    border: '1px solid #dbeafe'
                                                }}>
                                                    {m.grade}
                                                </span>
                                            )}
                                            <span style={{ fontWeight: 600, color: '#16a34a', marginLeft: '4px' }}>
                                                {formatNumber(m.matched_quantity)}개
                                            </span>
                                            <span style={{ fontWeight: 600, color: '#1f2937', marginLeft: '4px' }}>
                                                {formatCurrency(m.purchase_unit_price)}원
                                            </span>
                                        </div>

                                        {/* 2행: 매입처 | 날짜 */}
                                        <div className="matching-card-row" style={{ marginTop: '0.3rem', fontSize: '0.85rem' }}>
                                            <span style={{ color: '#64748b' }}>{m.purchase_company || m.company_name}</span>
                                            <span style={{ color: '#cbd5e1', margin: '0 6px' }}>|</span>
                                            <span style={{ color: '#94a3b8' }}>{formatDateShort(m.purchase_date)}</span>
                                        </div>
                                    </div>

                                    {/* 취소 버튼 */}
                                    <button
                                        className="matching-card-cancel-btn"
                                        onClick={() => onCancelMatching(m.matching_id)}
                                    >
                                        취소
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 푸터: 확인 버튼 */}
                <div className="premium-modal-footer">
                    <button
                        className="premium-modal-btn premium-btn-primary"
                        onClick={onClose}
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default MatchingHistoryModal;
