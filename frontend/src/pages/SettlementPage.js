import React, { useState, useEffect } from 'react';
import axios from 'axios';
import format from 'date-fns/format';
import parseISO from 'date-fns/parseISO';
import addDays from 'date-fns/addDays';
import differenceInDays from 'date-fns/differenceInDays';
import startOfDay from 'date-fns/startOfDay';
import startOfMonth from 'date-fns/startOfMonth';
import endOfMonth from 'date-fns/endOfMonth';
import { ko } from 'date-fns/locale';
import './SettlementPage.css';
import ConfirmModal from '../components/ConfirmModal';
import { formatCurrency as formatCurrencyBase } from '../utils/formatUtils';

const SettlementPage = ({ isWindow, initialHistory }) => {
  // Modes: 'new' (Drafting next settlement) | 'view' (Viewing history)
  const [mode, setMode] = useState('new');
  const [historyList, setHistoryList] = useState([]);

  // Date State for NEW Settlement
  const [nextStartDate, setNextStartDate] = useState(new Date());
  const [targetEndDate, setTargetEndDate] = useState(new Date());
  const [isFirstSettlement, setIsFirstSettlement] = useState(false);

  // Selected History Item (For View Mode)
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(false);

  const defaultSettlementData = {
    revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0, zeroCostCount: 0,
    prev_inventory_value: 0, today_purchase_cost: 0, today_inventory_value: 0, calculated_cogs: 0,
    system_cash_balance: 0, actual_cash_balance: 0,
    closing_note: '', closedAt: null,
    cash_inflow: 0, cash_outflow: 0, cash_expense: 0,
    inventoryLoss: 0,
    cashFlowDetails: [], expenseDetails: [],
    actualMethodValues: {} // [NEW] { 'CASH': 10000, 'VOUCHER': 0 ... }
  };

  // Financial Data State
  const [settlementData, setSettlementData] = useState(defaultSettlementData);
  const [fixedPrevInventory, setFixedPrevInventory] = useState(0);

  const [modalConfig, setModalConfig] = useState({ isOpen: false });
  const openModal = (cfg) => setModalConfig({ onConfirm: () => { }, ...cfg, isOpen: true });
  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  // Helper for Duration
  const getDurationDays = (start, end) => {
    return differenceInDays(startOfDay(end), startOfDay(start)) + 1;
  };

  const cashDifference = settlementData.actual_cash_balance - settlementData.system_cash_balance;

  // --- Initialization ---
  useEffect(() => {
    fetchHistory();
    initializeNextSettlement();
    fetchPaymentMethods();
  }, []);

  // [New] Deep link support
  useEffect(() => {
    if (initialHistory) {
      setMode('view');
      setSelectedHistory(initialHistory);
    }
  }, [initialHistory]);

  // --- Fetching Logic ---
  const fetchHistory = async () => {
    try {
      const res = await axios.get('/api/settlement/history');
      if (res.data.success) {
        setHistoryList(res.data.data);
      }
    } catch (e) {
      console.error("History error", e);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const res = await axios.get('/api/settings/payment-methods?is_active=1');
      if (res.data.success) {
        setPaymentMethods(res.data.data);
      }
    } catch (e) {
      console.error("Payment methods error", e);
    }
  };

  const initializeNextSettlement = async () => {
    try {
      const res = await axios.get('/api/settlement/last-closed');
      if (res.data.success) {
        if (res.data.lastDate) {
          const last = parseISO(res.data.lastDate);
          const next = addDays(last, 1);
          setNextStartDate(next);
          setTargetEndDate(new Date()); // Default to today
          setIsFirstSettlement(false);

          const lastInventory = parseFloat(res.data.lastInventory || 0);
          setFixedPrevInventory(lastInventory);
        } else {
          // First time ever
          setIsFirstSettlement(true);
          setNextStartDate(new Date()); // Or some project start date
          setTargetEndDate(new Date());
          setFixedPrevInventory(0);
        }
        setSettlementData({ ...defaultSettlementData, prev_inventory_value: parseFloat(res.data.lastInventory || 0) }); // Set initial prev inv
        setMode('new');
        setSelectedHistory(null);
      }
    } catch (e) {
      console.error("Init error", e);
    }
  };

  // --- Effect: When Dates Change or History Selected ---
  useEffect(() => {
    let start, end;
    if (mode === 'new') {
      start = nextStartDate;
      end = targetEndDate;
    } else if (mode === 'view' && selectedHistory) {
      start = parseISO(selectedHistory.start_date);
      end = parseISO(selectedHistory.end_date);
    }

    if (start && end && end >= start) {
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      fetchSettlementData(startStr, endStr);
    }
  }, [mode, nextStartDate, targetEndDate, selectedHistory]);

  // --- Effect: When History Selected ---
  useEffect(() => {
    if (mode === 'view' && selectedHistory) {
      // Flatten history item to settlementData structure
      const h = selectedHistory;
      setSettlementData(prev => ({
        ...prev,
        revenue: parseFloat(h.revenue),
        cogs: parseFloat(h.cogs),
        grossProfit: parseFloat(h.gross_profit),
        expenses: parseFloat(h.expenses),
        netProfit: parseFloat(h.net_profit),
        zeroCostCount: 0,

        prev_inventory_value: parseFloat(h.prev_inventory || 0),
        today_purchase_cost: parseFloat(h.purchase_cost || 0),
        today_inventory_value: parseFloat(h.today_inventory || 0),
        calculated_cogs: parseFloat(h.cogs),

        system_cash_balance: parseFloat(h.system_cash || 0),
        actual_cash_balance: parseFloat(h.actual_cash || 0),

        closing_note: h.note,
        closedAt: h.closed_at,

        // Map reconstructed cash flow data
        cash_inflow: parseFloat(h.cash_inflow || 0),
        cash_outflow: parseFloat(h.cash_outflow || 0),
        cash_expense: parseFloat(h.cash_expense || 0),
        inventoryLoss: parseFloat(h.inventory_loss || 0)
      }));
      // [FIX] Update targetEndDate to show the correct end date of the history item
      setTargetEndDate(parseISO(h.end_date));
    }
  }, [mode, selectedHistory]);


  const fetchSettlementData = async (start, end) => {
    setLoading(true);
    try {
      // 1. P&L Summary
      const summaryRes = await axios.get('/api/settlement/summary', { params: { startDate: start, endDate: end } });
      const sData = summaryRes.data.data;

      // 2. End Date Asset Snapshot (Inventory & Cash)
      const endClosingRes = await axios.get(`/api/settlement/closing/${end}`);

      const todayInv = endClosingRes.data.success ? parseFloat(endClosingRes.data.data.today_inventory_value || 0) : 0;
      const periodPurch = parseFloat(sData.periodPurchase || 0);

      // [FIX] In 'view' mode, use the historical prev_inventory instead of the 'next draft' one
      const prevInv = (mode === 'view' && selectedHistory)
        ? parseFloat(selectedHistory.prev_inventory || 0)
        : fixedPrevInventory;

      // Asset Flow Logic: Begin + Purch - End = COGS
      const invLoss = parseFloat(sData.inventoryLoss || 0);
      const derivedCogs = prevInv + periodPurch + invLoss - todayInv;

      setSettlementData(prev => {
        const newData = {
          ...prev,
          cashFlowDetails: sData.cashFlowDetails || [],
          expenseDetails: sData.expenseDetails || [],
          // [NEW] Metadata for UI
          isReconstructed: endClosingRes.data.data?.is_reconstructed,
          liveInventoryValue: endClosingRes.data.data?.live_inventory_value
        };

        // 'new' 모드일 때만 합계 수치들을 업데이트 (계산 로직 수행)
        if (mode === 'new') {
          return {
            ...newData,
            revenue: sData.revenue,
            cogs: sData.cogs,
            grossProfit: sData.grossProfit,
            expenses: sData.expenses,
            netProfit: sData.netProfit,
            zeroCostCount: sData.counts.zeroCostItems,

            prev_inventory_value: prevInv,
            today_purchase_cost: periodPurch,
            today_inventory_value: todayInv,
            calculated_cogs: derivedCogs,          // Theoretical COGS based on Assets

            system_cash_balance: endClosingRes.data.success ? parseFloat(endClosingRes.data.data.system_cash_balance || 0) : 0,
            actual_cash_balance: endClosingRes.data.success ? parseFloat(endClosingRes.data.data.actual_cash_balance || 0) : 0,

            cash_inflow: sData.cashFlow ? parseFloat(sData.cashFlow.inflow || 0) : 0,
            cash_outflow: sData.cashFlow ? parseFloat(sData.cashFlow.outflow || 0) : 0,
            cash_expense: sData.cashFlow ? parseFloat(sData.cashFlow.expense || 0) : 0,
            inventoryLoss: invLoss,
          };
        }

        // 'view' 모드일 때는 기존 데이터(selectedHistory에서 온 값들)를 유지함
        return newData;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (mode !== 'new') return;

    // Validation
    if (targetEndDate < nextStartDate) {
      openModal({ type: 'warning', title: '날짜 오류', message: '마감일은 시작일보다 이후여야 합니다.', showCancel: false });
      return;
    }

    openModal({
      type: 'confirm',
      title: '정산 확정',
      message: `${format(nextStartDate, 'yy-MM-dd')} ~ ${format(targetEndDate, 'yy-MM-dd')} (${getDurationDays(nextStartDate, targetEndDate)}일간)\n\n위 기간의 손익을 최종 확정하시겠습니까?`,
      showCancel: true,
      onConfirm: performSave
    });
  };


  const checkAuditStatus = async (date) => {
    try {
      const res = await axios.get('/api/inventory-audit', {
        params: {
          date: format(date, 'yyyy-MM-dd'),
          status: 'COMPLETED' // Only completed audits count
        }
      });
      return res.data.data && res.data.data.length > 0;
    } catch (e) {
      console.error("Audit check failed", e);
      return false; // Fail safe: assume no audit if error
    }
  };

  const performSave = async () => {
    // 1. Audit Check
    const hasAudit = await checkAuditStatus(targetEndDate);

    const proceedWithSave = async () => {
      try {
        const payload = {
          startDate: format(nextStartDate, 'yyyy-MM-dd'),
          endDate: format(targetEndDate, 'yyyy-MM-dd'),
          summaryData: settlementData,
          note: settlementData.closing_note
        };
        await axios.post('/api/settlement/close', payload);
        openModal({ type: 'success', title: '마감 완료', message: '성공적으로 마감되었습니다.', showCancel: false });

        // Refresh
        fetchHistory();
        initializeNextSettlement(); // Will advance the date

      } catch (e) {
        openModal({ type: 'warning', title: '저장 실패', message: '오류 발생' });
      }
    };

    if (!hasAudit) {
      openModal({
        type: 'warning',
        title: '재고 실사 누락 경고',
        message: `해당 날짜(${format(targetEndDate, 'MM/dd')})에 완료된 재고 실사 기록이 없습니다.\n\n정확한 원가 산출을 위해 실사를 먼저 진행하는 것이 권장됩니다.\n그래도 마감을 진행하시겠습니까?`,
        confirmText: '무시하고 진행',
        cancelText: '취소',
        onConfirm: proceedWithSave
      });
      return;
    }

    // Direct save if audit exists
    await proceedWithSave();
  };

  const handleDelete = () => {
    openModal({
      type: 'confirm',
      title: '정산 취소',
      message: '가장 최근의 정산 기록을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없으며, 해당 기간의 데이터는 다시 "미마감" 상태로 돌아갑니다.',
      showCancel: true,
      onConfirm: async () => {
        try {
          await axios.delete('/api/settlement/last');
          openModal({ type: 'success', title: '취소 완료', message: '정산이 취소되었습니다.', showCancel: false });
          fetchHistory();
          initializeNextSettlement();
        } catch (e) {
          openModal({ type: 'warning', title: '취소 실패', message: e.response?.data?.message || '오류가 발생했습니다.' });
        }
      }
    });
  };

  const formatCurrency = (val) => formatCurrencyBase(val) + '원';

  const formatWithCommas = (val) => {
    if (!val && val !== 0) return '';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const isLatestHistory = historyList.length > 0 && selectedHistory && selectedHistory.id === historyList[0].id;



  return (
    <div className={`settlement-page-wrapper unified ${isWindow ? 'is-window' : ''}`}>
      {/* Sidebar: Timeline */}
      <div className="settlement-sidebar">
        <div className="sidebar-header">
          <h3>📅 정산 이력</h3>
          <button className="btn-new-settle" onClick={() => { initializeNextSettlement(); setMode('new'); }}>+ 새 정산</button>
        </div>
        <div className="history-list timeline">
          {historyList.length === 0 && <div style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>이력이 없습니다.</div>}
          {historyList.map((hist, idx) => {
            const start = parseISO(hist.start_date);
            const end = parseISO(hist.end_date);
            const isDaily = differenceInDays(end, start) === 0;
            return (
              <div
                key={idx}
                className={`history-item ${mode === 'view' && selectedHistory === hist ? 'active' : ''}`}
                onClick={() => { setMode('view'); setSelectedHistory(hist); }}
              >
                <div className="hist-date">
                  {isDaily ? format(start, 'MM-dd (eee)', { locale: ko }) : `${format(start, 'MM-dd')} ~ ${format(end, 'MM-dd')}`}
                </div>
                <div className="hist-info">
                  <span className={`tag ${isDaily ? 'daily' : 'period'}`}>{isDaily ? '일일' : '기간'}</span>
                  <span className="profit">{formatCurrency(hist.net_profit)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="settlement-main">
        {/* Context Header */}
        <div className="main-header">
          <div className="context-title">
            {mode === 'new' ? (
              <>
                <span className="badge new">새 정산</span>
                <h3>차기 정산 수행</h3>
              </>
            ) : (
              <>
                <span className="badge view">이력 조회</span>
                <h3>정산 상세 조회</h3>
              </>
            )}
          </div>


          <div className="date-control-group">
            <div className="date-field readonly">
              <label>시작일 {mode === 'new' ? '(자동 지정)' : ''}</label>
              <input
                value={mode === 'new' ? format(nextStartDate, 'yyyy-MM-dd') : (selectedHistory ? format(parseISO(selectedHistory.start_date), 'yyyy-MM-dd') : '')}
                disabled
              />
            </div>
            <span className="arrow">➜</span>
            <div className={`date-field ${mode === 'view' ? 'readonly' : ''}`}>
              <label>마감 기준일</label>
              <input
                type="date"
                value={targetEndDate ? format(targetEndDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => mode === 'new' && setTargetEndDate(parseISO(e.target.value))}
                min={format(nextStartDate, 'yyyy-MM-dd')}
                disabled={mode === 'view'}
                style={{
                  width: '100%',
                  padding: '0.4rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: mode === 'view' ? '#f5f5f5' : 'white',
                  height: '36px'
                }}
              />
            </div>
            <div className="info-txt">
              {mode === 'new'
                ? `${getDurationDays(nextStartDate, targetEndDate)}일간 정산`
                : (selectedHistory ? `${getDurationDays(parseISO(selectedHistory.start_date), parseISO(selectedHistory.end_date))}일간 정산` : '')}
            </div>
          </div>
        </div>

        {/* P&L Section */}
        <div className="section-pnl">
          <h2>📊 손익 리포트 ({mode === 'new'
            ? `${format(nextStartDate, 'MM/dd')} ~ ${format(targetEndDate, 'MM/dd')}`
            : (selectedHistory ? `${format(parseISO(selectedHistory.start_date), 'MM/dd')} ~ ${format(parseISO(selectedHistory.end_date), 'MM/dd')}` : '정산 이력')})</h2>
          <div className="pnl-summary-row">
            <div className="pnl-box revenue">
              <span className="lbl">매출액</span>
              <span className="val">{formatCurrency(settlementData.revenue)}</span>
            </div>
            <div className="op">-</div>
            <div className="pnl-box cost">
              <span className="lbl">매출원가</span>
              <span className="val text-red">{formatCurrency(settlementData.cogs)}</span>
            </div>
            <div className="op">=</div>
            <div className="pnl-box profit">
              <span className="lbl">매출총이익</span>
              <span className="val text-blue">{formatCurrency(settlementData.grossProfit)}</span>
            </div>
            <div className="op">-</div>
            <div className="pnl-box expense">
              <span className="lbl">판관비</span>
              <span className="val text-red">{formatCurrency(settlementData.expenses)}</span>
            </div>
            {settlementData.inventoryLoss !== 0 && (
              <>
                <div className="op">+</div>
                <div className="pnl-box adjustment">
                  <span className="lbl">재고 조정 손익</span>
                  <span className={`val ${settlementData.inventoryLoss >= 0 ? 'text-blue' : 'text-red'}`}>
                    {formatCurrency(settlementData.inventoryLoss)}
                  </span>
                </div>
              </>
            )}
            <div className="op">=</div>
            <div className="pnl-box net highlight">
              <span className="lbl">순이익</span>
              <span className="val text-green">{formatCurrency(settlementData.netProfit)}</span>
            </div>
          </div>
        </div>

        {/* Closing Section */}
        <div className="section-closing">
          <h2>{mode === 'new' ? '📝 정산 확인 및 확정' : '📝 정산 당시 기록'}</h2>

          <div className="closing-grid">
            <div className="card-panel">
              <h4>📊 자산 흐름</h4>
              <div className="asset-flow-box">
                <div className="flow-row">
                  <span className="lbl">기초 재고 ({mode === 'new' ? format(nextStartDate, 'MM/dd') : (selectedHistory ? format(parseISO(selectedHistory.start_date), 'MM/dd') : '-')})</span>
                  <span className="val">{formatCurrency(settlementData.prev_inventory_value)}</span>
                </div>
                <div className="flow-op">+</div>
                <div className="flow-row">
                  <span className="lbl">기간 매입 ({mode === 'new' ? getDurationDays(nextStartDate, targetEndDate) : (selectedHistory ? getDurationDays(parseISO(selectedHistory.start_date), parseISO(selectedHistory.end_date)) : 0)}일간)</span>
                  <span className="val">{formatCurrency(settlementData.today_purchase_cost)}</span>
                </div>
                {settlementData.inventoryLoss !== 0 && (
                  <>
                    <div className="flow-op">{settlementData.inventoryLoss > 0 ? '+' : '-'}</div>
                    <div className="flow-row">
                      <span className="lbl">재고 조정</span>
                      <span className="val">{formatCurrency(Math.abs(settlementData.inventoryLoss))}</span>
                    </div>
                  </>
                )}
                <div className="flow-op">-</div>
                <div className="flow-row">
                  <span className="lbl">
                    기말 재고 ({mode === 'new' ? format(targetEndDate, 'MM/dd') : (selectedHistory ? format(parseISO(selectedHistory.end_date), 'MM/dd') : '-')})
                    {settlementData.isReconstructed && <span className="recon-badge">역산됨</span>}
                  </span>
                  <span className="val">{formatCurrency(settlementData.today_inventory_value)}</span>
                </div>
                {settlementData.isReconstructed && (
                  <div className="recon-note">
                    * {format(targetEndDate, 'MM/dd')} 당시 저장된 기록이 없어 수불부를 기반으로 역산된 추정치입니다.
                  </div>
                )}
                <div className="divider"></div>
                <div className="flow-row result">
                  <span className="lbl">산출 원가 (재고 기준)</span>
                  <span className="val">{formatCurrency(settlementData.calculated_cogs)}</span>
                </div>
                <div className="comparison-note">
                  <span>판매 매칭 원가: {formatCurrency(settlementData.cogs)}</span>
                  {Math.abs(settlementData.cogs - settlementData.calculated_cogs) > 100 && (
                    <div className="diff-warning-box">
                      ⚠️ 오차 발생: {formatCurrency(settlementData.cogs - settlementData.calculated_cogs)}
                      <br />
                      <small>(과거 재고 역산 과정에서 실시간 단가 적용 등으로 인한 차이가 발생할 수 있습니다.)</small>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card-panel">
              <h4>💰 현금 흐름</h4>
              <div className="asset-flow-box">
                <div className="flow-row">
                  <span className="lbl">입금</span>
                  <span className={`val ${settlementData.cash_inflow >= 0 ? 'text-blue' : 'text-red'}`}>
                    {(settlementData.cash_inflow >= 0 ? '+' : '') + formatCurrency(settlementData.cash_inflow)}
                  </span>
                </div>
                <div className="flow-row">
                  <span className="lbl">출금</span>
                  <span className={`val ${settlementData.cash_outflow >= 0 ? 'text-red' : 'text-blue'}`}>
                    {(settlementData.cash_outflow >= 0 ? '-' : '+') + formatCurrency(Math.abs(settlementData.cash_outflow))}
                  </span>
                </div>
                <div className="flow-row">
                  <span className="lbl">지출</span>
                  <span className={`val ${settlementData.cash_expense >= 0 ? 'text-red' : 'text-blue'}`}>
                    {(settlementData.cash_expense >= 0 ? '-' : '+') + formatCurrency(Math.abs(settlementData.cash_expense))}
                  </span>
                </div>

                {/* [NEW] Detailed Breakdown - Grouped by Payment Method */}
                {/* [NEW] Detailed Breakdown - Grouped by Payment Method & Detail */}
                <div className="flow-breakdown" style={{ marginTop: '1.2rem' }}>
                  {(() => {
                    const groups = {};

                    // Group Inflow/Outflow/Expenses and keep list
                    (settlementData.cashFlowDetails || []).forEach(d => {
                      const method = d.payment_method || '미지정';
                      if (!groups[method]) groups[method] = { receipts: 0, payments: 0, expenses: 0, list: [] };
                      if (d.transaction_type === 'RECEIPT') {
                        groups[method].receipts += parseFloat(d.amount);
                        groups[method].list.push({ type: 'RECEIPT', label: d.detail, amount: d.amount });
                      } else {
                        groups[method].payments += parseFloat(d.amount);
                        groups[method].list.push({ type: 'PAYMENT', label: d.detail, amount: d.amount });
                      }
                    });

                    (settlementData.expenseDetails || []).forEach(d => {
                      const method = d.payment_method || '미지정';
                      if (!groups[method]) groups[method] = { receipts: 0, payments: 0, expenses: 0, list: [] };
                      groups[method].expenses += parseFloat(d.amount);
                      groups[method].list.push({ type: 'EXPENSE', label: d.detail, amount: d.amount });
                    });

                    if (Object.keys(groups).length === 0) return <div className="empty-flow" style={{ fontSize: '0.85rem', color: '#888', textAlign: 'center', padding: '1rem' }}>해당 기간의 상세 내역이 없습니다.</div>;

                    return Object.entries(groups).map(([method, vals], idx) => (
                      <div key={idx} className="method-group-box" style={{ marginBottom: '1rem', background: '#f8fafc', padding: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>💳 {method}</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>{vals.list.length}건</span>
                        </div>

                        {/* Detail List */}
                        <div className="group-detail-list">
                          {vals.list.map((item, i) => {
                            const impact = item.type === 'RECEIPT' ? item.amount : -item.amount;
                            return (
                              <div key={i} className="flow-sub-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '2px 0' }}>
                                <span className="sub-lbl" style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>
                                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginRight: '4px' }}>[{item.type === 'RECEIPT' ? '입금' : item.type === 'PAYMENT' ? '출금' : '지출'}]</span>
                                  {item.label}
                                </span>
                                <span className={`sub-val ${impact >= 0 ? 'text-blue' : 'text-red'}`} style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  {formatCurrency(impact)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Summary for this method */}
                        <div className="flow-sub-row" style={{ marginTop: '6px', borderTop: '1px solid #e2e8f0', paddingTop: '6px', textAlign: 'right' }}>
                          <span style={{ fontSize: '0.8rem', color: '#64748b', marginRight: '8px' }}>수단별 소계:</span>
                          <span className={`sub-val ${vals.receipts - vals.payments - vals.expenses >= 0 ? 'text-blue' : 'text-red'}`} style={{ fontWeight: 700 }}>
                            {formatCurrency(vals.receipts - vals.payments - vals.expenses)}
                          </span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                <div className="divider"></div>
                <div className="flow-row result">
                  <span className="lbl">순 현금 흐름</span>
                  <span className="val">{formatCurrency(settlementData.cash_inflow - settlementData.cash_outflow - settlementData.cash_expense)}</span>
                </div>
                <div className="comparison-note" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                  * 위 흐름은 '선택 기간' 동안 발생한 합계입니다.
                </div>
              </div>
            </div>

            <div className="card-panel">
              <h4>📋 실물 자산 정산 ({mode === 'new' ? '확인' : '기록'})</h4>
              <div className="asset-flow-box">
                <div className="audit-table-header" style={{ display: 'flex', fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: '8px', padding: '0 4px', borderBottom: '2px solid #e2e8f0', paddingBottom: '4px' }}>
                  <span style={{ flex: 1.5 }}>결제 수단</span>
                  <span style={{ flex: 1.2, textAlign: 'right' }}>전산(기간)</span>
                  <span style={{ flex: 1.2, textAlign: 'right' }}>실제(입력)</span>
                </div>

                {(() => {
                  // [IMPORTANT] Use dynamic methods from DB
                  // If not loaded yet, fallback to common ones
                  const methods = paymentMethods.length > 0
                    ? paymentMethods.filter(m => mode === 'new' ? m.is_active : true)
                    : [{ code: 'CASH', name: '현금' }, { code: 'BANK', name: '계좌이체' }];

                  // Create Name -> Code mapping for normalization (for cashFlowDetails/expenseDetails)
                  const nameToCode = {};
                  paymentMethods.forEach(pm => {
                    nameToCode[pm.name] = pm.code;
                    nameToCode[pm.code] = pm.code;
                  });

                  // Calculate system period totals per method (normalize to codes)
                  const systemTotals = {};
                  (settlementData.cashFlowDetails || []).forEach(d => {
                    const code = nameToCode[d.payment_method] || d.payment_method;
                    if (!systemTotals[code]) systemTotals[code] = 0;
                    systemTotals[code] += (d.transaction_type === 'RECEIPT' ? d.amount : -d.amount);
                  });
                  (settlementData.expenseDetails || []).forEach(d => {
                    const code = nameToCode[d.payment_method] || d.payment_method;
                    if (!systemTotals[code]) systemTotals[code] = 0;
                    systemTotals[code] -= d.amount;
                  });

                  return methods.map(m => {
                    const code = m.code;
                    const sysVal = systemTotals[code] || 0;
                    const actVal = settlementData.actualMethodValues?.[code] ?? (mode === 'view' ? sysVal : '');
                    const diff = (parseFloat(actVal) || 0) - sysVal;

                    return (
                      <div key={code} className={`audit-row ${Math.abs(diff) > 0 ? 'has-diff' : ''}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', padding: '6px', borderRadius: '6px', background: Math.abs(diff) > 0 ? '#fff1f2' : '#f8fafc', border: '1px solid', borderColor: Math.abs(diff) > 0 ? '#fda4af' : '#e2e8f0' }}>
                        <span style={{ flex: 1.5, fontSize: '0.85rem', fontWeight: 600 }}>{m.name}</span>
                        <span style={{ flex: 1.2, textAlign: 'right', fontSize: '0.8rem', color: '#475569' }}>{formatCurrency(sysVal)}</span>
                        <div style={{ flex: 1.2, display: 'flex', justifyContent: 'flex-end' }}>
                          <input
                            type="text"
                            placeholder="0"
                            style={{ width: '90%', textAlign: 'right', padding: '4px 8px', fontSize: '1rem', fontWeight: '800', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#1d4ed8', backgroundColor: mode === 'new' ? '#fff' : '#f8fafc' }}
                            value={formatWithCommas(actVal)}
                            onChange={(e) => {
                              if (mode !== 'new') return;
                              const rawVal = e.target.value.replace(/[^0-9-]/g, '');
                              setSettlementData(prev => ({
                                ...prev,
                                actualMethodValues: { ...prev.actualMethodValues, [code]: rawVal }
                              }));
                            }}
                            disabled={mode === 'view'}
                          />
                        </div>
                        {Math.abs(diff) > 0 && (
                          <div style={{ position: 'absolute', right: '-85px', fontSize: '0.75rem', color: '#e11d48', fontWeight: 700 }}>
                            {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}

                <div className="divider" style={{ margin: '12px 0' }}></div>

                {mode === 'view' && (
                  <div className="read-only-note" style={{ marginTop: '1rem' }}>
                    <label>마감 승인 일시</label>
                    <div className="val">{settlementData.closedAt ? format(parseISO(settlementData.closedAt), 'yyyy-MM-dd HH:mm:ss') : '-'}</div>
                  </div>
                )}

                <textarea
                  className="memo-box"
                  placeholder={mode === 'new' ? "마감 노트 입력 (예: 시재 오차 사유, 특이사항)" : "(내용 없음)"}
                  value={settlementData.closing_note}
                  onChange={(e) => setSettlementData(p => ({ ...p, closing_note: e.target.value }))}
                  disabled={mode === 'view'}
                  style={{ marginTop: mode === 'view' ? '0.5rem' : '1rem' }}
                />

                {mode === 'new' ? (
                  <button className="confirm-btn" onClick={performSave}>정산 확정</button>
                ) : (
                  isLatestHistory && (
                    <button className="rollback-btn" onClick={handleDelete}>🗑️ 정산 확정 취소</button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal {...modalConfig} onClose={closeModal} />
    </div >
  );
};

export default SettlementPage;
