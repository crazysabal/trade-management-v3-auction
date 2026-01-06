import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalDraggable } from '../hooks/useModalDraggable';

/**
 * 매칭 내역 모달 컴포넌트
 * [MESSAGE_TEST] 스타일 및 최신 프리미엄 디자인 적용
 * 고도화: 드래그 지원, ESC 키 지원, 닫기 버튼 추가
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
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen, { isCentered: true });

    // ESC handling
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

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 10100 }}>
            <div
                className="modal-container"
                style={{
                    maxWidth: '450px',
                    width: '90%', // 모바일 대응 등 위해
                    padding: '2rem',
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    ...draggableStyle
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 우측 상단 닫기 버튼 */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1.25rem',
                        right: '1.25rem',
                        border: 'none',
                        background: 'none',
                        fontSize: '1.5rem',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        zIndex: 10,
                        padding: '4px',
                        lineHeight: 1,
                        transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.color = '#4b5563'}
                    onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                >
                    &times;
                </button>

                {/* 헤더 영역 (아이콘 + 제목) - 드래그 핸들 */}
                <div
                    onMouseDown={handleMouseDown}
                    className="draggable-header"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: 'move',
                        marginBottom: '1.5rem'
                    }}
                >
                    {/* 아이콘 */}
                    <div className="modal-icon drag-pointer-none" style={{ backgroundColor: '#e0f2fe' }}>
                        <span style={{ fontSize: '2rem' }}>📋</span>
                    </div>

                    {/* 제목 */}
                    <h2 className="modal-title drag-pointer-none" style={{ marginTop: '1.5rem', marginBottom: '0' }}>매칭 내역</h2>
                </div>

                {/* 부제목/품목정보 */}
                <p className="modal-message" style={{ marginBottom: '2rem', textAlign: 'center' }}>
                    <strong style={{ fontSize: '1.1rem', color: '#1f2937' }}>{formatProductName(saleItem)}</strong>
                    <br />
                    <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>총 수량: {formatNumber(saleItem?.quantity)}</span>
                </p>

                {/* 매칭 내역 목록 */}
                {matchings.length === 0 ? (
                    <div className="matching-history-empty" style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>저장된 매칭 내역이 없습니다.</div>
                ) : (
                    <div className="matching-history-list" style={{ marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                        {matchings.map((m) => (
                            <div key={m.matching_id} className="matching-history-card" style={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                padding: '1.25rem',
                                marginBottom: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                {/* 정보 영역 */}
                                <div className="matching-card-info" style={{ textAlign: 'left', flex: 1 }}>
                                    <div style={{ display: 'flex', marginBottom: '4px' }}>
                                        <span style={{ width: '60px', color: '#9ca3af', fontSize: '0.9rem' }}>출하주</span>
                                        <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '1rem' }}>{m.sender || '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', marginBottom: '4px' }}>
                                        <span style={{ width: '60px', color: '#9ca3af', fontSize: '0.9rem' }}>수량</span>
                                        <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '1rem' }}>{formatNumber(m.matched_quantity)}</span>
                                    </div>
                                    <div style={{ display: 'flex', marginBottom: '4px' }}>
                                        <span style={{ width: '60px', color: '#9ca3af', fontSize: '0.9rem' }}>단가</span>
                                        <span style={{ color: '#1f2937', fontSize: '0.95rem' }}>{formatCurrency(m.purchase_unit_price)}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <span style={{ width: '60px', color: '#9ca3af', fontSize: '0.9rem' }}>매입일</span>
                                        <span style={{ color: '#1f2937', fontSize: '0.95rem', marginRight: '8px' }}>{formatDateShort(m.purchase_date)}</span>
                                        <span style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.85rem', padding: '1px 6px', borderRadius: '4px' }}>
                                            {m.company_name || m.purchase_company}
                                        </span>
                                    </div>
                                </div>

                                {/* 취소 버튼 */}
                                <button
                                    className="modal-btn"
                                    style={{
                                        backgroundColor: '#fef2f2',
                                        color: '#ef4444',
                                        border: '1px solid #fee2e2',
                                        height: '32px',
                                        padding: '0 0.75rem',
                                        fontSize: '0.85rem'
                                    }}
                                    onClick={() => onCancelMatching(m.matching_id)}
                                >
                                    취소
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* 합계 정보 */}
                {matchings.length > 0 && (
                    <div style={{
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span style={{ color: '#64748b', fontSize: '0.95rem' }}>저장된 매칭 합계</span>
                        <strong style={{ color: '#2563eb', fontSize: '1.1rem' }}>
                            {formatNumber(matchings.reduce((sum, m) => sum + parseFloat(m.matched_quantity), 0))}
                        </strong>
                    </div>
                )}

                {/* 하단 버튼 */}
                <div className="modal-buttons" style={{ justifyContent: 'center' }}>
                    <button
                        className="modal-btn modal-btn-cancel"
                        style={{ width: '100%', maxWidth: '120px' }}
                        onClick={onClose}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default MatchingHistoryModal;
