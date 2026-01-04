import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, warehousesAPI, inventoryAdjustmentAPI, inventoryTransferAPI, inventoryProductionAPI } from '../services/api'; // Use centralized API services
import ConfirmModal from '../components/ConfirmModal';
import TradeDetailModal from '../components/TradeDetailModal';
import ProductionDetailModal from '../components/ProductionDetailModal';
import './InventoryHistory.css';

const InventoryHistory = ({ onOpenTrade }) => {
    const [history, setHistory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [messageModal, setMessageModal] = useState({ isOpen: false, title: '', message: '', content: null });
    const [detailModal, setDetailModal] = useState({ isOpen: false, tradeId: null });
    const [prodDetailModal, setProdDetailModal] = useState({ isOpen: false, productionId: null });
    const [confirmAction, setConfirmAction] = useState(null); // Function to execute on confirm

    // Filters
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const params = {
                start_date: startDate,
                end_date: endDate,
                // warehouse_id and transaction_type removed to fetch all
            };

            const response = await purchaseInventoryAPI.getTransactions(params);
            if (response.data.success) {
                const sortedData = (response.data.data || []).sort((a, b) => {
                    // 1. Sort by displayed Transaction Date first
                    const tDateA = a.transaction_date || '';
                    const tDateB = b.transaction_date || '';
                    if (tDateA !== tDateB) {
                        return tDateB.localeCompare(tDateA);
                    }
                    // 2. Sort by Detail Date (Entry Time)
                    const dDateA = a.detail_date || '';
                    const dDateB = b.detail_date || '';
                    // Convert to timestamps for accurate comparison
                    const timeA = new Date(dDateA).getTime();
                    const timeB = new Date(dDateB).getTime();
                    if (timeA !== timeB) {
                        return timeB - timeA;
                    }

                    // 2.5 Tie-breaker: Transaction Type Priority (Logically Newer Events > Older Events)
                    // Higher Number = Newer = Shows Top in Descending List
                    const typePriority = {
                        'TRANSFER_IN': 5,      // Result of Transfer (Newest)
                        'SALE': 4,             // Consumption
                        'TRANSFER_OUT': 4,     // Consumption
                        'PRODUCTION_IN': 3,    // Production Result
                        'PRODUCTION_OUT': 2,   // Production Input (Used)
                        'PURCHASE': 1,         // Initial Source
                        'IN': 1,
                        'ADJUST': 0            // Flexible
                    };
                    const pA = typePriority[a.transaction_type] || 0;
                    const pB = typePriority[b.transaction_type] || 0;
                    if (pA !== pB) {
                        return pB - pA;
                    }

                    // 3. Tie-breaker: ID
                    return (b.id || 0) - (a.id || 0);
                });
                setHistory(sortedData);
            }
        } catch (error) {
            console.error('재고 이력 조회 실패', error);
            setMessageModal({
                isOpen: true,
                title: '오류',
                message: '데이터를 불러오는 중 오류가 발생했습니다.'
            });
        } finally {
            setLoading(false);
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'PURCHASE': return '매입 입고';
            case 'SALE': return '매출 출고';
            case 'PRODUCTION_IN': return '생산 입고';
            case 'PRODUCTION_OUT': return '생산 출고';
            case 'IN': return '입고';
            case 'OUT': return '출고';
            case 'TRANSFER_IN': return '창고 입고';
            case 'TRANSFER_OUT': return '창고 출고';
            case 'ADJUST': return '재고 조정';
            default: return type;
        }
    };

    const getTypeBadgeClass = (type) => {
        switch (type) {
            case 'PURCHASE':
            case 'PRODUCTION_IN':
            case 'IN':
                return 'in';
            case 'SALE':
            case 'PRODUCTION_OUT':
            case 'OUT':
                return 'out';
            case 'ADJUST': return 'adjust';
            case 'TRANSFER_IN': return 'transfer-in';
            case 'TRANSFER_OUT': return 'transfer-out';
            default: return '';
        }
    };

    // Multi-keyword filtering
    const getFilteredHistory = () => {
        if (!searchTerm.trim()) return history;

        const keywords = searchTerm.toLowerCase().split(/\s+/).filter(k => k.length > 0);

        return history.filter(item => {
            // Combine all searchable fields into a single string for checking
            const searchableText = `
                ${item.transaction_date || ''}
                ${getTypeLabel(item.transaction_type)}
                ${item.warehouse_name || ''}
                ${item.product_name || ''}
                ${item.grade || ''}
                ${item.company_name || ''}
                ${item.sender || ''}
                ${item.shipper_location || ''}
                ${item.trade_number || ''}
            `.toLowerCase();

            // Check if ALL keywords are present in the searchable text (AND condition)
            return keywords.every(keyword => searchableText.includes(keyword));
        });
    };

    const displayedHistory = getFilteredHistory();



    const formatNumber = (num) => {
        return num ? Number(num).toLocaleString() : '0';
    };

    const handleRowClick = (item) => {
        if (!item.trade_master_id) return;

        let type = null;
        if (['PURCHASE', 'IN', 'PRODUCTION_IN'].includes(item.transaction_type)) type = 'PURCHASE';
        if (['SALE', 'OUT'].includes(item.transaction_type)) type = 'SALE';

        // Ensure onOpenTrade exists and type is valid before calling
        if (type && onOpenTrade) {
            onOpenTrade(type, item.trade_master_id);
        }
    };

    const handleCancelAdjustment = (item) => {
        setConfirmAction(() => async () => {
            try {
                await inventoryAdjustmentAPI.cancel(item.reference_id);
                fetchHistory();
                setConfirmAction(null);
            } catch (error) {
                console.error('조정 취소 실패', error);
                // Alert is sufficient, confirmAction stays null for the error modal
                setConfirmAction(null); // Clear action first
                setTimeout(() => {
                    setMessageModal({
                        isOpen: true,
                        title: '오류',
                        message: error.response?.data?.message || '조정 취소 중 오류가 발생했습니다.'
                    });
                }, 100);
            }
        });
        setMessageModal({
            isOpen: true,
            title: '조정 취소',
            message: '정말로 이 재고 조정을 취소하시겠습니까?\n취소 시 재고 수량이 원복됩니다.'
        });
    };

    // Custom Card Renderer for Confirmation
    const renderCancelCard = (item, typeStr) => {
        return (
            <div style={{
                border: '1px solid #e9ecef',
                borderRadius: '8px',
                padding: '24px',
                backgroundColor: 'white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
                <h3 style={{
                    textAlign: 'center',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    margin: '0 0 24px 0',
                    color: '#343a40'
                }}>
                    {item.product_name} {item.product_weight ? `${Number(item.product_weight)}kg` : ''} {item.grade ? `(${item.grade})` : ''}
                </h3>

                <div style={{ fontSize: '0.95rem', color: '#495057', lineHeight: '1.8' }}>
                    <div style={{ display: 'flex', marginBottom: '8px' }}>
                        <span style={{ width: '80px', color: '#868e96' }}>생산자</span>
                        <span style={{ fontWeight: '500' }}>{item.sender || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', marginBottom: '8px' }}>
                        <span style={{ width: '80px', color: '#868e96' }}>매입처</span>
                        <span style={{ fontWeight: '500' }}>{item.company_name || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', marginBottom: '8px' }}>
                        <span style={{ width: '80px', color: '#868e96' }}>보관</span>
                        <span style={{ fontWeight: '500' }}>{item.warehouse_name || '-'}</span>
                    </div>
                    <div style={{
                        marginTop: '16px',
                        paddingTop: '16px',
                        borderTop: '1px solid #f1f3f5',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: '#868e96',
                        fontSize: '0.9rem'
                    }}>
                        <span>매입일: {item.transaction_date}</span>
                        <span>단가: {item.unit_price ? formatNumber(item.unit_price) : 0}원</span>
                    </div>
                </div>

                <div style={{
                    marginTop: '20px',
                    paddingTop: '20px',
                    borderTop: '1px dashed #dee2e6',
                    textAlign: 'center'
                }}>
                    <span style={{ fontSize: '1rem', color: '#495057', marginRight: '8px' }}>
                        {typeStr} 수량
                    </span>
                    <strong style={{ fontSize: '1.5rem', color: '#20c997' }}>
                        {formatNumber(item.quantity)}
                    </strong>
                </div>
            </div>
        );
    };

    const handleCancelTransfer = (item) => {
        setConfirmAction(() => async () => {
            try {
                await inventoryTransferAPI.cancel(item.reference_id);
                fetchHistory(); // Refresh list
                setConfirmAction(null);
                setMessageModal({
                    isOpen: true,
                    title: '성공',
                    message: '재고 이동이 취소되었습니다.'
                });
            } catch (error) {
                console.error('이동 취소 실패', error);
                setConfirmAction(null);
                setTimeout(() => {
                    setMessageModal({
                        isOpen: true,
                        title: '오류',
                        message: error.response?.data?.message || '이동 취소 중 오류가 발생했습니다.'
                    });
                }, 100);
            }
        });
        setMessageModal({
            isOpen: true,
            title: '이동 취소 확인',
            message: '', // use custom content
            content: renderCancelCard(item, '이동 취소')
        });
    };

    const handleCancelProduction = (item) => {
        setConfirmAction(() => async () => {
            try {
                // Must use production_id (job id), not reference_id (ingredient row id)
                await inventoryProductionAPI.cancel(item.production_id);
                fetchHistory();
                setConfirmAction(null);
                setMessageModal({
                    isOpen: true,
                    title: '성공',
                    message: '생산 작업이 취소되었습니다.'
                });
            } catch (error) {
                console.error('생산 취소 실패', error);
                setConfirmAction(null);
                setTimeout(() => {
                    setMessageModal({
                        isOpen: true,
                        title: '오류',
                        message: error.response?.data?.message || '생산 취소 중 오류가 발생했습니다.'
                    });
                }, 100);
            }
        });
        setMessageModal({
            isOpen: true,
            title: '생산 작업 취소',
            message: '',
            content: renderCancelCard(item, '생산 취소')
        });
    };

    return (
        <div className="inventory-history-container" style={{ padding: '0.5rem' }}>
            {/* Header Removed */}

            {/* Header / Filter Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
                backgroundColor: '#fff',
                padding: '12px 16px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                    {/* 기간 선택 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={{
                                padding: '4px 8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                color: '#495057'
                            }}
                        />
                        <span style={{ color: '#868e96' }}>~</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={{
                                padding: '4px 8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                color: '#495057'
                            }}
                        />
                    </div>

                    {/* 구분선 */}
                    <div style={{ width: '1px', height: '24px', backgroundColor: '#e9ecef', margin: '0 8px' }}></div>

                    {/* 검색 필터 */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="🔍 품목, 창고, 거래처, 전표번호 검색 (띄어쓰기로 다중 검색)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    fetchHistory();
                                }
                            }}
                            style={{
                                flex: 1,
                                height: '36px',
                                padding: '0 0.75rem',
                                fontSize: '0.9rem',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        />
                    </div>

                    {/* 조회 버튼 */}
                    <div>
                        <button
                            onClick={fetchHistory}
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', height: '36px', fontSize: '0.9rem', opacity: loading ? 0.7 : 1 }}
                        >
                            {loading ? '조회 중...' : '조회'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="history-table-card">
                <table className="history-table">
                    <thead>
                        <tr>
                            <th>일자</th>
                            <th>구분</th>
                            <th>창고</th>
                            <th>품목명</th>
                            <th>수량</th>
                            <th>잔고</th>
                            <th>거래처</th>
                            <th>출하주</th>
                            <th>전표번호</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedHistory.length > 0 ? (
                            displayedHistory.map((item, index) => (
                                <tr key={`${item.transaction_type}-${item.reference_id}-${index}`}>
                                    <td>
                                        {item.transaction_date ? item.transaction_date.substring(0, 10) : '-'}
                                        <div style={{ fontSize: '0.8em', color: '#999' }}>
                                            {item.detail_date ? new Date(item.detail_date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`type-badge ${getTypeBadgeClass(item.transaction_type)}`}>
                                            {getTypeLabel(item.transaction_type)}
                                        </span>
                                    </td>
                                    <td>
                                        {item.warehouse_name || '-'}
                                    </td>
                                    <td>
                                        {item.product_name}
                                        {item.product_weight ? ` ${Number(item.product_weight)}kg` : ''}
                                        {item.grade ? ` (${item.grade})` : ''}
                                    </td>
                                    <td>
                                        <strong style={{ color: ['IN', 'PURCHASE', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUST'].includes(item.transaction_type) && Number(item.quantity) > 0 ? '#2ecc71' : '#e74c3c' }}>
                                            {/* Logic for Sign */}
                                            {(() => {
                                                const qty = Number(item.quantity);
                                                // 1. Outgoing types (always negative)
                                                if (['SALE', 'OUT', 'PRODUCTION_OUT', 'TRANSFER_OUT'].includes(item.transaction_type)) {
                                                    return `-${formatNumber(Math.abs(qty))}`;
                                                }
                                                // 2. Incoming types (always positive)
                                                if (['IN', 'PURCHASE', 'PRODUCTION_IN', 'TRANSFER_IN'].includes(item.transaction_type)) {
                                                    return `+${formatNumber(Math.abs(qty))}`;
                                                }
                                                // 3. Adjust (signed)
                                                return (qty > 0 ? '+' : '') + formatNumber(qty);
                                            })()}
                                        </strong>
                                    </td>
                                    <td style={{ color: '#7f8c8d' }}>
                                        {formatNumber(item.running_stock)}
                                    </td>
                                    <td>
                                        {item.company_name || '-'}
                                    </td>
                                    <td>
                                        {item.sender || '-'}
                                    </td>
                                    <td>
                                        <span
                                            className={item.trade_master_id || item.production_id ? 'trade-link' : ''}
                                            style={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.9em',
                                                cursor: (item.trade_master_id || item.production_id) ? 'pointer' : 'default',
                                                color: (item.trade_master_id || item.production_id) ? '#339af0' : 'inherit', // Blue color like TradeList
                                                textDecoration: (item.trade_master_id || item.production_id) ? 'none' : 'none'
                                            }}
                                            onClick={(e) => {
                                                if (item.production_id) {
                                                    e.stopPropagation();
                                                    setProdDetailModal({ isOpen: true, productionId: item.production_id });
                                                } else if (item.trade_master_id) {
                                                    e.stopPropagation();
                                                    setDetailModal({ isOpen: true, tradeId: item.trade_master_id });
                                                }
                                            }}
                                        >
                                            {item.trade_number || '-'}
                                        </span>
                                        {/* Cancel Button (Inline) */}
                                        {(item.transaction_type === 'ADJUST' || ['TRANSFER_IN', 'TRANSFER_OUT', 'PRODUCTION_IN', 'PRODUCTION_OUT'].includes(item.transaction_type)) && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (item.transaction_type === 'ADJUST') {
                                                        handleCancelAdjustment(item);
                                                    } else if (['PRODUCTION_IN', 'PRODUCTION_OUT'].includes(item.transaction_type)) {
                                                        handleCancelProduction(item);
                                                    } else {
                                                        handleCancelTransfer(item);
                                                    }
                                                }}
                                                style={{
                                                    marginLeft: '6px',
                                                    backgroundColor: '#ff6b6b',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '2px 6px',
                                                    fontSize: '0.75rem',
                                                    cursor: 'pointer',
                                                    verticalAlign: 'middle'
                                                }}
                                            >
                                                취소
                                            </button>
                                        )}
                                        {/* [NEW] Source Trade Link */}
                                        {item.source_trade_id && (
                                            <div style={{ fontSize: '0.75rem', marginTop: '2px', color: '#6c757d' }}>
                                                <span style={{ marginRight: '4px' }}>매입:</span>
                                                <span
                                                    className="trade-link"
                                                    style={{ color: '#6c757d', textDecoration: 'underline', cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDetailModal({ isOpen: true, tradeId: item.source_trade_id });
                                                    }}
                                                >
                                                    {item.source_trade_number}
                                                </span>
                                            </div>
                                        )}


                                    </td>
                                    <td style={{ color: '#868e96', fontSize: '0.9em' }}>
                                        {item.transaction_type === 'ADJUST' ? item.adjustment_reason : item.notes}
                                        {item.transaction_type === 'TRANSFER_OUT' && (
                                            <div style={{ color: '#7950f2' }}>
                                                {item.shipper_location}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="9" className="empty-state">
                                    조회된 이력이 없습니다.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ConfirmModal
                isOpen={messageModal.isOpen}
                onClose={() => setMessageModal({ ...messageModal, isOpen: false })}
                onConfirm={confirmAction || (() => setMessageModal(prev => ({ ...prev, isOpen: false })))}
                title={messageModal.title}
                message={messageModal.message}
                type={confirmAction ? "confirm" : "alert"}
                confirmText="확인"
                showCancel={!!confirmAction}
            >
                {messageModal.content}
            </ConfirmModal>

            <TradeDetailModal
                isOpen={detailModal.isOpen}
                onClose={() => setDetailModal({ isOpen: false, tradeId: null })}
                tradeId={detailModal.tradeId}
            />

            <ProductionDetailModal
                isOpen={prodDetailModal.isOpen}
                onClose={() => setProdDetailModal({ isOpen: false, productionId: null })}
                productionId={prodDetailModal.productionId}
            />
        </div >
    );
};

export default InventoryHistory;
