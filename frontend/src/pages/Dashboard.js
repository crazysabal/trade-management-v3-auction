import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tradeAPI, purchaseInventoryAPI } from '../services/api';
import TradeDetailModal from '../components/TradeDetailModal';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    todayPurchase: 0,
    todaySale: 0,
    monthPurchase: 0,
    monthSale: 0,
    inventoryValue: 0
  });
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeDetailModal, setTradeDetailModal] = useState({ isOpen: false, tradeId: null });

  // 로컬 시간대 기준 YYYY-MM-DD 형식 반환
  const formatLocalDate = (date) => {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // 오늘 날짜
      const today = formatLocalDate(new Date());
      
      // 이번 달 시작일
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = formatLocalDate(monthStart);
      
      // 1달 전 날짜
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const oneMonthAgoStr = formatLocalDate(oneMonthAgo);
      
      // 오늘 매입/매출
      const todayPurchaseRes = await tradeAPI.getAll({
        trade_type: 'PURCHASE',
        start_date: today,
        end_date: today
      });
      const todayPurchase = todayPurchaseRes.data.data.reduce((sum, t) => sum + parseFloat(t.total_price || 0), 0);
      
      const todaySaleRes = await tradeAPI.getAll({
        trade_type: 'SALE',
        start_date: today,
        end_date: today
      });
      const todaySale = todaySaleRes.data.data.reduce((sum, t) => sum + parseFloat(t.total_price || 0), 0);
      
      // 이번 달 매입/매출
      const monthPurchaseRes = await tradeAPI.getAll({
        trade_type: 'PURCHASE',
        start_date: monthStartStr,
        end_date: today
      });
      const monthPurchase = monthPurchaseRes.data.data.reduce((sum, t) => sum + parseFloat(t.total_price || 0), 0);
      
      const monthSaleRes = await tradeAPI.getAll({
        trade_type: 'SALE',
        start_date: monthStartStr,
        end_date: today
      });
      const monthSale = monthSaleRes.data.data.reduce((sum, t) => sum + parseFloat(t.total_price || 0), 0);
      
      // 재고 금액
      const inventoryRes = await purchaseInventoryAPI.getAll();
      const inventoryValue = inventoryRes.data.data.reduce((sum, item) => {
        return sum + (parseFloat(item.remaining_quantity || 0) * parseFloat(item.unit_price || 0));
      }, 0);
      
      // 최근 1달간 매입 내역
      const recentPurchaseRes = await tradeAPI.getAll({
        trade_type: 'PURCHASE',
        start_date: oneMonthAgoStr,
        end_date: today
      });
      setRecentPurchases(recentPurchaseRes.data.data.slice(0, 10));
      
      // 최근 1달간 매출 내역
      const recentSaleRes = await tradeAPI.getAll({
        trade_type: 'SALE',
        start_date: oneMonthAgoStr,
        end_date: today
      });
      setRecentSales(recentSaleRes.data.data.slice(0, 10));
      
      setStats({
        todayPurchase,
        todaySale,
        monthPurchase,
        monthSale,
        inventoryValue
      });
      
    } catch (error) {
      console.error('대시보드 데이터 로딩 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value);
  };


  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">대시보드</h1>
      </div>

      {/* 통계 카드: 오늘 매출, 오늘 매입, 이번달 매출, 이번달 매입, 재고 금액 */}
      <div className="dashboard-stats-grid">
        <div className="stat-card" style={{borderLeftColor: '#27ae60'}}>
          <h3>오늘 매출</h3>
          <div className="stat-value">{formatCurrency(stats.todaySale)}<span style={{fontSize: '1rem', fontWeight: 'normal', marginLeft: '4px'}}>원</span></div>
        </div>
        
        <div className="stat-card" style={{borderLeftColor: '#e74c3c'}}>
          <h3>오늘 매입</h3>
          <div className="stat-value">{formatCurrency(stats.todayPurchase)}<span style={{fontSize: '1rem', fontWeight: 'normal', marginLeft: '4px'}}>원</span></div>
        </div>
        
        <div className="stat-card" style={{borderLeftColor: '#16a085'}}>
          <h3>이번 달 매출</h3>
          <div className="stat-value">{formatCurrency(stats.monthSale)}<span style={{fontSize: '1rem', fontWeight: 'normal', marginLeft: '4px'}}>원</span></div>
        </div>
        
        <div className="stat-card" style={{borderLeftColor: '#e67e22'}}>
          <h3>이번 달 매입</h3>
          <div className="stat-value">{formatCurrency(stats.monthPurchase)}<span style={{fontSize: '1rem', fontWeight: 'normal', marginLeft: '4px'}}>원</span></div>
        </div>
        
        <div 
          className="stat-card" 
          style={{borderLeftColor: '#9b59b6', cursor: 'pointer'}}
          onClick={() => navigate('/inventory')}
        >
          <h3>재고 금액</h3>
          <div className="stat-value">{formatCurrency(stats.inventoryValue)}<span style={{fontSize: '1rem', fontWeight: 'normal', marginLeft: '4px'}}>원</span></div>
        </div>
      </div>

      {/* 최근 거래 내역: 매입/매출 분리 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
        {/* 왼쪽: 최근 매입 내역 */}
        <div className="card" style={{ marginBottom: 0 }}>
          <h2 className="card-title">최근 매입 내역 (1개월)</h2>
          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>전표번호</th>
                  <th>거래일자</th>
                  <th>거래처</th>
                  <th className="text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center">매입 내역이 없습니다.</td>
                  </tr>
                ) : (
                  recentPurchases.map(trade => (
                    <tr key={trade.id}>
                      <td>
                        <span 
                          className="trade-number-link"
                          onClick={() => setTradeDetailModal({ isOpen: true, tradeId: trade.id })}
                        >
                          {trade.trade_number}
                        </span>
                      </td>
                      <td>{trade.trade_date}</td>
                      <td>{trade.company_name}</td>
                      <td className="text-right">{formatCurrency(trade.total_price)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {recentPurchases.length > 0 && (
            <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
              <Link to="/trades?type=PURCHASE" className="btn btn-sm btn-secondary">
                전체보기 →
              </Link>
            </div>
          )}
        </div>

        {/* 오른쪽: 최근 매출 내역 */}
        <div className="card" style={{ marginBottom: 0 }}>
          <h2 className="card-title">최근 매출 내역 (1개월)</h2>
          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>전표번호</th>
                  <th>거래일자</th>
                  <th>거래처</th>
                  <th className="text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center">매출 내역이 없습니다.</td>
                  </tr>
                ) : (
                  recentSales.map(trade => (
                    <tr key={trade.id}>
                      <td>
                        <span 
                          className="trade-number-link"
                          onClick={() => setTradeDetailModal({ isOpen: true, tradeId: trade.id })}
                        >
                          {trade.trade_number}
                        </span>
                      </td>
                      <td>{trade.trade_date}</td>
                      <td>{trade.company_name}</td>
                      <td className="text-right">{formatCurrency(trade.total_price)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {recentSales.length > 0 && (
            <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
              <Link to="/trades?type=SALE" className="btn btn-sm btn-secondary">
                전체보기 →
              </Link>
            </div>
          )}
        </div>
      </div>

      <TradeDetailModal
        isOpen={tradeDetailModal.isOpen}
        onClose={() => setTradeDetailModal({ isOpen: false, tradeId: null })}
        tradeId={tradeDetailModal.tradeId}
      />
    </div>
  );
}

export default Dashboard;
