import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import './SettlementPage.css';
import DailyClosingTab from './tabs/DailyClosingTab';

const SettlementPage = () => {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' or 'closing'

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const [summaryData, setSummaryData] = useState(null);
  const [assetData, setAssetData] = useState(null);

  // 초기 로드
  useEffect(() => {
    if (activeTab === 'summary') {
      fetchData();
    }
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const formattedStart = format(startDate, 'yyyy-MM-dd');
      const formattedEnd = format(endDate, 'yyyy-MM-dd');

      // 1. 손익 요약 조회
      const summaryResponse = await axios.get('/api/settlement/summary', {
        params: { startDate: formattedStart, endDate: formattedEnd }
      });

      if (summaryResponse.data.success) {
        setSummaryData(summaryResponse.data.data);
      }

      // 2. 자산 현황 조회 (기간 무관, 현재 기준)
      const assetResponse = await axios.get('/api/settlement/assets');
      if (assetResponse.data.success) {
        setAssetData(assetResponse.data.data);
      }

    } catch (error) {
      console.error('정산 데이터 조회 오류:', error);
      alert('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchData();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount || 0);
  };

  const handleStartDateChange = (e) => {
    if (e.target.value) setStartDate(parseISO(e.target.value));
  };

  const handleEndDateChange = (e) => {
    if (e.target.value) setEndDate(parseISO(e.target.value));
  };

  return (
    <div className="settlement-page">
      <div className="page-header">
        <h1>📊 경영 정산 리포트</h1>
      </div>

      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          📅 기간별 손익 분석
        </button>
        <button
          className={`tab-btn ${activeTab === 'closing' ? 'active' : ''}`}
          onClick={() => setActiveTab('closing')}
        >
          💰 일일 시재 마감
        </button>
      </div>

      {activeTab === 'summary' && (
        <div className="settlement-container">
          {/* 필터 컨트롤이 summary 탭 안에 위치해야 함 */}
          <div className="filter-controls" style={{ marginBottom: '20px', justifyContent: 'flex-end' }}>
            <div className="date-picker-wrapper">
              <input
                type="date"
                className="date-input"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={handleStartDateChange}
              />
              <span className="separator">~</span>
              <input
                type="date"
                className="date-input"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={handleEndDateChange}
                min={format(startDate, 'yyyy-MM-dd')}
              />
            </div>
            <button className="btn-search" onClick={handleSearch} disabled={loading}>
              {loading ? '조회 중...' : '조회'}
            </button>
          </div>

          {/* 상단: 기간 손익 요약 */}
          <section className="summary-section">
            <h2>📅 기간 손익 (P&L) <span className="period-badge">{format(startDate, 'yyyy-MM-dd')} ~ {format(endDate, 'yyyy-MM-dd')}</span></h2>

            <div className="summary-cards">
              {/* 매출액 */}
              <div className="summary-card revenue">
                <div className="card-title">매출액 (Revenue)</div>
                <div className="card-amount">{formatCurrency(summaryData?.revenue)}</div>
                <div className="card-sub">거래 건수: {summaryData?.counts?.trades || 0}건</div>
              </div>

              {/* 매출원가 (- Cost) */}
              <div className="summary-card cost">
                <div className="card-title">(-) 매출원가 (COGS)</div>
                <div className="card-amount text-red">{formatCurrency(summaryData?.cogs)}</div>
                {summaryData?.counts?.zeroCostItems > 0 && (
                  <div className="card-warning">⚠️ 원가 0원 포함: {summaryData.counts.zeroCostItems}건</div>
                )}
              </div>

              {/* 매출총이익 (= Gross Profit) */}
              <div className="summary-card profit-gross">
                <div className="card-title">(=) 매출총이익</div>
                <div className="card-amount text-blue">{formatCurrency(summaryData?.grossProfit)}</div>
                <div className="card-sub">이익률: {summaryData?.revenue ? ((summaryData.grossProfit / summaryData.revenue) * 100).toFixed(1) : 0}%</div>
              </div>

              {/* 판관비 (- Expenses) */}
              <div className="summary-card expense">
                <div className="card-title">(-) 판관비 (Expenses)</div>
                <div className="card-amount text-red">{formatCurrency(summaryData?.expenses)}</div>
                <div className="card-sub">{summaryData?.counts?.expenses || 0}건</div>
              </div>

              {/* 영업이익 (= Net Profit) */}
              <div className="summary-card profit-net">
                <div className="card-title">(=) 영업이익 (Net Profit)</div>
                <div className="card-amount text-primary">{formatCurrency(summaryData?.netProfit)}</div>
              </div>
            </div>
          </section>

          {/* 하단: 자산 현황 */}
          <section className="assets-section">
            <h2>💰 현재 자산 현황 (Assets)</h2>
            <div className="assets-grid">
              <div className="asset-item">
                <span className="label">📦 재고 자산 가치</span>
                <span className="value">{formatCurrency(assetData?.inventoryValue)}</span>
              </div>
              <div className="asset-item">
                <span className="label">💳 매출 채권 (미수금)</span>
                <span className="value">{formatCurrency(assetData?.receivables)}</span>
              </div>
              <div className="asset-item">
                <span className="label">💸 매입 채무 (미지급금)</span>
                <span className="value text-red">-{formatCurrency(assetData?.payables)}</span>
              </div>
              <div className="asset-item highlight">
                <span className="label">💵 추정 보유 현금</span>
                <span className="value">{formatCurrency(assetData?.estimatedCash)}</span>
                <span className="hint">(초기 자본금 제외)</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'closing' && (
        <DailyClosingTab />
      )}

    </div>
  );
};

export default SettlementPage;
