import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { tradeAPI, companyAPI, productAPI, paymentAPI, settingsAPI, warehousesAPI, companyInfoAPI, purchaseInventoryAPI, matchingAPI } from '../services/api';
import ConfirmModal from './ConfirmModal';
import TradePrintModal from './TradePrintModal';
import './TradePanel.css';
import TradeDeleteConfirmModal from './TradeDeleteConfirmModal';
import SearchableSelect from './SearchableSelect';
import SalesLookupModal from './SalesLookupModal'; // Import SalesLookupModal
import { useModalDraggable } from '../hooks/useModalDraggable';

function TradePanel({
  tradeType = 'SALE',
  panelId,
  initialTradeId = null,
  initialViewMode = false,
  onSaveSuccess,
  onPrint,
  onDirtyChange,
  onInventoryUpdate,
  onTradeChange,
  onClose,
  updateProps, // [NEW] Props 동기화 콜백
  onLaunchApp, // [NEW] 앱 실행 콜백
  inventoryMap = {},
  cardColor = '#ffffff',
  timestamp // 리로드 트리거용
}) {
  const isPurchase = tradeType === 'PURCHASE';

  // Draggable hooks for inline modals (initialized later after state definitions)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 기본 데이터
  const [companies, setCompanies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]); // 결제 방법 목록
  const [loading, setLoading] = useState(true);

  // 현재 전표 상태
  const [currentTradeId, setCurrentTradeId] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [isViewMode, setIsViewMode] = useState(initialViewMode);

  // 선택된 행
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);

  // 드래그앤드롭 상태
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // 로컬 시간대 기준 YYYY-MM-DD 형식 반환
  const formatLocalDate = (date) => {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 숫자 포맷팅 (콤마)
  const formatNumber = (num) => {
    if (num === null || num === undefined || num === '') return '';
    return num.toLocaleString();
  };

  // 통화 포맷팅 (원화, 소수점 버림)
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined || amount === '' || isNaN(amount)) return '';
    // 숫자가 아니면 그대로 반환 (마이너스 부호 입력 등 대응)
    if (amount === '-') return amount;
    return Math.trunc(amount).toLocaleString(); // Math.trunc: 음수 반올림 방향 유지
  };

  const [master, setMaster] = useState({
    trade_type: tradeType,
    trade_date: formatLocalDate(new Date()),
    company_id: '',
    warehouse_id: '',
    notes: '',
    status: 'CONFIRMED',
    total_amount: 0
  });

  const [details, setDetails] = useState([]);

  // 거래처 잔고 정보
  const [companySummary, setCompanySummary] = useState(null);

  // 입금/출금 관련
  const [linkedPayments, setLinkedPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [deletedPaymentIds, setDeletedPaymentIds] = useState([]); // 삭제 대기 중인 입출금 ID
  const [modifiedPayments, setModifiedPayments] = useState({}); // 수정 대기 중인 입출금 {id: {amount, payment_method, notes}}
  const [editingPayment, setEditingPayment] = useState(null); // 수정 중인 입출금 (저장된 것)
  const [editingPendingPayment, setEditingPendingPayment] = useState(null); // 수정 중인 대기 입출금
  // 매칭 정보 모달
  const [matchingInfoModal, setMatchingInfoModal] = useState({ isOpen: false, data: null });
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ isOpen: false }); // 삭제 확인 모달

  // [NEW] 전역적으로 마지막 활성화된 전표를 추적하기 위한 ID
  // (여러 창이 뜰 수 있는 MDI 환경에서 퀵 추가 버튼의 대상을 찾기 위함)
  const markPanelActive = useCallback(() => {
    window.__lastActiveTradePanelId = panelId;
    // 재고 퀵 추가를 위해 마지막으로 활성화된 '매출' 전표를 별도로 추적
    if (!isPurchase) {
      window.__lastActiveSalesPanelId = panelId;
    }
  }, [panelId, isPurchase]);

  // [1] 마운트/언마운트 관리 (키 생성 및 제거)
  useEffect(() => {
    if (isPurchase) return;

    if (!window.__salesPanelRegistry) window.__salesPanelRegistry = {};

    // 초기 등록 (일단 false로 시작하고 바로 다음 Effect에서 업데이트됨)
    window.__salesPanelRegistry[panelId] = {
      hasCompany: !!master.company_id,
      isViewMode: !!isViewMode
    };

    // 마운트 시 이벤트 발송 (초기화)
    const entries = Object.values(window.__salesPanelRegistry);
    window.dispatchEvent(new CustomEvent('sales-panels-updated', {
      detail: {
        count: entries.length,
        hasReadyPanel: entries.some(p => p.hasCompany && !p.isViewMode)
      }
    }));

    return () => {
      // 언마운트 시에만 삭제
      if (window.__salesPanelRegistry) {
        delete window.__salesPanelRegistry[panelId];

        const currentEntries = Object.values(window.__salesPanelRegistry);
        window.dispatchEvent(new CustomEvent('sales-panels-updated', {
          detail: {
            count: currentEntries.length,
            hasReadyPanel: currentEntries.some(p => p.hasCompany && !p.isViewMode)
          }
        }));
      }
    };
  }, [panelId, isPurchase]); // 마운트 시 1회만 실행

  // [2] 상태 변경 시 레지스트리 값 갱신 (삭제 하지 않음)
  useEffect(() => {
    if (isPurchase) return;
    if (!window.__salesPanelRegistry) return; // 마운트 전이면 패스

    // 값 갱신
    window.__salesPanelRegistry[panelId] = {
      hasCompany: !!master.company_id,
      isViewMode: !!isViewMode
    };

    // 상태 변경 이벤트 발송
    const entries = Object.values(window.__salesPanelRegistry);
    const totalCount = entries.length;
    const hasReadyPanel = entries.some(p => p.hasCompany && !p.isViewMode);

    console.log(`[TradePanel Sync] ID: ${panelId}, Company: ${!!master.company_id}, View: ${isViewMode} -> Ready: ${hasReadyPanel}`);

    window.dispatchEvent(new CustomEvent('sales-panels-updated', {
      detail: {
        count: totalCount,
        hasReadyPanel: hasReadyPanel
      }
    }));
  }, [master.company_id, isViewMode, isPurchase, panelId]);

  // [3] 이벤트 핸들러 및 활성 패널 추적 (독립 실행)
  useEffect(() => {
    markPanelActive();

    const handleQuickAdd = (e) => {
      if (isPurchase) return;

      const { targetPanelId, inventory } = e.detail;
      console.log(`[TradePanel:${panelId}] QuickAdd Event Received. Target: ${targetPanelId}, Last Active: ${window.__lastActiveSalesPanelId}`);

      const isTarget = targetPanelId ? (targetPanelId === panelId) : (window.__lastActiveSalesPanelId === panelId);

      if (isTarget) {
        if (isViewMode) {
          window.dispatchEvent(new CustomEvent('inventory-quick-add-error', {
            detail: { message: '현재 전표가 보기 전용입니다.' }
          }));
          return;
        }

        if (!master.company_id) {
          window.dispatchEvent(new CustomEvent('inventory-quick-add-error', {
            detail: { message: '거래처를 먼저 선택해주세요.' }
          }));
          return;
        }

        setInventoryInputModal({
          isOpen: true,
          inventory: inventory,
          quantity: (parseFloat(inventory.remaining_quantity) || 0).toString(),
          unitPrice: inventory.unit_price ? Math.floor(inventory.unit_price).toString() : '',
          maxQuantity: parseFloat(inventory.remaining_quantity) || 0,
          dropIndex: detailsRef.current.length
        });
      }
    };

    window.addEventListener('inventory-quick-add', handleQuickAdd);
    return () => {
      window.removeEventListener('inventory-quick-add', handleQuickAdd);
    };
  }, [panelId, markPanelActive, isPurchase, isViewMode, master.company_id]);
  const [addPaymentModal, setAddPaymentModal] = useState({
    isOpen: false,
    amount: '',
    displayAmount: '',
    payment_method: '계좌이체',
    notes: ''
  });

  // [재고 드롭 모달] 상태
  const [inventoryInputModal, setInventoryInputModal] = useState({
    isOpen: false,
    inventory: null, // 드롭된 재고 아이템 원본
    quantity: '',
    unitPrice: '',
    maxQuantity: 0,
    dropIndex: null // 드롭된 위치
  });

  // Draggable hooks for inline modals
  const { handleMouseDown: handlePaymentDrag, draggableStyle: paymentDragStyle } = useModalDraggable(!!addPaymentModal.isOpen || !!editingPayment || !!editingPendingPayment);
  const { handleMouseDown: handleMatchingDrag, draggableStyle: matchingDragStyle } = useModalDraggable(!!matchingInfoModal.isOpen, { isCentered: true });
  // 재고 드롭 모달 중앙 정렬을 위해 isCentered: true 옵션 추가
  const { handleMouseDown: handleInventoryDrag, draggableStyle: inventoryDragStyle } = useModalDraggable(!!inventoryInputModal.isOpen, { isCentered: true });

  // 모달
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => { },
    confirmText: '확인',
    showCancel: false
  });

  const [matchingHistoryModal, setMatchingHistoryModal] = useState({
    isOpen: false,
    detail: null
  });

  // Sales Lookup Modal State
  const [isSalesLookupOpen, setIsSalesLookupOpen] = useState(false);

  // 변경 감지
  const [initialData, setInitialData] = useState(null);

  // 반품 처리: 선택한 매출 내역을 마이너스 수량으로 로드
  const handleSalesLink = async (selectedSale) => {
    try {
      // 1. 선택된 전표의 상세 정보를 가져옴
      const fullTrade = await tradeAPI.getById(selectedSale.id);
      if (!fullTrade) throw new Error('전표 정보를 가져올 수 없습니다.');

      // 2. 현재 폼을 초기화하되, 반품 모드로 설정
      // 기존 resetForm과 유사하지만, details를 반품 데이터로 채움

      const tradeData = fullTrade.data.data;

      // 2. [IMPROVED] 선택한 품목 하나만 반품하거나, 전체를 반품함
      let targetDetails = tradeData.details;
      if (selectedSale.selectedItemId) {
        targetDetails = tradeData.details.filter(d => d.id === selectedSale.selectedItemId);
      }

      const newDetails = targetDetails.map(d => ({
        product_id: d.product_id,
        product_name: d.product_name,
        quantity: -Math.abs(d.quantity), // 수량 음수 변환
        unit_price: d.unit_price, // 단가는 그대로 (양수)
        supply_amount: -Math.abs(d.supply_amount || d.total_amount || 0), // 금액 음수 변환 (supply_amount 사용)
        notes: '(반품)',

        // 중요: 원본 품목 ID를 parent_detail_id로 저장하여 누적 반품 한도 추적
        parent_detail_id: d.id,
        inventory_id: d.matched_inventory_id || d.inventory_id,
        origin_quantity: Math.abs(d.quantity), // 원본 매출 수량
        total_returned_quantity: parseFloat(d.item_returned_quantity) || 0, // 이미 반품된 합계

        // 기타 필드
        shipper_id: d.shipper_id,
        location_id: d.location_id,
        is_agricultural: d.is_agricultural
      }));


      // 3. 상태 업데이트
      setDetails(newDetails);
      setIsSalesLookupOpen(false);

      // 4. 알림
      setModal({
        isOpen: true,
        type: 'info',
        title: '반품 전표 생성됨',
        message: '선택한 매출 내역이 반품(마이너스) 상태로 입력되었습니다.\n내용을 확인 후 저장하세요.',
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
  };

  // refs
  const companyRef = useRef(null);
  const productRefs = useRef([]);
  const quantityRefs = useRef([]);
  const unitPriceRefs = useRef([]);
  const shipperLocationRefs = useRef([]);
  const focusValueRef = useRef({}); // 입력 포커스 시 값 저장용
  const dragHandleRef = useRef(false); // 드래그 핸들 클릭 상태 추적
  const lastReportedDirty = useRef(null); // 마지막으로 보고된 수정 상태 (무한 루프 방지)
  const senderRefs = useRef([]);
  const notesRefs = useRef([]);
  const modalConfirmRef = useRef(null);
  const isSaving = useRef(false); // 저장 중 중복 클릭 방지
  const tableContainerRef = useRef(null); // [NEW] 상세 행 추가 시 스크롤 제어용
  const detailsRef = useRef(details);
  useEffect(() => {
    detailsRef.current = details;
  }, [details]);



  // 모달 표시
  const showModal = (type, title, message, onConfirm = () => { }, confirmText = '확인', showCancel = false) => {
    setModal({ isOpen: true, type, title, message, onConfirm, confirmText, showCancel });
  };

  // 모달 열릴 때 document 레벨에서 키보드 이벤트 처리
  useEffect(() => {
    if (modal.isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          modal.onConfirm();
          setModal(prev => ({ ...prev, isOpen: false }));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setModal(prev => ({ ...prev, isOpen: false }));
        }
      };

      // document 레벨에서 키 이벤트 감지 (포커스 위치 무관)
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [modal.isOpen, modal.onConfirm]);

  // 변경사항 감지
  const checkDirty = useCallback(() => {
    if (isViewMode) return false; // 보기 모드일 때는 항상 수정 중 아님
    if (!initialData) return false;

    // 상세 비교 및 원인 로깅
    if (String(master.trade_date) !== String(initialData.master.trade_date)) {
      return true;
    }
    if (String(master.company_id || '') !== String(initialData.master.company_id || '')) {
      return true;
    }
    if (String(master.warehouse_id || '') !== String(initialData.master.warehouse_id || '')) {
      return true;
    }
    if ((master.notes || '') !== (initialData.master.notes || '')) {
      return true;
    }

    const currentDetails = details.filter(d => d.product_id && d.quantity);
    const initialDetails = initialData.details.filter(d => d.product_id && d.quantity);
    if (currentDetails.length !== initialDetails.length) return true;

    for (let i = 0; i < currentDetails.length; i++) {
      const current = currentDetails[i];
      const initial = initialDetails[i];
      if (!initial) return true;
      if (String(current.product_id || '') !== String(initial.product_id || '')) return true;
      if (Number(current.quantity || 0) !== Number(initial.quantity || 0)) return true;
      if (Number(current.unit_price || 0) !== Number(initial.unit_price || 0)) return true;
      if ((current.notes || '') !== (initial.notes || '')) return true;

    }

    // 입금/출금 변경사항 확인
    if (pendingPayments.length > 0) return true;
    if (deletedPaymentIds.length > 0) return true;
    if (Object.keys(modifiedPayments).length > 0) return true;

    return false;
  }, [initialData, master, details, pendingPayments, deletedPaymentIds, modifiedPayments]);

  // 변경사항 상태 동기화
  useEffect(() => {
    const isDirty = checkDirty();
    // 무한 루프 방지: 값이 실제로 변경되었을 때만 부모에게 알림
    if (lastReportedDirty.current !== isDirty) {
      lastReportedDirty.current = isDirty;
      if (onDirtyChange) {
        onDirtyChange(isDirty);
      }
    }
  }, [checkDirty, onDirtyChange]);

  // 초기 데이터 로드
  useEffect(() => {
    loadInitialData();
  }, []);

  // initialTradeId가 있으면 해당 전표 로드
  useEffect(() => {
    // 로딩 상태와 무관하게 데이터가 준비되면 전표 로드 시작 (연속 로딩 UX)
    if (initialTradeId) {
      // 1. 현재 로드된 전표와 다른 경우
      if (String(initialTradeId) !== String(currentTradeId)) {
        loadTrade(initialTradeId);
      }
      // 2. 같은 전표지만 외부에서 다시 보기를 요청한 경우 (timestamp 변경됨)
      else if (initialViewMode && !isViewMode) {
        setIsViewMode(true);
      }
    }

    // timestamp가 변경되면(외부에서 호출 시) 무조건 효과를 다시 실행하여 체크
    // currentTradeId는 내부 네비게이션 시 변경되므로 의존성에서 제외 (자동 리로드 방지)
  }, [initialTradeId, timestamp]);

  // [NEW] 상세 행 추가 시 자동 스크롤 하단 이동
  const prevDetailsLength = useRef(details.length);
  useEffect(() => {
    if (details.length > prevDetailsLength.current) {
      // 행이 추가된 경우에만 스크롤 (삭제 시에는 유지)
      if (tableContainerRef.current) {
        setTimeout(() => {
          tableContainerRef.current.scrollTop = tableContainerRef.current.scrollHeight;
        }, 50); // 렌더링 완료 후 스크롤을 위해 약간의 지연
      }
    }
    prevDetailsLength.current = details.length;
  }, [details.length]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const typeFilter = isPurchase ? 'SUPPLIER' : 'CUSTOMER';
      const [companiesRes, productsRes, warehousesRes] = await Promise.all([
        companyAPI.getAll({ is_active: 'true', type: typeFilter }),
        productAPI.getAll({ is_active: 'true' }),
        warehousesAPI.getAll()
      ]);
      setCompanies(companiesRes.data.data);
      setProducts(productsRes.data.data);
      setWarehouses(warehousesRes.data.data || []);
      const defaultWh = (warehousesRes.data.data || []).find(w => w.is_default);
      const defaultWhId = (isPurchase && defaultWh) ? defaultWh.id : '';

      // 결제 방법 로드
      try {
        const methodsRes = await settingsAPI.getPaymentMethods({ is_active: true });
        if (methodsRes.data.success) {
          setPaymentMethods(methodsRes.data.data);
        }
      } catch (err) {
        console.error('결제 방법 로딩 오류:', err);
      }

      // 초기 데이터 설정
      if (!initialTradeId) {
        setMaster(prev => ({ ...prev, warehouse_id: defaultWhId }));
        setInitialData({
          master: { ...master, warehouse_id: defaultWhId },
          details: []
        });
      }
    } catch (error) {
      console.error('초기 데이터 로딩 오류:', error);
      showModal('warning', '로딩 실패', '데이터를 불러오는데 실패했습니다.');
      setLoading(false); // 에러 시에는 로딩 해제
    } finally {
      // 전표를 이어서 로드해야 하는 경우 로딩 상태 유지 (깜빡임 방지)
      if (!initialTradeId) {
        setLoading(false);
      }
    }
  };

  // 품목 새로고침
  const refreshProducts = async () => {
    try {
      const productsRes = await productAPI.getAll({ is_active: 'true' });
      setProducts(productsRes.data?.data || []);
      showModal('success', '새로고침 완료', '품목 목록이 갱신되었습니다.');
    } catch (error) {
      console.error('품목 새로고침 오류:', error);
    }
  };


  // 거래처 잔고 정보 로드
  const loadCompanySummary = async (companyId, type, date, excludeTradeId = null) => {
    if (!companyId) {
      setCompanySummary(null);
      return;
    }
    try {
      const response = await paymentAPI.getCompanyTodaySummary(companyId, type, date, excludeTradeId);
      setCompanySummary(response.data.data);
    } catch (error) {
      console.error('거래처 잔고 조회 오류:', error);
      setCompanySummary(null);
    }
  };

  // 전표 로드
  const loadTrade = async (tradeId) => {
    if (!tradeId) return;

    try {
      setLoading(true);
      const response = await tradeAPI.getById(tradeId);
      const data = response.data.data;

      // 날짜 형식 변환
      if (data.master.trade_date) {
        const dateStr = data.master.trade_date.toString();
        if (dateStr.includes('T')) {
          data.master.trade_date = dateStr.substring(0, 10);
        }
      }

      setMaster(data.master);

      // details 로드
      const loadedDetails = data.details.map((d, index) => {
        // 저장된 전표의 경우, 현재 잔량 + 이미 매칭된 수량 = 수정 가능한 최대 수량
        // 반품(d.quantity < 0)의 경우 최대 수량을 0으로 설정하여 양수 판매 전환을 방지
        const availableMax = d.quantity < 0 ? 0 : (
          d.inventory_remaining !== undefined
            ? (parseFloat(d.inventory_remaining) || 0) + (parseFloat(d.matched_quantity) || 0)
            : undefined
        );

        return {
          ...d,
          inventory_id: d.matched_inventory_id || d.inventory_id, // API 응답 필드 매핑
          max_quantity: availableMax, // 유효성 검사를 위한 최대 수량 설정
          origin_quantity: (d.origin_quantity !== null && d.origin_quantity !== undefined) ? parseFloat(d.origin_quantity) : undefined,
          total_returned_quantity: (d.other_returned_quantity !== null && d.other_returned_quantity !== undefined) ? parseFloat(d.other_returned_quantity) : 0,
          rowIndex: index
        };


      });
      setDetails(loadedDetails);

      // 초기 데이터 저장
      setInitialData({
        master: { ...data.master },
        details: loadedDetails.map(d => ({ ...d }))
      });


      setCurrentTradeId(tradeId);
      setIsEdit(true);
      // 기존 전표 로드 시 보기 모드로 전환 (에러 발생 전 미리 설정)
      setIsViewMode(true);

      // 잔고 정보 로드
      if (data.master.company_id) {
        await loadCompanySummary(data.master.company_id, data.master.trade_type, data.master.trade_date, tradeId);
      }

      // 연결된 입출금 내역 조회
      if (data.master.company_id) {
        try {
          const paymentsRes = await paymentAPI.getByTrade(tradeId);
          setLinkedPayments(paymentsRes.data.data || []);
        } catch (err) {
          console.error('입출금 내역 조회 오류:', err);
        }
      }

      // 대기 중인 입출금 초기화
      setPendingPayments([]);
      setDeletedPaymentIds([]);
      setModifiedPayments({});

      // (Deprecated) setIsViewMode(true) was here
    } catch (error) {
      console.error('전표 로딩 오류:', error);

      if (error.response && error.response.status === 404) {
        showModal('warning', '전표 없음', '해당 전표가 존재하지 않거나 삭제되었습니다.', () => {
          if (onClose) onClose();
        });
      } else {
        showModal('warning', '로딩 실패', '전표를 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 날짜 변경
  const handleDateChange = async (days) => {
    const [year, month, day] = master.trade_date.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);
    currentDate.setDate(currentDate.getDate() + days);
    const newDate = formatLocalDate(currentDate);

    await processDateOrCompanyChange(newDate, master.company_id);
  };

  const handleDateInputChange = async (newDate) => {
    if (newDate === master.trade_date) return;
    await processDateOrCompanyChange(newDate, master.company_id);
  };

  // 초기화 버튼 클릭 처리
  const handleReset = () => {
    const hasDirtyData = checkDirty() || pendingPayments.length > 0 || Object.keys(modifiedPayments).length > 0 || deletedPaymentIds.length > 0;

    if (hasDirtyData) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '초기화 확인',
        message: '저장하지 않은 변경사항이 있습니다.\n초기화하면 현재 입력 내용이 사라집니다.\n정말 초기화하시겠습니까?',
        confirmText: '초기화',
        showCancel: true,
        onConfirm: async () => {
          await loadInitialData();
          setLoading(false);
          resetForm(); // 날짜 인자를 전달하지 않으면 금일 일자로 초기화됨
        }
      });
    } else {
      (async () => {
        await loadInitialData();
        setLoading(false);
        resetForm(); // 날짜 인자를 전달하지 않으면 금일 일자로 초기화됨
      })();
    }
  };

  // 날짜/거래처 변경 공통 처리
  const processDateOrCompanyChange = async (newDate, newCompanyId) => {
    const hasDirtyData = checkDirty() || pendingPayments.length > 0;

    if (hasDirtyData) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '저장하지 않은 변경사항',
        message: '저장하지 않은 변경사항이 있습니다.\n계속하면 현재 입력 내용이 사라집니다.\n계속하시겠습니까?',
        confirmText: '계속',
        showCancel: true,
        onConfirm: async () => {
          await executeTradeSwitch(newDate, newCompanyId);
        }
      });
    } else {
      await executeTradeSwitch(newDate, newCompanyId);
    }
  };

  // 전표 전환 실행
  const executeTradeSwitch = async (newDate, newCompanyId) => {
    if (!newCompanyId) {
      // 거래처 없이 날짜만 변경 시에도 폼 초기화
      resetForm(newDate, '');
      return;
    }

    try {
      const response = await tradeAPI.checkDuplicate({
        company_id: newCompanyId,
        trade_date: newDate,
        trade_type: tradeType
      });

      if (response.data.isDuplicate && response.data.existingTradeId) {
        // 기존 전표 로드
        await loadTrade(response.data.existingTradeId);
      } else {
        // 신규 등록 모드로 전환
        resetForm(newDate, newCompanyId);
      }
    } catch (error) {
      console.error('전표 확인 오류:', error);
      // 에러 발생 시에도 폼 초기화
      resetForm(newDate, newCompanyId);
    }
  };

  // 폼 초기화
  // 폼 초기화
  const resetForm = (date, companyId = '') => {
    // 날짜 기본값 로직 일원화
    const effectiveDate = date || formatLocalDate(new Date());

    // 기본 창고 설정
    const defaultWh = warehouses.find(w => w.is_default);
    const defaultWhId = (isPurchase && defaultWh) ? defaultWh.id : '';

    // 빈 행 생성
    const emptyRow = {
      rowIndex: 0,
      product_id: '',
      product_name: '',

      quantity: '',
      unit_price: '',
      supply_amount: 0,
      shipper_location: '',
      sender_name: '',
      notes: ''
    };

    setMaster({
      trade_type: tradeType,
      trade_date: effectiveDate,
      company_id: companyId,
      warehouse_id: defaultWhId,
      notes: '',
      status: 'CONFIRMED',
      total_amount: 0
    });
    // 거래처가 있으면 빈 행 1개, 없으면 빈 배열
    setDetails(companyId ? [emptyRow] : []);
    setCurrentTradeId(null);
    setIsEdit(false);
    setIsViewMode(false); // 신규 등록 모드에서는 편집 허용
    setLinkedPayments([]);
    setPendingPayments([]);
    setDeletedPaymentIds([]);
    setModifiedPayments({});
    setModifiedPayments({});
    setInitialData({
      master: { trade_type: tradeType, trade_date: effectiveDate, company_id: companyId, warehouse_id: defaultWhId, notes: '' },
      details: []
    });

    if (companyId) {
      loadCompanySummary(companyId, tradeType, date);
    } else {
      setCompanySummary(null);
    }

    // [FIX] 초기화 시 재고 현황 목록의 임시 조정 수치를 초기화하기 위해 알림 발송
    if (onTradeChange) {
      onTradeChange();
    }

    // [NEW] Persisted initialTradeId 제거 (데스크탑 새로고침 시 로딩 방지)
    if (updateProps && initialTradeId) {
      updateProps({ initialTradeId: null, initialViewMode: false });
    }
  };

  // 거래처 변경
  const handleCompanyChange = async (option) => {
    const newCompanyId = option ? option.value : '';

    if (!option) {
      // 거래처 선택 해제 시 폼 초기화
      resetForm(master.trade_date, '');
      return;
    }

    if (newCompanyId === String(master.company_id)) return;

    await processDateOrCompanyChange(master.trade_date, newCompanyId);
  };

  // 품목 행 관리
  const addDetailRow = () => {
    const newRow = {
      rowIndex: details.length,
      product_id: '',
      product_name: '',

      quantity: '',
      unit_price: '',
      supply_amount: 0,
      shipper_location: '',
      sender_name: '',
      notes: ''
    };
    setDetails([...details, newRow]);

    setTimeout(() => {
      if (productRefs.current[details.length]) {
        productRefs.current[details.length].focus();
      }
    }, 50);
  };

  // 드래그앤드롭 핸들러
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    // 드래그 시 행 스타일 변경을 위해 약간의 딜레이
    setTimeout(() => {
      e.target.closest('tr').style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e) => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    e.target.closest('tr').style.opacity = '1';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();

    // 내부 드래그인 경우
    if (draggedIndex !== null) {
      e.dataTransfer.dropEffect = 'move';
      if (index !== draggedIndex) {
        setDragOverIndex(index);
      }
    } else {
      // 외부 드래그(재고 목록 등)인 경우
      const inventoryJson = e.dataTransfer.getData('application/json'); // Note: getData not always available in dragover security model, but dropEffect works
      // 외부 드래그 감지는 inventoryJson이 있거나(일부 브라우저), 내부가 아니면 외부로 간주

      if (isPurchase) {
        e.dataTransfer.dropEffect = 'none';
        setDragOverIndex(null);
        return;
      }

      e.dataTransfer.dropEffect = 'copy';
      setDragOverIndex(index); // 드롭 위치 표시
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // 재고 입력 모달 ESC 키 핸들러 (규칙 준수)
  useEffect(() => {
    const handleEsc = (e) => {
      if (inventoryInputModal.isOpen && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setInventoryInputModal(prev => ({ ...prev, isOpen: false }));
      }
    };

    if (inventoryInputModal.isOpen) {
      window.addEventListener('keydown', handleEsc);
    }

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [inventoryInputModal.isOpen]);

  const handleDrop = (e, dropIndex) => {
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
    const dragIndex = draggedIndex;

    if (dragIndex === null || dragIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // 배열 순서 변경
    const newDetails = [...details];
    const [draggedItem] = newDetails.splice(dragIndex, 1);
    newDetails.splice(dropIndex, 0, draggedItem);

    setDetails(newDetails);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setSelectedRowIndex(dropIndex);
  };

  // 재고 입력 모달 확인 핸들러
  const handleInventoryInputConfirm = () => {
    const { inventory: item, quantity, unitPrice, dropIndex, maxQuantity } = inventoryInputModal;
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;

    // DEBUG: 값 확인
    // showModal('info', 'DEBUG', `입력값: ${ qty } (Type: ${ typeof qty }) \n최대값: ${ maxQuantity } (Type: ${ typeof maxQuantity })`);

    // 만약 maxQuantity가 undefined면 0으로 취급하여 검증
    const limit = maxQuantity ?? 0;

    if (qty <= 0) {
      showModal('warning', '입력 오류', '수량을 입력하세요.');
      return;
    }

    if (qty > limit) {
      showModal('warning', '수량 초과', `재고 잔량을 초과할 수 없습니다.\n(최대: ${limit})`);
      return;
    }

    // 새 전표 상세 객체 생성
    const newDetail = {
      rowIndex: 0,
      product_id: item.product_id,
      product_name: item.product_name,

      quantity: qty,
      unit_price: price,
      supply_amount: qty * price,
      shipper_location: item.shipper_location || '',
      sender_name: item.sender || '',
      notes: item.sender || '', // 출하주(sender)를 비고란에 자동 입력
      inventory_id: item.id,
      max_quantity: item.remaining_quantity || 0 // Validation limit
    };

    const newDetails = [...details];

    // 첫 행이 빈 행이면 삭제 (빈 행에 추가되는 것 방지)
    if (newDetails.length === 1) {
      const first = newDetails[0];
      const isFirstEmpty = !first.product_id && !first.quantity && !first.unit_price;
      if (isFirstEmpty) {
        newDetails.pop();
      }
    }

    // 드롭된 위치에 삽입
    if (typeof dropIndex === 'number' && dropIndex < newDetails.length) {
      const targetRow = newDetails[dropIndex];
      const isEmptyRow = !targetRow.product_id && !targetRow.quantity && !targetRow.unit_price;

      if (isEmptyRow) {
        newDetails[dropIndex] = { ...newDetail, rowIndex: dropIndex };
      } else {
        newDetails.splice(dropIndex, 0, newDetail);
      }
    } else {
      newDetails.push(newDetail);
    }

    // 인덱스 재정렬
    newDetails.forEach((d, i) => d.rowIndex = i);
    setDetails(newDetails);

    // 모달 닫기
    setInventoryInputModal({ isOpen: false, inventory: null, quantity: '', unitPrice: '', maxQuantity: 0, dropIndex: null });

    // 작업 완료 후 재고 목록 창에 포커스 반환
    if (window.__bringToFront) window.__bringToFront('INVENTORY_QUICK');
    window.dispatchEvent(new CustomEvent('inventory-quick-add-complete', { detail: { success: true } }));

    // 재고 수량 임시 차감 알림
    if (onInventoryUpdate && item.id) {
      onInventoryUpdate(item.id, -qty);
    }
  };

  const handleDetailChange = (index, field, value) => {
    const newDetails = [...details];

    // 품목 변경 시 재고 연결 해제 (데이터 불일치 방지)
    if (field === 'product_id' && newDetails[index].inventory_id) {
      const currentDetail = newDetails[index];
      // 이미 점유된 재고 수량이 있다면 반환
      if (onInventoryUpdate && currentDetail.quantity) {
        const qtyToRestore = parseFloat(currentDetail.quantity) || 0;
        if (qtyToRestore > 0) {
          onInventoryUpdate(currentDetail.inventory_id, qtyToRestore);
        }
      }
      // 재고 관련 필드 초기화 (일반 입력 모드로 전환)
      delete newDetails[index].inventory_id;
      delete newDetails[index].inventory_remaining; // 잔량 정보 제거
      delete newDetails[index].max_quantity; // 최대 수량 제약 해제
      delete newDetails[index].matched_inventory_id;
    }

    // 재고 수량 동기화 및 초과 검증
    if (field === 'quantity' && newDetails[index].inventory_id && onInventoryUpdate) {
      const oldQty = parseFloat(newDetails[index].quantity) || 0;
      const newQty = value === '' ? 0 : (parseFloat(value) || 0);

      // 초과 검증
      const maxQty = newDetails[index].max_quantity;

      const originQty = newDetails[index].origin_quantity;
      const totalReturnedOther = newDetails[index].total_returned_quantity || 0;

      // 0. 반품 한도 초과 검사 (판매한 수량보다 많이 반품하는 경우)
      if (originQty !== undefined && (Math.abs(newQty) + totalReturnedOther) > originQty && newQty < 0) {
        const availableReturn = Math.max(0, originQty - totalReturnedOther);
        showModal('warning', '수량 초과',
          `판매 수량을 초과하여 반품할 수 없습니다.\n` +
          `원본 매출: ${originQty}\n` +
          `기존 반품 합계: ${totalReturnedOther}\n` +
          `현재 가능한 최대 반품: ${availableReturn}`
        );

        let originalVal = focusValueRef.current[index] !== undefined ? parseFloat(focusValueRef.current[index]) : oldQty;
        if (isNaN(originalVal)) {
          // 복원 시에도 한도를 넘지 않도록 보정
          originalVal = -availableReturn;
        }

        newDetails[index].quantity = originalVal;
        setDetails(newDetails);
        return;
      }


      // 1. 양수 입력 방지 (반품 전표인 경우)
      if (newQty > maxQty) {
        const isReturn = (focusValueRef.current[index] !== undefined ? parseFloat(focusValueRef.current[index]) : oldQty) < 0;
        const msg = isReturn
          ? '반품 전표에서는 양수 수량을 입력할 수 없습니다.\n반품할 수량을 마이너스(-)로 입력해주세요.'
          : `재고 잔량을 초과할 수 없습니다.\n(최대: ${maxQty})`;

        showModal('warning', '수량 초과', msg);

        // 값 복합 복원 (NaN 방지)
        let originalVal = focusValueRef.current[index] !== undefined ? parseFloat(focusValueRef.current[index]) : oldQty;
        if (isNaN(originalVal)) originalVal = 0;

        // 재고 상태 동기화:
        // 입력 전(15) -> 입력 중(1) -> 입력 오류(18)
        // 현재 시스템(InventoryMap)은 1만큼 차감된 상태 (1이 유효하게 입력되었으므로)
        // 되돌리려면: 1 -> 15 (14 추가 사용)
        // diff = 15 - 1 = 14.
        // onInventoryUpdate(-14) 호출.
        if (!isNaN(originalVal) && originalVal !== oldQty) {
          const revertDiff = originalVal - oldQty;
          if (revertDiff !== 0) {
            onInventoryUpdate(newDetails[index].inventory_id, -revertDiff);
          }
        }

        newDetails[index].quantity = originalVal;
        setDetails(newDetails);
        return;
      }

      // 2. 기존 저장된 항목 (max_quantity 없음) -> inventoryMap 참조 검증
      else if (inventoryMap && inventoryMap[newDetails[index].inventory_id]) {
        const available = parseFloat(inventoryMap[newDetails[index].inventory_id].remaining_quantity) || 0;
        const additionalNeeded = newQty - oldQty;

        // 추가로 필요한 양이 가용 재고보다 많으면 차단 (단, 수량이 줄어드는 경우는 항상 허용)
        if (additionalNeeded > 0 && additionalNeeded > available) {
          showModal('warning', '수량 초과', `가용 재고 부족\n(추가 필요: ${additionalNeeded}, 가용: ${available})`);

          // 값 복원 (포커스 시 저장된 원본 값으로)
          const originalVal = focusValueRef.current[index] !== undefined ? parseFloat(focusValueRef.current[index]) : oldQty;

          if (!isNaN(originalVal) && originalVal !== oldQty) {
            const revertDiff = originalVal - oldQty;
            if (revertDiff !== 0) {
              onInventoryUpdate(newDetails[index].inventory_id, -revertDiff);
            }
          }

          newDetails[index].quantity = originalVal;
          setDetails(newDetails);
          return;
        }
      }

      // 숫자로 변환 가능한 경우에만 차액 계산
      if (!isNaN(newQty)) {
        const diff = newQty - oldQty;
        if (diff !== 0) {
          onInventoryUpdate(newDetails[index].inventory_id, -diff);
        }
      }
    }

    newDetails[index][field] = value;



    // 금액 계산
    if (field === 'quantity' || field === 'unit_price') {
      const qty = parseFloat(newDetails[index].quantity) || 0;
      const price = parseFloat(newDetails[index].unit_price) || 0;
      newDetails[index].supply_amount = qty * price;
    }

    setDetails(newDetails);
  };

  const handleDetailSelectChange = (index, option) => {
    handleDetailChange(index, 'product_id', option ? option.value : '');
    // 품목이 실제로 선택되었을 때만 수량으로 포커스 이동
    // [FIX] option이 없는 경우(선택 취소)에는 포커스 이동을 하지 않음 (Shift+Tab 접근성 개선)
    if (option) {
      setTimeout(() => {
        if (quantityRefs.current[index]) {
          quantityRefs.current[index].focus();
        }
      }, 50);
    }
  };

  const handleDeleteRow = (index) => {
    if (index === null || index === undefined || index < 0 || index >= details.length) return;

    const newDetails = details.filter((_, i) => i !== index);

    // 삭제된 행에 재고 ID가 있으면 수량 복원 알림
    const deletedRow = details[index];
    if (onInventoryUpdate && deletedRow.inventory_id && deletedRow.quantity) {
      onInventoryUpdate(deletedRow.inventory_id, parseFloat(deletedRow.quantity));
    }

    setDetails(newDetails);

    // 선택된 행이 삭제된 행이면 선택 해제, 뒤쪽 행이면 인덱스 조정
    if (selectedRowIndex === index) {
      setSelectedRowIndex(null);
    } else if (selectedRowIndex > index) {
      setSelectedRowIndex(selectedRowIndex - 1);
    }
  };

  const removeSelectedRow = () => {
    if (selectedRowIndex === null) {
      showModal('warning', '선택 필요', '삭제할 행을 선택하세요.');
      return;
    }
    handleDeleteRow(selectedRowIndex);
  };

  // 키보드 네비게이션
  const handleQuantityKeyDown = (e, index) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      // [FIX] Shift+Tab (역방향)으로 나갈 때는 유효성 검사 제외
      if (e.shiftKey) return;

      const val = details[index].quantity;
      if (val === '' || val === null || parseFloat(val) === 0) {
        e.preventDefault();
        return; // 수량이 없으면 단가로 넘어가지 않음
      }

      e.preventDefault();
      if (unitPriceRefs.current[index]) {
        unitPriceRefs.current[index].focus();
      }
    }
  };

  const handleUnitPriceKeyDown = (e, index) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      // [FIX] Shift+Tab (역방향)으로 나갈 때는 유효성 검사 제외
      if (e.shiftKey) return;

      const val = details[index].unit_price;
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
  };

  const handleSenderKeyDown = (e, index) => {
    // Owner (Sender) -> Location
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (shipperLocationRefs.current[index]) {
        shipperLocationRefs.current[index].focus();
      }
    }
  };

  const handleShipperLocationKeyDown = (e, index) => {
    // Location -> Notes
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (notesRefs.current[index]) {
        notesRefs.current[index].focus();
      }
    }
  };

  const handleNotesKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      // 현재 행의 필수 값 체크 (품목, 수량, 단가)
      const row = details[index];
      const isInvalid = !row.product_id || !row.quantity || parseFloat(row.quantity) === 0 || !row.unit_price || parseFloat(row.unit_price) === 0;

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
  };

  // 합계 계산
  const totalAmount = useMemo(() => {
    return details.reduce((sum, d) => sum + (parseFloat(d.supply_amount) || 0), 0);
  }, [details]);

  // master.total_amount 업데이트
  useEffect(() => {
    setMaster(prev => ({ ...prev, total_amount: totalAmount }));
  }, [totalAmount]);

  // 저장
  const handleSave = async (shouldPrint = false) => {
    if (isSaving.current) return;
    isSaving.current = true;

    try {
      if (!master.company_id) {
        showModal('warning', '입력 오류', '거래처를 선택하세요.');
        isSaving.current = false;
        return;
      }

      // 누적 반품 한도 검사 (최종)
      for (const d of details) {
        if (d.parent_detail_id && d.quantity < 0) {
          const originQty = parseFloat(d.origin_quantity);
          const otherReturned = parseFloat(d.total_returned_quantity) || 0;
          const currentReturn = Math.abs(parseFloat(d.quantity));

          if (!isNaN(originQty) && (currentReturn + otherReturned) > originQty) {
            showModal('warning', '저장 실패',
              `[${d.product_name}] 품목의 반품 수량이 매출 한도를 초과합니다.\n\n` +
              `원본 매출: ${originQty}\n` +
              `기존 반품 합계: ${otherReturned}\n` +
              `현재 입력: ${currentReturn}\n` +
              `(최대 ${Math.max(0, originQty - otherReturned)}개까지 가능)`
            );
            isSaving.current = false;
            return;
          }
        }
      }


      const validDetails = details.filter(d => d.product_id && d.quantity);
      const hasModifiedPayments = Object.keys(modifiedPayments).length > 0;
      const hasDeletedPayments = deletedPaymentIds.length > 0;
      const hasPendingPayments = pendingPayments.length > 0;
      const isDirty = checkDirty();

      // 변경사항이 있는지 체크
      const hasChanges = isDirty || hasPendingPayments || hasModifiedPayments || hasDeletedPayments;

      // 저장 및 출력 버튼 클릭 시, 변경사항이 없으면 출력만 할지 물어봄
      if (shouldPrint && isEdit && currentTradeId && !hasChanges) {
        showModal(
          'info',
          '출력 확인',
          '변경된 내용이 없습니다.\n출력만 하시겠습니까?',
          () => {
            if (onPrint) {
              onPrint(currentTradeId);
            }
          },
          '출력',
          true
        );
        return;
      }

      // 1. 변경 사항이 아예 없는 경우 (기존 전표 수정 시)
      if (isEdit && !hasChanges) {
        showModal('warning', '입력 오류', '저장할 변경 사항이 없습니다.');
        return;
      }

      // 2. 변경을 시도했으나(또는 새 전표이나) 결과적으로 필수 데이터가 없는 경우
      if (validDetails.length === 0 && !hasPendingPayments && !hasModifiedPayments && !hasDeletedPayments) {
        showModal('warning', '입력 오류', '최소 1개의 품목을 입력하거나 입출금을 추가하세요.');
        return;
      }

      try {
        // 중복 체크
        const duplicateCheck = await tradeAPI.checkDuplicate({
          company_id: master.company_id,
          trade_date: master.trade_date,
          trade_type: tradeType,
          exclude_trade_id: isEdit ? currentTradeId : undefined
        });

        if (duplicateCheck.data.isDuplicate) {
          showModal(
            'warning',
            '중복 전표',
            `이미 동일 거래처에 ${master.trade_date} 날짜로 전표가 존재합니다.`,
            () => loadTrade(duplicateCheck.data.existingTradeId),
            '기존 전표 수정',
            true
          );
          return;
        }

        // 저장 데이터 준비
        const saveData = {
          master: {
            ...master,
            total_amount: totalAmount,
            tax_amount: 0,
            total_price: totalAmount
          },
          details: validDetails.map(d => ({
            id: d.id, // ID 포함 (수정 시 필수)
            product_id: d.product_id,
            parent_detail_id: d.parent_detail_id, // [IMPORTANT] 누적 반품 추적을 위해 필수
            quantity: parseFloat(d.quantity) || 0,
            unit_price: parseFloat(d.unit_price) || 0,
            supply_amount: parseFloat(d.supply_amount) || 0,
            tax_amount: 0,
            shipper_location: d.shipper_location || '',
            sender_name: d.sender_name || '',
            notes: d.notes || '',
            inventory_id: d.inventory_id // 재고 매칭을 위해 ID 전달
          }))

        };

        let savedTradeId;
        if (isEdit && currentTradeId) {
          await tradeAPI.update(currentTradeId, saveData);
          savedTradeId = currentTradeId;
        } else {
          const response = await tradeAPI.create(saveData);
          savedTradeId = response.data.data.id;
        }

        // 삭제 대기 중인 입출금 처리
        if (deletedPaymentIds.length > 0) {
          for (const paymentId of deletedPaymentIds) {
            try {
              await paymentAPI.deleteLinkedTransaction(paymentId);
            } catch (err) {
              console.error('입출금 삭제 오류:', err);
            }
          }
          setDeletedPaymentIds([]);
        }

        // 수정 대기 중인 입출금 처리
        const modifiedIds = Object.keys(modifiedPayments);
        if (modifiedIds.length > 0) {
          for (const paymentId of modifiedIds) {
            try {
              await paymentAPI.updateTransaction(paymentId, modifiedPayments[paymentId]);
            } catch (err) {
              console.error('입출금 수정 오류:', err);
            }
          }
          setModifiedPayments({});
        }

        // 대기 중인 입금 처리
        if (pendingPayments.length > 0) {
          const transactionType = isPurchase ? 'PAYMENT' : 'RECEIPT';
          for (const payment of pendingPayments) {
            await paymentAPI.createTransactionWithAllocation({
              transaction_date: master.trade_date,
              company_id: master.company_id,
              transaction_type: transactionType,
              amount: payment.amount,
              payment_method: payment.payment_method,
              notes: payment.notes || '',
              source_trade_id: savedTradeId
            });
          }
          setPendingPayments([]);
        }

        if (!shouldPrint) {
          showModal('success', '저장 완료', `전표가 ${isEdit ? '수정' : '등록'} 되었습니다.`);
        }

        // 저장 후 전표 다시 로드
        await loadTrade(savedTradeId);

        // 전표 변경 알림 (재고 목록 리프레시 등)
        if (onTradeChange) {
          onTradeChange();
        }

        if (onSaveSuccess) {
          onSaveSuccess(savedTradeId);
        }

        // 출력
        if (shouldPrint && onPrint) {
          onPrint(savedTradeId);
        }
      } catch (error) {
        console.error('저장 오류:', error);
        showModal('warning', '저장 실패', error.response?.data?.message || '저장에 실패했습니다.');
      }
    } finally {
      isSaving.current = false;
    }
  };

  // 전표 삭제 - 강력한 확인 절차
  const handleDelete = () => {
    if (!isEdit || !currentTradeId) return;

    // 삭제 확인 모달 열기
    setDeleteConfirmModal({ isOpen: true, confirmText: '' });
  };

  // 실제 삭제 실행
  const executeDelete = async () => {
    try {
      await tradeAPI.delete(currentTradeId);
      setDeleteConfirmModal({ isOpen: false, confirmText: '' });
      showModal('success', '삭제 완료', '전표가 삭제되었습니다.');
      // 삭제 후 같은 거래처 유지
      resetForm(master.trade_date, master.company_id);

      // 전표 변경 알림 (재고 목록 리프레시 등)
      if (onTradeChange) {
        onTradeChange();
      }

      // [NEW] Persisted initialTradeId 제거
      if (updateProps && initialTradeId) {
        updateProps({ initialTradeId: null, initialViewMode: false });
      }
    } catch (error) {
      console.error('삭제 오류:', error);
      setDeleteConfirmModal({ isOpen: false, confirmText: '' });
      const errorData = error.response?.data;

      // 매칭된 내역이 있어서 삭제 불가한 경우
      if (errorData?.errorType === 'MATCHING_EXISTS' && errorData?.matchingData) {
        setMatchingInfoModal({
          isOpen: true,
          data: errorData.matchingData
        });
      } else {
        showModal('warning', '삭제 실패', errorData?.message || '삭제에 실패했습니다.');
      }
    }
  };

  // 입금 추가
  const handleOpenAddPayment = () => {
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
  };

  const handleSaveNewPayment = () => {
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
  };

  const handleRemovePendingPayment = (tempId) => {
    setPendingPayments(pendingPayments.filter(p => p.tempId !== tempId));
  };

  // 거래처 옵션
  const companyOptions = useMemo(() => {
    return companies.map(company => ({
      value: company.id,
      // [CHANGED] 별칭 (사업자명) 형태로 표시
      label: company.business_name && company.business_name !== company.company_name
        ? `${company.company_name} (${company.business_name})`
        : company.company_name,
      data: { subLabel: company.business_name, code: company.company_code } // 검색 필터용 데이터 (business_name 추가)
    }));
  }, [companies]);

  // 품목 옵션 (정렬)
  const productOptions = useMemo(() => {
    const sorted = [...products].sort((a, b) => {
      const nameCompare = (a.product_name || '').localeCompare(b.product_name || '', 'ko');
      if (nameCompare !== 0) return nameCompare;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    return sorted.map(product => {
      const unit = product.weight_unit || 'kg';
      const weightStr = product.weight ? `${parseFloat(product.weight)} ${unit}` : '';
      return {
        value: product.id,
        label: `${product.product_name}${weightStr ? ` ${weightStr}` : ''}${product.grade ? ` (${product.grade})` : ''} `
      };
    });
  }, [products]);

  // 잔고 계산
  const summary = companySummary || {
    today_total: 0,
    previous_balance: 0,
    subtotal: 0,
    today_payment: 0,
    final_balance: 0,
    last_trade_date: null
  };

  // 금일합계: 현재 입력 중인 품목의 합계 (실시간 반영)
  const currentTodayTotal = totalAmount;
  // 전잔고 + 금일 타 전표 + 금일 현재 전표 (실시간 계산)
  // [FIX] summary.today_total은 현재 전표를 제외한 다른 전표들의 합계이므로, 여기에 현재 전표(currentTodayTotal)를 더하는 것이 맞으나
  // UI상 '금일합계'로 표시되고 있어 혼동이 있으므로, 명확하게 '현재 전표 실시간 합계'와 '다른 전표 포함 총합'을 구분함.
  const currentSubtotal = (Number(summary.previous_balance) || 0) + (Number(summary.today_total) || 0) + currentTodayTotal;
  // 입출금 대기 금액
  const pendingTotal = pendingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  // [FIX] 기존 연결된 입금 내역 + 대기 중인 입금 내역 합계
  const linkedTotal = linkedPayments.reduce((sum, p) => sum + (Number(p.allocated_amount || p.amount) || 0), 0);
  // [FIX] 수식 전수 숫자화 (문자열 연결 방지) 및 명시적 초기값 보장
  const displayPayment = (Number(summary.today_payment) || 0) + (Number(pendingTotal) || 0) + (Number(linkedTotal) || 0);
  // 최종 잔고 (전잔고 + 금일 - 입금)
  const displayBalance = Number(currentSubtotal) - Number(displayPayment);

  // 변경사항 여부 (UI 버튼 스타일링용)
  const hasChanges = checkDirty();



  if (loading) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>;
  }

  // 폰트 스케일에 따른 크기 계산 헬퍼
  // 고정 폰트 크기 (전표 목록과 동일하게 0.8rem 기준)
  const fs = (size) => `${(size * 0.85).toFixed(2)}rem`;

  return (
    <div
      className={`trade-panel-container ${isViewMode ? 'view-mode' : ''}`}
      onMouseDown={markPanelActive}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, boxSizing: 'border-box' }}
    >
      <div className="trade-header-section">
        {/* 기본 정보 카드 */}
        <div className="card" style={{ marginBottom: '0.5rem', padding: '9px', flexShrink: 0, backgroundColor: cardColor }}>
          <div className="trade-form-row">
            <div className="trade-form-group trade-date-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', height: '36px' }}>
              {/* <label className="trade-label required" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>거래일자</label> */}
              <div className="trade-input-wrapper" style={{ flex: 1, height: '100%' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  style={{ height: '100%' }}
                  onClick={() => handleDateChange(-1)}
                // disabled={isViewMode} // 거래처 선택 상태에서도 날짜 변경 가능하도록 수정
                >◀</button>
                <input
                  type="date"
                  value={master.trade_date}
                  onChange={(e) => handleDateInputChange(e.target.value)}
                  className={`trade-date-input ${master.trade_date !== formatLocalDate(new Date()) ? 'is-not-today' : ''}`}
                  required
                  style={{ flex: 1, height: '100%' }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  style={{ height: '100%' }}
                  onClick={() => handleDateChange(1)}
                // disabled={isViewMode} // 거래처 선택 상태에서도 날짜 변경 가능하도록 수정
                >▶</button>
              </div>
            </div>
            <div className="trade-form-group" style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', height: '36px' }}>
              {/* <label className="trade-label required" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>거래처</label> */}
              <div style={{ flex: 1, height: '100%' }}>
                <SearchableSelect
                  ref={companyRef}
                  options={companyOptions}
                  value={master.company_id}
                  onChange={handleCompanyChange}
                  placeholder="거래처 선택..."
                  noOptionsMessage="거래처 없음"
                  styles={{
                    control: (base) => ({ ...base, minHeight: '36px', height: '36px' }),
                    valueContainer: (base) => ({ ...base, height: '34px', padding: '0 8px' }),
                    indicatorsContainer: (base) => ({ ...base, height: '34px' }),
                    menuPortal: (base) => ({ ...base, zIndex: 99999 })
                  }}
                  menuPortalTarget={document.body}
                />
              </div>
            </div>
            {isPurchase && (
              <div className="trade-form-group" style={{ width: '180px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', height: '36px' }}>
                {/* <label className="trade-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>입고 창고</label> */}
                <div style={{ flex: 1, height: '100%' }}>
                  <SearchableSelect
                    options={warehouses
                      .filter(w => w.is_active || String(w.id) === String(master.warehouse_id))
                      .map(w => ({ value: w.id, label: w.is_active ? w.name : `${w.name} (비활성)` }))}
                    value={master.warehouse_id}
                    onChange={(o) => setMaster({ ...master, warehouse_id: o ? o.value : '' })}
                    placeholder="기본 창고"
                    isDisabled={!master.company_id || isViewMode}
                    styles={{
                      control: (base) => ({ ...base, minHeight: '36px', height: '36px' }),
                      valueContainer: (base) => ({ ...base, height: '34px', padding: '0 8px' }),
                      indicatorsContainer: (base) => ({ ...base, height: '34px' }),
                      menuPortal: (base) => ({ ...base, zIndex: 99999 })
                    }}
                    menuPortalTarget={document.body}
                  />
                </div>
              </div>
            )}
            {/* 버튼 영역 */}
            <div className="trade-action-buttons">
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-custom"
                onClick={handleReset}
              >
                초기화
              </button>
              {isViewMode ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-custom"
                    onClick={() => {
                      if (onPrint && currentTradeId) {
                        onPrint(currentTradeId);
                      }
                    }}
                  >
                    출력
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm btn-custom"
                    onClick={() => setIsViewMode(false)}
                  >
                    수정 모드
                  </button>
                  {/* View Mode에서는 닫기 버튼 등이 필요할 수 있으나 FloatingWindow가 처리 */}
                </>
              ) : (
                <>
                  {isEdit && currentTradeId && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm btn-custom"
                      onClick={handleDelete}
                      disabled={!master.company_id}
                    >
                      삭제
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn btn-primary btn-sm btn-custom btn-save-edit ${hasChanges ? 'is-dirty' : ''}`}
                    onClick={() => handleSave(false)}
                    disabled={!master.company_id}
                  >
                    {isEdit ? '수정' : '저장'}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-success btn-sm btn-custom btn-save-print ${hasChanges ? 'is-dirty' : ''}`}
                    onClick={() => handleSave(true)}
                    disabled={!master.company_id}
                  >
                    {isEdit ? '수정 및 출력' : '저장 및 출력'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 영역 (품목 상세 + 잔고) */}
      <div className="trade-content-area" style={{ flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {/* 왼쪽: 품목 상세 카드 */}
        <div className="trade-detail-card" style={{ backgroundColor: cardColor }}>
          <div className="trade-card-header">
            <h2 className="trade-card-title">품목 상세</h2>
            <div className="trade-card-actions">
              <button
                type="button"
                className="btn btn-secondary btn-custom btn-sm"
                onClick={refreshProducts}
                disabled={isViewMode}
              >
                품목 새로고침
              </button>
              {/* 재고 버튼 (매출일 때만 표시) */}
              {!isPurchase && onLaunchApp && (
                <button
                  type="button"
                  className="btn btn-info btn-custom btn-sm"
                  onClick={() => onLaunchApp('INVENTORY_QUICK')}
                  style={{ backgroundColor: '#17a2b8', color: 'white', border: 'none' }}
                >
                  재고
                </button>
              )}
              {/* 반품 버튼 (매출일 때만 표시) */}
              {!isPurchase && (
                <button
                  type="button"
                  className="btn btn-warning btn-custom btn-sm"
                  onClick={() => setIsSalesLookupOpen(true)}
                  disabled={!master.company_id || isViewMode}
                  style={{ backgroundColor: '#f39c12', color: 'white', border: 'none' }}
                >
                  반품
                </button>
              )}
              <button
                type="button"
                className="btn btn-success btn-custom btn-sm"
                onClick={addDetailRow}
                disabled={!master.company_id || isViewMode}
              >
                + 추가
              </button>
            </div>
          </div>

          <div
            className="trade-table-container"
            ref={tableContainerRef}
            onDragOver={(e) => handleDragOver(e, details.length)}
            onDrop={(e) => handleDrop(e, details.length)}
          >
            <table className="trade-table">
              <thead>
                <tr>
                  <th className="col-no">No</th>
                  <th className="col-product">품목</th>
                  <th className="col-qty">수량</th>
                  <th className="col-price">단가</th>
                  <th className="col-amount">금액</th>
                  {isPurchase && <th className="col-owner">출하주</th>}
                  {isPurchase && <th className="col-location">출하지</th>}
                  <th className="col-remarks">비고</th>
                  <th className="col-action"></th>
                </tr>
              </thead>
              <tbody>
                {details.map((detail, index) => (
                  <tr
                    key={index}
                    draggable={!isMobile}
                    onDragStart={(e) => {
                      // 핸들(삼선)을 잡았을 때만 드래그 시작 (Ref 체크)
                      if (!dragHandleRef.current) {
                        e.preventDefault();
                        return;
                      }
                      handleDragStart(e, index);
                    }}
                    onDragOver={(e) => {
                      e.stopPropagation();
                      handleDragOver(e, index);
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDrop(e, index);
                    }}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedRowIndex(index)}
                    className={`trade-table-row ${selectedRowIndex === index ? 'selected' : ''} ${draggedIndex === index ? 'is-dragging' : ''} ${dragOverIndex === index ? 'is-over' : ''}`}
                    style={{ transition: 'background-color 0.15s' }}
                  >
                    <td>
                      <span className="trade-index-cell">
                        <span
                          className="trade-drag-handle"
                          onMouseDown={() => { dragHandleRef.current = true; }}
                          onMouseUp={() => { dragHandleRef.current = false; }}
                          onMouseLeave={() => { dragHandleRef.current = false; }}
                        >☰</span>
                        {index + 1}
                      </span>
                    </td>
                    <td>
                      <SearchableSelect
                        ref={el => productRefs.current[index] = el}
                        options={productOptions}
                        value={detail.product_id}
                        onChange={(option) => handleDetailSelectChange(index, option)}
                        placeholder="품목 검색..."
                        noOptionsMessage="품목 없음"
                        menuPortalTarget={document.body}
                        size="small"
                        isDisabled={!!detail.inventory_id || isViewMode} // 재고 드롭 항목은 품목 변경 불가
                      />
                    </td>
                    <td>
                      <input
                        ref={el => quantityRefs.current[index] = el}
                        type="text"
                        value={detail.quantity !== undefined && detail.quantity !== null ? formatCurrency(detail.quantity) : ''}
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          const isNegative = inputValue.startsWith('-');
                          const numericPart = inputValue.replace(/[^0-9.]/g, ''); // 숫자와 소수점만 허용
                          const val = (isNegative ? '-' : '') + numericPart;
                          handleDetailChange(index, 'quantity', val);
                        }}
                        onFocus={(e) => {
                          // 포커스 시점의 값을 저장 (입력 취소 시 복원용)
                          focusValueRef.current[index] = detail.quantity;
                        }}
                        onKeyDown={(e) => handleQuantityKeyDown(e, index)}
                        className="trade-input-table trade-input-right"
                        placeholder="0"
                        disabled={isViewMode}
                      />
                    </td>
                    <td>
                      <input
                        ref={el => unitPriceRefs.current[index] = el}
                        type="text"
                        value={detail.unit_price !== undefined && detail.unit_price !== null ? formatCurrency(detail.unit_price) : ''}
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          const isNegative = inputValue.startsWith('-');
                          const numericPart = inputValue.replace(/[^0-9.]/g, '');
                          const val = (isNegative ? '-' : '') + numericPart;
                          handleDetailChange(index, 'unit_price', val);
                        }}
                        onKeyDown={(e) => handleUnitPriceKeyDown(e, index)}
                        className="trade-input-table trade-input-right"
                        placeholder="0"
                        disabled={isViewMode}
                      />
                    </td>
                    <td className="trade-input-right" style={{ padding: '4px 8px', fontWeight: '600', color: isPurchase ? '#c0392b' : '#2980b9' }}>
                      {formatCurrency(detail.supply_amount)}
                    </td>
                    {isPurchase && (
                      <td>
                        <input
                          ref={el => senderRefs.current[index] = el}
                          type="text"
                          value={detail.sender_name || ''}
                          onChange={(e) => handleDetailChange(index, 'sender_name', e.target.value)}
                          onKeyDown={(e) => handleSenderKeyDown(e, index)}
                          className="trade-input-table"
                          disabled={isViewMode}
                        />
                      </td>
                    )}
                    {isPurchase && (
                      <td>
                        <input
                          ref={el => shipperLocationRefs.current[index] = el}
                          type="text"
                          value={detail.shipper_location || ''}
                          onChange={(e) => handleDetailChange(index, 'shipper_location', e.target.value)}
                          onKeyDown={(e) => handleShipperLocationKeyDown(e, index)}
                          className="trade-input-table"
                          disabled={isViewMode}
                        />
                      </td>
                    )}
                    <td>
                      <input
                        ref={el => notesRefs.current[index] = el}
                        type="text"
                        value={detail.notes || ''}
                        onChange={(e) => handleDetailChange(index, 'notes', e.target.value)}
                        onKeyDown={(e) => handleNotesKeyDown(e, index)}
                        className="trade-input-table"
                        disabled={isViewMode}
                      />
                    </td>
                    <td className="cell-action">
                      <button
                        type="button"
                        className="btn-delete-row"
                        onClick={(e) => {
                          e.stopPropagation(); // 행 선택 방지
                          handleDeleteRow(index);
                        }}
                        tabIndex="-1"
                        disabled={isViewMode}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {/* 빈 행 표시 제거됨 */}
                {/* Spacer Row to push footer to bottom */}
                <tr style={{ height: '100%', background: 'transparent' }} onDragOver={(e) => handleDragOver(e, details.length)} onDrop={(e) => handleDrop(e, details.length)}>
                  <td colSpan="10" style={{ border: 'none', padding: 0 }}></td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="trade-table-footer">
                  <td colSpan={isPurchase ? 4 : 4} className="trade-total-label">합계</td>
                  <td className="trade-total-value">
                    {formatCurrency(totalAmount)}
                  </td>
                  {isPurchase && <td></td>}
                  {isPurchase && <td></td>}
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

        </div>

        {/* 하단 영역: 비고 및 잔고 */}
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'stretch', width: '100%', minHeight: '220px', marginTop: '0.5rem' }}>

          {/* 왼쪽: 비고 카드 (새로 생성) */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '9px', backgroundColor: cardColor, marginBottom: 0 }}>
            <h2 className="card-title trade-card-title" style={{ marginBottom: '0.5rem' }}>비고</h2>
            <textarea
              value={master.notes}
              onChange={(e) => setMaster({ ...master, notes: e.target.value })}
              className="trade-textarea"
              placeholder="메모 입력..."
              style={{ flex: 1, resize: 'none', width: '100%', height: '100%' }}
              disabled={!master.company_id || isViewMode}
            />
          </div>

          {/* 오른쪽: 잔고 정보 카드 */}
          <div className="trade-balance-card" style={{ backgroundColor: cardColor }}>


            {/* 잔고 정보 리스트 */}
            <div className="balance-list">
              <div className="balance-item">
                <span className="balance-text-label">현재 전표 합계</span>
                <span className="balance-text-value" style={{ color: isPurchase ? '#2980b9' : '#e67e22', fontWeight: '800' }}>
                  {formatCurrency(currentTodayTotal)}원
                </span>
              </div>
              <div className="balance-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="balance-text-label">전잔고</span>
                  {summary.last_trade_date && (
                    <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'normal' }}>
                      {summary.last_trade_date.substring(5).replace('-', '/')}
                    </span>
                  )}
                </div>
                <span className="balance-text-value">{formatCurrency(summary.previous_balance)}원</span>
              </div>
              <div className="balance-item">
                <span className="balance-text-label">전잔고 + 오늘 총계</span>
                <span className="balance-text-value">{formatCurrency(currentSubtotal)}원</span>
              </div>

              <div className="balance-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="balance-text-label">
                    {isPurchase ? '출금' : '입금'}
                    {pendingTotal > 0 && <span className="tag-pending-count"> ({pendingPayments.length}건)</span>}
                  </span>
                  {summary.last_payment_date && (
                    <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'normal' }}>
                      {summary.last_payment_date.substring(5).replace('-', '/')}
                    </span>
                  )}
                </div>
                <span className="balance-text-value text-green">
                  {formatCurrency(displayPayment)}원
                </span>
              </div>
            </div>

            {/* 잔고 */}
            {(() => {
              // 잔고 상태별 색상 클래스
              const balanceClass = displayBalance > 0 ? 'positive' : displayBalance < 0 ? 'negative' : 'zero';

              return (
                <div className={`balance-box ${balanceClass}`}>
                  <span className="balance-box-label">
                    잔고{pendingTotal > 0 ? ' (예정)' : ''}
                  </span>
                  <span className="balance-box-value">
                    {displayBalance < 0 ? '-' : ''}{formatCurrency(Math.abs(displayBalance))}원
                  </span>
                </div>
              );
            })()}

            {/* 입출금 내역 섹션 */}
            <div className="payment-section-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '0.5rem' }}>
              <div className="payment-section-header">
                <h3 className="trade-section-label m-0">
                  📋 {isPurchase ? '출금' : '입금'} 내역
                </h3>
                <button
                  type="button"
                  onClick={handleOpenAddPayment}
                  disabled={!master.company_id || isViewMode}
                  className="payment-add-btn"
                  style={{
                    backgroundColor: master.company_id ? (isPurchase ? '#3498db' : '#27ae60') : '#ccc',
                  }}
                >
                  + {isPurchase ? '출금' : '입금'} 추가
                </button>
              </div>

              {/* 입출금 내역 리스트 제거됨 (기존 방식 복귀) */}

              {/* 연결된 입금 내역 */}
              {(linkedPayments.length > 0 || pendingPayments.length > 0) ? (
                <div className="payment-list-container">
                  {linkedPayments.map(payment => {
                    const linkType = payment.link_type;
                    const displayAmount = linkType === 'allocated' ? payment.allocated_amount : payment.amount;
                    // 직접 연결 또는 수금/지급에서 등록한 것은 삭제 가능 (배분된 것은 불가)
                    const canDelete = linkType === 'direct' || linkType === 'general';
                    const isModified = modifiedPayments[payment.id]; // 수정 대기 중인지 확인

                    // 유형별 스타일
                    return (
                      <div key={`${payment.id}-${linkType}`} className={`payment-item ${linkType}`}>
                        <div className="flex-1" style={{ overflow: 'hidden' }}>
                          <div className="payment-detail-row">
                            {formatCurrency(displayAmount)}원
                            {linkType !== 'direct' && (
                              <span className={`payment-badge ${linkType}`}>
                                {linkType === 'allocated' ? '배분' : '수금/지급'}
                              </span>
                            )}
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              border: '1px solid #e2e8f0',
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}>
                              {payment.payment_method || '미지정'}
                            </span>
                            {payment.notes && (
                              <span style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                ({payment.notes})
                              </span>
                            )}
                            {isModified && (
                              <span className="tag-modified">
                                수정됨
                              </span>
                            )}
                          </div>
                        </div>
                        {
                          canDelete && !isViewMode && (
                            <div className="payment-actions">
                              <button
                                type="button"
                                onClick={() => setEditingPayment(payment)}
                                className="btn btn-custom btn-primary btn-xs"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeletedPaymentIds(prev => [...prev, payment.id]);
                                  setLinkedPayments(prev => prev.filter(p => p.id !== payment.id));
                                }}
                                className="btn btn-custom btn-danger btn-xs"
                              >
                                삭제
                              </button>
                            </div>
                          )
                        }
                      </div>
                    );
                  })}
                  {/* 대기 중인 입금 내역 */}
                  {pendingPayments.map(payment => (
                    <div key={payment.tempId} className="payment-item" style={{
                      backgroundColor: '#fff3cd',
                      borderLeftColor: '#ffc107',
                      borderStyle: 'dashed'
                    }}>
                      <div className="flex-1" style={{ overflow: 'hidden' }}>
                        <div className="payment-detail-row">
                          {formatCurrency(payment.amount)}원
                          <span className="payment-badge" style={{ backgroundColor: '#ffc107', color: '#333', flexShrink: 0 }}>
                            대기
                          </span>
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#fff',
                            color: '#666',
                            border: '1px solid #ddd',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}>
                            {payment.payment_method || '미지정'}
                          </span>
                          {payment.notes && (
                            <span style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              ({payment.notes})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="payment-actions">
                        {!isViewMode && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingPendingPayment({
                                ...payment,
                                displayAmount: new Intl.NumberFormat('ko-KR').format(Math.abs(payment.amount))
                              })}
                              className="btn btn-custom btn-primary btn-xs"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePendingPayment(payment.tempId)}
                              className="btn btn-custom btn-danger btn-xs"
                            >
                              취소
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}


            </div>
          </div>
        </div>
      </div>
      {/* 공통 Confirm Modal */}
      < ConfirmModal
        isOpen={modal.isOpen}
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))
        }
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        confirmText={modal.confirmText}
        showCancel={modal.showCancel}
      />

      {/* 입금/출금 추가 모달 */}
      {
        addPaymentModal.isOpen && (
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
              onMouseDown={handlePaymentDrag}
              style={{
                ...paymentDragStyle,
                padding: '1.5rem',
                backgroundColor: '#fff',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                outline: 'none',
                cursor: 'grab'
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50', pointerEvents: 'none' }}>
                {isPurchase ? '💸 출금' : '💰 입금'} 추가
              </h3>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>금액 *</label>
                <input
                  type="text"
                  className="payment-amount-input"
                  value={addPaymentModal.displayAmount}
                  onChange={(e) => {
                    // 마이너스 기호와 숫자만 허용
                    const inputValue = e.target.value;
                    const isNegative = inputValue.startsWith('-');
                    const numericPart = inputValue.replace(/[^0-9]/g, '');
                    const rawValue = isNegative && numericPart ? `- ${numericPart} ` : numericPart;
                    const displayValue = numericPart
                      ? (isNegative ? '-' : '') + new Intl.NumberFormat('ko-KR').format(parseInt(numericPart))
                      : (isNegative ? '-' : '');
                    setAddPaymentModal(prev => ({
                      ...prev,
                      amount: rawValue,
                      displayAmount: displayValue
                    }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const amount = parseFloat(addPaymentModal.amount) || 0;
                      if (amount === 0) {
                        // 금액이 0원이면 다음으로 넘어가지 않음
                        return;
                      }
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
                  {paymentMethods.map(method => (
                    <option key={method.id} value={method.name}>{method.name}</option>
                  ))}
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
        )
      }

      {/* 입출금 수정 모달 */}
      {
        editingPayment && (
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
              onMouseDown={handlePaymentDrag}
              style={{
                ...paymentDragStyle,
                backgroundColor: 'white',
                borderRadius: '8px',
                maxWidth: '400px',
                width: '90%',
                padding: '1.5rem',
                outline: 'none',
                cursor: 'grab'
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50', pointerEvents: 'none' }}>
                {isPurchase ? '💸 출금' : '💰 입금'} 수정
              </h3>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>금액 *</label>
                <input
                  type="text"
                  value={editingPayment.displayAmount || new Intl.NumberFormat('ko-KR').format(editingPayment.amount || 0)}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    const amount = parseInt(numericValue) || 0;
                    setEditingPayment(prev => ({
                      ...prev,
                      amount: amount,
                      displayAmount: numericValue ? new Intl.NumberFormat('ko-KR').format(amount) : ''
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
                  value={editingPayment.payment_method || (paymentMethods.length > 0 ? paymentMethods[0].name : '')}
                  onChange={(e) => setEditingPayment(prev => ({ ...prev, payment_method: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.target.closest('.modal-container').querySelector('input[placeholder="메모"]')?.focus();
                    }
                  }}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  {paymentMethods.map(method => (
                    <option key={method.id} value={method.name}>{method.name}</option>
                  ))}
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
                      // 수정 대기 목록에 추가하고 모달 닫기
                      setModifiedPayments(prev => ({
                        ...prev,
                        [editingPayment.id]: {
                          amount: editingPayment.amount,
                          payment_method: editingPayment.payment_method,
                          notes: editingPayment.notes
                        }
                      }));
                      setLinkedPayments(prev => prev.map(p =>
                        p.id === editingPayment.id
                          ? { ...p, amount: editingPayment.amount, allocated_amount: editingPayment.amount, payment_method: editingPayment.payment_method, notes: editingPayment.notes }
                          : p
                      ));
                      setEditingPayment(null);
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
                  onClick={() => {
                    // 수정 대기 목록에 추가
                    setModifiedPayments(prev => ({
                      ...prev,
                      [editingPayment.id]: {
                        amount: editingPayment.amount,
                        payment_method: editingPayment.payment_method,
                        notes: editingPayment.notes
                      }
                    }));
                    // linkedPayments 화면 표시용 업데이트
                    setLinkedPayments(prev => prev.map(p =>
                      p.id === editingPayment.id
                        ? { ...p, amount: editingPayment.amount, allocated_amount: editingPayment.amount, payment_method: editingPayment.payment_method, notes: editingPayment.notes }
                        : p
                    ));
                    setEditingPayment(null);
                  }}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* 매칭 정보 모달 (삭제 불가 안내) */}
      {
        matchingInfoModal.isOpen && matchingInfoModal.data && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000
            }}
          >
            <div style={{
              ...matchingDragStyle,
              position: 'fixed',
              top: '50%',
              left: '50%',
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
            }}>
              {/* 헤더 */}
              <div
                onMouseDown={handleMatchingDrag}
                style={{
                  padding: '1rem 1.5rem',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  cursor: 'grab'
                }}
              >
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'none' }}>
                  ⚠️ 삭제할 수 없습니다
                </h3>
              </div>

              {/* 내용 */}
              <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                <p style={{ margin: '0 0 1rem 0', color: '#555', lineHeight: '1.6' }}>
                  이 매입 전표는 다음 <strong>{matchingInfoModal.data.totalCount}건</strong>의 매출과 매칭되어 있습니다:
                </p>

                {/* 매칭 목록 */}
                <div style={{
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  maxHeight: '250px',
                  overflowY: 'auto'
                }}>
                  {matchingInfoModal.data.items
                    .sort((a, b) => {
                      // 1. 재고 순번 (seqNo) 오름차순
                      const seqDiff = (a.seqNo || 0) - (b.seqNo || 0);
                      if (seqDiff !== 0) return seqDiff;
                      // 2. 날짜 내림차순 (최신순)
                      const dateDiff = new Date(b.saleDate) - new Date(a.saleDate);
                      if (dateDiff !== 0) return dateDiff;
                      // 3. 품목명 오름차순
                      return (a.productName || '').localeCompare(b.productName || '');
                    })
                    .map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem',
                          backgroundColor: 'white',
                          borderRadius: '6px',
                          marginBottom: idx < matchingInfoModal.data.items.length - 1 ? '0.5rem' : 0,
                          borderLeft: '3px solid #3498db'
                        }}
                      >
                        <div style={{ fontWeight: '600', color: '#2c3e50', marginBottom: '0.25rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#ecf0f1',
                            color: '#7f8c8d',
                            fontSize: '0.8rem',
                            marginRight: '6px',
                            verticalAlign: 'middle'
                          }}>
                            No.{item.seqNo}
                          </span>
                          {item.productName} - {item.matchedQuantity}개
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          → {item.saleDate} / {item.saleTradeNumber}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          → 거래처: {item.customerName}
                        </div>
                      </div>
                    ))}
                </div>

                <p style={{
                  margin: '1rem 0 0 0',
                  padding: '0.75rem',
                  backgroundColor: '#fff3cd',
                  borderRadius: '6px',
                  color: '#856404',
                  fontSize: '0.9rem'
                }}>
                  💡 삭제하려면 먼저 <strong>재고 관리 → 매칭 관리</strong>에서 매칭을 해제해주세요.
                </p>
              </div>

              {/* 버튼 */}
              <div style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid #eee',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem'
              }}>
                <button
                  onClick={() => setMatchingInfoModal({ isOpen: false, data: null })}
                  style={{
                    padding: '0.5rem 1.5rem',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )
      }

      <TradeDeleteConfirmModal
        isOpen={deleteConfirmModal.isOpen}
        onClose={() => setDeleteConfirmModal({ isOpen: false })}
        onConfirm={executeDelete}
        title="전표 삭제 확인"
        warnings={[
          '삭제된 전표는 <strong>복구할 수 없습니다</strong>',
          '연결된 <strong>입출금 내역</strong>이 함께 삭제됩니다',
          '<strong>거래처 잔고</strong>가 자동으로 조정됩니다'
        ]}
        tradeDate={master.trade_date}
        tradeType={master.trade_type}
        companyName={companies.find(c => String(c.id) === String(master.company_id))?.company_name}
        tradeNumber={currentTradeId} // 전표 번호 전달 추가 (누락되어 있었음)
      />

      {/* 반품 조회 모달 */}
      <SalesLookupModal
        isOpen={isSalesLookupOpen}
        onClose={() => setIsSalesLookupOpen(false)}
        companyId={master.company_id}
        companyName={companies.find(c => c.id === master.company_id)?.company_name}
        onSelect={handleSalesLink}
      />

      {/* 대기 중 입출금 수정 모달 */}
      {
        editingPendingPayment && (
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
              onMouseDown={handlePaymentDrag}
              style={{
                ...paymentDragStyle,
                backgroundColor: 'white',
                borderRadius: '8px',
                maxWidth: '400px',
                width: '90%',
                padding: '1.5rem',
                outline: 'none',
                cursor: 'grab'
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50', pointerEvents: 'none' }}>
                {isPurchase ? '💸 출금' : '💰 입금'} 수정 (대기)
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
                    setEditingPendingPayment(prev => ({
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
                  value={editingPendingPayment.payment_method || (paymentMethods.length > 0 ? paymentMethods[0].name : '')}
                  onChange={(e) => setEditingPendingPayment(prev => ({ ...prev, payment_method: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.target.closest('.modal-container').querySelector('input[placeholder="메모"]')?.focus();
                    }
                  }}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  {paymentMethods.map(method => (
                    <option key={method.id} value={method.name}>{method.name}</option>
                  ))}
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
                      // pendingPayments 업데이트
                      if (editingPendingPayment.amount === 0) {
                        showModal('warning', '입력 오류', `0원은 ${isPurchase ? '출금' : '입금'}할 수 없습니다.`);
                        return;
                      }
                      setPendingPayments(prev => prev.map(p =>
                        p.tempId === editingPendingPayment.tempId
                          ? { ...p, amount: editingPendingPayment.amount, payment_method: editingPendingPayment.payment_method, notes: editingPendingPayment.notes }
                          : p
                      ));
                      setEditingPendingPayment(null);
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
                  onClick={() => {
                    // 유효성 검사
                    if (editingPendingPayment.amount === 0) {
                      showModal('warning', '입력 오류', `0원은 ${isPurchase ? '출금' : '입금'}할 수 없습니다.`);
                      return;
                    }
                    // pendingPayments 업데이트
                    setPendingPayments(prev => prev.map(p =>
                      p.tempId === editingPendingPayment.tempId
                        ? { ...p, amount: editingPendingPayment.amount, payment_method: editingPendingPayment.payment_method, notes: editingPendingPayment.notes }
                        : p
                    ));
                    setEditingPendingPayment(null);
                  }}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )
      }
      {/* 네비게이션 차단 모달 */}
      {/* ... (생략) ... */}

      {/* [재고 드롭] 수량/단가 입력 모달 */}
      {
        inventoryInputModal.isOpen && createPortal(
          <div
            className="modal-overlay"
            onMouseDown={(e) => e.stopPropagation()} // 이벤트 버블링 차단하여 뒤의 전표 창이 앞으로 튀어나오지 않게 함
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setInventoryInputModal(prev => ({ ...prev, isOpen: false }));
                // 취소 시에도 재고 목록 창에 포커스 반환
                if (window.__bringToFront) window.__bringToFront('INVENTORY_QUICK');
                window.dispatchEvent(new CustomEvent('inventory-quick-add-complete', { detail: { success: false } }));
              }
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10000 // ConfirmModal(11000)보다 확실히 낮게 설정
            }}
          >
            <div
              className="modal-container"
              style={{
                ...inventoryDragStyle,
                position: 'fixed', // useModalDraggable의 transform 기준점 확보
                top: '50%',
                left: '50%',
                width: '450px',
                maxWidth: '90%',
                padding: '1.5rem',
                textAlign: 'left', // modal-container 기본이 center일 수 있으므로
                boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)' // 그림자 추가
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div
                onMouseDown={handleInventoryDrag}
                style={{
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  cursor: 'grab'
                }}
              >
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50', fontSize: '1.4rem', pointerEvents: 'none' }}>재고 품목 추가</h3>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  color: '#7f8c8d'
                }}>
                  {(() => {
                    const inv = inventoryInputModal.inventory || {};
                    const weight = inv.weight || inv.product_weight;
                    const unit = inv.weight_unit || inv.product_weight_unit || 'kg';
                    const weightText = weight ? `${parseFloat(weight)}${unit}` : '';
                    const senderText = inv.sender ? ` ${inv.sender} ` : '';
                    const gradeText = inv.grade ? ` (${inv.grade})` : '';

                    return (
                      <>
                        {inv.product_name || '품목명'}
                        <span style={{ fontWeight: '500' }}>{weightText}</span>
                        <span style={{ fontSize: '1.1rem', color: '#3498db', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                          {senderText}{gradeText}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* 정보 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                backgroundColor: '#f8f9fa',
                padding: '1rem',
                borderRadius: '8px'
              }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '1.0rem', color: '#7f8c8d', marginBottom: '0.25rem' }}>재고 잔량</div>
                  <div style={{ fontWeight: '700', fontSize: '1.2rem', color: '#27ae60' }}>
                    {inventoryInputModal.maxQuantity}
                  </div>
                </div>
                <div style={{ width: '1px', backgroundColor: '#e0e0e0' }}></div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '1.0rem', color: '#7f8c8d', marginBottom: '0.25rem' }}>기준 단가</div>
                  <div style={{ fontWeight: '700', fontSize: '1.2rem' }}>
                    {formatCurrency(inventoryInputModal.inventory?.unit_price || 0)}원
                  </div>
                </div>
              </div>

              {/* 입력 폼 */}
              <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '600' }}>수량</label>
                  <input
                    type="text"
                    value={inventoryInputModal.quantity ? formatCurrency(parseFloat(inventoryInputModal.quantity)) : ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      setInventoryInputModal(prev => ({ ...prev, quantity: val }));
                    }}
                    className="modal-input-highlight"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      height: '45px',
                      fontSize: '1.2rem',
                      fontWeight: '800',
                      textAlign: 'right',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      boxSizing: 'border-box',
                      color: '#2980b9'
                    }}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const qty = parseFloat(inventoryInputModal.quantity) || 0;
                        const limit = inventoryInputModal.maxQuantity ?? 0;

                        if (qty <= 0) {
                          showModal('warning', '입력 오류', '수량을 입력하세요.');
                          return;
                        }

                        if (qty > limit) {
                          showModal('warning', '수량 초과', `재고 잔량을 초과할 수 없습니다.\n(최대: ${limit})`);
                          return;
                        }

                        const priceInput = document.getElementById('modal-price-input');
                        if (priceInput) {
                          priceInput.focus();
                          priceInput.select();
                        }
                      }
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '600' }}>단가</label>
                  <input
                    id="modal-price-input"
                    type="text"
                    value={inventoryInputModal.unitPrice ? formatCurrency(parseFloat(inventoryInputModal.unitPrice)) : ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setInventoryInputModal(prev => ({ ...prev, unitPrice: val }));
                    }}
                    className="modal-input-highlight"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      height: '45px',
                      fontSize: '1.2rem',
                      fontWeight: '800',
                      textAlign: 'right',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      boxSizing: 'border-box',
                      color: '#2c3e50'
                    }}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInventoryInputConfirm();
                    }}
                  />
                </div>
              </div>

              {/* 버튼 */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    setInventoryInputModal(prev => ({ ...prev, isOpen: false }));
                    // 취소 시에도 재고 목록 창에 포커스 반환
                    if (window.__bringToFront) window.__bringToFront('INVENTORY_QUICK');
                    window.dispatchEvent(new CustomEvent('inventory-quick-add-complete', { detail: { success: false } }));
                  }}
                  className="modal-btn modal-btn-cancel"
                  style={{ flex: 1 }}
                >
                  취소
                </button>
                <button
                  onClick={handleInventoryInputConfirm}
                  className="modal-btn modal-btn-primary"
                  style={{ flex: 1 }}
                >
                  추가하기
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }
    </div >
  );
}

export default TradePanel;
