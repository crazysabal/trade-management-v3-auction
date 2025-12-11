import React, { useState, useEffect, useMemo } from 'react';
import { paymentAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

function CompanyBalances() {
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);
  const [summary, setSummary] = useState({
    totalReceivable: 0,
    totalPayable: 0,
    receivableCount: 0,
    payableCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchReceivable, setSearchReceivable] = useState('');
  const [searchPayable, setSearchPayable] = useState('');
  const [hasBalanceOnly, setHasBalanceOnly] = useState(true);
  
  // 입금/출금 모달
  const [paymentModal, setPaymentModal] = useState({
    isOpen: false,
    type: 'RECEIPT',
    company: null
  });
  
  const [paymentForm, setPaymentForm] = useState({
    transaction_date: formatLocalDate(new Date()),
    amount: '',
    displayAmount: '', // 천단위 콤마 표시용
    payment_method: '계좌이체',
    notes: ''
  });
  
  const [unpaidTrades, setUnpaidTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  
  // 입출금 내역 모달
  const [historyModal, setHistoryModal] = useState({
    isOpen: false,
    company: null,
    type: null // 'receivable' or 'payable'
  });
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // 수정 모달
  const [editModal, setEditModal] = useState({
    isOpen: false,
    transaction: null
  });
  
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: '확인',
    showCancel: false
  });

  function formatLocalDate(date) {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 천단위 콤마 포맷
  const formatNumberWithComma = (value) => {
    if (!value && value !== 0) return '';
    const num = String(value).replace(/[^\d]/g, '');
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // 콤마 제거하고 숫자만 반환
  const parseNumberFromComma = (value) => {
    return String(value).replace(/,/g, '');
  };

  useEffect(() => {
    loadBalances();
  }, []);

  const loadBalances = async () => {
    try {
      setLoading(true);
      const response = await paymentAPI.getBalances({});
      const data = response.data.data || [];
      
      const receivableList = data
        .filter(item => item.company_type_flag === 'CUSTOMER' || item.company_type_flag === 'BOTH')
        .map(item => ({
          ...item,
          balance: parseFloat(item.receivable || 0)
        }));
      
      const payableList = data
        .filter(item => item.company_type_flag === 'SUPPLIER' || item.company_type_flag === 'BOTH')
        .map(item => ({
          ...item,
          balance: parseFloat(item.payable || 0)
        }));
      
      setReceivables(receivableList);
      setPayables(payableList);
      
      const receivableWithBalance = receivableList.filter(item => item.balance > 0);
      const payableWithBalance = payableList.filter(item => item.balance > 0);
      
      setSummary({
        totalReceivable: receivableWithBalance.reduce((sum, item) => sum + item.balance, 0),
        totalPayable: payableWithBalance.reduce((sum, item) => sum + item.balance, 0),
        receivableCount: receivableWithBalance.length,
        payableCount: payableWithBalance.length
      });
    } catch (error) {
      console.error('잔고 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  const getFilteredReceivables = () => {
    return receivables.filter(item => {
      if (searchReceivable && !item.company_name.toLowerCase().includes(searchReceivable.toLowerCase()) 
          && !item.company_code?.toLowerCase().includes(searchReceivable.toLowerCase())) {
        return false;
      }
      if (hasBalanceOnly && item.balance <= 0) {
        return false;
      }
      return true;
    });
  };

  const getFilteredPayables = () => {
    return payables.filter(item => {
      if (searchPayable && !item.company_name.toLowerCase().includes(searchPayable.toLowerCase()) 
          && !item.company_code?.toLowerCase().includes(searchPayable.toLowerCase())) {
        return false;
      }
      if (hasBalanceOnly && item.balance <= 0) {
        return false;
      }
      return true;
    });
  };

  // 금액 입력 핸들러 (마이너스 허용 - 기초잔고 설정용)
  const handleAmountChange = (e) => {
    const rawValue = parseNumberFromComma(e.target.value);
    // 마이너스 부호 또는 숫자만 허용
    if (rawValue === '' || rawValue === '-' || /^-?\d+$/.test(rawValue)) {
      setPaymentForm(prev => ({
        ...prev,
        amount: rawValue,
        displayAmount: rawValue === '-' ? '-' : formatNumberWithComma(rawValue)
      }));
    }
  };

  const openPaymentModal = async (company, type) => {
    setPaymentForm({
      transaction_date: formatLocalDate(new Date()),
      amount: '',
      displayAmount: '',
      payment_method: '계좌이체',
      notes: ''
    });
    setUnpaidTrades([]);
    
    setPaymentModal({
      isOpen: true,
      type,
      company
    });
    
    await loadUnpaidTrades(company.company_id, type === 'RECEIPT' ? 'SALE' : 'PURCHASE');
  };

  const loadUnpaidTrades = async (companyId, tradeType) => {
    try {
      setLoadingTrades(true);
      const response = await paymentAPI.getUnpaidTrades(companyId, tradeType);
      setUnpaidTrades(response.data.data || []);
    } catch (error) {
      console.error('미결제 전표 조회 오류:', error);
    } finally {
      setLoadingTrades(false);
    }
  };

  // FIFO 방식으로 자동 배분 계산
  const fifoAllocation = useMemo(() => {
    const inputAmount = parseFloat(paymentForm.amount) || 0;
    let remainingAmount = inputAmount;
    const allocations = [];
    
    for (const trade of unpaidTrades) {
      const unpaidAmount = parseFloat(trade.unpaid_amount || 0);
      if (remainingAmount <= 0 || unpaidAmount <= 0) {
        allocations.push({
          ...trade,
          allocatedAmount: 0,
          remainingAfter: unpaidAmount,
          status: 'pending'
        });
        continue;
      }
      
      const allocated = Math.min(remainingAmount, unpaidAmount);
      const remaining = unpaidAmount - allocated;
      
      allocations.push({
        ...trade,
        allocatedAmount: allocated,
        remainingAfter: remaining,
        status: remaining === 0 ? 'paid' : (allocated > 0 ? 'partial' : 'pending')
      });
      
      remainingAmount -= allocated;
    }
    
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    const currentBalance = paymentModal.company?.balance || 0;
    const balanceAfter = currentBalance - inputAmount;
    
    return {
      allocations,
      totalAllocated,
      balanceAfter,
      inputAmount,
      paidCount: allocations.filter(a => a.status === 'paid').length,
      partialCount: allocations.filter(a => a.status === 'partial').length,
      pendingCount: allocations.filter(a => a.status === 'pending').length
    };
  }, [paymentForm.amount, unpaidTrades, paymentModal.company?.balance]);

  const getUnpaidTotal = () => {
    return unpaidTrades.reduce((sum, t) => sum + parseFloat(t.unpaid_amount || 0), 0);
  };

  // 실제 입금/출금 처리
  const executePayment = async () => {
    const amount = parseFloat(paymentForm.amount);
    
    try {
      const allocationList = fifoAllocation.allocations
        .filter(a => a.allocatedAmount > 0)
        .map(a => ({
          trade_master_id: a.id,
          amount: a.allocatedAmount
        }));

      const data = {
        transaction_date: paymentForm.transaction_date,
        payment_method: paymentForm.payment_method,
        notes: paymentForm.notes,
        company_id: paymentModal.company.company_id,
        transaction_type: paymentModal.type,
        amount: amount,
        allocations: allocationList
      };

      await paymentAPI.createTransactionWithAllocation(data);
      
      setModal({
        isOpen: true,
        type: 'success',
        title: '처리 완료',
        message: `${paymentModal.type === 'RECEIPT' ? '입금' : '출금'}이 처리되었습니다.${allocationList.length > 0 ? ` (${allocationList.length}건 전표 결제)` : ''}`,
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {
          setPaymentModal({ isOpen: false, type: 'RECEIPT', company: null });
          loadBalances();
        }
      });
    } catch (error) {
      console.error('입금/출금 처리 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '처리 실패',
        message: error.response?.data?.message || '처리에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
    }
  };

  const handlePaymentSubmit = async () => {
    const amount = parseFloat(paymentForm.amount);
    if (!paymentForm.amount || paymentForm.amount === '-' || amount === 0) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '입력 오류',
        message: '금액을 입력하세요.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }
    
    // 마이너스 금액인 경우 (기초잔고 설정) - 바로 처리
    if (amount < 0) {
      executePayment();
      return;
    }

    // 잔고 초과 여부 확인
    const currentBalance = paymentModal.company?.balance || 0;
    const isReceipt = paymentModal.type === 'RECEIPT';
    const actionName = isReceipt ? '입금' : '출금';
    
    if (amount > currentBalance) {
      const overAmount = amount - currentBalance;
      const newBalance = currentBalance - amount;
      
      setModal({
        isOpen: true,
        type: 'warning',
        title: '⚠️ 잔고 초과 경고',
        message: `${actionName} 금액이 현재 잔고를 초과합니다.\n\n` +
          `• 현재 잔고: ${formatCurrency(currentBalance)}원\n` +
          `• ${actionName} 금액: ${formatCurrency(amount)}원\n` +
          `• 초과 금액: ${formatCurrency(overAmount)}원\n\n` +
          `${actionName} 후 잔고: ${formatCurrency(Math.abs(newBalance))}원 (${isReceipt ? '선수금' : '선급금'})\n\n` +
          `계속 진행하시겠습니까?`,
        confirmText: '진행',
        showCancel: true,
        onConfirm: executePayment
      });
      return;
    }

    // 잔고 이하면 바로 처리
    await executePayment();
  };

  const handleFullPayment = () => {
    const balance = paymentModal.company?.balance || 0;
    setPaymentForm(prev => ({
      ...prev,
      amount: String(balance),
      displayAmount: formatNumberWithComma(balance)
    }));
  };

  const closePaymentModal = () => {
    setPaymentModal({ isOpen: false, type: 'RECEIPT', company: null });
  };

  // 입출금 내역 조회
  const openHistoryModal = async (company, type) => {
    setHistoryModal({
      isOpen: true,
      company,
      type
    });
    await loadPaymentHistory(company.company_id, type === 'receivable' ? 'RECEIPT' : 'PAYMENT');
  };

  const loadPaymentHistory = async (companyId, transactionType) => {
    try {
      setLoadingHistory(true);
      const response = await paymentAPI.getTransactions({ 
        company_id: companyId,
        transaction_type: transactionType 
      });
      setPaymentHistory(response.data.data || []);
    } catch (error) {
      console.error('입출금 내역 조회 오류:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const closeHistoryModal = () => {
    setHistoryModal({ isOpen: false, company: null, type: null });
    setPaymentHistory([]);
  };

  // 입출금 삭제
  const handleDeleteTransaction = (transaction) => {
    setModal({
      isOpen: true,
      type: 'warning',
      title: '삭제 확인',
      message: `${transaction.transaction_number} 거래를 삭제하시겠습니까?\n\n금액: ${formatCurrency(transaction.amount)}원\n삭제 시 잔고가 복원됩니다.`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await paymentAPI.deleteTransaction(transaction.id);
          setModal({
            isOpen: true,
            type: 'success',
            title: '삭제 완료',
            message: '거래가 삭제되었습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {
              loadPaymentHistory(historyModal.company.company_id, historyModal.type === 'receivable' ? 'RECEIPT' : 'PAYMENT');
              loadBalances();
            }
          });
        } catch (error) {
          console.error('삭제 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '삭제 실패',
            message: error.response?.data?.message || '삭제에 실패했습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {}
          });
        }
      }
    });
  };

  // ESC 키 처리
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editModal.isOpen) {
          setEditModal({ isOpen: false, transaction: null });
        } else if (historyModal.isOpen) {
          closeHistoryModal();
        } else if (paymentModal.isOpen) {
          closePaymentModal();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paymentModal.isOpen, historyModal.isOpen, editModal.isOpen]);

  if (loading && receivables.length === 0 && payables.length === 0) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  const filteredReceivables = getFilteredReceivables();
  const filteredPayables = getFilteredPayables();

  return (
    <div className="company-balances">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="page-title">거래처 잔고 관리</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={hasBalanceOnly}
              onChange={(e) => setHasBalanceOnly(e.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
            잔고 있는 거래처만
          </label>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderLeftColor: '#3498db' }}>
          <h3>미지급금 (매입처)</h3>
          <div className="stat-value" style={{ color: '#2c3e50' }}>
            {formatCurrency(summary.totalPayable)}
            <span style={{ fontSize: '1rem', fontWeight: 'normal', marginLeft: '4px' }}>원</span>
          </div>
          <small style={{ color: '#7f8c8d' }}>{summary.payableCount}개 거래처</small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#3498db' }}>
          <h3>미수금 (매출처)</h3>
          <div className="stat-value" style={{ color: '#2c3e50' }}>
            {formatCurrency(summary.totalReceivable)}
            <span style={{ fontSize: '1rem', fontWeight: 'normal', marginLeft: '4px' }}>원</span>
          </div>
          <small style={{ color: '#7f8c8d' }}>{summary.receivableCount}개 거래처</small>
        </div>
      </div>

      {/* 좌우 분할 목록 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* 왼쪽: 매입처 (미지급금) */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '2px solid #3498db'
          }}>
            <h3 style={{ margin: 0, color: '#2c3e50' }}>매입처 (미지급금)</h3>
            <span style={{ 
              backgroundColor: '#ebf5fb', 
              color: '#3498db', 
              padding: '4px 12px', 
              borderRadius: '20px',
              fontSize: '0.9rem',
              fontWeight: '600'
            }}>
              {summary.payableCount}건
            </span>
          </div>
          
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="거래처명 검색..."
              value={searchPayable}
              onChange={(e) => setSearchPayable(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>거래처명</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px' }}>최근거래</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: '120px' }}>미지급금</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '110px' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayables.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#7f8c8d' }}>
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredPayables.map((item) => (
                    <tr key={`payable-${item.company_id}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px 8px', fontWeight: '500' }}>
                        {item.company_name}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.85rem', color: '#7f8c8d' }}>
                        {item.last_transaction_date || '-'}
                      </td>
                      <td style={{ 
                        padding: '10px 8px', 
                        textAlign: 'right',
                        color: item.balance > 0 ? '#2c3e50' : '#7f8c8d',
                        fontWeight: item.balance > 0 ? '600' : '400'
                      }}>
                        {item.balance > 0 ? formatCurrency(item.balance) + '원' : '-'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'nowrap' }}>
                          {item.balance > 0 && (
                            <button 
                              className="btn btn-sm btn-primary"
                              onClick={() => openPaymentModal(item, 'PAYMENT')}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                            >
                              출금
                            </button>
                          )}
                          <button 
                            className="btn btn-sm"
                            onClick={() => openHistoryModal(item, 'payable')}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#7f8c8d', color: 'white', border: 'none', whiteSpace: 'nowrap' }}
                          >
                            내역
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {filteredPayables.length > 0 && (
            <div style={{ 
              marginTop: '0.75rem', 
              padding: '0.75rem', 
              backgroundColor: '#34495e',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '0.9rem', color: 'white' }}>
                {filteredPayables.length}개 거래처
              </span>
              <span style={{ fontWeight: '700', color: 'white' }}>
                합계: {formatCurrency(filteredPayables.reduce((sum, item) => sum + item.balance, 0))}원
              </span>
            </div>
          )}
        </div>

        {/* 오른쪽: 매출처 (미수금) */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '2px solid #3498db'
          }}>
            <h3 style={{ margin: 0, color: '#2c3e50' }}>매출처 (미수금)</h3>
            <span style={{ 
              backgroundColor: '#ebf5fb', 
              color: '#3498db', 
              padding: '4px 12px', 
              borderRadius: '20px',
              fontSize: '0.9rem',
              fontWeight: '600'
            }}>
              {summary.receivableCount}건
            </span>
          </div>
          
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="거래처명 검색..."
              value={searchReceivable}
              onChange={(e) => setSearchReceivable(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>거래처명</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px' }}>최근거래</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: '120px' }}>미수금</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '110px' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceivables.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#7f8c8d' }}>
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredReceivables.map((item) => (
                    <tr key={`receivable-${item.company_id}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px 8px', fontWeight: '500' }}>
                        {item.company_name}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.85rem', color: '#7f8c8d' }}>
                        {item.last_transaction_date || '-'}
                      </td>
                      <td style={{ 
                        padding: '10px 8px', 
                        textAlign: 'right',
                        color: item.balance > 0 ? '#2c3e50' : '#7f8c8d',
                        fontWeight: item.balance > 0 ? '600' : '400'
                      }}>
                        {item.balance > 0 ? formatCurrency(item.balance) + '원' : '-'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'nowrap' }}>
                          {item.balance > 0 && (
                            <button 
                              className="btn btn-sm btn-primary"
                              onClick={() => openPaymentModal(item, 'RECEIPT')}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                            >
                              입금
                            </button>
                          )}
                          <button 
                            className="btn btn-sm"
                            onClick={() => openHistoryModal(item, 'receivable')}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#7f8c8d', color: 'white', border: 'none', whiteSpace: 'nowrap' }}
                          >
                            내역
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {filteredReceivables.length > 0 && (
            <div style={{ 
              marginTop: '0.75rem', 
              padding: '0.75rem', 
              backgroundColor: '#34495e',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '0.9rem', color: 'white' }}>
                {filteredReceivables.length}개 거래처
              </span>
              <span style={{ fontWeight: '700', color: 'white' }}>
                합계: {formatCurrency(filteredReceivables.reduce((sum, item) => sum + item.balance, 0))}원
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 입금/출금 모달 */}
      {paymentModal.isOpen && (
        <div className="modal-overlay">
          <div 
            className="modal-container" 
            style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* 거래처명 강조 헤더 */}
            <div style={{ 
              backgroundColor: paymentModal.type === 'RECEIPT' ? '#27ae60' : '#3498db',
              color: 'white',
              padding: '1rem 1.5rem',
              margin: '-1.5rem -1.5rem 1.5rem -1.5rem',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <span style={{ fontSize: '2rem' }}>
                {paymentModal.type === 'RECEIPT' ? '💰' : '💸'}
              </span>
              <div>
                <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                  {paymentModal.type === 'RECEIPT' ? '입금 처리' : '출금 처리'}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>
                  {paymentModal.company?.company_name}
                </div>
              </div>
            </div>
            
            {/* 현재 잔액 및 입금 후 잔액 표시 */}
            <div style={{ 
              marginBottom: '1rem', 
              padding: '1rem', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1rem',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ color: '#7f8c8d', fontSize: '0.85rem', marginBottom: '4px' }}>
                  현재 {paymentModal.type === 'RECEIPT' ? '미수금' : '미지급금'}
                </div>
                <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#2c3e50' }}>
                  {formatCurrency(paymentModal.company?.balance)}원
                </div>
              </div>
              <div>
                <div style={{ color: '#7f8c8d', fontSize: '0.85rem', marginBottom: '4px' }}>
                  {paymentModal.type === 'RECEIPT' ? '입금' : '출금'} 금액
                </div>
                <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#3498db' }}>
                  {paymentForm.amount ? formatCurrency(paymentForm.amount) + '원' : '-'}
                </div>
              </div>
              <div>
                <div style={{ color: '#7f8c8d', fontSize: '0.85rem', marginBottom: '4px' }}>
                  {paymentModal.type === 'RECEIPT' ? '입금' : '출금'} 후 잔액
                </div>
                <div style={{ 
                  fontWeight: '700', 
                  fontSize: '1.1rem', 
                  color: fifoAllocation.balanceAfter <= 0 ? '#27ae60' : '#e74c3c'
                }}>
                  {paymentForm.amount ? formatCurrency(Math.max(0, fifoAllocation.balanceAfter)) + '원' : '-'}
                </div>
              </div>
            </div>
            
            <div style={{ textAlign: 'left' }}>
              {/* 기본 정보 입력 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>거래일자</label>
                  <input
                    type="date"
                    value={paymentForm.transaction_date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, transaction_date: e.target.value })}
                  />
                </div>
                
                <div className="form-group">
                  <label className="required">금액</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={paymentForm.displayAmount}
                      onChange={handleAmountChange}
                      placeholder="0"
                      style={{ textAlign: 'right', flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handleFullPayment}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#27ae60',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85rem'
                      }}
                    >
                      전액
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>결제방법</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                  >
                    <option value="현금">현금</option>
                    <option value="계좌이체">계좌이체</option>
                    <option value="카드">카드</option>
                    <option value="어음">어음</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>비고</label>
                  <input
                    type="text"
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    placeholder="메모"
                  />
                </div>
              </div>

              {/* 전표 결제 미리보기 */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#2c3e50', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📋 전표 결제 미리보기</span>
                  {paymentForm.amount && fifoAllocation.paidCount > 0 && (
                    <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#27ae60' }}>
                      {fifoAllocation.paidCount}건 완납{fifoAllocation.partialCount > 0 ? `, ${fifoAllocation.partialCount}건 부분결제` : ''}
                    </span>
                  )}
                </h4>
                
                {loadingTrades ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#7f8c8d' }}>
                    불러오는 중...
                  </div>
                ) : unpaidTrades.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#7f8c8d', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                    미결제 전표가 없습니다.
                  </div>
                ) : (
                  <>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '6px' }}>
                      <table style={{ width: '100%', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>전표번호</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>거래일</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>미결제</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>결제예정</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fifoAllocation.allocations.map((trade) => (
                            <tr 
                              key={trade.id} 
                              style={{ 
                                borderBottom: '1px solid #eee',
                                backgroundColor: trade.status === 'paid' ? '#e8f8f0' : 
                                                trade.status === 'partial' ? '#fef9e7' : 'white'
                              }}
                            >
                              <td style={{ padding: '8px' }}>{trade.trade_number}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                {trade.trade_date?.split('T')[0]}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>
                                {formatCurrency(trade.unpaid_amount)}
                              </td>
                              <td style={{ 
                                padding: '8px', 
                                textAlign: 'right',
                                fontWeight: trade.allocatedAmount > 0 ? '600' : '400',
                                color: trade.allocatedAmount > 0 ? '#27ae60' : '#bdc3c7'
                              }}>
                                {trade.allocatedAmount > 0 ? formatCurrency(trade.allocatedAmount) : '-'}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                {trade.status === 'paid' && (
                                  <span style={{ 
                                    backgroundColor: '#27ae60', 
                                    color: 'white', 
                                    padding: '2px 8px', 
                                    borderRadius: '10px',
                                    fontSize: '0.75rem'
                                  }}>완납</span>
                                )}
                                {trade.status === 'partial' && (
                                  <span style={{ 
                                    backgroundColor: '#f39c12', 
                                    color: 'white', 
                                    padding: '2px 8px', 
                                    borderRadius: '10px',
                                    fontSize: '0.75rem'
                                  }}>부분</span>
                                )}
                                {trade.status === 'pending' && (
                                  <span style={{ 
                                    backgroundColor: '#bdc3c7', 
                                    color: 'white', 
                                    padding: '2px 8px', 
                                    borderRadius: '10px',
                                    fontSize: '0.75rem'
                                  }}>대기</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* 합계 */}
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.75rem', 
                      backgroundColor: '#34495e', 
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: 'white'
                    }}>
                      <span>
                        총 미결제: <strong>{formatCurrency(getUnpaidTotal())}원</strong>
                        <span style={{ marginLeft: '10px', color: '#bdc3c7' }}>({unpaidTrades.length}건)</span>
                      </span>
                      <span>
                        결제 예정: <strong style={{ color: '#2ecc71' }}>
                          {formatCurrency(fifoAllocation.totalAllocated)}원
                        </strong>
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div className="modal-buttons" style={{ marginTop: '1.5rem' }}>
              <button 
                className="modal-btn modal-btn-cancel"
                onClick={closePaymentModal}
              >
                취소
              </button>
              <button 
                className="modal-btn modal-btn-primary"
                onClick={handlePaymentSubmit}
              >
                {paymentModal.type === 'RECEIPT' ? '입금' : '출금'} 처리
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 입출금 내역 모달 */}
      {historyModal.isOpen && (
        <div className="modal-overlay">
          <div 
            className="modal-container" 
            style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{ 
              backgroundColor: '#34495e',
              color: 'white',
              padding: '1rem 1.5rem',
              margin: '-1.5rem -1.5rem 1.5rem -1.5rem',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📜</span>
                <div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                    {historyModal.type === 'receivable' ? '입금 내역' : '출금 내역'}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '700' }}>
                    {historyModal.company?.company_name}
                  </div>
                </div>
              </div>
              <button
                onClick={closeHistoryModal}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ×
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#7f8c8d' }}>
                불러오는 중...
              </div>
            ) : paymentHistory.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#7f8c8d' }}>
                {historyModal.type === 'receivable' ? '입금' : '출금'} 내역이 없습니다.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>거래번호</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>거래일</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>금액</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>결제방법</th>
                      <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>비고</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '80px' }}>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((tx) => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {tx.transaction_number}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {tx.transaction_date?.split('T')[0]}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '600', color: '#2c3e50' }}>
                          {formatCurrency(tx.amount)}원
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {tx.payment_method || '-'}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#7f8c8d', fontSize: '0.85rem' }}>
                          {tx.notes || '-'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteTransaction(tx)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.75rem',
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* 합계 */}
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  backgroundColor: '#34495e', 
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: 'white'
                }}>
                  <span>{paymentHistory.length}건</span>
                  <span>
                    합계: <strong>{formatCurrency(paymentHistory.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0))}원</strong>
                  </span>
                </div>
              </div>
            )}

            <div className="modal-buttons" style={{ marginTop: '1.5rem' }}>
              <button 
                className="modal-btn modal-btn-cancel"
                onClick={closeHistoryModal}
              >
                닫기
              </button>
              <button 
                className="modal-btn modal-btn-primary"
                onClick={() => {
                  closeHistoryModal();
                  openPaymentModal(historyModal.company, historyModal.type === 'receivable' ? 'RECEIPT' : 'PAYMENT');
                }}
              >
                {historyModal.type === 'receivable' ? '입금' : '출금'} 등록
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={modal.isOpen}
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        confirmText={modal.confirmText}
        showCancel={modal.showCancel}
      />
    </div>
  );
}

export default CompanyBalances;
