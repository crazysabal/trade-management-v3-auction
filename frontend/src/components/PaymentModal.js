import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { paymentAPI } from '../services/api';

/**
 * 입금/출금 설정 공통 모달
 * 
 * @param {boolean} isOpen - 모달 열림 여부
 * @param {function} onClose - 모달 닫기 함수
 * @param {function} onConfirm - 확인 시 실행 함수 (paymentData 전달)
 * @param {boolean} isPurchase - 매입(출금) 여부. false면 매출(입금)
 * @param {string} companyId - 거래처 ID
 * @param {string} companyName - 거래처명
 * @param {string} tradeDate - 거래일자
 * @param {object} companySummary - 거래처 잔고 요약 정보
 * @param {object} initialPayment - 초기 입금/출금 설정 { amount, displayAmount, payment_method, notes }
 */
const PaymentModal = ({
  isOpen,
  onClose,
  onConfirm,
  isPurchase = false,
  companyId,
  companyName,
  tradeDate,
  companySummary,
  initialPayment = { amount: '', displayAmount: '', payment_method: '계좌이체', notes: '' }
}) => {
  // 입금/출금 상태
  const [payment, setPayment] = useState(initialPayment);

  // 미결제 전표 목록
  const [unpaidTrades, setUnpaidTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

  // 모달 열릴 때 초기화 및 미결제 전표 로드
  useEffect(() => {
    if (isOpen) {
      setPayment(initialPayment);
      loadUnpaidTrades();
    }
  }, [isOpen, companyId]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // 미결제 전표 로드
  const loadUnpaidTrades = async () => {
    if (!companyId) return;

    setLoadingTrades(true);
    try {
      const tradeType = isPurchase ? 'PURCHASE' : 'SALE';
      const response = await paymentAPI.getUnpaidTrades(companyId, tradeType);
      setUnpaidTrades(response.data.data || []);
    } catch (error) {
      console.error('미결제 전표 조회 오류:', error);
      setUnpaidTrades([]);
    }
    setLoadingTrades(false);
  };

  // 금액 입력 핸들러
  const handleAmountChange = (e) => {
    const rawValue = e.target.value.replace(/[^\d]/g, '');
    const numericValue = parseInt(rawValue) || 0;
    setPayment(prev => ({
      ...prev,
      amount: rawValue,
      displayAmount: numericValue > 0 ? formatCurrency(numericValue) : ''
    }));
  };

  // 전액 입력
  const handleFullPayment = () => {
    if (!companySummary?.final_balance) return;
    const fullAmount = companySummary.final_balance;
    setPayment(prev => ({
      ...prev,
      amount: String(fullAmount),
      displayAmount: formatCurrency(fullAmount)
    }));
  };

  // 숫자 포맷
  const formatCurrency = (value) => {
    if (!value && value !== 0) return '';
    return new Intl.NumberFormat('ko-KR').format(value);
  };

  // FIFO 자동 배분 계산
  const fifoAllocation = useMemo(() => {
    const amount = parseInt(payment.amount) || 0;
    if (amount === 0 || unpaidTrades.length === 0) {
      return {
        allocations: unpaidTrades.map(t => ({ ...t, allocatedAmount: 0, status: 'pending' })),
        totalAllocated: 0,
        balanceAfter: companySummary?.final_balance || 0,
        paidCount: 0,
        partialCount: 0
      };
    }

    let remaining = amount;
    let paidCount = 0;
    let partialCount = 0;

    const allocations = unpaidTrades.map(trade => {
      const unpaid = parseFloat(trade.unpaid_amount) || 0;

      if (remaining <= 0) {
        return { ...trade, allocatedAmount: 0, status: 'pending' };
      }

      const allocated = Math.min(remaining, unpaid);
      remaining -= allocated;

      let status = 'pending';
      if (allocated >= unpaid) {
        status = 'paid';
        paidCount++;
      } else if (allocated > 0) {
        status = 'partial';
        partialCount++;
      }

      return { ...trade, allocatedAmount: allocated, status };
    });

    return {
      allocations,
      totalAllocated: amount - remaining,
      balanceAfter: (companySummary?.final_balance || 0) - amount,
      paidCount,
      partialCount
    };
  }, [payment.amount, unpaidTrades, companySummary]);

  // 확인 버튼 클릭
  const handleConfirm = () => {
    onConfirm({
      amount: payment.amount,
      displayAmount: payment.displayAmount,
      payment_method: payment.payment_method,
      notes: payment.notes
    });
  };

  // 삭제 버튼 클릭
  const handleDelete = () => {
    onConfirm({
      amount: '',
      displayAmount: '',
      payment_method: '계좌이체',
      notes: ''
    });
  };

  // 취소 버튼 클릭
  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  const transactionLabel = isPurchase ? '출금' : '입금';
  const balanceLabel = isPurchase ? '미지급금' : '미수금';
  const headerColor = isPurchase ? '#3498db' : '#27ae60';
  const icon = isPurchase ? '💸' : '💰';

  return createPortal(
    <div className="modal-overlay">
      <div
        className="modal-container"
        style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', padding: '1.5rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 거래처명 강조 헤더 */}
        <div style={{
          backgroundColor: headerColor,
          color: 'white',
          padding: '1rem 1.5rem',
          margin: '-1.5rem -1.5rem 1.5rem -1.5rem',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <span style={{ fontSize: '2rem' }}>{icon}</span>
          <div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              {transactionLabel} 설정
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>
              {companyName}
            </div>
          </div>
        </div>

        {/* 현재 잔액 및 입금 후 잔액 표시 */}
        {companySummary && (
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
                현재 {balanceLabel}
              </div>
              <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#2c3e50' }}>
                {formatCurrency(companySummary.final_balance)}원
              </div>
            </div>
            <div>
              <div style={{ color: '#7f8c8d', fontSize: '0.85rem', marginBottom: '4px' }}>
                {transactionLabel} 금액
              </div>
              <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#3498db' }}>
                {payment.amount ? formatCurrency(payment.amount) + '원' : '-'}
              </div>
            </div>
            <div>
              <div style={{ color: '#7f8c8d', fontSize: '0.85rem', marginBottom: '4px' }}>
                {transactionLabel} 후 잔액
              </div>
              <div style={{
                fontWeight: '700',
                fontSize: '1.1rem',
                color: fifoAllocation.balanceAfter <= 0 ? '#27ae60' : '#e74c3c'
              }}>
                {payment.amount ? formatCurrency(Math.max(0, fifoAllocation.balanceAfter)) + '원' : '-'}
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'left' }}>
          {/* 기본 정보 입력 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>거래일자</label>
              <input
                type="date"
                value={tradeDate}
                disabled
                style={{ backgroundColor: '#f5f5f5' }}
              />
            </div>

            <div className="form-group">
              <label className="required">금액</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={payment.displayAmount}
                  onChange={handleAmountChange}
                  placeholder="0"
                  style={{ textAlign: 'right', flex: 1 }}
                  autoFocus
                />
                {companySummary && companySummary.final_balance > 0 && (
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
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>결제방법</label>
              <select
                value={payment.payment_method}
                onChange={(e) => setPayment(prev => ({ ...prev, payment_method: e.target.value }))}
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
                value={payment.notes}
                onChange={(e) => setPayment(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="메모"
              />
            </div>
          </div>

          {/* 전표 결제 미리보기 */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#2c3e50', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>📋 전표 결제 미리보기</span>
              {payment.amount && fifoAllocation.paidCount > 0 && (
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
                    총 미결제: <strong>{formatCurrency(unpaidTrades.reduce((sum, t) => sum + parseFloat(t.unpaid_amount || 0), 0))}원</strong>
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

          {/* 안내 메시지 */}
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: '#fff3e0',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: '#e65100',
            textAlign: 'center'
          }}>
            ⚠️ 전표 저장 버튼을 클릭해야 입출금이 처리됩니다.
          </div>
        </div>

        <div className="modal-buttons" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {/* 기존에 설정된 입출금이 있을 때만 삭제 버튼 표시 */}
            {initialPayment.amount && parseFloat(initialPayment.amount) !== 0 && (
              <button
                className="modal-btn"
                style={{
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none'
                }}
                onClick={handleDelete}
              >
                삭제
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="modal-btn modal-btn-cancel"
              onClick={handleCancel}
            >
              취소
            </button>
            <button
              className="modal-btn modal-btn-primary"
              onClick={handleConfirm}
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PaymentModal;











