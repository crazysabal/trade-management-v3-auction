import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, productAPI, warehousesAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import TradeDetailModal from '../components/TradeDetailModal';

function InventoryTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { }, confirmText: '확인', showCancel: false });
  const [tradeDetailModal, setTradeDetailModal] = useState({ isOpen: false, tradeId: null });
  const [filters, setFilters] = useState({
    start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    product_id: '',
    warehouse_id: '',
    transaction_type: ''
  });
  const [searchText, setSearchText] = useState('');
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInitialData = async () => {
    try {
      const productsRes = await productAPI.getAll({ is_active: 'true' });
      const warehousesRes = await warehousesAPI.getAll();
      setProducts(productsRes.data.data);
      if (warehousesRes.data.success) {
        setWarehouses(warehousesRes.data.data);
      }
      loadTransactions();
    } catch (error) {
      console.error('초기 데이터 로딩 오류:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const response = await purchaseInventoryAPI.getTransactions(filters);
      setTransactions(response.data.data || []);
    } catch (error) {
      console.error('재고 수불부 로딩 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '로딩 실패', message: '재고 수불부를 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadTransactions();
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value || 0);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTransactionTypeBadge = (type) => {
    const badges = {
      PURCHASE: <span className="badge badge-success">입고 (매입)</span>,
      PRODUCTION_IN: <span className="badge badge-purple" style={{ backgroundColor: '#6f42c1', color: 'white' }}>생산 입고</span>,
      SALE: <span className="badge badge-info">출고 (매칭)</span>,
      PRODUCTION_OUT: <span className="badge badge-warning" style={{ backgroundColor: '#ffc107', color: 'black' }}>생산 투입</span>,
      // 호환성 유지
      IN: <span className="badge badge-success">입고</span>,
      OUT: <span className="badge badge-info">출고</span>
    };
    return badges[type] || type;
  };

  // 품목 옵션 변환
  const sortedProducts = [...products].sort((a, b) => {
    const nameCompare = (a.product_name || '').localeCompare(b.product_name || '', 'ko');
    if (nameCompare !== 0) return nameCompare;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const productOptions = [
    { value: '', label: '전체 품목' },
    ...sortedProducts.map(product => ({
      value: product.id,
      label: `${product.product_name}${product.weight ? ` ${parseFloat(product.weight)}kg` : ''}${product.grade ? ` (${product.grade})` : ''}`
    }))
  ];

  // 다중 필터링 로직 (Client-side)
  const filteredTransactions = React.useMemo(() => {
    if (!searchText.trim()) return transactions;
    const keywords = searchText.toLowerCase().trim().split(/\s+/).filter(k => k);

    return transactions.filter(t => {
      const searchStr = [
        t.trade_number,
        t.transaction_date,
        t.product_name,
        t.company_name,
        t.sender,
        t.transaction_type,
        formatCurrency(t.unit_price) // 가격도 검색 가능
      ].join(' ').toLowerCase();

      return keywords.every(k => searchStr.includes(k));
    });
  }, [transactions, searchText]);

  // 집계 계산 (필터링된 결과 기준)
  const totalIn = filteredTransactions
    .filter(t => ['IN', 'PURCHASE', 'PRODUCTION_IN'].includes(t.transaction_type))
    .reduce((sum, t) => sum + parseFloat(t.quantity || 0), 0);

  const totalOut = filteredTransactions
    .filter(t => ['OUT', 'SALE', 'PRODUCTION_OUT'].includes(t.transaction_type))
    .reduce((sum, t) => sum + parseFloat(t.quantity || 0), 0);

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="inventory-transactions" style={{ margin: '0 auto', width: '100%' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>📒 재고 수불부</h1>
      </div>

      <div className="search-filter-container" style={{ marginBottom: '1.5rem', backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="filter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="filter-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>시작일</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>종료일</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
            />
          </div>

          <div className="filter-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>창고</label>
            <select
              className="filter-input"
              value={filters.warehouse_id}
              onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}
            >
              <option value="">전체 창고</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>구분</label>
            <select
              className="filter-input"
              value={filters.transaction_type}
              onChange={(e) => setFilters({ ...filters, transaction_type: e.target.value })}
            >
              <option value="">전체 구분</option>
              <option value="IN">입고 (전체)</option>
              <option value="OUT">출고 (전체)</option>
              <option value="PURCHASE">매입 입고</option>
              <option value="SALE">매출 출고</option>
              <option value="PRODUCTION_IN">생산 입고</option>
              <option value="PRODUCTION_OUT">생산 투입</option>
            </select>
          </div>
          <div className="filter-group">
            <label>&nbsp;</label>
            <button onClick={handleSearch} className="btn btn-primary">
              조회
            </button>
          </div>
        </div>

        {/* 검색어 입력 row */}

      </div>

      {/* 집계 카드 */}
      < div className="card" style={{ marginBottom: '1.5rem' }
      }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#d4edda', borderRadius: '4px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#155724' }}>총 입고 (매입)</h4>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#155724' }}>
              +{formatNumber(totalIn)} 개
            </div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#d1ecf1', borderRadius: '4px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#0c5460' }}>총 출고 (매칭)</h4>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0c5460' }}>
              -{formatNumber(totalOut)} 개
            </div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#e2e3e5', borderRadius: '4px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#383d41' }}>순증감</h4>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: totalIn - totalOut >= 0 ? '#155724' : '#721c24' }}>
              {totalIn - totalOut >= 0 ? '+' : ''}{formatNumber(totalIn - totalOut)} 개
            </div>
          </div>
        </div>
      </div >

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '15px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff' }}>
          <div style={{ flex: 1, maxWidth: '500px' }}>
            <input
              type="text"
              className="filter-input"
              style={{ width: '100%', padding: '8px 12px' }}
              placeholder="🔍 결과 내 검색 (전표번호, 거래처, 가격 등 - 띄어쓰기로 다중 검색)"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666', fontWeight: '500' }}>
            총 <span style={{ color: '#2980b9', fontWeight: 'bold' }}>{filteredTransactions.length}</span>건
          </div>
        </div>
        <div className="table-container" style={{ margin: 0, padding: 0, boxShadow: 'none', border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>일자</th>
                <th>구분</th>
                <th>품목명</th>
                <th className="text-right">수량</th>
                <th className="text-right">단가</th>
                <th>거래처</th>
                <th>출하주</th>
                <th>전표번호</th>
                <th className="text-right">누적재고</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center">조회된 내역이 없습니다.</td>
                </tr>
              ) : (
                (() => {
                  let colorIndex = 0;
                  let prevProductName = null;
                  return filteredTransactions.map((trans, index) => {
                    const isNewGroup = prevProductName !== null && prevProductName !== trans.product_name;
                    if (isNewGroup) {
                      colorIndex++;
                    }
                    prevProductName = trans.product_name;
                    const bgColor = colorIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                    const isIn = ['IN', 'PURCHASE', 'PRODUCTION_IN'].includes(trans.transaction_type);

                    return (
                      <tr key={`${trans.transaction_type}-${trans.reference_id}-${index}`} style={{
                        backgroundColor: bgColor,
                        borderTop: isNewGroup ? '2px solid #e2e8f0' : 'none'
                      }}>
                        <td>{formatDate(trans.transaction_date)}</td>
                        <td>{getTransactionTypeBadge(trans.transaction_type)}</td>
                        <td><strong>
                          {trans.product_name || '-'}
                          {trans.product_weight ? ` ${parseFloat(trans.product_weight)}kg` : ''}
                          {trans.grade ? ` (${trans.grade})` : ''}
                        </strong></td>
                        <td className="text-right" style={{
                          color: isIn ? '#22c55e' : '#3b82f6',
                          fontWeight: 'bold'
                        }}>
                          {isIn ? '+' : '-'}{formatNumber(trans.quantity)}개
                        </td>
                        <td className="text-right">
                          {formatCurrency(trans.unit_price)}원
                        </td>
                        <td>{trans.company_name || '-'}</td>
                        <td>{trans.sender || '-'}</td>
                        <td>
                          {trans.trade_master_id ? (
                            <span
                              className="trade-number-link"
                              onClick={() => setTradeDetailModal({ isOpen: true, tradeId: trans.trade_master_id })}
                            >
                              {trans.trade_number || '-'}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>{trans.trade_number || '-'}</span>
                          )}
                        </td>
                        <td className="text-right">
                          <strong>{formatNumber(trans.running_stock)}개</strong>
                        </td>
                      </tr>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </div>
        <ConfirmModal isOpen={modal.isOpen} onClose={() => setModal(prev => ({ ...prev, isOpen: false }))} onConfirm={modal.onConfirm} title={modal.title} message={modal.message} type={modal.type} confirmText={modal.confirmText} showCancel={modal.showCancel} />

        <TradeDetailModal
          isOpen={tradeDetailModal.isOpen}
          onClose={() => setTradeDetailModal({ isOpen: false, tradeId: null })}
          tradeId={tradeDetailModal.tradeId}
        />
      </div>
    </div>
  );
}

export default InventoryTransactions;
