import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, warehousesAPI } from '../services/api'; // Use centralized API services
import ConfirmModal from '../components/ConfirmModal';
import TradeDetailModal from '../components/TradeDetailModal';
import './InventoryHistory.css';

const InventoryHistory = ({ onOpenTrade }) => {
    const [history, setHistory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [messageModal, setMessageModal] = useState({ isOpen: false, title: '', message: '' });
    const [detailModal, setDetailModal] = useState({ isOpen: false, tradeId: null });

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
                    if (dDateA !== dDateB) {
                        return dDateB.localeCompare(dDateA);
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
            case 'PRODUCTION_OUT': return '생산 투입';
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
                                        <strong style={{ color: ['IN', 'PURCHASE', 'PRODUCTION_IN', 'TRANSFER_IN'].includes(item.transaction_type) ? '#2ecc71' : (Number(item.quantity) > 0 ? '#2ecc71' : '#e74c3c') }}>
                                            {Number(item.quantity) > 0 ? '+' : ''}{formatNumber(item.quantity)}
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
                                        {item.transaction_type === 'TRANSFER_OUT' && (
                                            <div style={{ fontSize: '0.8em', color: '#7950f2' }}>
                                                {item.shipper_location}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <span
                                            className={item.trade_master_id ? 'trade-link' : ''}
                                            style={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.9em',
                                                cursor: item.trade_master_id ? 'pointer' : 'default',
                                                color: item.trade_master_id ? '#339af0' : 'inherit', // Blue color like TradeList
                                                textDecoration: item.trade_master_id ? 'none' : 'none' // Remove underline to match TradeList style if desired, or keep it. TradeList uses no underline but blue color.
                                            }}
                                            onClick={(e) => {
                                                if (item.trade_master_id) {
                                                    e.stopPropagation();
                                                    setDetailModal({ isOpen: true, tradeId: item.trade_master_id });
                                                }
                                            }}
                                        >
                                            {item.trade_number || '-'}
                                        </span>
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
                onConfirm={() => setMessageModal({ ...messageModal, isOpen: false })}
                title={messageModal.title}
                message={messageModal.message}
                type="alert"
                confirmText="확인"
                showCancel={false}
            />

            <TradeDetailModal
                isOpen={detailModal.isOpen}
                onClose={() => setDetailModal({ isOpen: false, tradeId: null })}
                tradeId={detailModal.tradeId}
            />
        </div>
    );
};

export default InventoryHistory;
