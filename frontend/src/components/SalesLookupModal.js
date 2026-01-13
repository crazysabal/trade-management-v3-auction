import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import useDraggable from '../hooks/useDraggable';

const SalesLookupModal = ({
    isOpen,
    onClose,
    companyId,
    companyName,
    onSelect
}) => {
    const { position, handleMouseDown } = useDraggable();
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [salesList, setSalesList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTriggered, setSearchTriggered] = useState(false);

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

    // 모달 오픈 시 바디 스크롤 방지
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

    const searchSales = async () => {
        if (!companyId) return;
        setLoading(true);
        setSearchTriggered(true);
        try {
            const response = await axios.get('/api/trades', {
                params: {
                    company_id: companyId,
                    start_date: startDate,
                    end_date: endDate,
                    trade_type: 'SALE',
                    limit: 100
                }
            });
            setSalesList(response.data.data.filter(t => t.status !== 'CANCELLED'));
        } catch (error) {
            console.error("Failed to fetch sales history:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && companyId) {
            searchSales();
        }
    }, [isOpen, companyId]);

    if (!isOpen) return null;

    return createPortal(
        <div className="premium-modal-overlay" onClick={onClose}>
            <div
                className="premium-modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '850px',
                    width: '90%',
                    transform: `translate(${position.x}px, ${position.y}px)`
                }}
            >
                {/* 헤더: 중앙 정렬 아이콘 디자인 */}
                <div className="premium-modal-header">
                    <div
                        className="premium-modal-icon"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: 'grab' }}
                    >
                        <span role="img" aria-label="return" style={{ pointerEvents: 'none' }}>↩️</span>
                    </div>
                    <h2 className="premium-modal-title" style={{ userSelect: 'none' }}>반품 대상 매출 선택</h2>
                    <p className="premium-modal-subtitle">
                        {companyName}의 매출 전표를 선택하세요.
                    </p>
                </div>

                <div className="premium-modal-body">
                    {/* 검색 바 */}
                    <div className="trade-toolbar" style={{ marginBottom: '1.5rem', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '15px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>조회 기간</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="trade-date-input"
                                style={{ width: '130px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                            />
                            <span style={{ color: '#94a3b8' }}>~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="trade-date-input"
                                style={{ width: '130px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                            />
                        </div>
                        <button
                            className="premium-modal-btn premium-btn-primary"
                            onClick={searchSales}
                            style={{ padding: '0 20px', height: '36px', flex: 'none', maxWidth: '100px', fontSize: '0.9rem' }}
                        >
                            조회
                        </button>
                    </div>

                    {/* 결과 테이블 */}
                    <div className="trade-table-container" style={{ height: '400px', border: '1px solid #e2e8f0', borderRadius: '8px', overflowY: 'auto' }}>
                        <table className="trade-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f1f5f9' }}>
                                <tr>
                                    <th style={{ width: '80px', padding: '12px', color: '#64748b' }}>선택</th>
                                    <th style={{ width: '110px', padding: '12px', color: '#64748b' }}>날짜</th>
                                    <th style={{ width: '140px', padding: '12px', color: '#64748b' }}>전표번호</th>
                                    <th style={{ textAlign: 'left', padding: '12px', color: '#64748b' }}>품목 내역</th>
                                    <th style={{ width: '110px', textAlign: 'right', padding: '12px', color: '#64748b' }}>합계금액</th>
                                    <th style={{ width: '80px', padding: '12px', color: '#64748b' }}>품목수</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>검색 중...</td></tr>
                                ) : salesList.length === 0 ? (
                                    <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>매출 내역이 없습니다.</td></tr>
                                ) : (
                                    salesList.map(sale => (
                                        <tr key={sale.id} className="trade-table-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td className="text-center" style={{ padding: '10px' }}>
                                                <button
                                                    className="btn btn-success btn-sm"
                                                    onClick={() => onSelect(sale)}
                                                    style={{ borderRadius: '6px', padding: '4px 12px' }}
                                                >
                                                    선택
                                                </button>
                                            </td>
                                            <td className="text-center" style={{ padding: '10px', color: '#475569' }}>{sale.trade_date}</td>
                                            <td className="text-center" style={{ padding: '10px', color: '#3b82f6', fontWeight: 500 }}>{sale.trade_number}</td>
                                            <td style={{ padding: '10px', textAlign: 'left' }}>
                                                <div style={{ fontWeight: 500, color: '#1e293b' }}>
                                                    {sale.product_names || <span style={{ color: '#cbd5e1' }}>(품목 정보 없음)</span>}
                                                </div>
                                            </td>
                                            <td className="text-right" style={{ padding: '10px', fontWeight: 700, color: '#0f172a' }}>
                                                {Number(sale.total_price).toLocaleString()}원
                                            </td>
                                            <td className="text-center" style={{ padding: '10px' }}>
                                                <span style={{ fontSize: '0.85rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                                    {sale.item_count}건
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="premium-modal-footer">
                    <button
                        className="premium-modal-btn premium-btn-secondary"
                        onClick={onClose}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SalesLookupModal;
