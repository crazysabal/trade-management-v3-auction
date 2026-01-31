/**
 * useTradePanelPayments.js
 * 
 * TradePanel 컴포넌트의 결제(입금/출금) 관련 핸들러 Hook
 * 
 * @created 2026-01-31
 * @refactored from TradePanel.js
 */

import { useCallback } from 'react';

/**
 * 결제 관련 핸들러 Hook
 * 
 * @param {Object} params
 * @param {Object} params.master - 마스터 상태
 * @param {boolean} params.isPurchase - 매입 전표 여부
 * @param {Object} params.addPaymentModal - 결제 추가 모달 상태
 * @param {Function} params.setAddPaymentModal - 결제 추가 모달 setter
 * @param {Array} params.pendingPayments - 대기 중 결제 목록
 * @param {Function} params.setPendingPayments - 대기 중 결제 setter
 * @param {Array} params.paymentMethods - 결제 수단 목록
 * @param {Function} params.showModal - 모달 표시 함수
 */
export function useTradePanelPayments({
    master,
    isPurchase,
    addPaymentModal,
    setAddPaymentModal,
    pendingPayments,
    setPendingPayments,
    paymentMethods,
    showModal
}) {
    // 입금/출금 추가 모달 열기
    const handleOpenAddPayment = useCallback(() => {
        if (!master.company_id) {
            showModal('warning', '입력 오류', '먼저 거래처를 선택하세요.');
            return;
        }
        setAddPaymentModal({
            isOpen: true,
            amount: '',
            displayAmount: '',
            payment_method: paymentMethods.length > 0 ? paymentMethods[0].name : '계좌이체',
            notes: ''
        });
    }, [master.company_id, paymentMethods, setAddPaymentModal, showModal]);

    // 새 결제 저장 (대기 목록에 추가)
    const handleSaveNewPayment = useCallback(() => {
        const amount = parseFloat(addPaymentModal.amount) || 0;
        if (amount === 0) {
            showModal('warning', '입력 오류', `0원은 ${isPurchase ? '출금' : '입금'}할 수 없습니다.\n금액을 입력해주세요.`, () => {
                // 모달 닫힌 후 금액 입력 필드에 포커스
                setTimeout(() => {
                    const amountInput = document.querySelector('.payment-amount-input');
                    if (amountInput) {
                        amountInput.focus();
                        amountInput.select();
                    }
                }, 100);
            });
            return;
        }

        // pendingPayments에 추가 (전표 저장 시 함께 저장됨)
        const newPayment = {
            tempId: Date.now(),
            amount: amount,
            payment_method: addPaymentModal.payment_method,
            notes: addPaymentModal.notes,
            isPending: true
        };

        setPendingPayments(prev => [...prev, newPayment]);
        setAddPaymentModal({ isOpen: false, amount: '', displayAmount: '', payment_method: '계좌이체', notes: '' });
    }, [addPaymentModal, isPurchase, setAddPaymentModal, setPendingPayments, showModal]);

    // 대기 중 결제 제거
    const handleRemovePendingPayment = useCallback((tempId) => {
        setPendingPayments(prev => prev.filter(p => p.tempId !== tempId));
    }, [setPendingPayments]);

    return {
        handleOpenAddPayment,
        handleSaveNewPayment,
        handleRemovePendingPayment
    };
}
