import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, parseISO, addDays, differenceInDays, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import './SettlementPage.css';
import ConfirmModal from '../components/ConfirmModal';

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

  const [loading, setLoading] = useState(false);

  const defaultSettlementData = {
    revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0, zeroCostCount: 0,
    prev_inventory_value: 0, today_purchase_cost: 0, today_inventory_value: 0, calculated_cogs: 0,
    system_cash_balance: 0, actual_cash_balance: 0,
    closing_note: '', closedAt: null,
    cash_inflow: 0, cash_outflow: 0, cash_expense: 0,
    inventoryLoss: 0, // [NEW]
    cashFlowDetails: [], expenseDetails: []
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

  // --- Effect: When Dates Change (in New Mode) ---
  useEffect(() => {
    if (mode === 'new') {
      const startStr = format(nextStartDate, 'yyyy-MM-dd');
      const endStr = format(targetEndDate, 'yyyy-MM-dd');
      // Only fetch if end >= start
      if (targetEndDate >= nextStartDate) {
        fetchSettlementData(startStr, endStr);
      }
    }
  }, [mode, nextStartDate, targetEndDate]);

  // --- Effect: When History Selected ---
  useEffect(() => {
    if (mode === 'view' && selectedHistory) {
      // Flatten history item to settlementData structure
      const h = selectedHistory;
      setSettlementData({
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
      });
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

      // [New Mode] Use Fixed Previous Inventory (from last closing)
      // [View Mode] Logic handled elsewhere, but this function is only for 'new' mode.
      const prevInv = fixedPrevInventory;

      // Asset Flow Logic: Begin + Purch - End = COGS
      // With Loss: Begin + Purch + Loss(Negative) - End = COGS
      const invLoss = parseFloat(sData.inventoryLoss || 0);
      const derivedCogs = prevInv + periodPurch + invLoss - todayInv;

      setSettlementData({
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

        closing_note: '',
        closedAt: null,

        cash_inflow: sData.cashFlow ? parseFloat(sData.cashFlow.inflow || 0) : 0,
        cash_outflow: sData.cashFlow ? parseFloat(sData.cashFlow.outflow || 0) : 0,
        cash_expense: sData.cashFlow ? parseFloat(sData.cashFlow.expense || 0) : 0,
        inventoryLoss: invLoss,
        cashFlowDetails: sData.cashFlowDetails || [],
        expenseDetails: sData.expenseDetails || []
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

  const formatCurrency = (val) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(val || 0);

  const isLatestHistory = historyList.length > 0 && selectedHistory && selectedHistory.id === historyList[0].id;



  return (
    <div className={`settlement-page-wrapper unified ${isWindow ? 'is-window' : ''}`}>
      {/* Sidebar: Timeline */}
      <div className="settlement-sidebar">
        <div className="sidebar-header">
          <h3>📅 마감 이력</h3>
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
                <h3>마감 상세 조회</h3>
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
            : (selectedHistory ? `${format(parseISO(selectedHistory.start_date), 'MM/dd')} ~ ${format(parseISO(selectedHistory.end_date), 'MM/dd')}` : '마감 이력')})</h2>
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
          <h2>{mode === 'new' ? '📝 마감 확인 및 확정' : '📝 마감 당시 기록'}</h2>

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
                  <span className="lbl">기말 재고 ({mode === 'new' ? format(targetEndDate, 'MM/dd') : (selectedHistory ? format(parseISO(selectedHistory.end_date), 'MM/dd') : '-')})</span>
                  <span className="val">{formatCurrency(settlementData.today_inventory_value)}</span>
                </div>
                <div className="divider"></div>
                <div className="flow-row result">
                  <span className="lbl">산출 원가</span>
                  <span className="val">{formatCurrency(settlementData.calculated_cogs)}</span>
                </div>
                <div className="comparison-note">
                  <span>손익계산서 원가: {formatCurrency(settlementData.cogs)}</span>
                  {Math.abs(settlementData.cogs - settlementData.calculated_cogs) > 100 && (
                    <span className="diff-warning"> (차이: {formatCurrency(settlementData.cogs - settlementData.calculated_cogs)})</span>
                  )}
                </div>
              </div>
            </div>

            <div className="card-panel">
              <h4>💰 현금 흐름</h4>
              <div className="asset-flow-box">
                <div className="flow-row">
                  <span className="lbl">입금</span>
                  <span className="val text-blue">+{formatCurrency(settlementData.cash_inflow)}</span>
                </div>
                <div className="flow-row">
                  <span className="lbl">출금</span>
                  <span className="val text-red">-{formatCurrency(settlementData.cash_outflow)}</span>
                </div>
                <div className="flow-row">
                  <span className="lbl">지출</span>
                  <span className="val text-red">-{formatCurrency(settlementData.cash_expense)}</span>
                </div>

                {/* [NEW] Detailed Breakdown (Collapsible or Always Visible) */}
                <div className="flow-breakdown">
                  {settlementData.cashFlowDetails && (
                    <>
                      {/* Inflow Breakdown */}
                      {settlementData.cashFlowDetails.filter(d => d.transaction_type === 'RECEIPT').map((d, i) => (
                        <div key={`in-${i}`} className="flow-sub-row">
                          <span className="sub-lbl">↳ {d.payment_method || '미지정'}</span>
                          <span className="sub-val">+{formatCurrency(d.total)}</span>
                        </div>
                      ))}

                      {/* Outflow Breakdown */}
                      {settlementData.cashFlowDetails.filter(d => d.transaction_type === 'PAYMENT').map((d, i) => (
                        <div key={`out-${i}`} className="flow-sub-row">
                          <span className="sub-lbl">↳ {d.payment_method || '미지정'}</span>
                          <span className="sub-val">-{formatCurrency(d.total)}</span>
                        </div>
                      ))}

                      {/* Expense Breakdown */}
                      {settlementData.expenseDetails && settlementData.expenseDetails.map((d, i) => (
                        <div key={`exp-${i}`} className="flow-sub-row">
                          <span className="sub-lbl">↳ [지출] {d.payment_method || '미지정'}</span>
                          <span className="sub-val">-{formatCurrency(d.total)}</span>
                        </div>
                      ))}
                    </>
                  )}
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
              <h4>최종 마감 승인</h4>
              <div className="form-line">
                <label>기준일 전산 시재</label>
                <input value={formatCurrency(settlementData.system_cash_balance)} disabled />
              </div>
              <div className={`form-line ${mode === 'new' ? 'active' : ''}`}>
                <label>기준일 실사 시재</label>
                <input
                  className={mode === 'new' ? 'editable' : ''}
                  value={settlementData.actual_cash_balance.toLocaleString()}
                  onChange={(e) => mode === 'new' && setSettlementData(p => ({ ...p, actual_cash_balance: parseInt(e.target.value.replace(/,/g, '')) || 0 }))}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-line result">
                <label>시재 오차</label>
                <span className={`diff-val ${cashDifference === 0 ? 'ok' : 'ng'}`}>
                  {cashDifference > 0 ? '+' : ''}{formatCurrency(cashDifference)}
                </span>
              </div>

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

      <ConfirmModal {...modalConfig} onClose={closeModal} />
    </div >
  );
};

export default SettlementPage;
