import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { purchaseInventoryAPI } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatUtils'; // [Refactor] 공통 유틸리티 사용
import TradeDetailModal from './TradeDetailModal';
import useDraggable from '../hooks/useDraggable';

// formatCurrency, formatNumber, formatDate imported from formatUtils.js

const getStatusBadge = (status) => {
    switch (status) {
        case 'AVAILABLE':
            return <span className="badge badge-success" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>사용가능</span>;
        case 'DEPLETED':
            return <span className="badge badge-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>소진</span>;
        case 'CANCELLED':
            return <span className="badge badge-danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>취소</span>;
        default:
            return <span className="badge badge-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>{status}</span>;
    }
};

const formatInventoryName = (inv) => {
    if (!inv) return '';
    const parts = [];
    parts.push(inv.product_name);

    // [Standard 34.9.5] 최우선 품목 식별 헤딩 표준 준수: 품목명 중량 출하주 (등급)
    // 중량 표시 (단위 중량 사용)
    const weight = inv.product_weight || inv.weight;
    // product_weight 사용 시에는 product_weight_unit을 우선적으로 결합하여 정합성 유지
    const unit = inv.product_weight ? (inv.product_weight_unit || inv.weight_unit || 'kg') : (inv.weight_unit || 'kg');
    if (weight && parseFloat(weight) > 0) {
        parts.push(`${parseFloat(weight).toString()}${unit}`);
    }

    // 출하주
    if (inv.sender) {
        parts.push(inv.sender);
    }

    let baseName = parts.join(' ');

    // 등급은 괄호로 감싸서 뒤에 배치
    if (inv.grade) {
        baseName += ` (${inv.grade})`;
    }

    return baseName;
};

import './InventoryDetailModal.css';

const InventoryDetailModal = ({ isOpen, inventoryId, onClose }) => {
    const [data, setData] = useState({
        inventory: null,
        matchings: [],
        loading: false
    });
    const [tradeDetailModal, setTradeDetailModal] = useState({
        isOpen: false,
        tradeId: null,
        highlightId: null
    });

    const { position, handleMouseDown } = useDraggable();

    useEffect(() => {
        if (isOpen && inventoryId) {
            loadDetail();
        }
    }, [isOpen, inventoryId]);

    // ESC 키로 닫기
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) {
                // 서브 모달(전표 상세)이 열려있지 않을 때만 닫기
                if (!tradeDetailModal.isOpen) {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, tradeDetailModal.isOpen, onClose]);

    const loadDetail = async () => {
        setData(prev => ({ ...prev, loading: true }));
        try {
            const response = await purchaseInventoryAPI.getById(inventoryId);
            setData({
                inventory: response.data.data.inventory,
                matchings: response.data.data.matchings,
                loading: false
            });
        } catch (error) {
            console.error('상세 조회 오류:', error);
            setData(prev => ({ ...prev, loading: false }));
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="premium-modal-overlay" onClick={onClose}>
            <div
                className="premium-modal-container"
                style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    maxWidth: '800px',
                    width: '90vw'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 헤더: 프리미엄 표준 (중앙 아이콘 + 제목 + 부제목) */}
                <div className="premium-modal-header" style={{ position: 'relative' }}>
                    <div
                        className="premium-modal-icon"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: 'grab' }}
                    >
                        <span role="img" aria-label="inventory">🔍</span>
                    </div>
                    <h2 className="premium-modal-title">재고 상세</h2>
                    <button
                        onClick={onClose}
                        className="premium-modal-close"
                        title="닫기 (Esc)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="premium-modal-body" style={{ overflowY: 'auto' }}>
                    {data.loading ? (
                        <div className="premium-empty-state">불러오는 중...</div>
                    ) : data.inventory ? (
                        <>
                            {/* 핵심 정보 배너 */}
                            <div className="inventory-summary-banner">
                                <div className="inventory-summary-left">
                                    <div className="inventory-product-name" style={{ marginBottom: '6px' }}>
                                        {formatInventoryName(data.inventory)}
                                        {getStatusBadge(data.inventory.status)}
                                    </div>
                                    <div className="inventory-info-value" style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontWeight: '600', color: '#475569' }}>{data.inventory.company_name}</span>
                                        <span style={{ color: '#cbd5e1' }}>|</span>
                                        <span>{formatDate(data.inventory.purchase_date)} 매입</span>
                                        <span style={{ color: '#cbd5e1' }}>|</span>
                                        <span style={{ color: '#0f172a', fontWeight: '600' }}>단가: {formatCurrency(data.inventory.unit_price)}원</span>
                                    </div>
                                </div>
                                <div className="inventory-remaining-wrap">
                                    <div className="inventory-remaining-label">남은 수량</div>
                                    <div className="inventory-remaining-value">
                                        {formatNumber(data.inventory.remaining_quantity)}
                                        <span style={{ fontSize: '1rem', marginLeft: '4px', fontWeight: '500' }}>개</span>
                                    </div>
                                    <div className="inventory-original-qty">
                                        최초 {formatNumber(data.inventory.original_quantity)}개 입고
                                    </div>
                                </div>
                            </div>

                            {/* 상세 정보 그리드 */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                {/* 매입 상세 */}
                                <div className="inventory-info-section">
                                    <div className="inventory-section-title">매입 상세</div>
                                    <div className="inventory-info-grid">
                                        <div className="inventory-info-item">
                                            <span className="inventory-info-label">전표 번호</span>
                                            <span
                                                className="inventory-info-value link"
                                                onClick={() => setTradeDetailModal({
                                                    isOpen: true,
                                                    tradeId: data.inventory.trade_master_id,
                                                    highlightId: data.inventory.trade_detail_id
                                                })}
                                            >
                                                {data.inventory.trade_number}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* 출하주 및 출하지 정보 */}
                                <div className="inventory-info-section">
                                    <div className="inventory-section-title">출하주 및 출하지</div>
                                    <div className="inventory-info-grid" style={{
                                        backgroundColor: '#f0f9ff',
                                        borderColor: '#e0f2fe',
                                        display: 'flex',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: '24px'
                                    }}>
                                        <div className="inventory-info-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="inventory-info-label" style={{ marginBottom: 0 }}>출하주</span>
                                            <span className="inventory-info-value">{data.inventory.sender || '-'}</span>
                                        </div>
                                        <div style={{ width: '1px', height: '12px', backgroundColor: '#bae6fd' }}></div>
                                        <div className="inventory-info-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="inventory-info-label" style={{ marginBottom: 0 }}>출하지</span>
                                            <span className="inventory-info-value">{data.inventory.shipper_location || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 매칭 이력 테이블 */}
                            <div className="inventory-info-section">
                                <h4 className="inventory-matching-header">
                                    📄 매출 매칭 이력 ({data.matchings.length}건)
                                </h4>
                                {data.matchings.length === 0 ? (
                                    <div className="premium-empty-state" style={{ padding: '2rem' }}>
                                        아직 매출과 매칭된 이력이 없습니다.
                                    </div>
                                ) : (
                                    <div className="inventory-table-container">
                                        <table className="inventory-table">
                                            <thead>
                                                <tr>
                                                    <th>매칭일</th>
                                                    <th>매출전표</th>
                                                    <th>고객</th>
                                                    <th style={{ textAlign: 'right' }}>매칭수량</th>
                                                    <th style={{ textAlign: 'right' }}>매출단가</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.matchings.map((match, index) => (
                                                    <tr key={index}>
                                                        <td>{formatDate(match.matched_at)}</td>
                                                        <td>
                                                            <span
                                                                className="inventory-info-value link"
                                                                onClick={() => setTradeDetailModal({
                                                                    isOpen: true,
                                                                    tradeId: match.sale_trade_master_id,
                                                                    highlightId: match.sale_detail_id
                                                                })}
                                                            >
                                                                {match.sale_trade_number}
                                                            </span>
                                                        </td>
                                                        <td>{match.customer_name}</td>
                                                        <td style={{ textAlign: 'right' }} className="qty-negative">
                                                            -{formatNumber(match.matched_quantity)}개
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>{formatCurrency(match.sale_unit_price)}원</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="premium-empty-state" style={{ color: '#ef4444' }}>
                            정보를 불러올 수 없습니다.
                        </div>
                    )}
                </div>

                <div className="premium-modal-footer">
                    <button onClick={onClose} className="premium-modal-btn premium-btn-secondary">
                        닫기
                    </button>
                </div>
            </div>

            <TradeDetailModal
                isOpen={tradeDetailModal.isOpen}
                onClose={() => setTradeDetailModal({ isOpen: false, tradeId: null, highlightId: null })}
                tradeId={tradeDetailModal.tradeId}
                highlightId={tradeDetailModal.highlightId}
            />
        </div>,
        document.body
    );
};

export default InventoryDetailModal;
