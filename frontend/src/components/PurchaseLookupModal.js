import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import useDraggable from '../hooks/useDraggable';
import { formatLocalDate } from '../utils/dateUtils';

const PurchaseLookupModal = ({
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
        return formatLocalDate(d);
    });
    const [endDate, setEndDate] = useState(formatLocalDate(new Date()));
    const [itemsList, setItemsList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTriggered, setSearchTriggered] = useState(false);
    const [filterText, setFilterText] = useState('');

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

    const searchPurchases = async () => {
        if (!companyId) return;
        setLoading(true);
        setSearchTriggered(true);
        try {
            // 1. 거래처의 매입 전표 목록 조회
            const response = await axios.get('/api/trades', {
                params: {
                    company_id: companyId,
                    start_date: startDate,
                    end_date: endDate,
                    trade_type: 'PURCHASE',
                    limit: 200
                }
            });

            const masters = response.data.data.filter(t => t.status !== 'CANCELLED' && t.item_count > 0);

            // 2. 각 전표의 상세 정보를 병렬로 가져와서 '품목 단위'로 플랫하게 펼침
            const detailPromises = masters.map(m => axios.get(`/api/trades/${m.id}`));
            const detailsResponses = await Promise.all(detailPromises);

            const flatItems = [];
            detailsResponses.forEach((res, idx) => {
                if (res.data.success) {
                    const master = masters[idx];
                    const details = res.data.data.details;
                    details.forEach(d => {
                        flatItems.push({
                            ...d,
                            trade_number: master.trade_number,
                            trade_date: master.trade_date,
                            master_id: master.id,
                            total_price: master.total_price
                        });
                    });
                }
            });

            setItemsList(flatItems);
        } catch (error) {
            console.error("Failed to fetch detailed purchase history:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && companyId) {
            searchPurchases();
        }
    }, [isOpen, companyId]);

    const handleItemSelect = (item) => {
        onSelect({
            id: item.master_id,
            trade_number: item.trade_number,
            selectedItemId: item.id,
            remaining_quantity: item.remaining_quantity
        });
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="premium-modal-overlay" onClick={onClose}>
            <div
                className="premium-modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'auto',
                    minWidth: '750px',
                    maxWidth: '1000px',
                    transform: `translate(${position.x}px, ${position.y}px)`
                }}
            >
                {/* 헤더 */}
                <div className="premium-modal-header" style={{ padding: '1.5rem 1.5rem 1rem' }}>
                    <div
                        className="premium-modal-icon"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: 'grab', backgroundColor: '#e74c3c', width: '48px', height: '48px', marginBottom: '0.75rem' }}
                    >
                        <span role="img" aria-label="return" style={{ pointerEvents: 'none', fontSize: '1.5rem' }}>📤</span>
                    </div>
                    <h2 className="premium-modal-title" style={{ userSelect: 'none', fontSize: '1.5rem', marginBottom: '0.25rem' }}>반출 대상 매입 선택</h2>
                    <p className="premium-modal-subtitle" style={{ fontSize: '0.9rem', color: '#64748b' }}>
                        <strong style={{ color: '#e74c3c' }}>{companyName || '거래처'}</strong>에서 매입한 품목을 반출(반품) 처리합니다.
                    </p>
                </div>

                <div className="premium-modal-body" style={{ padding: '0 1.5rem 1.5rem' }}>
                    {/* 검색 바 */}
                    <div className="trade-toolbar" style={{ marginBottom: '1rem', backgroundColor: '#fdf2f2', padding: '10px 15px', borderRadius: '12px', border: '1px solid #fee2e2', display: 'flex', justifyContent: 'center', gap: '15px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>조회 기간</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="trade-date-input"
                                style={{ width: '120px', border: '1px solid #cbd5e1', borderRadius: '6px', height: '32px', fontSize: '0.85rem' }}
                            />
                            <span style={{ color: '#94a3b8' }}>~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="trade-date-input"
                                style={{ width: '120px', border: '1px solid #cbd5e1', borderRadius: '6px', height: '32px', fontSize: '0.85rem' }}
                            />
                        </div>

                        <button
                            className="premium-modal-btn"
                            onClick={searchPurchases}
                            style={{ padding: '0 20px', height: '32px', flex: 'none', maxWidth: '100px', fontSize: '0.85rem', backgroundColor: '#e74c3c', color: 'white', fontWeight: 'bold' }}
                        >
                            조회
                        </button>
                    </div>

                    {/* 실시간 목록 필터 */}
                    <div style={{ padding: '0 5px 10px 5px' }}>
                        <input
                            type="text"
                            placeholder="🔍 품목명, 출하주, 비고 검색..."
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 15px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                backgroundColor: '#fff',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                            }}
                        />
                    </div>

                    {/* 결과 테이블 */}
                    <div className="trade-table-container" style={{ height: '350px', border: '1px solid #e2e8f0', borderRadius: '8px', overflowY: 'auto' }}>
                        <table className="trade-table" style={{ width: '100%', borderCollapse: 'collapse', height: 'auto' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f1f5f9' }}>
                                <tr>
                                    <th style={{ width: '70px', padding: '8px', color: '#64748b' }}>선택</th>
                                    <th style={{ width: '100px', padding: '8px', color: '#64748b' }}>날짜</th>
                                    <th style={{ textAlign: 'left', padding: '8px', color: '#64748b' }}>품목</th>
                                    <th style={{ width: '80px', textAlign: 'right', padding: '8px', color: '#64748b' }}>매입수량</th>
                                    <th style={{ width: '80px', textAlign: 'right', padding: '8px', color: '#64748b', backgroundColor: '#fef2f2' }}>반출가능</th>
                                    <th style={{ width: '90px', textAlign: 'right', padding: '8px', color: '#64748b' }}>단가</th>
                                    <th style={{ width: '100px', textAlign: 'right', padding: '8px', color: '#64748b' }}>금액</th>
                                    <th style={{ textAlign: 'left', padding: '8px', color: '#64748b' }}>출하주</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>매입 내역을 불러오는 중...</td></tr>
                                ) : itemsList.length === 0 ? (
                                    <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>매입 내역이 없습니다.</td></tr>
                                ) : (
                                    itemsList
                                        .filter(item => {
                                            const matchesSearch = item.product_name?.toLowerCase().includes(filterText.toLowerCase()) ||
                                                item.sender?.toLowerCase().includes(filterText.toLowerCase()) ||
                                                item.notes?.toLowerCase().includes(filterText.toLowerCase());

                                            // [IMPROVED] 재고 잔량이 있는 경우에만 표시 (매입 후 잔량 + 반품으로 돌아온 재고 포함)
                                            const hasInventory = (parseFloat(item.remaining_quantity) || 0) > 0;

                                            return matchesSearch && hasInventory;
                                        })
                                        .map((item, index) => (
                                            <tr key={`${item.master_id}-${index}`} className="trade-table-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td className="text-center" style={{ padding: '6px 10px' }}>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleItemSelect(item)}
                                                        style={{ borderRadius: '6px', padding: '2px 10px', fontSize: '0.8rem' }}
                                                    >
                                                        선택
                                                    </button>
                                                </td>
                                                <td className="text-center" style={{ padding: '6px 10px', color: '#475569', fontSize: '0.8rem' }}>{item.trade_date}</td>
                                                <td style={{ padding: '6px 10px', textAlign: 'left' }}>
                                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>
                                                        {item.product_name} {(item.product_weight && parseFloat(item.product_weight) > 0) ? `${parseFloat(item.product_weight)}${item.weight_unit || item.product_weight_unit || 'kg'}` : ''} {item.grade ? `(${item.grade})` : ''}
                                                    </div>
                                                </td>
                                                <td className="text-right" style={{ padding: '6px 10px', fontWeight: 500, color: '#475569', fontSize: '0.9rem' }}>
                                                    {parseFloat(item.quantity).toLocaleString()}
                                                </td>
                                                <td className="text-right" style={{ padding: '6px 10px', fontWeight: 700, color: '#ef4444', backgroundColor: '#fef2f2', fontSize: '0.9rem' }}>
                                                    {parseFloat(item.remaining_quantity || 0).toLocaleString()}
                                                </td>
                                                <td className="text-right" style={{ padding: '6px 10px', color: '#64748b', fontSize: '0.85rem' }}>
                                                    {parseFloat(item.unit_price).toLocaleString()}
                                                </td>
                                                <td className="text-right" style={{ padding: '6px 10px', fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                                                    {Math.round(item.total_amount || 0).toLocaleString()}원
                                                </td>
                                                <td style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontSize: '0.8rem' }}>
                                                    {item.sender || '-'}
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

export default PurchaseLookupModal;
