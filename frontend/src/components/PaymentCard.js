import React, { useState, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';

/**
 * PaymentCard - 입출금 관련 공통 컴포넌트
 * 
 * 잔고 정보 + 입출금 내역 표시 + 입출금 추가/수정/삭제 기능
 * TradePanel, SaleFromInventory 등에서 재사용 가능
 * 
 * @param {boolean} isPurchase - 매입(출금) 여부. false면 매출(입금)
 * @param {string} companyId - 거래처 ID (입출금 추가 활성화 조건)
 * @param {string} tradeDate - 거래 일자
 * @param {object} companySummary - 거래처 잔고 요약 정보 { previous_balance, today_total, today_payment }
 * @param {number} currentTodayTotal - 현재 입력 중인 금일 합계 (품목 합계)
 * @param {array} linkedPayments - 저장된 입출금 목록
 * @param {array} pendingPayments - 저장 대기 중 입출금 목록
 * @param {object} modifiedPayments - 수정 대기 중 입출금 정보 { [paymentId]: { amount, payment_method, notes } }
 * @param {function} onLinkedPaymentsChange - 저장된 입출금 변경 콜백 (newLinkedPayments)
 * @param {function} onPendingPaymentsChange - 대기 중 입출금 변경 콜백 (newPendingPayments)
 * @param {function} onModifiedPaymentsChange - 수정 대기 중 입출금 변경 콜백 (newModifiedPayments)
 * @param {function} onDeletePayment - 저장된 입출금 삭제 콜백 (paymentId)
 * @param {number} fontScale - 폰트 크기 배율 (0.8 ~ 1.2)
 * @param {string} cardColor - 카드 배경색
 * @param {string} title - 카드 제목 (기본: "매출처 잔고" 또는 "매입처 잔고")
 * @param {boolean} showTitle - 제목 표시 여부 (기본: true)
 * @param {object} style - 추가 스타일
 */
function PaymentCard({
  isPurchase = false,
  companyId,
  tradeDate,
  companySummary,
  currentTodayTotal = 0,
  linkedPayments = [],
  pendingPayments = [],
  modifiedPayments = {},
  onLinkedPaymentsChange,
  onPendingPaymentsChange,
  onModifiedPaymentsChange,
  onDeletePayment,
  fontScale = 1.0,
  cardColor = '#ffffff',
  title,
  showTitle = true,
  style = {}
}) {
  // 폰트 크기 헬퍼
  const fs = (size) => `${(size * fontScale).toFixed(2)}rem`;

  // 숫자 포맷
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  // 입출금 추가 모달 상태
  const [addPaymentModal, setAddPaymentModal] = useState({
    isOpen: false,
    amount: '',
    displayAmount: '',
    payment_method: '계좌이체',
    notes: ''
  });

  // 저장된 입출금 수정 모달 상태
  const [editingPayment, setEditingPayment] = useState(null);

  // 대기 중 입출금 수정 모달 상태
  const [editingPendingPayment, setEditingPendingPayment] = useState(null);

  // 프리미엄 알림 모달 상태
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: 'warning',
    title: '',
    message: '',
    onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
  });

  // 잔고 계산
  const summary = useMemo(() => {
    const previousBalance = companySummary?.previous_balance || 0;
    const baseToday = companySummary?.today_total || 0;
    const baseTodayPayment = companySummary?.today_payment || 0;

    // 삭제된 입출금 금액 계산 (linkedPayments에서 이미 제거되었으므로 별도 계산 불필요)

    return {
      previous_balance: previousBalance,
      today_total: baseToday,
      today_payment: baseTodayPayment
    };
  }, [companySummary]);

  // 저장 대기 중인 입출금 합계
  const pendingTotal = useMemo(() => {
    return pendingPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  }, [pendingPayments]);

  // 저장된 입출금 중 수정된 금액 반영
  const linkedPaymentTotal = useMemo(() => {
    return linkedPayments.reduce((sum, p) => {
      const displayAmount = p.link_type === 'allocated' ? p.allocated_amount : p.amount;
      return sum + (parseFloat(displayAmount) || 0);
    }, 0);
  }, [linkedPayments]);

  // 표시용 계산 값들
  const currentSubtotal = summary.previous_balance + currentTodayTotal;
  const displayPayment = summary.today_payment - linkedPaymentTotal + linkedPaymentTotal + pendingTotal;
  const displayBalance = currentSubtotal - displayPayment;

  // 입출금 추가 모달 열기
  const handleOpenAddPayment = () => {
    setAddPaymentModal({
      isOpen: true,
      amount: '',
      displayAmount: '',
      payment_method: '계좌이체',
      notes: ''
    });
  };

  // 새 입출금 저장 (대기 목록에 추가)
  const handleSaveNewPayment = () => {
    const amount = parseFloat(addPaymentModal.amount) || 0;
    if (amount === 0) {
      setConfirmModal({
        isOpen: true,
        type: 'warning',
        title: '금액 입력',
        message: '금액을 입력해주세요. 0원은 입력할 수 없습니다.',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        showCancel: false
      });
      return;
    }

    const newPayment = {
      tempId: Date.now(),
      amount: amount,
      payment_method: addPaymentModal.payment_method,
      notes: addPaymentModal.notes,
      isPending: true
    };

    if (onPendingPaymentsChange) {
      onPendingPaymentsChange([...pendingPayments, newPayment]);
    }
    setAddPaymentModal({ isOpen: false, amount: '', displayAmount: '', payment_method: '계좌이체', notes: '' });
  };

  // 대기 중 입출금 삭제
  const handleRemovePendingPayment = (tempId) => {
    if (onPendingPaymentsChange) {
      onPendingPaymentsChange(pendingPayments.filter(p => p.tempId !== tempId));
    }
  };

  // 대기 중 입출금 수정 저장
  const handleSavePendingPaymentEdit = () => {
    if (!editingPendingPayment) return;

    const amount = parseFloat(editingPendingPayment.amount) || 0;
    if (amount === 0) {
      setConfirmModal({
        isOpen: true,
        type: 'warning',
        title: '금액 입력',
        message: '금액을 입력해주세요. 0원은 입력할 수 없습니다.',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        showCancel: false
      });
      return;
    }

    if (onPendingPaymentsChange) {
      onPendingPaymentsChange(pendingPayments.map(p =>
        p.tempId === editingPendingPayment.tempId
          ? {
            ...p,
            amount: amount,
            payment_method: editingPendingPayment.payment_method,
            notes: editingPendingPayment.notes
          }
          : p
      ));
    }
    setEditingPendingPayment(null);
  };

  // 저장된 입출금 수정 저장
  const handleSavePaymentEdit = () => {
    if (!editingPayment) return;

    const amount = parseFloat(editingPayment.amount) || 0;
    if (amount === 0) {
      setConfirmModal({
        isOpen: true,
        type: 'warning',
        title: '금액 입력',
        message: '금액을 입력해주세요. 0원은 입력할 수 없습니다.',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        showCancel: false
      });
      return;
    }

    // 수정 대기 목록에 추가
    if (onModifiedPaymentsChange) {
      onModifiedPaymentsChange({
        ...modifiedPayments,
        [editingPayment.id]: {
          amount: editingPayment.amount,
          payment_method: editingPayment.payment_method,
          notes: editingPayment.notes
        }
      });
    }

    // linkedPayments 화면 표시용 업데이트
    if (onLinkedPaymentsChange) {
      onLinkedPaymentsChange(linkedPayments.map(p =>
        p.id === editingPayment.id
          ? { ...p, amount: editingPayment.amount, allocated_amount: editingPayment.amount, payment_method: editingPayment.payment_method, notes: editingPayment.notes }
          : p
      ));
    }
    setEditingPayment(null);
  };

  // 저장된 입출금 삭제
  const handleDeleteLinkedPayment = (paymentId) => {
    if (onDeletePayment) {
      onDeletePayment(paymentId);
    }
    if (onLinkedPaymentsChange) {
      onLinkedPaymentsChange(linkedPayments.filter(p => p.id !== paymentId));
    }
  };

  const cardTitle = title || (isPurchase ? '매입처 잔고' : '매출처 잔고');
  const paymentLabel = isPurchase ? '출금' : '입금';

  return (
    <div className="card" style={{
      padding: '0.75rem',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: cardColor,
      ...style
    }}>
      {showTitle && (
        <h2 className="card-title" style={{ marginBottom: '0.5rem', fontSize: fs(1), flexShrink: 0 }}>
          💰 {cardTitle}
        </h2>
      )}

      {/* 잔고 정보 리스트 */}
      <div style={{ marginBottom: '0.5rem', fontSize: fs(1), flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0.4rem',
          backgroundColor: '#f0f7ff',
          borderRadius: '4px 4px 0 0',
          borderBottom: '1px solid #eee'
        }}>
          <span style={{ color: '#1565c0', fontWeight: '500' }}>금일 합계</span>
          <span style={{ fontWeight: '600', color: isPurchase ? '#c62828' : '#1565c0' }}>
            {formatCurrency(currentTodayTotal)}원
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem', borderBottom: '1px solid #eee' }}>
          <span style={{ color: '#666' }}>전잔고</span>
          <span style={{ fontWeight: '600' }}>{formatCurrency(summary.previous_balance)}원</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem', borderBottom: '1px solid #eee' }}>
          <span style={{ color: '#666' }}>전잔고 + 금일</span>
          <span style={{ fontWeight: '600' }}>{formatCurrency(currentSubtotal)}원</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem', borderBottom: '1px solid #eee' }}>
          <span style={{ color: '#666' }}>
            {paymentLabel}
            {pendingTotal > 0 && <span style={{ fontSize: fs(0.85), color: '#ffc107' }}> ({pendingPayments.length}건)</span>}
          </span>
          <span style={{ fontWeight: '600', color: '#2e7d32' }}>
            {formatCurrency(displayPayment)}원
          </span>
        </div>
      </div>

      {/* 잔고 */}
      {(() => {
        const balanceColor = displayBalance > 0 ? '#e65100' : displayBalance < 0 ? '#1565c0' : '#2e7d32';
        const balanceBg = displayBalance > 0 ? '#fff3e0' : displayBalance < 0 ? '#e3f2fd' : '#e8f5e9';

        return (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.5rem',
            backgroundColor: balanceBg,
            borderRadius: '6px',
            marginBottom: '0.5rem',
            flexShrink: 0
          }}>
            <span style={{ fontWeight: '600', color: balanceColor, fontSize: fs(1) }}>
              잔고{pendingTotal > 0 ? ' (예정)' : ''}
            </span>
            <span style={{ fontWeight: '700', color: balanceColor, fontSize: fs(1) }}>
              {displayBalance < 0 ? '-' : ''}{formatCurrency(Math.abs(displayBalance))}원
            </span>
          </div>
        );
      })()}

      {/* 입출금 내역 섹션 */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: '0.5rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: fs(1), fontWeight: '600', color: '#555' }}>
            📋 {paymentLabel} 내역
          </h3>
          <button
            type="button"
            onClick={handleOpenAddPayment}
            disabled={!companyId}
            style={{
              padding: '4px 10px',
              fontSize: fs(0.85),
              backgroundColor: companyId ? (isPurchase ? '#3498db' : '#27ae60') : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: companyId ? 'pointer' : 'not-allowed'
            }}
          >
            + {paymentLabel} 추가
          </button>
        </div>

        {/* 입출금 내역 목록 */}
        {(linkedPayments.length > 0 || pendingPayments.length > 0) ? (
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {/* 저장된 입출금 */}
            {linkedPayments.map(payment => {
              const linkType = payment.link_type || 'direct';
              const displayAmount = linkType === 'allocated' ? payment.allocated_amount : payment.amount;
              const canDelete = linkType === 'direct' || linkType === 'general';
              const isModified = modifiedPayments[payment.id];

              const typeStyles = {
                direct: { bg: '#f0fff4', border: '#27ae60', label: '직접', labelBg: '#27ae60' },
                allocated: { bg: '#e3f2fd', border: '#2196f3', label: '배분', labelBg: '#2196f3' },
                general: { bg: '#f3e5f5', border: '#9c27b0', label: '수금/지급', labelBg: '#9c27b0' }
              };
              const typeStyle = typeStyles[linkType] || typeStyles.direct;

              return (
                <div key={`${payment.id}-${linkType}`} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem',
                  marginBottom: '0.4rem',
                  backgroundColor: typeStyle.bg,
                  borderRadius: '4px',
                  fontSize: fs(0.9),
                  borderLeft: `3px solid ${typeStyle.border}`
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {formatCurrency(displayAmount)}원
                      <span style={{
                        fontSize: fs(0.75),
                        backgroundColor: typeStyle.labelBg,
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '3px'
                      }}>
                        {typeStyle.label}
                      </span>
                      {isModified && (
                        <span style={{
                          fontSize: fs(0.7),
                          backgroundColor: '#ffc107',
                          color: '#333',
                          padding: '2px 5px',
                          borderRadius: '3px'
                        }}>
                          수정됨
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: fs(0.8), color: '#888' }}>
                      {payment.transaction_date?.substring(0, 10)} | {payment.payment_method || '미지정'}
                      {linkType === 'allocated' && payment.amount !== displayAmount && (
                        <span> (총 {formatCurrency(payment.amount)}원 중)</span>
                      )}
                    </div>
                  </div>
                  {canDelete && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => setEditingPayment({
                          ...payment,
                          displayAmount: new Intl.NumberFormat('ko-KR').format(Math.abs(payment.amount))
                        })}
                        style={{
                          padding: '3px 8px',
                          fontSize: fs(0.8),
                          backgroundColor: '#3498db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLinkedPayment(payment.id)}
                        style={{
                          padding: '3px 8px',
                          fontSize: fs(0.8),
                          backgroundColor: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 저장 대기 중 입출금 */}
            {pendingPayments.map(payment => (
              <div key={payment.tempId} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem',
                backgroundColor: '#fff3cd',
                borderRadius: '4px',
                marginBottom: '0.4rem',
                fontSize: fs(0.9),
                borderLeft: '3px solid #ffc107',
                border: '1px dashed #ffc107'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {formatCurrency(payment.amount)}원
                    <span style={{
                      fontSize: fs(0.75),
                      backgroundColor: '#ffc107',
                      color: '#333',
                      padding: '1px 4px',
                      borderRadius: '3px'
                    }}>
                      저장 대기
                    </span>
                  </div>
                  <div style={{ fontSize: fs(0.8), color: '#888' }}>
                    {payment.payment_method || '미지정'}
                    {payment.notes && ` | ${payment.notes}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditingPendingPayment({
                      ...payment,
                      displayAmount: new Intl.NumberFormat('ko-KR').format(Math.abs(payment.amount))
                    })}
                    style={{
                      padding: '3px 8px',
                      fontSize: fs(0.8),
                      backgroundColor: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemovePendingPayment(payment.tempId)}
                    style={{
                      padding: '3px 8px',
                      fontSize: fs(0.8),
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '0.75rem',
            textAlign: 'center',
            color: '#999',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            fontSize: fs(0.9),
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {paymentLabel} 내역이 없습니다
          </div>
        )}

        <div style={{ fontSize: fs(0.85), color: '#888', marginTop: '0.4rem', textAlign: 'center', flexShrink: 0 }}>
          * {paymentLabel}은 전표 저장 시 함께 처리됩니다
        </div>
      </div>

      {/* 입출금 추가 모달 */}
      {addPaymentModal.isOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAddPaymentModal({ ...addPaymentModal, isOpen: false });
            }
          }}
        >
          <div
            className="modal-container"
            tabIndex={-1}
            style={{
              maxWidth: '400px',
              padding: '1.5rem',
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
              outline: 'none'
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>
              {isPurchase ? '💸 출금' : '💰 입금'} 추가
            </h3>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>금액 *</label>
              <input
                type="text"
                className="payment-amount-input"
                value={addPaymentModal.displayAmount}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  const isNegative = inputValue.startsWith('-');
                  const numericPart = inputValue.replace(/[^0-9]/g, '');
                  const amount = numericPart ? (isNegative ? -parseInt(numericPart) : parseInt(numericPart)) : 0;
                  const displayValue = numericPart
                    ? (isNegative ? '-' : '') + new Intl.NumberFormat('ko-KR').format(parseInt(numericPart))
                    : (isNegative ? '-' : '');
                  setAddPaymentModal(prev => ({
                    ...prev,
                    amount: amount,
                    displayAmount: displayValue
                  }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const amount = parseFloat(addPaymentModal.amount) || 0;
                    if (amount === 0) return;
                    e.target.closest('.modal-container').querySelector('select')?.focus();
                  }
                }}
                placeholder="0"
                style={{ width: '100%', padding: '0.5rem', textAlign: 'right', border: '1px solid #ddd', borderRadius: '4px' }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>결제방법</label>
              <select
                value={addPaymentModal.payment_method}
                onChange={(e) => setAddPaymentModal(prev => ({ ...prev, payment_method: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.closest('.modal-container').querySelector('input[placeholder="메모"]')?.focus();
                  }
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="현금">현금</option>
                <option value="계좌이체">계좌이체</option>
                <option value="카드">카드</option>
                <option value="어음">어음</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>비고</label>
              <input
                type="text"
                value={addPaymentModal.notes}
                onChange={(e) => setAddPaymentModal(prev => ({ ...prev, notes: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveNewPayment();
                  }
                }}
                placeholder="메모"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAddPaymentModal({ ...addPaymentModal, isOpen: false })}
                style={{ padding: '0.5rem 1rem' }}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveNewPayment}
                style={{ padding: '0.5rem 1rem' }}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 저장된 입출금 수정 모달 */}
      {editingPayment && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditingPayment(null);
            }
          }}
        >
          <div
            className="modal-container"
            tabIndex={-1}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
              padding: '1.5rem',
              outline: 'none'
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>
              {isPurchase ? '💸 출금' : '💰 입금'} 수정
            </h3>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>금액 *</label>
              <input
                type="text"
                value={editingPayment.displayAmount || new Intl.NumberFormat('ko-KR').format(editingPayment.amount || 0)}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  const isNegative = inputValue.startsWith('-');
                  const numericPart = inputValue.replace(/[^0-9]/g, '');
                  const amount = numericPart ? (isNegative ? -parseInt(numericPart) : parseInt(numericPart)) : 0;
                  setEditingPayment(prev => ({
                    ...prev,
                    amount: amount,
                    displayAmount: numericPart
                      ? (isNegative ? '-' : '') + new Intl.NumberFormat('ko-KR').format(parseInt(numericPart))
                      : (isNegative ? '-' : '')
                  }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.closest('.modal-container').querySelector('select')?.focus();
                  }
                }}
                placeholder="0"
                style={{ width: '100%', padding: '0.5rem', textAlign: 'right', border: '1px solid #ddd', borderRadius: '4px' }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>결제방법</label>
              <select
                value={editingPayment.payment_method || '계좌이체'}
                onChange={(e) => setEditingPayment(prev => ({ ...prev, payment_method: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.closest('.modal-container').querySelector('input[placeholder="메모"]')?.focus();
                  }
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="현금">현금</option>
                <option value="계좌이체">계좌이체</option>
                <option value="카드">카드</option>
                <option value="어음">어음</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>비고</label>
              <input
                type="text"
                value={editingPayment.notes || ''}
                onChange={(e) => setEditingPayment(prev => ({ ...prev, notes: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSavePaymentEdit();
                  }
                }}
                placeholder="메모"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingPayment(null)}
                style={{ padding: '0.5rem 1rem' }}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSavePaymentEdit}
                style={{ padding: '0.5rem 1rem' }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대기 중 입출금 수정 모달 */}
      {editingPendingPayment && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditingPendingPayment(null);
            }
          }}
        >
          <div
            className="modal-container"
            tabIndex={-1}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
              padding: '1.5rem',
              outline: 'none'
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>
              {isPurchase ? '💸 출금' : '💰 입금'} 수정 (저장 대기)
            </h3>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>금액 *</label>
              <input
                type="text"
                value={editingPendingPayment.displayAmount || ''}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  const isNegative = inputValue.startsWith('-');
                  const numericPart = inputValue.replace(/[^0-9]/g, '');
                  const amount = numericPart ? (isNegative ? -parseInt(numericPart) : parseInt(numericPart)) : 0;
                  const displayValue = numericPart
                    ? (isNegative ? '-' : '') + new Intl.NumberFormat('ko-KR').format(parseInt(numericPart))
                    : (isNegative ? '-' : '');
                  setEditingPendingPayment(prev => ({
                    ...prev,
                    amount: amount,
                    displayAmount: displayValue
                  }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.closest('.modal-container').querySelector('select')?.focus();
                  }
                }}
                placeholder="0"
                style={{ width: '100%', padding: '0.5rem', textAlign: 'right', border: '1px solid #ddd', borderRadius: '4px' }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>결제방법</label>
              <select
                value={editingPendingPayment.payment_method || '계좌이체'}
                onChange={(e) => setEditingPendingPayment(prev => ({ ...prev, payment_method: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.closest('.modal-container').querySelector('input[placeholder="메모"]')?.focus();
                  }
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="현금">현금</option>
                <option value="계좌이체">계좌이체</option>
                <option value="카드">카드</option>
                <option value="어음">어음</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>비고</label>
              <input
                type="text"
                value={editingPendingPayment.notes || ''}
                onChange={(e) => setEditingPendingPayment(prev => ({ ...prev, notes: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSavePendingPaymentEdit();
                  }
                }}
                placeholder="메모"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingPendingPayment(null)}
                style={{ padding: '0.5rem 1rem' }}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSavePendingPaymentEdit}
                style={{ padding: '0.5rem 1rem' }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 프리미엄 알림 모달 */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        confirmText="확인"
        showCancel={false}
      />
    </div>
  );
}

export default PaymentCard;




