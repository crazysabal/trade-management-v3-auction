import React, { useState, useEffect, useMemo } from 'react';
import { paymentAPI, tradeAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import useDraggable from '../hooks/useDraggable';
import UnsettledPrintModal from '../components/UnsettledPrintModal';

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
  const [checkedCompanies, setCheckedCompanies] = useState([]);

  const toggleCheck = (id) => {
    setCheckedCompanies(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const [unsettledModal, setUnsettledModal] = useState({
    isOpen: false,
    data: [] // { company, trades: [ { master, details } ] }
  });
  const [loadingUnsettled, setLoadingUnsettled] = useState(false);

  // 드래그 훅 적용 (hooks/useDraggable.js 사양에 맞춤)
  const unsettledDrag = useDraggable();

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
    onConfirm: () => { },
    confirmText: '확인',
    showCancel: false
  });
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

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

      const receivableWithBalance = receivableList.filter(item => item.balance !== 0);
      const payableWithBalance = payableList.filter(item => item.balance !== 0);

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

  const handleRefresh = () => {
    setSearchReceivable('');
    setSearchPayable('');
    setCheckedCompanies([]);
    loadBalances();
  };

  const toggleSelectAll = (type, isSelected) => {
    const list = type === 'receivable' ? getFilteredReceivables() : getFilteredPayables();
    const ids = list.map(item => item.company_id);

    if (isSelected) {
      setCheckedCompanies(prev => [...new Set([...prev, ...ids])]);
    } else {
      setCheckedCompanies(prev => prev.filter(id => !ids.includes(id)));
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  const getFilteredReceivables = () => {
    return receivables.filter(item => {
      // 검색 필터
      if (searchReceivable && !item.company_name.toLowerCase().includes(searchReceivable.toLowerCase())
        && !item.company_code?.toLowerCase().includes(searchReceivable.toLowerCase())) {
        return false;
      }
      // 잔고 필터 (0원 제외)
      return item.balance !== 0;
    });
  };

  const getFilteredPayables = () => {
    return payables.filter(item => {
      // 검색 필터
      if (searchPayable && !item.company_name.toLowerCase().includes(searchPayable.toLowerCase())
        && !item.company_code?.toLowerCase().includes(searchPayable.toLowerCase())) {
        return false;
      }
      // 잔고 필터 (0원 제외)
      return item.balance !== 0;
    });
  };


  // 입출금 및 전표 통합 내역(원장) 조회
  const openHistoryModal = async (company, type) => {
    setHistoryModal({
      isOpen: true,
      company,
      type
    });
    await loadLedger(company.company_id);
  };

  const loadLedger = async (companyId) => {
    try {
      setLoadingHistory(true);
      const response = await paymentAPI.getLedger(companyId);
      setPaymentHistory(response.data.transactions || []);
    } catch (error) {
      console.error('거래처 원장 조회 오류:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 잔고 0원 이후 전표 상세 내역 조회 로직
  const handleViewUnsettledDetails = async () => {
    if (checkedCompanies.length === 0) return;

    // 모달 열기 전 드래그 위치 초기화
    if (unsettledDrag.setPosition) {
      unsettledDrag.setPosition({ x: 0, y: 0 });
    }

    try {
      setLoadingUnsettled(true);
      const results = [];

      for (const companyId of checkedCompanies) {
        // 1. 해당 업체의 원장 데이터 가져오기
        const ledgerRes = await paymentAPI.getLedger(companyId);
        const { company, transactions } = ledgerRes.data.data;

        // 2. 현재 잔고 확인
        const balancesRes = await paymentAPI.getBalances({});
        const companyBalance = balancesRes.data.data.find(b => b.company_id === companyId);
        // 품목 상세를 보려는 쪽의 잔고 (receivable - payable)
        // 여기서는 통합 기준 잔고를 역산함
        let currentBalance = (parseFloat(companyBalance?.receivable || 0) - parseFloat(companyBalance?.payable || 0));

        const targetItems = []; // { type: 'trade'|'payment', data: object, date: string }
        // 3. 역산하며 0원 시점 찾기
        // transactions는 최신순(DESC)으로 정렬되어 있음
        for (const tx of transactions) {
          if (tx.reference.startsWith('SAL') || tx.reference.startsWith('PUR')) {
            targetItems.push({ type: 'trade', reference: tx.reference, date: tx.date });
          } else if (tx.reference.startsWith('REC') || tx.reference.startsWith('PAY')) {
            targetItems.push({ type: 'payment', reference: tx.reference, date: tx.date, tx: tx });
          }

          // 역산: 이전 잔고 = 현재 잔고 - (이번 거래의 영향)
          currentBalance = currentBalance - (parseFloat(tx.debit || 0) - parseFloat(tx.credit || 0));

          // 잔고가 0이 되거나 부호가 바뀌면 (정확히 0이 아닐 수 있으므로) 중단
          if (Math.abs(currentBalance) < 1) break;
        }

        // 4. 상세 정보 수집 (전표 품목 + 입출금 상세)
        const combinedDetails = [];
        for (const item of targetItems) {
          if (item.type === 'trade') {
            const searchRes = await tradeAPI.getAll({ search: item.reference });
            const tradeMaster = searchRes.data.data.find(t => t.trade_number === item.reference);
            if (tradeMaster) {
              const detailRes = await tradeAPI.getById(tradeMaster.id);
              combinedDetails.push({
                type: 'trade',
                ...detailRes.data.data
              });
            }
          } else if (item.type === 'payment') {
            // 입출금 데이터는 Ledger API에서 온 정보를 그대로 사용하거나 추가 조인 가능
            combinedDetails.push({
              type: 'payment',
              reference: item.reference,
              date: item.date,
              description: item.tx.description,
              debit: item.tx.debit,
              credit: item.tx.credit,
              payment_method: item.tx.payment_method
            });
          }
        }

        results.push({
          company,
          details: combinedDetails // 날짜순 정렬은 모달 내에서 처리하거나 여기서 수행
        });
      }

      setUnsettledModal({
        isOpen: true,
        data: results
      });
    } catch (error) {
      console.error('미결제 상세 조회 오류:', error);
      setModal({
        isOpen: true,
        type: 'error',
        title: '조회 오류',
        message: '전표 상세 내역을 불러오는 중 오류가 발생했습니다.',
        confirmText: '확인'
      });
    } finally {
      setLoadingUnsettled(false);
    }
  };



  const closeHistoryModal = () => {
    setHistoryModal({ isOpen: false, company: null, type: null });
    setPaymentHistory([]);
  };

  // ESC 키 처리
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // 상위 모달(인쇄 미리보기, 알림창)이 열려 있으면 해당 모달의 자체 ESC 처리에 맡김
        if (isPrintModalOpen || modal.isOpen) return;

        if (historyModal.isOpen) {
          closeHistoryModal();
        } else if (unsettledModal.isOpen) {
          setUnsettledModal({ isOpen: false, data: [] });
        } else if (editModal.isOpen) {
          setEditModal({ isOpen: false, transaction: null });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyModal.isOpen, editModal.isOpen, unsettledModal.isOpen, isPrintModalOpen, modal.isOpen]);

  if (loading && receivables.length === 0 && payables.length === 0) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  const filteredReceivables = getFilteredReceivables();
  const filteredPayables = getFilteredPayables();

  return (
    <div className="company-balances">


      {/* 상단 컨트롤 영역 */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
        width: '100%',
        padding: '0 0.5rem'
      }}>
        <button
          className="btn"
          onClick={handleViewUnsettledDetails}
          disabled={checkedCompanies.length === 0 || loadingUnsettled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 14px',
            fontSize: '0.85rem',
            fontWeight: '600',
            backgroundColor: checkedCompanies.length > 0 ? '#2c3e50' : '#e2e8f0',
            color: checkedCompanies.length > 0 ? 'white' : '#94a3b8',
            borderRadius: '6px',
            border: 'none',
            cursor: checkedCompanies.length > 0 ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            flex: 'none',
            width: 'fit-content'
          }}
        >
          {loadingUnsettled ? '📦 분석 중...' : '📝 전표 상세 조회'}
        </button>

        <button
          className="btn btn-primary"
          onClick={handleRefresh}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '0.85rem',
            fontWeight: '600',
            backgroundColor: '#3498db',
            borderRadius: '6px',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            transition: 'all 0.2s',
            flex: 'none',
            width: 'fit-content'
          }}
        >
          🔄 새로고침
        </button>
      </div>

      {/* 요약 카드 */}


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
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={filteredPayables.length > 0 && filteredPayables.every(item => checkedCompanies.includes(item.company_id))}
                      onChange={(e) => toggleSelectAll('payable', e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'left' }}>거래처명</th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: '90px' }}>최근거래</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right', width: '120px' }}>미지급금</th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: '60px' }}>액션</th>
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
                  filteredPayables.map((item, index) => (
                    <tr
                      key={`payable-${item.company_id}`}
                      style={{
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                        borderTop: index > 0 ? '2px solid #e2e8f0' : 'none'
                      }}
                    >
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={checkedCompanies.includes(item.company_id)}
                          onChange={() => toggleCheck(item.company_id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '8px 8px', fontWeight: '500' }}>
                        {item.company_name}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', fontSize: '0.85rem', color: '#7f8c8d' }}>
                        {item.last_transaction_date || '-'}
                      </td>
                      <td style={{
                        padding: '8px 8px',
                        textAlign: 'right',
                        color: item.balance < 0 ? '#e74c3c' : (item.balance > 0 ? '#2c3e50' : '#7f8c8d'),
                        fontWeight: item.balance !== 0 ? '600' : '400'
                      }}>
                        {item.balance !== 0 ? formatCurrency(item.balance) + '원' : '-'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'nowrap' }}>

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
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={filteredReceivables.length > 0 && filteredReceivables.every(item => checkedCompanies.includes(item.company_id))}
                      onChange={(e) => toggleSelectAll('receivable', e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'left' }}>거래처명</th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: '90px' }}>최근거래</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right', width: '120px' }}>미수금</th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: '60px' }}>액션</th>
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
                  filteredReceivables.map((item, index) => (
                    <tr
                      key={`receivable-${item.company_id}`}
                      style={{
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                        borderTop: index > 0 ? '2px solid #e2e8f0' : 'none'
                      }}
                    >
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={checkedCompanies.includes(item.company_id)}
                          onChange={() => toggleCheck(item.company_id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '8px 8px', fontWeight: '500' }}>
                        {item.company_name}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', fontSize: '0.85rem', color: '#7f8c8d' }}>
                        {item.last_transaction_date || '-'}
                      </td>
                      <td style={{
                        padding: '8px 8px',
                        textAlign: 'right',
                        color: item.balance < 0 ? '#e74c3c' : (item.balance > 0 ? '#2c3e50' : '#7f8c8d'),
                        fontWeight: item.balance !== 0 ? '600' : '400'
                      }}>
                        {item.balance !== 0 ? formatCurrency(item.balance) + '원' : '-'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'nowrap' }}>

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



      {/* 입출금 내역 모달 */}
      {historyModal.isOpen && (
        <div className="premium-modal-overlay">
          <div
            className="premium-modal-container"
            style={{ maxWidth: '850px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더: 아이콘 + 제목 + 부제목 */}
            <div className="premium-modal-header" style={{ paddingBottom: '1.5rem' }}>
              <div className="premium-modal-icon">
                <span role="img" aria-label="history">📜</span>
              </div>
              <h2 className="premium-modal-title">
                {historyModal.company?.company_name} - 상세 원장
              </h2>
              <p className="premium-modal-subtitle" style={{ fontWeight: '600', color: '#1e293b', marginTop: '0.25rem' }}>
                전표 및 입출금 통합 이력
              </p>
            </div>

            <div className="premium-modal-body" style={{ padding: '0 2rem 1.5rem 2rem' }}>
              {loadingHistory ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  데이터를 불러오는 중...
                </div>
              ) : paymentHistory.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  상세 내역이 없습니다.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 1rem', textAlign: 'center', color: '#475569', fontWeight: '600', width: '110px', whiteSpace: 'nowrap' }}>거래일</th>
                        <th style={{ padding: '12px 1rem', textAlign: 'left', color: '#475569', fontWeight: '600', width: '100px', whiteSpace: 'nowrap' }}>구분</th>
                        <th style={{ padding: '12px 1rem', textAlign: 'right', color: '#475569', fontWeight: '600', width: '120px', whiteSpace: 'nowrap' }}>매출 / 출금</th>
                        <th style={{ padding: '12px 1rem', textAlign: 'right', color: '#475569', fontWeight: '600', width: '120px', whiteSpace: 'nowrap' }}>매입 / 입금</th>
                        <th style={{ padding: '12px 1rem', textAlign: 'left', color: '#475569', fontWeight: '600', whiteSpace: 'nowrap' }}>비고/참조</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((tx, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 1rem', textAlign: 'center', color: '#475569', whiteSpace: 'nowrap' }}>
                            {tx.date?.split('T')[0]}
                          </td>
                          <td style={{ padding: '12px 1rem' }}>
                            <span style={{
                              backgroundColor: tx.type === '매출' || tx.type === '입금' ? '#e6fffa' : '#fff5f5',
                              color: tx.type === '매출' || tx.type === '입금' ? '#047481' : '#c53030',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              whiteSpace: 'nowrap'
                            }}>
                              {tx.type}
                            </span>
                          </td>
                          <td style={{ padding: '12px 1rem', textAlign: 'right', color: tx.debit > 0 ? '#1e293b' : '#94a3b8' }}>
                            {tx.debit > 0 ? formatCurrency(tx.debit) + '원' : '-'}
                          </td>
                          <td style={{ padding: '12px 1rem', textAlign: 'right', color: tx.credit > 0 ? '#1e293b' : '#94a3b8' }}>
                            {tx.credit > 0 ? formatCurrency(tx.credit) + '원' : '-'}
                          </td>
                          <td style={{ padding: '12px 1rem', color: '#64748b', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontFamily: 'monospace' }}>{tx.reference}</span>
                              <span style={{ marginTop: '2px' }}>{tx.description || '-'}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                        <td colSpan="2" style={{ padding: '12px 1rem', fontWeight: '600', color: '#475569', whiteSpace: 'nowrap' }}>
                          총 {paymentHistory.length}건
                        </td>
                        <td style={{ padding: '12px 1rem', textAlign: 'right', fontWeight: '800', color: '#475569' }}>
                          {formatCurrency(paymentHistory.reduce((sum, tx) => sum + parseFloat(tx.debit || 0), 0))}원
                        </td>
                        <td style={{ padding: '12px 1rem', textAlign: 'right', fontWeight: '800', color: '#475569' }}>
                          {formatCurrency(paymentHistory.reduce((sum, tx) => sum + parseFloat(tx.credit || 0), 0))}원
                        </td>
                        <td style={{ padding: '12px 1rem', textAlign: 'right', fontWeight: '800', color: '#2563eb', fontSize: '1rem' }}>
                          잔액: {formatCurrency(
                            paymentHistory.reduce((sum, tx) => sum + (parseFloat(tx.debit || 0) - parseFloat(tx.credit || 0)), 0)
                          )}원
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="premium-modal-footer">
              <button
                className="premium-modal-btn premium-btn-primary"
                onClick={closeHistoryModal}
                style={{ flex: 'none', width: '120px', marginLeft: 'auto' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미결제 전표 상세 내역 모달 */}
      {unsettledModal.isOpen && (
        <div className="premium-modal-overlay" style={{ display: 'block' }}>
          <div
            ref={unsettledDrag.modalRef}
            className="premium-modal-container"
            style={{
              width: 'fit-content',
              minWidth: '600px',
              maxWidth: '95vw',
              maxHeight: '85vh',
              position: 'fixed',
              top: `calc(50% + ${unsettledDrag.position.y}px)`,
              left: `calc(50% + ${unsettledDrag.position.x}px)`,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'none', // CSS 라이브러리의 slideUp 애니메이션과 transform 충돌(깜빡임) 방지
              margin: 0
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="premium-modal-header"
              onMouseDown={unsettledDrag.handleMouseDown}
              style={{ cursor: 'grab' }}
            >
              <div className="premium-modal-icon">
                <span role="img" aria-label="details">📝</span>
              </div>
              <h2 className="premium-modal-title">미결제 전표 상세 내역</h2>
            </div>

            <div className="premium-modal-body" style={{ overflowY: 'auto' }}>
              {unsettledModal.data.map((res, cIdx) => (
                <div key={cIdx} style={{ marginBottom: '2rem' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    borderLeft: '4px solid #3498db'
                  }}>
                    <span style={{ fontWeight: '700', fontSize: '1.1rem', color: '#1e293b' }}>{res.company.company_name}</span>
                  </div>

                  {res.details.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      표시할 미결제 내역이 없습니다.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead style={{ backgroundColor: '#f8fafc' }}>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', whiteSpace: 'nowrap', width: '80px' }}>일자</th>
                            <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', whiteSpace: 'nowrap' }}>품목명</th>
                            <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', whiteSpace: 'nowrap', width: '120px' }}>출하주</th>
                            <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', whiteSpace: 'nowrap', width: '120px' }}>등급</th>
                            <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', width: '80px' }}>수량</th>
                            <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', width: '100px' }}>단가</th>
                            <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', width: '120px' }}>금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {res.details.flatMap(item => {
                            if (item.type === 'trade') {
                              return item.details.map(detail => ({
                                ...detail,
                                rowType: 'trade',
                                date: item.master.trade_date,
                                trade_type: item.master.trade_type
                              }));
                            } else {
                              return [{
                                rowType: 'payment',
                                date: item.date,
                                description: item.description,
                                debit: item.debit,
                                credit: item.credit,
                                reference: item.reference,
                                payment_method: item.payment_method
                              }];
                            }
                          }).sort((a, b) => {
                            const dateA = a.date.substring(0, 10);
                            const dateB = b.date.substring(0, 10);
                            if (dateA !== dateB) return dateA.localeCompare(dateB);

                            const pA = a.rowType === 'payment' ? 1 : 0;
                            const pB = b.rowType === 'payment' ? 1 : 0;
                            return pA - pB;
                          }).map((item, iIdx) => {
                            if (item.rowType === 'trade') {
                              const amount = item.total_price ? parseFloat(item.total_price) : (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0));
                              const sign = item.trade_type === 'SALE' ? 1 : -1;
                              return (
                                <tr key={iIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                    {item.date ? item.date.substring(5) : '-'}
                                  </td>
                                  <td style={{ padding: '10px 16px', color: '#1e293b', whiteSpace: 'nowrap' }}>
                                    {item.product_name} {Number(item.product_weight || 0) > 0 ? `${Number(item.product_weight).toString()}kg` : ''}
                                  </td>
                                  <td style={{ padding: '10px 16px', color: '#475569', whiteSpace: 'nowrap' }}>{item.sender_name || '-'}</td>
                                  <td style={{ padding: '10px 16px', color: '#475569', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                    {item.grade} {item.size && `(${item.size})`}
                                  </td>
                                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '600' }}>
                                    {parseFloat(item.quantity || 0).toString()}
                                  </td>
                                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: item.trade_type === 'SALE' ? '#0f172a' : '#ef4444' }}>
                                    {formatCurrency(amount * sign)}
                                  </td>
                                </tr>
                              );
                            } else {
                              const amount = parseFloat(item.debit || 0) - parseFloat(item.credit || 0);
                              const isDeposit = parseFloat(item.credit || 0) > 0;
                              return (
                                <tr key={iIdx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#f0f9ff' }}>
                                  <td style={{ padding: '10px 16px', color: '#0369a1', fontSize: '0.8rem' }}>{item.date?.substring(5, 10)}</td>
                                  <td colSpan="5" style={{ padding: '10px 16px', color: '#0369a1', fontWeight: '700' }}>
                                    [{isDeposit ? '입금' : '출금'}] {item.description || `(${item.payment_method})`}
                                  </td>
                                  <td style={{
                                    padding: '10px 16px',
                                    textAlign: 'right',
                                    fontWeight: '800',
                                    color: amount < 0 ? '#ef4444' : '#0369a1'
                                  }}>
                                    {formatCurrency(amount)}
                                  </td>
                                </tr>
                              );
                            }
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                            <td colSpan="6" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap' }}>
                              합계 :
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '800', color: '#2563eb', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                              {formatCurrency(res.details.reduce((sum, item) => {
                                if (item.type === 'trade') {
                                  const tAmt = item.details.reduce((s, d) => {
                                    const amt = d.total_price ? parseFloat(d.total_price) : (parseFloat(d.quantity || 0) * parseFloat(d.unit_price || 0));
                                    return s + amt;
                                  }, 0);
                                  return sum + (item.master.trade_type === 'SALE' ? tAmt : -tAmt);
                                } else {
                                  return sum + (parseFloat(item.debit || 0) - parseFloat(item.credit || 0));
                                }
                              }, 0))}원
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="premium-modal-footer">
              <div style={{ marginRight: 'auto', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>조회 업체: {unsettledModal.data.length}개</span>
                <span style={{ fontSize: '1rem', fontWeight: '700', color: '#2563eb' }}>
                  미정산 총액: {new Intl.NumberFormat('ko-KR').format(unsettledModal.data.reduce((acc, curr) => {
                    const total = curr.details.reduce((sum, item) => {
                      if (item.type === 'trade') {
                        const amt = item.details.reduce((s, d) => s + (d.total_price || (d.quantity * d.unit_price)), 0);
                        return sum + (item.master.trade_type === 'SALE' ? amt : -amt);
                      } else {
                        return sum + (item.debit - item.credit);
                      }
                    }, 0);
                    return acc + total;
                  }, 0))}원
                </span>
              </div>
              <button
                className="premium-modal-btn premium-btn-primary"
                onClick={() => setIsPrintModalOpen(true)}
                style={{ width: 'auto', height: '40px', padding: '0 1.5rem', fontSize: '0.95rem', flex: 'none' }}
              >
                🖨️ 인쇄 미리보기
              </button>
              <button
                className="premium-modal-btn premium-btn-secondary"
                onClick={() => setUnsettledModal({ isOpen: false, data: [] })}
                style={{ width: '100px', height: '40px', padding: '0', fontSize: '0.95rem', flex: 'none' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <UnsettledPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        data={unsettledModal.data}
      />

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
