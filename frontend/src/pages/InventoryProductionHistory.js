import React, { useState, useEffect } from 'react';
import { inventoryProductionAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ProductionDetailModal from '../components/ProductionDetailModal';
import './InventoryProductionHistory.css';

function InventoryProductionHistory() {
    const [history, setHistory] = useState([]);
    const [originalHistory, setOriginalHistory] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(true);

    // 모달 상태
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { } });
    const [detailModal, setDetailModal] = useState({ isOpen: false, productionId: null });

    // 필터
    const [filters, setFilters] = useState({
        start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            loadHistory();
        } catch (error) {
            console.error('초기 데이터 로딩 오류:', error);
        }
    };

    const loadHistory = async () => {
        try {
            setLoading(true);
            const response = await inventoryProductionAPI.getHistory(filters);
            const data = response.data.data || [];
            setOriginalHistory(data);
            setHistory(data);
            setSearchText(''); // 새로운 조회 시 검색어 초기화 (선택 사항, 사용자 UX에 따라 결정)
        } catch (error) {
            console.error('이력 로딩 오류:', error);
            showStatus('error', '작업 이력을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 다중 필터링 로직
    useEffect(() => {
        if (originalHistory.length === 0) return;

        const filtered = originalHistory.filter(item => {
            if (!searchText.trim()) return true;

            const keywords = searchText.toLowerCase().trim().split(/\s+/).filter(k => k);

            const date = new Date(item.created_at);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${date.toLocaleTimeString()}`;
            const qty = Number(item.output_quantity).toLocaleString();
            const cost = Math.round(item.unit_cost).toLocaleString();

            const searchableText = [
                dateStr,
                item.output_product_name || '',
                qty,
                cost,
                item.memo || ''
            ].join(' ').toLowerCase();

            return keywords.every(k => searchableText.includes(k));
        });

        setHistory(filtered);
    }, [searchText, originalHistory]);

    const handleSearch = () => {
        loadHistory();
    };

    const showStatus = (type, message, onConfirm = () => { }) => {
        setConfirmModal({
            isOpen: true,
            type: type === 'error' ? 'warning' : type,
            title: type === 'error' ? '오류' : '알림',
            message,
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                onConfirm();
            }
        });
    };

    const handleDelete = (id) => {
        setConfirmModal({
            isOpen: true,
            type: 'danger',
            title: '작업 취소',
            message: '정말로 이 재고 작업을 취소하시겠습니까?\n생산된 재고가 삭제되고 투입된 재료가 복구됩니다.\n(이미 판매되거나 사용된 경우 취소할 수 없습니다)',
            confirmText: '삭제(취소)',
            showCancel: true,
            onConfirm: async () => {
                try {
                    await inventoryProductionAPI.cancel(id);
                    showStatus('success', '작업이 취소되었습니다.');
                    loadHistory();
                } catch (error) {
                    showStatus('error', error.response?.data?.message || '작업 취소 실패');
                }
            }
        });
    };



    if (loading && history.length === 0) return <div className="loading">로딩 중...</div>;

    return (
        <div className="inventory-production-history" style={{ margin: '0 auto', width: '100%', padding: '0.5rem' }}>


            <div className="search-filter-container" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="filter-row" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {/* 기간 조절 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="date"
                            value={filters.start_date}
                            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                            style={{ fontSize: '0.9rem', width: '130px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                        />
                        <span>~</span>
                        <input
                            type="date"
                            value={filters.end_date}
                            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
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
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ whiteSpace: 'nowrap', margin: 0, fontWeight: 'bold' }}>검색</label>
                        <input
                            type="text"
                            placeholder="🔍 작업일시, 품목, 수량, 단가, 비고... (띄어쓰기로 다중 검색)"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
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
                            onClick={handleSearch}
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', height: '36px', fontSize: '0.9rem' }}
                        >
                            조회
                        </button>
                    </div>
                </div>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th className="text-center">작업일시</th>
                            <th className="text-center">생산 품목</th>
                            <th className="text-right">수량</th>
                            <th className="text-right">단가</th>
                            <th className="text-center">비고</th>
                            <th className="text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length === 0 ? (
                            <tr><td colSpan="6" className="text-center">조회된 이력이 없습니다.</td></tr>
                        ) : (
                            history.map(item => (
                                <tr key={item.id}>
                                    <td style={{ textAlign: 'center' }}>
                                        {(() => {
                                            const d = new Date(item.created_at);
                                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toLocaleTimeString()}`;
                                        })()}
                                    </td>
                                    <td>
                                        <strong>
                                            {item.output_product_name}
                                            {Number(item.output_product_weight || 0) > 0 ? ` ${Number(item.output_product_weight)}kg` : ''}
                                            {item.output_product_grade ? ` (${item.output_product_grade})` : ''}
                                        </strong>
                                    </td>
                                    <td className="font-bold text-primary" style={{ textAlign: 'right' }}>
                                        {Number(item.output_quantity).toLocaleString()}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{Math.round(item.unit_cost).toLocaleString()} 원</td>
                                    <td className="text-gray-600">{item.memo || '-'}</td>
                                    <td className="text-center" style={{ display: 'flex', gap: '6px', justifyContent: 'center', padding: '10px' }}>
                                        <button
                                            onClick={() => setDetailModal({ isOpen: true, productionId: item.id })}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '0.8rem',
                                                color: '#2980b9',
                                                backgroundColor: '#f0f9ff',
                                                border: '1px solid #abd5f7',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                            title="재료 상세 보기"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                <polyline points="14 2 14 8 20 8"></polyline>
                                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                                <polyline points="10 9 9 9 8 9"></polyline>
                                            </svg>
                                            상세
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '0.8rem',
                                                color: '#c0392b',
                                                backgroundColor: '#fff0f0',
                                                border: '1px solid #fab1a0',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            취소
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                {...confirmModal}
            />

            <ProductionDetailModal
                isOpen={detailModal.isOpen}
                productionId={detailModal.productionId}
                onClose={() => setDetailModal({ isOpen: false, productionId: null })}
            />
        </div>
    );
}

export default InventoryProductionHistory;
