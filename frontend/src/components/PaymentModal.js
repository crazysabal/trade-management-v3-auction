import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { paymentAPI } from '../services/api';
import { useModalDraggable } from '../hooks/useModalDraggable';

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
  const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

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

    try {
      setLoadingTrades(true);
      // tradeType은 반대로 조회 (매출 전표 결제면 SALE, 매입 전표 결제면 PURCHASE)
      const type = isPurchase ? 'PURCHASE' : 'SALE';
      const response = await paymentAPI.getUnpaidTrades(companyId, type);
      setUnpaidTrades(response.data.data || []);
    } catch (err) {
      console.error('미결제 전표 조회 오류:', err);
      setUnpaidTrades([]);
    } finally {
      setLoadingTrades(false);
    }
  };

  // FIFO 정산 로직 시뮬레이션
  const fifoAllocation = useMemo(() => {
    const amount = parseFloat(payment.amount) || 0;
    let remaining = amount;
    const allocations = unpaidTrades.map(trade => {
      const unpaid = parseFloat(trade.unpaid_amount) || 0;
      const allocated = Math.min(remaining, unpaid);
      remaining -= allocated;

      return {
        ...trade,
        allocatedAmount: allocated,
        status: allocated >= unpaid ? 'paid' : (allocated > 0 ? 'partial' : 'pending')
      };
    });

    return {
      allocations,
      totalAllocated: amount - remaining,
      extraAmount: remaining,
      paidCount: allocations.filter(a => a.status === 'paid').length,
      partialCount: allocations.filter(a => a.status === 'partial').length
    };
  }, [payment.amount, unpaidTrades]);

  const handleAmountChange = (e) => {
    const inputValue = e.target.value;
    const isNegative = inputValue.startsWith('-');
    const val = inputValue.replace(/[^0-9]/g, '');
    const numVal = parseInt(val || '0', 10);
    const finalVal = isNegative ? -numVal : numVal;

    setPayment(prev => ({
      ...prev,
      amount: finalVal,
      displayAmount: val === '' ? (isNegative ? '-' : '') : (isNegative ? '-' : '') + numVal.toLocaleString()
    }));
  };

  const handleConfirm = () => {
    onConfirm(payment);
  };

  const handleCancel = () => {
    onClose();
  };

  const handleDelete = () => {
    onConfirm({ amount: 0, displayAmount: '', payment_method: '', notes: '' });
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ko-KR').format(val || 0);
  };

  if (!isOpen) return null;

  const modalTitle = isPurchase ? '💸 출금(결제) 설정' : '💰 입금(수금) 설정';

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div
        className="styled-modal"
        style={{
          width: '550px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          ...draggableStyle
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header draggable-header"
          onMouseDown={handleMouseDown}
        >
          <h3 className="drag-pointer-none">{modalTitle}</h3>
          <button className="close-btn drag-pointer-auto" onClick={handleCancel}>&times;</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div style={{
            padding: '1rem',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
              <span style={{ width: '80px', color: '#64748b' }}>거래처:</span>
              <span style={{ fontWeight: '600' }}>{companyName}</span>
            </div>
            <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
              <span style={{ width: '80px', color: '#64748b' }}>거래일:</span>
              <span>{tradeDate}</span>
            </div>
            <div style={{ display: 'flex' }}>
              <span style={{ width: '80px', color: '#64748b' }}>전잔고:</span>
              <span style={{ fontWeight: '600', color: '#c62828' }}>
                {formatCurrency(companySummary?.previous_balance)}원
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>{isPurchase ? '출금액' : '입금액'}</label>
              <input
                type="text"
                className="form-input"
                style={{ fontSize: '1.2rem', fontWeight: '700', textAlign: 'right', color: '#1565c0' }}
                value={payment.displayAmount}
                onChange={handleAmountChange}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>결제 수단</label>
              <select
                className="form-select"
                value={payment.payment_method}
                onChange={(e) => setPayment(prev => ({ ...prev, payment_method: e.target.value }))}
              >
                <option value="계좌이체">계좌이체</option>
                <option value="현금">현금</option>
                <option value="카드">카드</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>메모</label>
              <input
                type="text"
                className="form-input"
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

        <div className="modal-buttons" style={{ marginTop: '1.5rem', display: 'flex', borderTop: '1px solid #eee', padding: '1rem 0' }}>
          <div style={{ flex: 1 }}>
            {/* 기존에 설정된 입출금이 있을 때만 삭제 버튼 표시 */}
            {initialPayment.amount && parseFloat(initialPayment.amount) !== 0 && (
              <button
                className="modal-btn"
                style={{
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  padding: '0.6rem 1.2rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
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
              style={{
                padding: '0.6rem 1.2rem',
                backgroundColor: '#94a3b8',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              취소
            </button>
            <button
              className="modal-btn modal-btn-primary"
              onClick={handleConfirm}
              style={{
                padding: '0.6rem 1.2rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
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
