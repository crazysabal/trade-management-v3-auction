import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
// Link import removed - registration buttons removed
import { createPortal } from 'react-dom';
import { tradeAPI, companyAPI, paymentAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import TradeDetailModal from '../components/TradeDetailModal';
import TradePrintModal from '../components/TradePrintModal';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatNumber } from '../utils/formatUtils';
import { format, parseISO, isValid, addDays, subDays, startOfMonth, endOfMonth, startOfYear, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import './TradeList.css';

// 기본 날짜 설정 helper
const getInitialDateRange = () => {
  const today = new Date();
  return {
    start_date: format(startOfMonth(today), 'yyyy-MM-dd'),
    end_date: format(today, 'yyyy-MM-dd')
  };
};

function TradeList({ isWindow, refreshKey, onOpenTradeEdit }) {
  const { user } = useAuth();
  const getScopedKey = (key) => user?.id ? `u${user.id}_${key}` : key;

  // View Mode: 'DAILY' | 'PERIOD' | 'COMPANY'
  const [viewMode, setViewMode] = useState('DAILY');

  // Global Date Range (Query Range)
  const [queryRange, setQueryRange] = useState(getInitialDateRange());

  // Loaded Data
  const [purchaseTrades, setPurchaseTrades] = useState([]);
  const [saleTrades, setSaleTrades] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]); // 결제 방법별 합계용
  const [loading, setLoading] = useState(true);

  // Selections
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCompany, setSelectedCompany] = useState(null);

  // Text Filters (Main Panel)
  const [purchaseFilter, setPurchaseFilter] = useState('');
  const [saleFilter, setSaleFilter] = useState('');

  // Modals
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { }, confirmText: '확인', showCancel: false });
  const [detailModal, setDetailModal] = useState({ isOpen: false, tradeId: null });
  const [printModal, setPrintModal] = useState({ isOpen: false, tradeId: null });
  const [matchingErrorModal, setMatchingErrorModal] = useState({ isOpen: false, title: '', matchingData: null });

  // Layout State
  const [layoutOrder, setLayoutOrder] = useState({ left: 'PURCHASE', right: 'SALE' });
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  // Load Layout Preferences
  useEffect(() => {
    const savedLayout = localStorage.getItem(getScopedKey('tradeListLayout'));
    if (savedLayout) {
      try { setLayoutOrder(JSON.parse(savedLayout)); } catch (e) { }
    }
    const savedRatio = localStorage.getItem(getScopedKey('tradeListSplitRatio'));
    if (savedRatio) setSplitRatio(parseFloat(savedRatio));
  }, [user?.id]);

  // Data Loading
  const loadTrades = async () => {
    try {
      setLoading(true);
      const [purchaseRes, saleRes, companyRes, paymentRes] = await Promise.all([
        tradeAPI.getAll({ ...queryRange, trade_type: 'PURCHASE' }),
        tradeAPI.getAll({ ...queryRange, trade_type: 'SALE' }),
        companyAPI.getAll(),
        paymentAPI.getTransactions({ start_date: queryRange.start_date, end_date: queryRange.end_date })
      ]);
      setPurchaseTrades(purchaseRes.data.data);
      setSaleTrades(saleRes.data.data);
      setCompanies(companyRes.data.data || []);
      setPaymentTransactions(paymentRes.data.data || []);
    } catch (error) {
      console.error('Load Error:', error);
      setModal({ isOpen: true, type: 'warning', title: '로딩 실패', message: '데이터를 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrades();
  }, [queryRange, refreshKey]);

  // View Mode Change Handler
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setPurchaseFilter('');
    setSaleFilter('');
    // Reset selections appropriate for mode
    if (mode === 'DAILY') {
      // Default to today or first available
      setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    } else if (mode === 'COMPANY') {
      setSelectedCompany(null);
    }
  };

  // --- Sidebar Logic ---

  // 1. Daily List Generation
  const dailyList = useMemo(() => {
    const map = new Map();
    const start = parseISO(queryRange.start_date);
    const end = parseISO(queryRange.end_date);

    // Init dates
    try {
      if (isValid(start) && isValid(end) && start <= end) {
        for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
          const str = format(d, 'yyyy-MM-dd');
          map.set(str, { date: str, count: 0, amount: 0, day: format(d, 'eee', { locale: ko }) });
        }
      }
    } catch (e) { console.error(e); }

    [...purchaseTrades, ...saleTrades].forEach(t => {
      const dateStr = t.trade_date?.substring(0, 10);
      if (map.has(dateStr)) {
        const d = map.get(dateStr);
        d.count++;
        d.amount += parseFloat(t.total_price || 0);
      }
    });

    return Array.from(map.values());
  }, [queryRange, purchaseTrades, saleTrades]);

  // 2. Company List Generation (sort_order 기준 정렬)
  const companyList = useMemo(() => {
    // 거래처별 sort_order 맵 생성 (company_name이 별칭, 거래에서 company_name으로 저장됨)
    const sortOrderMap = new Map();
    companies.forEach(c => sortOrderMap.set(c.company_name, c.sort_order ?? 9999));

    const map = new Map();
    [...purchaseTrades, ...saleTrades].forEach(t => {
      if (!t.company_name) return;
      if (!map.has(t.company_name)) {
        map.set(t.company_name, {
          name: t.company_name,
          count: 0,
          sortOrder: sortOrderMap.get(t.company_name) ?? 9999
        });
      }
      map.get(t.company_name).count++;
    });
    // sort_order 기준 오름차순 정렬
    return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [purchaseTrades, saleTrades, companies]);

  // [SIDEBAR SEARCH STATE]
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Filtered Company List
  const filteredCompanyList = useMemo(() => {
    if (!sidebarSearch.trim()) return companyList;
    return companyList.filter(c => c.name.toLowerCase().includes(sidebarSearch.toLowerCase()));
  }, [companyList, sidebarSearch]);


  // --- Filtering Logic for Main Content ---

  const getDisplayedTrades = (rawTrades) => {
    let baseFiltered = rawTrades;

    // 1. View Mode Filter
    if (viewMode === 'DAILY') {
      baseFiltered = rawTrades.filter(t => t.trade_date?.substring(0, 10) === selectedDate);
    } else if (viewMode === 'COMPANY') {
      if (selectedCompany) {
        baseFiltered = rawTrades.filter(t => t.company_name === selectedCompany);
      } else {
        baseFiltered = []; // Select a company first
      }
    } else if (viewMode === 'PERIOD') {
      // Show all in range
    }

    return baseFiltered;
  };

  const displayedPurchaseTrades = useMemo(() => getDisplayedTrades(purchaseTrades), [viewMode, selectedDate, selectedCompany, queryRange, purchaseTrades]);
  const displayedSaleTrades = useMemo(() => getDisplayedTrades(saleTrades), [viewMode, selectedDate, selectedCompany, queryRange, saleTrades]);


  // --- Layout Handlers ---
  const handleMouseDown = useCallback(() => { setIsDragging(true); }, []);
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newRatio = Math.min(Math.max(x / rect.width, 0.3), 0.7);
    setSplitRatio(newRatio);
  }, [isDragging]);
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem(getScopedKey('tradeListSplitRatio'), splitRatio.toString());
    }
  }, [isDragging, splitRatio, user?.id]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);


  // --- Render Helpers ---

  const renderSidebarContent = () => {
    if (viewMode === 'DAILY') {
      return (
        <div className="sidebar-list">
          <div className="sidebar-content">
            {dailyList.map(item => (
              <div
                key={item.date}
                className={`sidebar-item ${selectedDate === item.date ? 'active' : ''}`}
                onClick={() => setSelectedDate(item.date)}
              >
                <div className="sidebar-item-date">{item.date} ({item.day})</div>
                <div className="sidebar-item-summary">
                  <span>전표 {item.count}건</span>
                  <span style={{ fontWeight: '500' }}>{formatCurrency(item.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    } else if (viewMode === 'COMPANY') {
      return (
        <div className="sidebar-list">
          <div className="sidebar-search-box">
            <input
              type="text"
              placeholder="거래처 검색..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="sidebar-search-input"
            />
          </div>
          <div className="sidebar-content">
            {filteredCompanyList.length === 0 && <div style={{ padding: '1rem', color: '#999', textAlign: 'center' }}>거래처가 없습니다.</div>}
            {filteredCompanyList.map(comp => (
              <div
                key={comp.name}
                className={`sidebar-item ${selectedCompany === comp.name ? 'active' : ''}`}
                onClick={() => setSelectedCompany(comp.name)}
              >
                <div className="sidebar-item-date">{comp.name}</div>
                <div className="sidebar-item-summary">
                  <span>기간 내 {comp.count}건</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
  };

  const TradeTable = memo(({ trades, type, viewMode }) => {
    const isPurchase = type === 'PURCHASE';
    const isCompanyMode = viewMode === 'COMPANY';
    const headerBgColor = isPurchase ? '#fdf2f2' : '#f0f7ff';
    const headerTextColor = isPurchase ? '#c0392b' : '#2980b9';
    const amountLabel = isPurchase ? '매입액' : '매출액';

    // 데이터 가공 (정렬 및 잔액 계산)
    const processedTrades = useMemo(() => {
      let sorted = [...trades];
      // 거래처 모드일 때만 날짜 오름차순 (장부 형태)
      if (isCompanyMode) {
        sorted.sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date) || a.id - b.id);
      }

      let runningBalance = 0;
      return sorted.map(t => {
        const totalPrice = parseFloat(t.total_price) || 0;
        const paidAmount = parseFloat(isPurchase ? t.daily_payment : t.daily_receipt) || 0;

        let prevBalance = 0;
        let balance = 0;

        if (isCompanyMode) {
          prevBalance = runningBalance;
          balance = prevBalance + totalPrice - paidAmount;
          runningBalance = balance;
        } else {
          // 일자별 모드: 건별 잔액 (단순 차액)
          balance = totalPrice - paidAmount;
        }

        return { ...t, prevBalance, balance, totalPrice, paidAmount };
      });
    }, [trades, isCompanyMode]);


    // 합계 계산
    const sums = useMemo(() => {
      return processedTrades.reduce((acc, t) => ({
        sales: acc.sales + t.totalPrice,
        paid: acc.paid + t.paidAmount
      }), { sales: 0, paid: 0 });
    }, [processedTrades]);

    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '14%' }} />
              <col />
              {isCompanyMode && <col style={{ width: '18%' }} />}
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '50px' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ backgroundColor: headerBgColor, borderBottom: `2px solid ${headerTextColor}` }}>
                <th style={{ color: headerTextColor, padding: '0.6rem', textAlign: 'left', fontSize: '0.85rem' }}>날짜</th>
                <th style={{ color: headerTextColor, padding: '0.6rem', textAlign: 'left', fontSize: '0.85rem' }}>거래처</th>
                {isCompanyMode && <th style={{ color: headerTextColor, padding: '0.6rem', textAlign: 'right', fontSize: '0.85rem' }}>전잔금</th>}
                <th style={{ color: headerTextColor, padding: '0.6rem', textAlign: 'right', fontSize: '0.85rem' }}>{amountLabel}</th>
                <th style={{ color: headerTextColor, padding: '0.6rem', textAlign: 'right', fontSize: '0.85rem' }}>{isPurchase ? '출금' : '입금'}</th>
                <th style={{ color: headerTextColor, padding: '0.6rem', textAlign: 'center', fontSize: '0.85rem' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {processedTrades.length === 0 ? (
                <tr><td colSpan={isCompanyMode ? 6 : 5} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>데이터가 없습니다.</td></tr>
              ) : (
                processedTrades.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => setDetailModal({ isOpen: true, tradeId: t.id })}>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.trade_date?.substring(5, 10)}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.company_name}</td>

                    {isCompanyMode && (
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.85rem', color: '#64748b' }}>
                        {formatCurrency(t.prevBalance)}
                      </td>
                    )}

                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '600', fontSize: '0.85rem' }}>{formatCurrency(t.totalPrice)}</td>

                    <td style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.85rem', color: t.paidAmount > 0 ? '#16a34a' : '#94a3b8' }}>
                      {t.paidAmount > 0 ? formatCurrency(t.paidAmount) : '-'}
                    </td>

                    <td style={{ padding: '0.5rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setPrintModal({ isOpen: true, tradeId: t.id })} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>🖨️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {processedTrades.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, backgroundColor: '#f8fafc', borderTop: '2px solid #cbd5e1', zIndex: 2 }}>
                <tr style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                  <td colSpan={2} style={{ padding: '0.8rem', textAlign: 'center', color: '#475569' }}>합계 ({processedTrades.length}건)</td>

                  {isCompanyMode && <td style={{ padding: '0.6rem', textAlign: 'right', color: '#94a3b8' }}>-</td>}

                  <td style={{ padding: '0.6rem', textAlign: 'right', color: '#1e293b' }}>
                    {formatCurrency(sums.sales)}
                  </td>

                  <td style={{ padding: '0.6rem', textAlign: 'right', color: '#16a34a' }}>
                    {formatCurrency(sums.paid)}
                  </td>

                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  }, (prev, next) => prev.trades === next.trades && prev.type === next.type && prev.viewMode === next.viewMode);

  const renderPanel = (type) => {
    const isPurchase = type === 'PURCHASE';
    const trades = isPurchase ? displayedPurchaseTrades : displayedSaleTrades;
    const filter = isPurchase ? purchaseFilter : saleFilter;
    const setFilter = isPurchase ? setPurchaseFilter : setSaleFilter;
    const color = isPurchase ? '#c0392b' : '#2980b9';
    const label = isPurchase ? '매입' : '매출';
    const transactionType = isPurchase ? 'PAYMENT' : 'RECEIPT'; // 매입=출금, 매출=입금

    // 2차 필터링 (검색어)
    const finalTrades = trades.filter(t => {
      if (!filter.trim()) return true;
      const search = filter.toLowerCase();
      return (
        t.trade_number?.toLowerCase().includes(search) ||
        t.company_name?.toLowerCase().includes(search) ||
        String(t.total_price).includes(search)
      );
    });

    // 결제 방법별 합계 계산 (현재 뷰모드/선택에 따라 필터링)
    const getPaymentMethodSummary = () => {
      // 해당 전표 유형(입금/출금)에 맞는 거래만 필터
      let filteredPayments = paymentTransactions.filter(p => p.transaction_type === transactionType);

      // 뷰 모드에 따라 추가 필터링
      if (viewMode === 'DAILY' && selectedDate) {
        filteredPayments = filteredPayments.filter(p => {
          const paymentDate = p.transaction_date?.split('T')[0] || p.transaction_date;
          return paymentDate === selectedDate;
        });
      } else if (viewMode === 'COMPANY' && selectedCompany) {
        // 거래처별 뷰: 해당 거래처의 결제만 표시
        filteredPayments = filteredPayments.filter(p => p.company_name === selectedCompany);
      }
      // PERIOD 모드: 전체 기간 표시 (필터 없음)

      // 결제 방법별 그룹화
      const methodTotals = {};
      filteredPayments.forEach(p => {
        const method = p.payment_method || '미지정';
        methodTotals[method] = (methodTotals[method] || 0) + parseFloat(p.amount || 0);
      });

      return methodTotals;
    };

    const methodTotals = getPaymentMethodSummary();
    const hasPayments = Object.keys(methodTotals).length > 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '0.8rem', background: isPurchase ? '#fff5f5' : '#f0f9ff', borderBottom: `2px solid ${color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: color, fontSize: '1rem' }}>{label} 목록 <span style={{ fontSize: '0.8rem', background: color, color: '#fff', padding: '1px 6px', borderRadius: '10px' }}>{finalTrades.length}</span></h3>
        </div>
        <div style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
          <input
            type="text"
            placeholder="검색 (번호, 거래처, 금액)..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ width: '100%', padding: '0.4rem', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TradeTable trades={finalTrades} type={type} viewMode={viewMode} />
        </div>
        {/* 결제 방법별 합계 */}
        {hasPayments && (
          <div style={{ padding: '0.4rem 0.8rem', borderTop: '1px solid #eee', backgroundColor: isPurchase ? '#fef2f2' : '#f0f8ff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>{isPurchase ? '출금방법별:' : '입금방법별:'}</span>
              {Object.entries(methodTotals).map(([method, total], idx) => (
                <span key={idx} style={{
                  padding: '0.2rem 0.5rem',
                  backgroundColor: color,
                  color: '#fff',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: '500'
                }}>
                  {method}: {formatCurrency(total)}원
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };


  // 퀵 기간 설정 핸들러
  const handleQuickPeriod = (type) => {
    const today = new Date();
    let start, end;
    if (type === 'TODAY') { start = end = today; }
    else if (type === 'WEEK') { start = subDays(today, 7); end = today; }
    else if (type === 'MONTH') { start = startOfMonth(today); end = endOfMonth(today); }
    else if (type === 'YEAR') { start = startOfYear(today); end = endOfMonth(today); }
    setQueryRange({ start_date: format(start, 'yyyy-MM-dd'), end_date: format(end, 'yyyy-MM-dd') });
  };

  return (
    <div className={`trade-list-wrapper unified ${isWindow ? 'is-window' : ''}`}>
      {/* Left Sidebar */}
      <div className="trade-sidebar">
        {/* 탭: 일자 / 거래처 */}
        <div className="sidebar-tabs">
          <div className={`tab-btn ${viewMode === 'DAILY' ? 'active' : ''}`} onClick={() => handleViewModeChange('DAILY')}>일자</div>
          <div className={`tab-btn ${viewMode === 'COMPANY' ? 'active' : ''}`} onClick={() => handleViewModeChange('COMPANY')}>거래처</div>
        </div>

        {/* 공통 기간 선택 UI */}
        <div className="period-control-compact">
          <div className="period-inputs">
            <input type="date" value={queryRange.start_date} onChange={(e) => setQueryRange(p => ({ ...p, start_date: e.target.value }))} />
            <span>~</span>
            <input type="date" value={queryRange.end_date} onChange={(e) => setQueryRange(p => ({ ...p, end_date: e.target.value }))} />
          </div>
          <div className="quick-btn-row">
            <button className="btn-quick-sm" onClick={() => handleQuickPeriod('TODAY')}>오늘</button>
            <button className="btn-quick-sm" onClick={() => handleQuickPeriod('WEEK')}>7일</button>
            <button className="btn-quick-sm" onClick={() => handleQuickPeriod('MONTH')}>이번달</button>
            <button className="btn-quick-sm" onClick={() => handleQuickPeriod('YEAR')}>올해</button>
          </div>
        </div>

        {/* Sidebar Content (Based on Mode) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {renderSidebarContent()}
        </div>
      </div>

      {/* Main Content (Split View) */}
      <div className="trade-main" ref={containerRef}>
        {/* Split View Re-implementation */}
        <div className="split-pane-container">
          {/* Left Panel */}
          <div style={{ flex: `0 0 calc(${splitRatio * 100}% - 4px)`, minWidth: '300px' }}>
            {renderPanel(layoutOrder.left)}
          </div>

          {/* Resizer */}
          <div
            className={`resizer ${isDragging ? 'dragging' : ''}`}
            onMouseDown={handleMouseDown}
          ></div>

          {/* Right Panel */}
          <div style={{ flex: 1, minWidth: '300px' }}>
            {renderPanel(layoutOrder.right)}
          </div>
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} {...modal} />
      <TradeDetailModal isOpen={detailModal.isOpen} onClose={() => setDetailModal({ isOpen: false, tradeId: null })} tradeId={detailModal.tradeId} />
      <TradePrintModal isOpen={printModal.isOpen} onClose={() => setPrintModal({ isOpen: false, tradeId: null })} tradeId={printModal.tradeId} />

      {/* Matching Error Modal - Partial Impl or reused */}
      {matchingErrorModal.isOpen && createPortal(
        <div className="modal-overlay">
          <div className="matching-error-modal">
            <h3>⚠️ {matchingErrorModal.title}</h3>
            <p>기존 매칭이 존재하여 삭제할 수 없습니다.</p>
            <button onClick={() => setMatchingErrorModal({ isOpen: false, title: '', matchingData: null })}>닫기</button>
          </div>
        </div>
        , document.body)}
    </div>
  );
}

export default memo(TradeList);
