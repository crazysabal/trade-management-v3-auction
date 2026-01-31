/**
 * useTradePanelState.js
 * 
 * TradePanel 컴포넌트의 모든 상태를 관리하는 Hook
 * Context 재설계의 핵심 - 상태 중앙화
 * 
 * @created 2026-01-31
 */

import { useState, useRef, useCallback } from 'react';
import { formatLocalDate } from '../utils/tradePanelUtils';

/**
 * TradePanel 상태 관리 Hook
 * 
 * @param {Object} params
 * @param {string} params.tradeType - 거래 유형 ('SALE' | 'PURCHASE')
 * @param {boolean} params.initialViewMode - 초기 보기 모드
 * @returns {Object} 모든 상태와 setter
 */
export function useTradePanelState({ tradeType, initialViewMode = false }) {
    // ========================================
    // 기본 UI 상태
    // ========================================
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [loading, setLoading] = useState(true);

    // ========================================
    // 로컬 데이터 상태 (Context fallback용)
    // ========================================
    const [localCompanies, setLocalCompanies] = useState([]);
    const [localWarehouses, setLocalWarehouses] = useState([]);
    const [localProducts, setLocalProducts] = useState([]);
    const [localPaymentMethods, setLocalPaymentMethods] = useState([]);

    // ========================================
    // 전표 상태
    // ========================================
    const [currentTradeId, setCurrentTradeId] = useState(null);
    const [isEdit, setIsEdit] = useState(false);
    const [initialData, setInitialData] = useState(null);
    const [isViewMode, setIsViewMode] = useState(initialViewMode);

    // ========================================
    // 마스터 데이터
    // ========================================
    const [master, setMaster] = useState({
        trade_type: tradeType,
        trade_date: formatLocalDate(new Date()),
        company_id: '',
        warehouse_id: '',
        notes: '',
        status: 'CONFIRMED',
        total_amount: 0
    });

    // ========================================
    // 상세 데이터
    // ========================================
    const [details, setDetails] = useState([]);

    // ========================================
    // 거래처 및 결제 관련
    // ========================================
    const [companySummary, setCompanySummary] = useState(null);
    const [linkedPayments, setLinkedPayments] = useState([]);
    const [pendingPayments, setPendingPayments] = useState([]);
    const [deletedPaymentIds, setDeletedPaymentIds] = useState([]);
    const [modifiedPayments, setModifiedPayments] = useState({});
    const [editingPayment, setEditingPayment] = useState(null);
    const [editingPendingPayment, setEditingPendingPayment] = useState(null);

    // ========================================
    // UI 상태: 행 선택 및 드래그
    // ========================================
    const [selectedRowIndex, setSelectedRowIndex] = useState(null);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // ========================================
    // 모달 상태
    // ========================================
    const [modal, setModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        onConfirm: () => { },
        confirmText: '확인',
        showCancel: false
    });

    const [addPaymentModal, setAddPaymentModal] = useState({
        isOpen: false,
        amount: '',
        displayAmount: '',
        payment_method: '계좌이체',
        notes: ''
    });

    const [inventoryInputModal, setInventoryInputModal] = useState({
        isOpen: false,
        inventory: null,
        quantity: '',
        unitPrice: '',
        maxQuantity: 0,
        dropIndex: null
    });

    const [matchingInfoModal, setMatchingInfoModal] = useState({ isOpen: false, data: null });
    const [matchingHistoryModal, setMatchingHistoryModal] = useState({ isOpen: false, detail: null });
    const [deleteConfirmModal, setDeleteConfirmModal] = useState({ isOpen: false, confirmText: '' });
    const [isSalesLookupOpen, setIsSalesLookupOpen] = useState(false);
    const [isPurchaseLookupOpen, setIsPurchaseLookupOpen] = useState(false);

    // ========================================
    // Refs
    // ========================================
    const isSaving = useRef(false);
    const lastReportedDirty = useRef(false);
    const dragHandleRef = useRef(false);
    const focusValueRef = useRef({});
    const tableContainerRef = useRef(null);

    // 입력 필드 refs
    const companyRef = useRef(null);
    const productRefs = useRef([]);
    const quantityRefs = useRef([]);
    const unitPriceRefs = useRef([]);
    const senderRefs = useRef([]);
    const shipperLocationRefs = useRef([]);
    const notesRefs = useRef([]);

    // ========================================
    // 헬퍼 함수
    // ========================================
    const resetMaster = useCallback((date, companyId = '') => {
        setMaster({
            trade_type: tradeType,
            trade_date: date || formatLocalDate(new Date()),
            company_id: companyId,
            warehouse_id: '',
            notes: '',
            status: 'CONFIRMED',
            total_amount: 0
        });
    }, [tradeType]);

    return {
        // 기본 UI 상태
        isMobile, setIsMobile,
        loading, setLoading,

        // 로컬 데이터
        localCompanies, setLocalCompanies,
        localWarehouses, setLocalWarehouses,
        localProducts, setLocalProducts,
        localPaymentMethods, setLocalPaymentMethods,

        // 전표 상태
        currentTradeId, setCurrentTradeId,
        isEdit, setIsEdit,
        initialData, setInitialData,
        isViewMode, setIsViewMode,

        // 마스터/상세 데이터
        master, setMaster,
        details, setDetails,

        // 거래처/결제
        companySummary, setCompanySummary,
        linkedPayments, setLinkedPayments,
        pendingPayments, setPendingPayments,
        deletedPaymentIds, setDeletedPaymentIds,
        modifiedPayments, setModifiedPayments,
        editingPayment, setEditingPayment,
        editingPendingPayment, setEditingPendingPayment,

        // 행 선택/드래그
        selectedRowIndex, setSelectedRowIndex,
        draggedIndex, setDraggedIndex,
        dragOverIndex, setDragOverIndex,

        // 모달
        modal, setModal,
        addPaymentModal, setAddPaymentModal,
        inventoryInputModal, setInventoryInputModal,
        matchingInfoModal, setMatchingInfoModal,
        matchingHistoryModal, setMatchingHistoryModal,
        deleteConfirmModal, setDeleteConfirmModal,
        isSalesLookupOpen, setIsSalesLookupOpen,
        isPurchaseLookupOpen, setIsPurchaseLookupOpen,

        // Refs
        isSaving,
        lastReportedDirty,
        dragHandleRef,
        focusValueRef,
        tableContainerRef,
        companyRef,
        productRefs,
        quantityRefs,
        unitPriceRefs,
        senderRefs,
        shipperLocationRefs,
        notesRefs,

        // 헬퍼
        resetMaster
    };
}
