import React, { useState, useEffect } from 'react';
import { inventoryProductionAPI, productAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import ProductionDetailModal from '../components/ProductionDetailModal';

function InventoryProductionHistory() {
    const [history, setHistory] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // 모달 상태
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { } });
    const [detailModal, setDetailModal] = useState({ isOpen: false, productionId: null });

    // 필터
    const [filters, setFilters] = useState({
        start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        product_id: ''
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const productsRes = await productAPI.getAll({ is_active: 'true' });
            setProducts(productsRes.data.data);
            loadHistory();
        } catch (error) {
            console.error('초기 데이터 로딩 오류:', error);
        }
    };

    const loadHistory = async () => {
        try {
            setLoading(true);
            const response = await inventoryProductionAPI.getHistory(filters);
            setHistory(response.data.data || []);
        } catch (error) {
            console.error('이력 로딩 오류:', error);
            showStatus('error', '작업 이력을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

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

    // 품목 옵션
    const sortedProducts = [...products].sort((a, b) => (a.product_name || '').localeCompare(b.product_name || '', 'ko'));
    const productOptions = [
        { value: '', label: '전체 품목' },
        ...sortedProducts.map(p => {
            const weightText = p.weight ? ` ${parseFloat(p.weight)}kg` : '';
            const gradeText = p.grade ? ` (${p.grade})` : '';
            return {
                value: p.id,
                label: `${p.product_name}${weightText}${gradeText}`
            };
        })
    ];

    if (loading && history.length === 0) return <div className="loading">로딩 중...</div>;

    return (
        <div className="inventory-production-history" style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
                <h1 className="page-title" style={{ margin: 0 }}>🏭 재고 작업 이력</h1>
            </div>

            <div className="search-filter-container">
                <div className="filter-row">
                    <div className="filter-group">
                        <label>시작일</label>
                        <input
                            type="date"
                            value={filters.start_date}
                            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                            style={{ fontSize: '0.9rem' }}
                        />
                    </div>
                    <div className="filter-group">
                        <label>종료일</label>
                        <input
                            type="date"
                            value={filters.end_date}
                            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                            style={{ fontSize: '0.9rem' }}
                        />
                    </div>
                    <div className="filter-group" style={{ minWidth: '250px' }}>
                        <label>생산 품목</label>
                        <SearchableSelect
                            options={productOptions}
                            value={filters.product_id}
                            onChange={(option) => setFilters({ ...filters, product_id: option ? option.value : '' })}
                            placeholder="전체 품목"
                        />
                    </div>
                    <div className="filter-group">
                        <label>&nbsp;</label>
                        <button onClick={handleSearch} className="btn btn-primary">조회</button>
                    </div>
                </div>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>작업일시</th>
                            <th>생산 품목</th>
                            <th>생산 수량</th>
                            <th>단위 비용</th>
                            <th>비고(메모)</th>
                            <th className="text-center">상세보기</th>
                            <th className="text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length === 0 ? (
                            <tr><td colSpan="7" className="text-center">조회된 이력이 없습니다.</td></tr>
                        ) : (
                            history.map(item => (
                                <tr key={item.id}>
                                    <td>{new Date(item.created_at).toLocaleString()}</td>
                                    <td>
                                        <strong>{item.output_product_name}</strong>
                                        {item.output_product_grade && <span className="text-gray-500 text-sm ml-1">({item.output_product_grade})</span>}
                                    </td>
                                    <td className="font-bold text-primary">
                                        {Number(item.output_quantity).toLocaleString()}
                                    </td>
                                    <td>{Math.round(item.unit_cost).toLocaleString()} 원</td>
                                    <td className="text-gray-600">{item.memo || '-'}</td>
                                    <td className="text-center">
                                        <button
                                            className="btn btn-sm btn-outline-info"
                                            onClick={() => setDetailModal({ isOpen: true, productionId: item.id })}
                                        >
                                            🔍 투입 재료 확인
                                        </button>
                                    </td>
                                    <td className="text-center">
                                        <button
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={() => handleDelete(item.id)}
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
