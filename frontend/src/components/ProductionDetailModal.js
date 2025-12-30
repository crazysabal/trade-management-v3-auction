import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { inventoryProductionAPI } from '../services/api';

/**
 * 재고 작업 상세 보기 모달 컴포넌트
 * (TradeDetailModal 스타일 재사용)
 */
const ProductionDetailModal = ({ isOpen, onClose, productionId }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && productionId) {
            fetchDetail();
        } else {
            setData(null);
        }
    }, [isOpen, productionId]);

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

    // 모달 열릴 때 스크롤 방지
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

    const fetchDetail = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await inventoryProductionAPI.getDetail(productionId);
            if (response.data.success) {
                setData(response.data.data);
            }
        } catch (err) {
            setError('상세 정보를 불러오는데 실패했습니다.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const formatNumber = (value) => new Intl.NumberFormat('ko-KR').format(value || 0);

    const formatWeight = (weight) => {
        const num = parseFloat(weight);
        if (isNaN(num)) return weight;
        return num % 1 === 0 ? num.toFixed(0) : num.toString();
    };

    const renderIngredientName = (ing) => {
        const parts = [ing.product_name];
        if (ing.weight) {
            parts.push(`${formatWeight(ing.weight)}kg`);
        }
        if (ing.grade) {
            parts.push(ing.grade);
        }
        return parts.join(' ');
    };

    return createPortal(
        <div className="modal-overlay">
            <div
                className="trade-detail-modal"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '900px', maxWidth: '95%',
                    backgroundColor: 'white',
                    padding: '1rem', // Reduced padding
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                }}
            >
                {/* 헤더 */}
                <div className="trade-detail-modal-header">
                    <div className="trade-detail-modal-header-left">
                        <h2>📦 재고 작업 상세</h2>
                        {data && (
                            <div className="trade-detail-header-summary">
                                <span className="summary-item">
                                    <span className="summary-label">작업일</span>
                                    <span className="summary-value">
                                        {(() => {
                                            const d = new Date(data.created_at);
                                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                        })()}
                                    </span>
                                </span>
                                <span className="summary-divider">|</span>
                                <span className="summary-item">
                                    <span className="summary-label">ID</span>
                                    <span className="summary-value highlight">{data.id}</span>
                                </span>
                            </div>
                        )}
                    </div>
                    <button className="trade-detail-modal-close" onClick={onClose}>×</button>
                </div>

                {/* 바디 */}
                <div className="trade-detail-modal-body">
                    {loading ? (
                        <div className="trade-detail-modal-loading">불러오는 중...</div>
                    ) : error ? (
                        <div className="trade-detail-modal-error">{error}</div>
                    ) : data ? (
                        <>
                            {/* 섹션 1: 생산 정보 (결과물) */}
                            <h4 className="trade-detail-section-title">🏷️ 생산 결과 (Output)</h4>
                            <div className="trade-detail-info-grid" style={{ gridTemplateColumns: '1fr' }}>
                                {/* Row 1: Product / Qty / Price */}
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                                    <div className="trade-detail-info-item">
                                        <label>생산 품목</label>
                                        <div className="trade-detail-info-value highlight" style={{ color: '#6f42c1' }}>
                                            {data.output_product_name}
                                            {Number(data.output_product_weight || 0) > 0 ? ` ${Number(data.output_product_weight)}kg` : ''}
                                            {data.output_product_grade ? ` (${data.output_product_grade})` : ''}
                                        </div>
                                    </div>
                                    <div className="trade-detail-info-item">
                                        <label>생산 수량</label>
                                        <div className="trade-detail-info-value">
                                            {formatNumber(data.output_quantity)}
                                        </div>
                                    </div>
                                    <div className="trade-detail-info-item">
                                        <label>생산 단가</label>
                                        <div className="trade-detail-info-value">
                                            {formatNumber(Math.round(data.unit_cost))} 원
                                        </div>
                                    </div>
                                </div>
                                {data.memo && (
                                    <div className="trade-detail-info-item full-width" style={{ marginTop: '1rem' }}>
                                        <label>메모</label>
                                        <div className="trade-detail-info-value">{data.memo}</div>
                                    </div>
                                )}
                            </div>

                            {/* 섹션 2: 투입 재료 목록 */}
                            <h4 className="trade-detail-section-title" style={{ marginTop: '1.5rem' }}>
                                📥 투입 재료 (Ingredients) ({data.ingredients ? data.ingredients.length : 0}건)
                            </h4>
                            <div className="trade-detail-table-container">
                                <table className="trade-detail-table" style={{ borderCollapse: 'collapse', width: '100%', border: '1px solid #dce4ec' }}>
                                    <thead style={{ backgroundColor: '#34495e' }}>
                                        <tr>
                                            <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #dde2e6', color: 'white', fontWeight: 'bold' }}>품목</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #dde2e6', color: 'white', fontWeight: 'bold' }}>출하주</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #dde2e6', color: 'white', fontWeight: 'bold' }}>매입 거래처</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #dde2e6', color: 'white', fontWeight: 'bold' }}>매입 일자</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #dde2e6', color: 'white', fontWeight: 'bold' }}>수량</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #dde2e6', color: 'white', fontWeight: 'bold' }}>단가</th>
                                            <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #dde2e6', color: 'white', fontWeight: 'bold' }}>합계</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.ingredients && data.ingredients.length > 0 ? (
                                            data.ingredients.map((ing, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ fontWeight: '500' }}>{renderIngredientName(ing)}</td>
                                                    <td style={{ textAlign: 'center' }}>{ing.sender || '-'}</td>
                                                    <td style={{ textAlign: 'center' }}>{ing.company_name || '-'}</td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {ing.purchase_date ? (() => {
                                                            const d = new Date(ing.purchase_date);
                                                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                                        })() : '-'}
                                                    </td>
                                                    <td className="text-right" style={{ color: '#b45309', fontWeight: 'bold' }}>
                                                        {formatNumber(ing.used_quantity)}
                                                    </td>
                                                    <td className="text-right">{formatNumber(Math.round(ing.unit_price))} 원</td>
                                                    <td className="text-right font-bold">
                                                        {formatNumber(Math.round(ing.total_cost))} 원
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="7" className="text-center" style={{ padding: '2rem', color: '#aaa' }}>
                                                    투입된 재료 정보가 없습니다.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    {data.ingredients && data.ingredients.length > 0 && (
                                        <tfoot>
                                            <tr>
                                                <td colSpan="4" className="text-right font-bold">합계</td>
                                                <td className="text-right font-bold">
                                                    {formatNumber(data.ingredients.reduce((sum, ing) => sum + Number(ing.used_quantity), 0))}
                                                </td>
                                                <td></td>
                                                <td className="text-right font-bold text-primary">
                                                    {formatNumber(data.ingredients.reduce((sum, ing) => sum + Number(ing.total_cost), 0))} 원
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="trade-detail-modal-empty">작업 내역이 없습니다.</div>
                    )}
                </div>

                {/* 푸터 */}
                {/* 푸터 */}
                <div className="trade-detail-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        style={{
                            width: '80px',
                            height: '36px',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            flex: 'none'
                            // marginRight: '1rem' // Optional: if user wants space on right. Let's stick to size first. 
                            // User said "If I put space on right it might get smaller". I'll ensuring size is fixed is better.
                        }}
                    >
                        닫기
                    </button>
                    {/* Add a spacer if they seemingly want "space on the right"? No, let's just make sure it's sized correctly. 
                       "버튼이 여전히 모달 가로 전체로 되어있는것 같은데?" -> It IS full width.
                       Attributes like flex: 'none' and width: '80px' should fix it.
                    */}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ProductionDetailModal;
