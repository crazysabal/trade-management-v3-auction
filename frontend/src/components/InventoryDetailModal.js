import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { purchaseInventoryAPI } from '../services/api';
import TradeDetailModal from './TradeDetailModal';

// 헬퍼 함수
const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
};

const formatNumber = (value) => {
    return new Intl.NumberFormat('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(value || 0);
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getStatusBadge = (status) => {
    switch (status) {
        case 'AVAILABLE':
            return <span className="badge badge-success">사용가능</span>;
        case 'DEPLETED':
            return <span className="badge badge-secondary">소진</span>;
        case 'CANCELLED':
            return <span className="badge badge-danger">취소</span>;
        default:
            return <span className="badge badge-secondary">{status}</span>;
    }
};

const InventoryDetailModal = ({ isOpen, inventoryId, onClose }) => {
    const [data, setData] = useState({
        inventory: null,
        matchings: [],
        loading: false
    });
    const [tradeDetailModal, setTradeDetailModal] = useState({
        isOpen: false,
        tradeId: null
    });

    useEffect(() => {
        if (isOpen && inventoryId) {
            loadDetail();
        }
    }, [isOpen, inventoryId]);

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
        <div className="modal-overlay" style={{ zIndex: 10050 }}>
            <div
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '800px',
                    maxHeight: '85vh',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    flexShrink: 0
                }}>
                    <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔍 재고 상세
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            lineHeight: 1
                        }}
                    >
                        ×
                    </button>
                </div>
                <div style={{
                    padding: '1.5rem',
                    overflowY: 'auto',
                    flex: 1,
                    backgroundColor: '#fff'
                }}>
                    {data.loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                            불러오는 중...
                        </div>
                    ) : data.inventory ? (
                        <>
                            {/* 기본 정보 */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '1rem',
                                marginBottom: '1.5rem',
                                padding: '1.25rem',
                                backgroundColor: '#f8fafc',
                                borderRadius: '12px',
                                border: '1px solid #f1f5f9'
                            }}>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>품목</label>
                                    <div style={{ fontWeight: '600', color: '#334155' }}>
                                        {data.inventory.product_name}
                                        {data.inventory.grade && (
                                            <span className="badge badge-info" style={{ marginLeft: '8px', fontSize: '0.7rem' }}>
                                                {data.inventory.grade}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>매입처</label>
                                    <div style={{ fontWeight: '600' }}>{data.inventory.company_name}</div>
                                </div>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>매입일</label>
                                    <div>{formatDate(data.inventory.purchase_date)}</div>
                                </div>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>전표번호</label>
                                    <div
                                        style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}
                                        onClick={() => {
                                            setTradeDetailModal({ isOpen: true, tradeId: data.inventory.trade_master_id });
                                        }}
                                    >
                                        {data.inventory.trade_number}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>원래 수량</label>
                                    <div>{formatNumber(data.inventory.original_quantity)}개</div>
                                </div>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>남은 수량</label>
                                    <div style={{ fontWeight: '700', color: '#22c55e', fontSize: '1.1rem' }}>
                                        {formatNumber(data.inventory.remaining_quantity)}개
                                    </div>
                                </div>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>매입 단가</label>
                                    <div>{formatCurrency(data.inventory.unit_price)}원</div>
                                </div>
                                <div>
                                    <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>상태</label>
                                    <div>{getStatusBadge(data.inventory.status)}</div>
                                </div>
                                {data.inventory.shipper_location && (
                                    <div>
                                        <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>출하지</label>
                                        <div>{data.inventory.shipper_location}</div>
                                    </div>
                                )}
                                {data.inventory.sender && (
                                    <div>
                                        <label style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>출하주</label>
                                        <div>{data.inventory.sender}</div>
                                    </div>
                                )}
                            </div>

                            {/* 매칭 이력 */}
                            <h4 style={{ marginBottom: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📋 매출 매칭 이력 ({data.matchings.length}건)
                            </h4>
                            {data.matchings.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '3rem 2rem',
                                    color: '#94a3b8',
                                    backgroundColor: '#f8fafc',
                                    borderRadius: '12px',
                                    border: '1px dashed #e2e8f0'
                                }}>
                                    아직 매출과 매칭된 이력이 없습니다.
                                </div>
                            ) : (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f1f5f9' }}>
                                                <th style={{ padding: '12px', color: '#475569', fontWeight: '600', textAlign: 'left', fontSize: '0.85rem' }}>매칭일</th>
                                                <th style={{ padding: '12px', color: '#475569', fontWeight: '600', textAlign: 'left', fontSize: '0.85rem' }}>매출전표</th>
                                                <th style={{ padding: '12px', color: '#475569', fontWeight: '600', textAlign: 'left', fontSize: '0.85rem' }}>고객</th>
                                                <th style={{ padding: '12px', color: '#475569', fontWeight: '600', textAlign: 'right', fontSize: '0.85rem' }}>매칭수량</th>
                                                <th style={{ padding: '12px', color: '#475569', fontWeight: '600', textAlign: 'right', fontSize: '0.85rem' }}>매출단가</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.matchings.map((match, index) => (
                                                <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '12px', fontSize: '0.85rem' }}>{formatDate(match.matched_at)}</td>
                                                    <td style={{ padding: '12px', fontSize: '0.85rem' }}>
                                                        <span
                                                            onClick={() => {
                                                                setTradeDetailModal({ isOpen: true, tradeId: match.sale_trade_master_id });
                                                            }}
                                                            style={{
                                                                color: '#3b82f6',
                                                                cursor: 'pointer',
                                                                textDecoration: 'underline'
                                                            }}
                                                            title="전표 상세 보기"
                                                        >
                                                            {match.sale_trade_number}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px', fontSize: '0.85rem' }}>{match.customer_name}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: '#ef4444', fontSize: '0.85rem' }}>
                                                        -{formatNumber(match.matched_quantity)}개
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem' }}>{formatCurrency(match.sale_unit_price)}원</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
                            정보를 불러올 수 없습니다.
                        </div>
                    )}
                </div>
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #e5e7eb',
                    textAlign: 'right',
                    backgroundColor: '#f8fafc',
                    flexShrink: 0
                }}>
                    <button
                        onClick={onClose}
                        className="modal-btn modal-btn-cancel"
                        style={{ height: '36px', padding: '0 1.25rem' }}
                    >
                        닫기
                    </button>
                </div>
            </div>

            <TradeDetailModal
                isOpen={tradeDetailModal.isOpen}
                onClose={() => setTradeDetailModal({ isOpen: false, tradeId: null })}
                tradeId={tradeDetailModal.tradeId}
            />
        </div>,
        document.body
    );
};

export default InventoryDetailModal;
