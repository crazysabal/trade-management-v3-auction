import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import useDraggable from '../hooks/useDraggable';
import { formatLocalDate } from '../utils/dateUtils'; // [FIX] Import date utility

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
        return formatLocalDate(d);
    });
    const [endDate, setEndDate] = useState(formatLocalDate(new Date()));
    const [itemsList, setItemsList] = useState([]); // [REPLACED] 전표 목록 -> 품목 목록
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

    const searchSales = async () => {
        if (!companyId) return;
        setLoading(true);
        setSearchTriggered(true);
        try {
            // 1. 거래처의 매출 전표 목록 조회
            const response = await axios.get('/api/trades', {
                params: {
                    company_id: companyId,
                    start_date: startDate,
                    end_date: endDate,
                    trade_type: 'SALE',
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
                            total_price: master.total_price // 전표 전체 정보가 필요한 경우르 위해
                        });
                    });
                }
            });

            setItemsList(flatItems);
        } catch (error) {
            console.error("Failed to fetch detailed sales history:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && companyId) {
            searchSales();
        }
    }, [isOpen, companyId]);

    const handleItemSelect = (item) => {
        // [MODIFIED] 개별 품목 반품을 위해 item.id (trade_detail_id)를 함께 전달
        onSelect({
            id: item.master_id,
            trade_number: item.trade_number,
            selectedItemId: item.id  // 개별 품목 ID
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
                    <div className="trade-toolbar" style={{ marginBottom: '1.25rem', backgroundColor: '#f8fafc', padding: '12px 15px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '15px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>조회 기간</span>
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
                            style={{ padding: '0 25px', height: '34px', flex: 'none', maxWidth: '100px', fontSize: '0.85rem' }}
                        >
                            조회
                        </button>
                    </div>

                    {/* 실시간 목록 필터 (목록 바로 위) */}
                    <div style={{ padding: '0 5px 10px 5px' }}>
                        <input
                            type="text"
                            placeholder="🔍 품목명, 비고 검색..."
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
                    <div className="trade-table-container" style={{ height: '400px', border: '1px solid #e2e8f0', borderRadius: '8px', overflowY: 'auto' }}>
                        <table className="trade-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f1f5f9' }}>
                                <tr>
                                    <th style={{ width: '80px', padding: '12px', color: '#64748b' }}>선택</th>
                                    <th style={{ width: '100px', padding: '12px', color: '#64748b' }}>날짜</th>
                                    <th style={{ textAlign: 'left', padding: '12px', color: '#64748b' }}>품목</th>
                                    <th style={{ width: '80px', textAlign: 'right', padding: '12px', color: '#64748b' }}>매출수량</th>
                                    <th style={{ width: '80px', textAlign: 'right', padding: '12px', color: '#64748b', backgroundColor: '#fff7ed' }}>반품가능</th>
                                    <th style={{ width: '90px', textAlign: 'right', padding: '12px', color: '#64748b' }}>단가</th>
                                    <th style={{ width: '100px', textAlign: 'right', padding: '12px', color: '#64748b' }}>금액</th>
                                    <th style={{ textAlign: 'left', padding: '12px', color: '#64748b' }}>비고</th>

                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>상세 품목을 불러오는 중...</td></tr>
                                ) : itemsList.length === 0 ? (
                                    <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>매출 내역이 없습니다.</td></tr>
                                ) : (
                                    itemsList
                                        .filter(item =>
                                            item.product_name?.toLowerCase().includes(filterText.toLowerCase()) ||
                                            item.notes?.toLowerCase().includes(filterText.toLowerCase())
                                        )
                                        .map((item, index) => (
                                            <tr key={`${item.master_id}-${index}`} className="trade-table-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td className="text-center" style={{ padding: '10px' }}>
                                                    <button
                                                        className="btn btn-success btn-sm"
                                                        onClick={() => handleItemSelect(item)}
                                                        style={{ borderRadius: '6px', padding: '4px 12px' }}
                                                    >
                                                        선택
                                                    </button>
                                                </td>
                                                <td className="text-center" style={{ padding: '10px', color: '#475569', fontSize: '0.85rem' }}>{item.trade_date}</td>
                                                <td style={{ padding: '10px', textAlign: 'left' }}>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                        {item.product_name} {(item.product_weight && parseFloat(item.product_weight) > 0) ? `${parseFloat(item.product_weight)}${item.weight_unit || item.product_weight_unit || 'kg'}` : ''} {item.grade ? `(${item.grade})` : ''}
                                                    </div>
                                                </td>
                                                <td className="text-right" style={{ padding: '10px', fontWeight: 500, color: '#475569' }}>
                                                    {parseFloat(item.quantity).toLocaleString()}
                                                </td>
                                                <td className="text-right" style={{ padding: '10px', fontWeight: 700, color: '#f97316', backgroundColor: '#fff7ed' }}>
                                                    {Math.max(0, parseFloat(item.quantity) - (parseFloat(item.item_returned_quantity) || 0)).toLocaleString()}
                                                </td>
                                                <td className="text-right" style={{ padding: '10px', color: '#64748b' }}>
                                                    {parseFloat(item.unit_price).toLocaleString()}
                                                </td>
                                                <td className="text-right" style={{ padding: '10px', fontWeight: 700, color: '#0f172a' }}>
                                                    {Math.round(item.total_amount || 0).toLocaleString()}원
                                                </td>

                                                <td style={{ padding: '10px', textAlign: 'left', color: '#64748b', fontSize: '0.85rem' }}>
                                                    {item.notes || '-'}
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
