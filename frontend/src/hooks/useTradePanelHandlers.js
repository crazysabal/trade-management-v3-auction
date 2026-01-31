/**
 * useTradePanelHandlers.js
 * 
 * TradePanel 컴포넌트의 드래그앤드롭 및 키보드 네비게이션 핸들러 Hook
 * 
 * @created 2026-01-31
 * @refactored from TradePanel.js (Step 2: Handler Extraction)
 */

import { useCallback } from 'react';

/**
 * 드래그앤드롭 핸들러 Hook
 * 
 * @param {Object} params
 * @param {number|null} params.draggedIndex - 현재 드래그 중인 인덱스
 * @param {Function} params.setDraggedIndex - 드래그 인덱스 setter
 * @param {Function} params.setDragOverIndex - 드래그 오버 인덱스 setter
 * @param {boolean} params.isPurchase - 매입 전표 여부
 * @param {boolean} params.isViewMode - 보기 모드 여부
 * @param {Object} params.master - 마스터 상태
 * @param {Array} params.details - 상세 항목 배열
 * @param {Function} params.setDetails - 상세 항목 setter
 * @param {Function} params.setSelectedRowIndex - 선택된 행 인덱스 setter
 * @param {Function} params.setInventoryInputModal - 재고 입력 모달 setter
 * @param {Function} params.showModal - 모달 표시 함수
 */
export function useTradePanelDragHandlers({
    draggedIndex,
    setDraggedIndex,
    setDragOverIndex,
    isPurchase,
    isViewMode,
    master,
    details,
    setDetails,
    setSelectedRowIndex,
    setInventoryInputModal,
    showModal
}) {
    const handleDragStart = useCallback((e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
        // 드래그 시 행 스타일 변경을 위해 약간의 딜레이
        setTimeout(() => {
            e.target.closest('tr').style.opacity = '0.5';
        }, 0);
    }, [setDraggedIndex]);

    const handleDragEnd = useCallback((e) => {
        setDraggedIndex(null);
        setDragOverIndex(null);
        e.target.closest('tr').style.opacity = '1';
    }, [setDraggedIndex, setDragOverIndex]);

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault();

        // 내부 드래그인 경우
        if (draggedIndex !== null) {
            e.dataTransfer.dropEffect = 'move';
            if (index !== draggedIndex) {
                setDragOverIndex(index);
            }
        } else {
            // 외부 드래그(재고 목록 등)인 경우
            if (isPurchase) {
                e.dataTransfer.dropEffect = 'none';
                setDragOverIndex(null);
                return;
            }

            e.dataTransfer.dropEffect = 'copy';
            setDragOverIndex(index);
        }
    }, [draggedIndex, isPurchase, setDragOverIndex]);

    const handleDragLeave = useCallback(() => {
        setDragOverIndex(null);
    }, [setDragOverIndex]);

    const handleDrop = useCallback((e, dropIndex) => {
        e.preventDefault();

        // 보기 모드에서는 드롭 차단
        if (isViewMode) {
            showModal('warning', '작업 불가', '수정 모드로 전환 후 이용해주세요.');
            return;
        }

        const inventoryJson = e.dataTransfer.getData('application/json');

        // 1. 외부 재고 아이템 드래그 앤 드롭
        if (inventoryJson) {
            // 매입 전표인 경우 차단
            if (isPurchase) {
                showModal('warning', '작업 불가', '매입 전표에는 재고를 추가할 수 없습니다.\n재고는 매출 전표에서만 사용할 수 있습니다.');
                setDragOverIndex(null);
                return;
            }

            // 거래처 선택 확인
            if (!master.company_id) {
                showModal('warning', '거래처 미선택', '먼저 거래처를 선택해주세요.');
                setDragOverIndex(null);
                return;
            }

            try {
                const item = JSON.parse(inventoryJson);
                const availableQty = parseFloat(item.remaining_quantity) || 0;

                // 모달 열기
                setInventoryInputModal({
                    isOpen: true,
                    inventory: item,
                    quantity: availableQty.toString(),
                    unitPrice: item.unit_price ? Math.floor(item.unit_price).toString() : '',
                    maxQuantity: availableQty,
                    dropIndex: dropIndex
                });

                setDragOverIndex(null);
                return;
            } catch (err) {
                console.error('재고 드롭 처리 오류:', err);
            }
        }

        // 2. 내부 행 순서 변경
        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        // 배열 순서 변경
        const newDetails = [...details];
        const [draggedItem] = newDetails.splice(draggedIndex, 1);
        newDetails.splice(dropIndex, 0, draggedItem);

        setDetails(newDetails);
        setDraggedIndex(null);
        setDragOverIndex(null);
        setSelectedRowIndex(dropIndex);
    }, [
        isViewMode,
        isPurchase,
        master.company_id,
        draggedIndex,
        details,
        setDetails,
        setDraggedIndex,
        setDragOverIndex,
        setSelectedRowIndex,
        setInventoryInputModal,
        showModal
    ]);

    return {
        handleDragStart,
        handleDragEnd,
        handleDragOver,
        handleDragLeave,
        handleDrop
    };
}

/**
 * 키보드 네비게이션 핸들러 Hook
 * 
 * @param {Object} params
 * @param {Array} params.details - 상세 항목 배열
 * @param {boolean} params.isPurchase - 매입 전표 여부
 * @param {Object} params.refs - 필드 참조 객체 { productRefs, quantityRefs, unitPriceRefs, senderRefs, shipperLocationRefs, notesRefs }
 * @param {Function} params.addDetailRow - 상세 행 추가 함수
 */
export function useTradePanelKeyboardHandlers({
    details,
    isPurchase,
    refs,
    addDetailRow
}) {
    const { productRefs, unitPriceRefs, senderRefs, shipperLocationRefs, notesRefs } = refs;

    const handleQuantityKeyDown = useCallback((e, index) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            // Shift+Tab (역방향)으로 나갈 때는 유효성 검사 제외
            if (e.shiftKey) return;

            const val = details[index]?.quantity;
            if (val === '' || val === null || parseFloat(val) === 0) {
                e.preventDefault();
                return; // 수량이 없으면 단가로 넘어가지 않음
            }

            e.preventDefault();
            if (unitPriceRefs.current[index]) {
                unitPriceRefs.current[index].focus();
            }
        }
    }, [details, unitPriceRefs]);

    const handleUnitPriceKeyDown = useCallback((e, index) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            // Shift+Tab (역방향)으로 나갈 때는 유효성 검사 제외
            if (e.shiftKey) return;

            const val = details[index]?.unit_price;
            if (val === '' || val === null || parseFloat(val) === 0) {
                e.preventDefault();
                return; // 단가가 없으면 비고/출하주로 넘어가지 않음
            }

            e.preventDefault();
            if (isPurchase) {
                // Purchase: Unit Price -> Owner (Sender)
                if (senderRefs.current[index]) {
                    senderRefs.current[index].focus();
                }
            } else {
                // Sale: Unit Price -> Notes
                if (notesRefs.current[index]) {
                    notesRefs.current[index].focus();
                }
            }
        }
    }, [details, isPurchase, senderRefs, notesRefs, unitPriceRefs]);

    const handleSenderKeyDown = useCallback((e, index) => {
        // Owner (Sender) -> Location
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (shipperLocationRefs.current[index]) {
                shipperLocationRefs.current[index].focus();
            }
        }
    }, [shipperLocationRefs]);

    const handleShipperLocationKeyDown = useCallback((e, index) => {
        // Location -> Notes
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (notesRefs.current[index]) {
                notesRefs.current[index].focus();
            }
        }
    }, [notesRefs]);

    const handleNotesKeyDown = useCallback((e, index) => {
        if (e.key === 'Enter') {
            // 현재 행의 필수 값 체크 (품목, 수량, 단가)
            const row = details[index];
            const isInvalid = !row?.product_id || !row?.quantity || parseFloat(row?.quantity) === 0 || !row?.unit_price || parseFloat(row?.unit_price) === 0;

            if (isInvalid) {
                e.preventDefault();
                return; // 필수 값이 없으면 다음 행으로 갈 수 없음
            }

            e.preventDefault();
            // 다음 행의 품목으로 이동하거나 새 행 추가
            if (index === details.length - 1) {
                addDetailRow();
            } else if (productRefs.current[index + 1]) {
                productRefs.current[index + 1].focus();
            }
        }
    }, [details, addDetailRow, productRefs]);

    return {
        handleQuantityKeyDown,
        handleUnitPriceKeyDown,
        handleSenderKeyDown,
        handleShipperLocationKeyDown,
        handleNotesKeyDown
    };
}
