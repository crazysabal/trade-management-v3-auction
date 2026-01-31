/**
 * useTradePanelReturns.js
 * 
 * TradePanel 컴포넌트의 반품/반출 처리 핸들러 Hook
 * 
 * @created 2026-01-31
 * @refactored from TradePanel.js
 */

import { useCallback } from 'react';
import { tradeAPI } from '../services/api';

/**
 * 반품/반출 처리 핸들러 Hook
 * 
 * @param {Object} params
 * @param {Function} params.setDetails - 상세 항목 setter
 * @param {Function} params.setModal - 모달 상태 setter
 * @param {Function} params.setIsPurchaseLookupOpen - 매입 조회 모달 닫기
 * @param {Function} params.setIsSalesLookupOpen - 매출 조회 모달 닫기
 */
export function useTradePanelReturns({
    setDetails,
    setModal,
    setIsPurchaseLookupOpen,
    setIsSalesLookupOpen
}) {
    // 반출 처리: 선택한 매입 내역을 마이너스 수량으로 로드
    const handlePurchaseLink = useCallback(async (selectedPurchase) => {
        try {
            const fullTrade = await tradeAPI.getById(selectedPurchase.id);
            if (!fullTrade) throw new Error('전표 정보를 가져올 수 없습니다.');

            const tradeData = fullTrade.data.data;
            let targetDetails = tradeData.details;
            if (selectedPurchase.selectedItemId) {
                targetDetails = tradeData.details.filter(d => d.id === selectedPurchase.selectedItemId);
            }

            const newDetails = targetDetails.map(d => ({
                product_id: d.product_id,
                product_name: d.product_name,
                quantity: -Math.abs(
                    (d.id === selectedPurchase.selectedItemId && selectedPurchase.remaining_quantity)
                        ? parseFloat(selectedPurchase.remaining_quantity)
                        : d.quantity
                ), // 수량 음수 변환 (잔여 수량 우선 적용)
                unit_price: d.unit_price,
                supply_amount: -Math.abs(d.supply_amount || d.total_amount || 0),
                notes: '(반출)',
                parent_detail_id: d.id,
                inventory_id: d.matched_inventory_id || d.inventory_id,
                origin_quantity: Math.abs(d.quantity),
                available_stock: (d.id === selectedPurchase.selectedItemId && selectedPurchase.remaining_quantity)
                    ? parseFloat(selectedPurchase.remaining_quantity)
                    : null,
                total_returned_quantity: parseFloat(d.item_returned_quantity) || 0,
                shipper_id: d.shipper_id,
                location_id: d.location_id,
                is_agricultural: d.is_agricultural
            }));

            setDetails(prev => {
                const existingValid = prev.filter(d => d.product_id);
                return [...existingValid, ...newDetails];
            });
            setIsPurchaseLookupOpen(false);

            setModal({
                isOpen: true,
                type: 'info',
                title: '반출 항목 추가됨',
                message: '선택한 매입 내역이 반출(마이너스) 품목으로 추가되었습니다.\n기존 목록 아래에서 확인하실 수 있습니다.',
                confirmText: '확인',
                showCancel: false,
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        } catch (error) {
            console.error('반출 처리 중 오류:', error);
            setModal({
                isOpen: true,
                type: 'error',
                title: '반출 처리 실패',
                message: '반출 품목을 생성하는 중 오류가 발생했습니다.',
                confirmText: '확인',
                showCancel: false,
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    }, [setDetails, setModal, setIsPurchaseLookupOpen]);

    // 반품 처리: 선택한 매출 내역을 마이너스 수량으로 로드
    const handleSalesLink = useCallback(async (selectedSale) => {
        try {
            const fullTrade = await tradeAPI.getById(selectedSale.id);
            if (!fullTrade) throw new Error('전표 정보를 가져올 수 없습니다.');

            const tradeData = fullTrade.data.data;
            let targetDetails = tradeData.details;
            if (selectedSale.selectedItemId) {
                targetDetails = tradeData.details.filter(d => d.id === selectedSale.selectedItemId);
            }

            const newDetails = targetDetails.map(d => ({
                product_id: d.product_id,
                product_name: d.product_name,
                quantity: -Math.abs(d.quantity), // 수량 음수 변환
                unit_price: d.unit_price, // 단가는 그대로 (양수)
                supply_amount: -Math.abs(d.supply_amount || d.total_amount || 0), // 금액 음수 변환
                notes: '(반품)',
                parent_detail_id: d.id,
                inventory_id: d.matched_inventory_id || d.inventory_id,
                origin_quantity: Math.abs(d.quantity), // 원본 매출 수량
                total_returned_quantity: parseFloat(d.item_returned_quantity) || 0, // 이미 반품된 합계
                shipper_id: d.shipper_id,
                location_id: d.location_id,
                is_agricultural: d.is_agricultural
            }));

            setDetails(prev => {
                const existingValid = prev.filter(d => d.product_id);
                return [...existingValid, ...newDetails];
            });
            setIsSalesLookupOpen(false);

            setModal({
                isOpen: true,
                type: 'info',
                title: '반품 항목 추가됨',
                message: '선택한 매출 내역이 반품(마이너스) 품목으로 추가되었습니다.\n기존 목록 아래에서 확인하실 수 있습니다.',
                confirmText: '확인',
                showCancel: false,
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        } catch (error) {
            console.error('반품 처리 중 오류:', error);
            setModal({
                isOpen: true,
                type: 'error',
                title: '반품 처리 실패',
                message: '반품 전표를 생성하는 중 오류가 발생했습니다.',
                confirmText: '확인',
                showCancel: false,
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    }, [setDetails, setModal, setIsSalesLookupOpen]);

    return {
        handlePurchaseLink,
        handleSalesLink
    };
}
