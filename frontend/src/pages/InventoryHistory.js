import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, warehousesAPI } from '../services/api'; // Use centralized API services
import ConfirmModal from '../components/ConfirmModal';
import './InventoryHistory.css';

const InventoryHistory = () => {
    const [history, setHistory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [messageModal, setMessageModal] = useState({ isOpen: false, title: '', message: '' });

    // Filters
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [transactionType, setTransactionType] = useState('');

    useEffect(() => {
        fetchWarehouses();
        fetchHistory();
    }, []);

    const fetchWarehouses = async () => {
        try {
            const response = await warehousesAPI.getAll();
            if (response.data.success) {
                setWarehouses(response.data.data);
            }
        } catch (error) {
            console.error('창고 목록 로드 실패', error);
            setMessageModal({
                isOpen: true,
                title: '오류',
                message: '창고 목록을 불러오는데 실패했습니다.'
            });
        }
    };

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const params = {
                start_date: startDate,
                end_date: endDate,
                warehouse_id: selectedWarehouse,
                transaction_type: transactionType
            };

            const response = await purchaseInventoryAPI.getTransactions(params);
            if (response.data.success) {
                setHistory(response.data.data);
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

    const formatNumber = (num) => {
        return num ? Number(num).toLocaleString() : '0';
    };

    return (
        <div className="inventory-history-container">
            <div className="page-header mb-4">
                <h2 className="page-title">재고 이력 조회</h2>
            </div>

            <div className="history-filter-bar">
                <div className="filter-group">
                    <label>시작일</label>
                    <input
                        type="date"
                        className="filter-input"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <label>종료일</label>
                    <input
                        type="date"
                        className="filter-input"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <label>창고</label>
                    <select
                        className="filter-input"
                        value={selectedWarehouse}
                        onChange={(e) => setSelectedWarehouse(e.target.value)}
                    >
                        <option value="">전체 창고</option>
                        {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label>구분</label>
                    <select
                        className="filter-input"
                        value={transactionType}
                        onChange={(e) => setTransactionType(e.target.value)}
                    >
                        <option value="">전체 입출고</option>
                        <option value="IN">입고 (매입/생산)</option>
                        <option value="OUT">출고 (매출/투입)</option>
                    </select>
                </div>

                <button className="search-btn" onClick={fetchHistory} disabled={loading}>
                    {loading ? '조회 중...' : '조회하기'}
                </button>
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
                            <th>출하실/비고</th>
                            <th>전표번호</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length > 0 ? (
                            history.map((item, index) => (
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
                                        <strong style={{ color: ['IN', 'PURCHASE', 'PRODUCTION_IN'].includes(item.transaction_type) ? '#2ecc71' : '#e74c3c' }}>
                                            {['IN', 'PURCHASE', 'PRODUCTION_IN'].includes(item.transaction_type) ? '+' : '-'}{formatNumber(item.quantity)}
                                        </strong>
                                    </td>
                                    <td style={{ color: '#7f8c8d' }}>
                                        {formatNumber(item.running_stock)}
                                    </td>
                                    <td>
                                        {item.company_name || '-'}
                                    </td>
                                    <td>
                                        {item.shipper_location || item.sender || '-'}
                                    </td>
                                    <td>
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
                                            {item.trade_number || '-'}
                                        </span>
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
        </div >
    );
};

export default InventoryHistory;
