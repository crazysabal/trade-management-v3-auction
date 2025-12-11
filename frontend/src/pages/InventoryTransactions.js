import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, productAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import TradeDetailModal from '../components/TradeDetailModal';

function InventoryTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => {}, confirmText: '확인', showCancel: false });
  const [tradeDetailModal, setTradeDetailModal] = useState({ isOpen: false, tradeId: null });
  const [filters, setFilters] = useState({
    start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    product_id: ''
  });

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInitialData = async () => {
    try {
      const productsRes = await productAPI.getAll({ is_active: 'true' });
      setProducts(productsRes.data.data);
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
      setModal({ isOpen: true, type: 'warning', title: '로딩 실패', message: '재고 수불부를 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => {} });
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
      IN: <span className="badge badge-success">입고 (매입)</span>,
      OUT: <span className="badge badge-info">출고 (매칭)</span>
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

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  // 집계 계산
  const totalIn = transactions
    .filter(t => t.transaction_type === 'IN')
    .reduce((sum, t) => sum + parseFloat(t.quantity || 0), 0);
  
  const totalOut = transactions
    .filter(t => t.transaction_type === 'OUT')
    .reduce((sum, t) => sum + parseFloat(t.quantity || 0), 0);

  return (
    <div className="inventory-transactions">
      <div className="page-header">
        <h1 className="page-title">재고 수불부</h1>
      </div>

      <div className="search-filter-container">
        <div className="filter-row">
          <div className="filter-group">
            <label>시작일</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({...filters, start_date: e.target.value})}
            />
          </div>
          <div className="filter-group">
            <label>종료일</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({...filters, end_date: e.target.value})}
            />
          </div>
          <div className="filter-group" style={{minWidth: '280px'}}>
            <label>품목</label>
            <SearchableSelect
              options={productOptions}
              value={filters.product_id}
              onChange={(option) => setFilters({...filters, product_id: option ? option.value : ''})}
              placeholder="전체 품목"
              isClearable={false}
            />
          </div>
          <div className="filter-group">
            <label>&nbsp;</label>
            <button onClick={handleSearch} className="btn btn-primary">
              조회
            </button>
          </div>
        </div>
      </div>

      {/* 집계 카드 */}
      <div className="card" style={{marginBottom: '1.5rem'}}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem'}}>
          <div style={{padding: '1rem', backgroundColor: '#d4edda', borderRadius: '4px'}}>
            <h4 style={{margin: '0 0 0.5rem 0', color: '#155724'}}>총 입고 (매입)</h4>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#155724'}}>
              +{formatNumber(totalIn)} 개
            </div>
          </div>
          <div style={{padding: '1rem', backgroundColor: '#d1ecf1', borderRadius: '4px'}}>
            <h4 style={{margin: '0 0 0.5rem 0', color: '#0c5460'}}>총 출고 (매칭)</h4>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#0c5460'}}>
              -{formatNumber(totalOut)} 개
            </div>
          </div>
          <div style={{padding: '1rem', backgroundColor: '#e2e3e5', borderRadius: '4px'}}>
            <h4 style={{margin: '0 0 0.5rem 0', color: '#383d41'}}>순증감</h4>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: totalIn - totalOut >= 0 ? '#155724' : '#721c24'}}>
              {totalIn - totalOut >= 0 ? '+' : ''}{formatNumber(totalIn - totalOut)} 개
            </div>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>일자</th>
              <th>구분</th>
              <th>품목명</th>
              <th>등급</th>
              <th className="text-right">수량</th>
              <th className="text-right">단가</th>
              <th>거래처</th>
              <th>출하주</th>
              <th>전표번호</th>
              <th className="text-right">누적재고</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center">조회된 내역이 없습니다.</td>
              </tr>
            ) : (
              (() => {
                let colorIndex = 0;
                let prevProductName = null;
                return transactions.map((trans, index) => {
                  const isNewGroup = prevProductName !== null && prevProductName !== trans.product_name;
                  if (isNewGroup) {
                    colorIndex++;
                  }
                  prevProductName = trans.product_name;
                  const bgColor = colorIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                  const isIn = trans.transaction_type === 'IN';
                  
                  return (
                    <tr key={`${trans.transaction_type}-${trans.reference_id}-${index}`} style={{
                      backgroundColor: bgColor,
                      borderTop: isNewGroup ? '2px solid #e2e8f0' : 'none'
                    }}>
                      <td>{formatDate(trans.transaction_date)}</td>
                      <td>{getTransactionTypeBadge(trans.transaction_type)}</td>
                      <td><strong>{trans.product_name}</strong></td>
                      <td>
                        {trans.grade ? <span className="badge badge-secondary">{trans.grade}</span> : '-'}
                      </td>
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
  );
}

export default InventoryTransactions;
