import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { tradeAPI, companyAPI, productAPI, paymentAPI, settingsAPI, warehousesAPI } from '../services/api';
import './TradePanel.css'; // 스타일 분리
import SearchableSelect from './SearchableSelect';
import TradeDeleteConfirmModal from './TradeDeleteConfirmModal';
import ConfirmModal from './ConfirmModal';

/**
 * TradePanel - 단일 전표 패널 컴포넌트
 * DualTradeForm에서 좌/우 패널로 사용
 * 기존 TradeForm.js와 동일한 UI 구성
 */
function TradePanel({
  tradeType = 'SALE',  // 'SALE' | 'PURCHASE'
  panelId,             // 패널 식별자
  initialTradeId = null, // 초기 로드할 전표 ID
  onSaveSuccess,       // 저장 성공 콜백
  onPrint,             // 출력 콜백
  onDirtyChange,       // 변경사항 상태 변경 콜백

  onInventoryUpdate,   // 재고 수량 업데이트 콜백
  onTradeChange,       // 전표 변경(저장/삭제) 콜백 (재고 리프레시용)
  inventoryMap = {},   // 검증용 재고 맵 (from DualTradeForm)
  // fontScale 제거됨 - 고정 폰트 크기 사용
  cardColor = '#ffffff', // 카드 배경색
}) {
  const isPurchase = tradeType === 'PURCHASE';

  // 모바일 감지
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
    if (amount === null || amount === undefined || amount === '') return '0';
    return Math.floor(amount).toLocaleString();
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
  const [matchingInfoModal, setMatchingInfoModal] = useState({ isOpen: false, data: null }); // 매칭 정보 모달
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ isOpen: false }); // 삭제 확인 모달
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

  // 변경 감지
  const [initialData, setInitialData] = useState(null);

  // refs
  const companyRef = useRef(null);
  const productRefs = useRef([]);
  const quantityRefs = useRef([]);
  const unitPriceRefs = useRef([]);
  const shipperLocationRefs = useRef([]);
  const focusValueRef = useRef({}); // 입력 포커스 시 값 저장용
  const senderRefs = useRef([]);
  const notesRefs = useRef([]);
  const modalConfirmRef = useRef(null);



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
    if (!initialData) return false;
    if (master.trade_date !== initialData.master.trade_date) return true;
    if (String(master.company_id || '') !== String(initialData.master.company_id || '')) return true;
    if (String(master.warehouse_id || '') !== String(initialData.master.warehouse_id || '')) return true;
    if ((master.notes || '') !== (initialData.master.notes || '')) return true;

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
    }

    return false;
  }, [initialData, master, details]);

  // 초기 데이터 로드
  useEffect(() => {
    loadInitialData();
  }, []);

  // initialTradeId가 있으면 해당 전표 로드 (최초 1회만)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialTradeId && !loading && companies.length > 0 && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadTrade(initialTradeId);
    }
  }, [initialTradeId, loading, companies.length]);

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
      setInitialData({
        master: { ...master },
        details: []
      });
    } catch (error) {
      console.error('초기 데이터 로딩 오류:', error);
      showModal('warning', '로딩 실패', '데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
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
  const loadCompanySummary = async (companyId, type, date) => {
    if (!companyId) {
      setCompanySummary(null);
      return;
    }
    try {
      const response = await paymentAPI.getCompanyTodaySummary(companyId, type, date);
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
        const availableMax = d.inventory_remaining !== undefined
          ? (parseFloat(d.inventory_remaining) || 0) + (parseFloat(d.matched_quantity) || 0)
          : undefined;

        return {
          ...d,
          inventory_id: d.matched_inventory_id || d.inventory_id, // API 응답 필드 매핑
          max_quantity: availableMax, // 유효성 검사를 위한 최대 수량 설정
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

      // 잔고 정보 로드
      if (data.master.company_id) {
        await loadCompanySummary(data.master.company_id, data.master.trade_type, data.master.trade_date);
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
    } catch (error) {
      console.error('전표 로딩 오류:', error);
      showModal('warning', '로딩 실패', '전표를 불러오는데 실패했습니다.');
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
        onConfirm: () => {
          resetForm(master.trade_date);
        }
      });
    } else {
      resetForm(master.trade_date);
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
  const resetForm = (date, companyId = '') => {
    // 빈 행 생성
    const emptyRow = {
      rowIndex: 0,
      product_id: '',
      product_name: '',
      unit: '',
      quantity: '',
      unit_price: '',
      supply_amount: 0,
      shipper_location: '',
      sender_name: '',
      notes: ''
    };

    setMaster({
      trade_type: tradeType,
      trade_date: date || formatLocalDate(new Date()),
      company_id: companyId,
      warehouse_id: '',
      notes: '',
      status: 'CONFIRMED',
      total_amount: 0
    });
    // 거래처가 있으면 빈 행 1개, 없으면 빈 배열
    setDetails(companyId ? [emptyRow] : []);
    setCurrentTradeId(null);
    setIsEdit(false);
    setLinkedPayments([]);
    setPendingPayments([]);
    setDeletedPaymentIds([]);
    setModifiedPayments({});
    setInitialData({
      master: { trade_type: tradeType, trade_date: date, company_id: companyId, warehouse_id: '', notes: '' },
      details: []
    });

    if (companyId) {
      loadCompanySummary(companyId, tradeType, date);
    } else {
      setCompanySummary(null);
    }

    // 재고 목록 및 임시 차감 상태 초기화
    if (onTradeChange) {
      onTradeChange();
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
      unit: '',
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
    // showModal('info', 'DEBUG', `입력값: ${qty} (Type: ${typeof qty})\n최대값: ${maxQuantity} (Type: ${typeof maxQuantity})`);

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
      unit: '',
      quantity: qty,
      unit_price: price,
      supply_amount: qty * price,
      shipper_location: item.shipper_location || '',
      sender_name: item.sender || '',
      notes: '',
      inventory_id: item.id,
      max_quantity: item.remaining_quantity || 0 // Validation limit
    };

    const newDetails = [...details];

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

    // 재고 수량 임시 차감 알림
    if (onInventoryUpdate && item.id) {
      onInventoryUpdate(item.id, -qty);
    }
  };

  const handleDetailChange = (index, field, value) => {
    const newDetails = [...details];

    // 재고 수량 동기화 및 초과 검증
    if (field === 'quantity' && newDetails[index].inventory_id && onInventoryUpdate) {
      const oldQty = parseFloat(newDetails[index].quantity) || 0;
      const newQty = value === '' ? 0 : (parseFloat(value) || 0);

      // 초과 검증
      const maxQty = newDetails[index].max_quantity;

      // 1. 신규 드롭된 항목 (max_quantity 존재)
      if (maxQty !== undefined) {
        if (newQty > maxQty) {
          showModal('warning', '수량 초과', `재고 잔량을 초과할 수 없습니다.\n(최대: ${maxQty})`);

          // 값 복원 (포커스 시 저장된 원본 값으로)
          const originalVal = focusValueRef.current[index] !== undefined ? parseFloat(focusValueRef.current[index]) : oldQty;

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

    // 품목 선택 시 단위 자동 입력
    if (field === 'product_id') {
      const product = products.find(p => p.id == value);
      if (product) {
        newDetails[index].unit = product.unit || '';
      }
    }

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
      e.preventDefault();
      if (unitPriceRefs.current[index]) {
        unitPriceRefs.current[index].focus();
      }
    }
  };

  const handleUnitPriceKeyDown = (e, index) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (isPurchase) {
        if (shipperLocationRefs.current[index]) {
          shipperLocationRefs.current[index].focus();
        }
      } else {
        if (notesRefs.current[index]) {
          notesRefs.current[index].focus();
        }
      }
    }
  };

  const handleShipperLocationKeyDown = (e, index) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (senderRefs.current[index]) {
        senderRefs.current[index].focus();
      }
    }
  };

  const handleSenderKeyDown = (e, index) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (notesRefs.current[index]) {
        notesRefs.current[index].focus();
      }
    }
  };

  const handleNotesKeyDown = (e, index) => {
    if (e.key === 'Enter') {
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
    // 유효성 검사
    if (!master.company_id) {
      showModal('warning', '입력 오류', '거래처를 선택하세요.');
      return;
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

    // 새 전표: 품목 또는 새 입출금 필요
    // 기존 전표 수정: 품목, 새 입출금, 수정/삭제된 입출금 중 하나라도 있으면 됨
    if (!isEdit && validDetails.length === 0 && pendingPayments.length === 0) {
      showModal('warning', '입력 오류', '최소 1개의 품목을 입력하거나 입출금을 추가하세요.');
      return;
    }

    if (isEdit && validDetails.length === 0 && pendingPayments.length === 0 && !hasModifiedPayments && !hasDeletedPayments) {
      showModal('warning', '입력 오류', '저장할 변경 사항이 없습니다.');
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
          product_id: d.product_id,
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
        showModal('success', '저장 완료', `전표가 ${isEdit ? '수정' : '등록'}되었습니다.`);
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
      label: company.alias
        ? `${company.company_name} - ${company.alias}`
        : company.company_name
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
      const weightStr = product.weight ? `${parseFloat(product.weight)}kg` : '';
      return {
        value: product.id,
        label: `${product.product_name}${weightStr ? ` ${weightStr}` : ''}${product.grade ? ` (${product.grade})` : ''}`
      };
    });
  }, [products]);

  // 잔고 계산
  const summary = companySummary || {
    today_total: 0,
    previous_balance: 0,
    subtotal: 0,
    today_payment: 0,
    final_balance: 0
  };

  // 금일합계: 현재 입력 중인 품목의 합계 (실시간 반영)
  const currentTodayTotal = totalAmount;
  // 전잔고 + 금일 (실시간 계산)
  const currentSubtotal = (summary.previous_balance || 0) + currentTodayTotal;
  // 입출금 대기 금액
  const pendingTotal = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const displayPayment = summary.today_payment + pendingTotal;
  // 최종 잔고 (전잔고 + 금일 - 입금)
  const displayBalance = currentSubtotal - displayPayment;

  // 변경사항 여부 계산 (hooks 전에 계산)
  const isDirty = checkDirty();
  const hasModifiedPaymentsCalc = Object.keys(modifiedPayments).length > 0;
  const hasDeletedPaymentsCalc = deletedPaymentIds.length > 0;
  const hasPendingPaymentsCalc = pendingPayments.length > 0;
  const hasChanges = isDirty || hasPendingPaymentsCalc || hasModifiedPaymentsCalc || hasDeletedPaymentsCalc;

  // 변경사항 상태를 부모에게 알림 (조건부 return 전에 hooks 호출)
  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(panelId, hasChanges);
    }
  }, [hasChanges, panelId, onDirtyChange]);

  if (loading) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>;
  }

  // 폰트 스케일에 따른 크기 계산 헬퍼
  // 고정 폰트 크기 (전표 목록과 동일하게 0.8rem 기준)
  const fs = (size) => `${(size * 0.85).toFixed(2)}rem`;

  return (
    <div className="trade-panel" style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#f8f9fa',
      overflow: 'hidden',
      fontSize: fs(1)
    }}>
      {/* 페이지 헤더 */}
      <div className="page-header" style={{
        marginBottom: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: isPurchase ? '#fdf2f2' : '#f0f7ff',
        borderBottom: '2px solid',
        borderColor: isPurchase ? '#c0392b' : '#2980b9',
        flexShrink: 0
      }}>
        <h1 style={{
          margin: 0,
          fontSize: fs(1),
          fontWeight: '700',
          color: isPurchase ? '#c0392b' : '#2980b9'
        }}>
          {isPurchase ? '📦 매입 전표' : '💰 매출 전표'} {isEdit ? '수정' : '등록'}
        </h1>
        {hasChanges && (
          <span style={{
            fontSize: fs(0.75),
            backgroundColor: '#e74c3c',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '10px',
            fontWeight: '600',
            animation: 'pulse 1.5s ease-in-out infinite'
          }}>
            수정됨
          </span>
        )}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
          @keyframes buttonPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.7); }
            50% { box-shadow: 0 0 0 8px rgba(46, 204, 113, 0); }
          }
        `}</style>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.5rem', minHeight: 0, overflow: 'hidden' }}>
        {/* 기본 정보 카드 */}
        <div className="card" style={{ marginBottom: '0.5rem', padding: '0.75rem', flexShrink: 0, backgroundColor: cardColor }}>
          <div className="trade-form-row">
            <div className="trade-form-group trade-date-group">
              <label className="trade-label required">거래일자</label>
              <div className="trade-input-wrapper">
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  onClick={() => handleDateChange(-1)}
                >◀</button>
                <input
                  type="date"
                  value={master.trade_date}
                  onChange={(e) => handleDateInputChange(e.target.value)}
                  className="trade-date-input"
                  required
                />
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  onClick={() => handleDateChange(1)}
                >▶</button>
              </div>
            </div>
            <div className="trade-form-group" style={{ flex: 1 }}>
              <label className="trade-label required">거래처</label>
              <SearchableSelect
                ref={companyRef}
                options={companyOptions}
                value={master.company_id}
                onChange={handleCompanyChange}
                placeholder="거래처 선택..."
                noOptionsMessage="거래처 없음"
              />
            </div>
            {isPurchase && (
              <div className="trade-form-group" style={{ width: '180px' }}>
                <label className="trade-label">입고 창고</label>
                <SearchableSelect
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                  value={master.warehouse_id}
                  onChange={(o) => setMaster({ ...master, warehouse_id: o ? o.value : '' })}
                  placeholder="기본 창고"
                />
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
            </div>
          </div>
        </div>

        {/* 메인 콘텐츠 영역 (품목 상세 + 잔고) */}
        <div className="trade-content-area">

          {/* 왼쪽: 품목 상세 카드 */}
          <div className="trade-detail-card" style={{ backgroundColor: cardColor }}>
            <div className="trade-card-header">
              <h2 className="trade-card-title">품목 상세</h2>
              <div className="trade-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-custom btn-sm"
                  onClick={refreshProducts}
                >
                  🔄 새로고침
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-custom btn-sm"
                  onClick={addDetailRow}
                  disabled={!master.company_id}
                >
                  + 추가
                </button>
              </div>
            </div>

            <div
              className="trade-table-container"
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
                    {isPurchase && <th className="col-location">출하지</th>}
                    {isPurchase && <th className="col-owner">출하주</th>}
                    <th className="col-remarks">비고</th>
                    <th className="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((detail, index) => (
                    <tr
                      key={index}
                      draggable={!isMobile}
                      onDragStart={(e) => handleDragStart(e, index)}
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
                          <span className="trade-drag-handle">☰</span>
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
                        />
                      </td>
                      <td>
                        <input
                          ref={el => quantityRefs.current[index] = el}
                          type="text"
                          value={detail.quantity ? formatCurrency(Math.floor(detail.quantity)) : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            handleDetailChange(index, 'quantity', val);
                          }}
                          onFocus={(e) => {
                            // 포커스 시점의 값을 저장 (입력 취소 시 복원용)
                            focusValueRef.current[index] = detail.quantity;
                          }}
                          onKeyDown={(e) => handleQuantityKeyDown(e, index)}
                          className="trade-input-table trade-input-right"
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <input
                          ref={el => unitPriceRefs.current[index] = el}
                          type="text"
                          value={detail.unit_price ? formatCurrency(Math.floor(detail.unit_price)) : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            handleDetailChange(index, 'unit_price', val);
                          }}
                          onKeyDown={(e) => handleUnitPriceKeyDown(e, index)}
                          className="trade-input-table trade-input-right"
                          placeholder="0"
                        />
                      </td>
                      <td className="trade-input-right" style={{ padding: '4px 8px', fontWeight: '600', color: isPurchase ? '#c0392b' : '#2980b9' }}>
                        {formatCurrency(detail.supply_amount)}
                      </td>
                      {isPurchase && (
                        <td>
                          <input
                            ref={el => shipperLocationRefs.current[index] = el}
                            type="text"
                            value={detail.shipper_location || ''}
                            onChange={(e) => handleDetailChange(index, 'shipper_location', e.target.value)}
                            onKeyDown={(e) => handleShipperLocationKeyDown(e, index)}
                            className="trade-input-table"
                          />
                        </td>
                      )}
                      {isPurchase && (
                        <td>
                          <input
                            ref={el => senderRefs.current[index] = el}
                            type="text"
                            value={detail.sender_name || ''}
                            onChange={(e) => handleDetailChange(index, 'sender_name', e.target.value)}
                            onKeyDown={(e) => handleSenderKeyDown(e, index)}
                            className="trade-input-table"
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
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#e74c3c',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            lineHeight: '1',
                            padding: '0 5px'
                          }}
                          onClick={(e) => {
                            e.stopPropagation(); // 행 선택 방지
                            handleDeleteRow(index);
                          }}
                          tabIndex="-1"
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

            {/* 비고 */}
            <div className="note-section">
              <label className="trade-section-label">비고</label>
              <textarea
                value={master.notes}
                onChange={(e) => setMaster({ ...master, notes: e.target.value })}
                rows="4"
                className="trade-textarea"
                placeholder="메모 입력..."
              />
            </div>
          </div>

          {/* 오른쪽: 잔고 정보 카드 */}
          <div className="trade-balance-card" style={{ backgroundColor: cardColor }}>
            <h2 className="card-title trade-card-title">
              💰 {isPurchase ? '매입처 잔고' : '매출처 잔고'}
            </h2>

            {/* 잔고 정보 리스트 */}
            <div className="balance-list">
              <div className="balance-item header">
                <span className="font-medium text-blue">금일 합계</span>
                <span className={`font-bold ${isPurchase ? 'text-red' : 'text-blue'}`}>
                  {formatCurrency(currentTodayTotal)}원
                </span>
              </div>
              <div className="balance-item">
                <span className="balance-text-label">전잔고</span>
                <span className="balance-text-value">{formatCurrency(summary.previous_balance)}원</span>
              </div>
              <div className="balance-item">
                <span className="balance-text-label">전잔고 + 금일</span>
                <span className="balance-text-value">{formatCurrency(currentSubtotal)}원</span>
              </div>
              <div className="balance-item">
                <span className="balance-text-label">
                  {isPurchase ? '출금' : '입금'}
                  {pendingTotal > 0 && <span className="tag-pending-count"> ({pendingPayments.length}건)</span>}
                </span>
                <span className="balance-text-value text-green">
                  {formatCurrency(displayPayment)}원
                </span>
              </div>
            </div>

            {/* 잔고 */}
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
            <div className="payment-section-wrapper">
              <div className="payment-section-header">
                <h3 className="trade-section-label m-0">
                  📋 {isPurchase ? '출금' : '입금'} 내역
                </h3>
                <button
                  type="button"
                  onClick={handleOpenAddPayment}
                  disabled={!master.company_id}
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
                        <div className="flex-1">
                          <div className="payment-detail-row">
                            {formatCurrency(displayAmount)}원
                            <span className={`payment-badge ${linkType}`}>
                              {linkType === 'direct' ? '직접' : linkType === 'allocated' ? '배분' : '수금/지급'}
                            </span>
                            {isModified && (
                              <span className="tag-modified">
                                수정됨
                              </span>
                            )}
                          </div>
                          <div className="payment-meta-row">
                            {payment.transaction_date?.substring(0, 10)} | {payment.payment_method || '미지정'}
                            {linkType === 'allocated' && payment.amount !== displayAmount && (
                              <span> (총 {formatCurrency(payment.amount)}원 중)</span>
                            )}
                          </div>
                        </div>
                        {canDelete && (
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
                        )}
                      </div>
                    );
                  })}
                  {/* 저장 대기 중인 입금 내역 */}
                  {pendingPayments.map(payment => (
                    <div key={payment.tempId} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem',
                      backgroundColor: '#fff3cd',
                      borderRadius: '4px',
                      marginBottom: '0.4rem',
                      fontSize: fs(0.95),
                      borderLeft: '3px solid #ffc107',
                      border: '1px dashed #ffc107'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {formatCurrency(payment.amount)}원
                          <span style={{
                            fontSize: fs(0.8),
                            backgroundColor: '#ffc107',
                            color: '#333',
                            padding: '1px 4px',
                            borderRadius: '3px'
                          }}>
                            저장 대기
                          </span>
                        </div>
                        <div style={{ fontSize: fs(0.85), color: '#888' }}>
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
                            fontSize: fs(0.85),
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
                            fontSize: fs(0.85),
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
                  fontSize: fs(1),
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {isPurchase ? '출금' : '입금'} 내역이 없습니다
                </div>
              )}

              <div style={{ fontSize: fs(0.95), color: '#888', marginTop: '0.4rem', textAlign: 'center', flexShrink: 0 }}>
                * {isPurchase ? '출금' : '입금'}은 전표 저장 시 함께 처리됩니다
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 공통 Confirm Modal */}
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

      {/* 입금/출금 추가 모달 */}
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
                  // 마이너스 기호와 숫자만 허용
                  const inputValue = e.target.value;
                  const isNegative = inputValue.startsWith('-');
                  const numericPart = inputValue.replace(/[^0-9]/g, '');
                  const rawValue = isNegative && numericPart ? `-${numericPart}` : numericPart;
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
      )}

      {/* 입출금 수정 모달 */}
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
      )}

      {/* 매칭 정보 모달 (삭제 불가 안내) */}
      {matchingInfoModal.isOpen && matchingInfoModal.data && (
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
            <div style={{
              padding: '1rem 1.5rem',
              backgroundColor: '#e74c3c',
              color: 'white'
            }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                {matchingInfoModal.data.items.map((item, idx) => (
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
                      📦 {item.productName} - {item.matchedQuantity}개
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
      )}

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
        tradePartnerName={companies.find(c => String(c.id) === String(master.company_id))?.company_name}
      />

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
      )}
      {/* 네비게이션 차단 모달 */}
      {/* ... (생략) ... */}

      {/* [재고 드롭] 수량/단가 입력 모달 */}
      {inventoryInputModal.isOpen && createPortal(
        <div
          className="modal-overlay"
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
            zIndex: 99999
          }}
        >
          <div
            className="modal-container"
            style={{
              width: '450px',
              maxWidth: '90%',
              padding: '1.5rem',
              textAlign: 'left' // modal-container 기본이 center일 수 있으므로
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{
              textAlign: 'center',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50', fontSize: '1.4rem' }}>재고 품목 추가</h3>
              <div style={{
                fontSize: '1.1rem',
                fontWeight: '700',
                color: '#3498db'
              }}>
                {inventoryInputModal.inventory?.product_name || '품목명'}
                <span style={{ fontSize: '0.9rem', color: '#7f8c8d', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                  {inventoryInputModal.inventory?.sender ? `(${inventoryInputModal.inventory.sender})` : ''}
                </span>
              </div>
            </div>

            {/* 정보 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '1.5rem',
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              borderRadius: '8px'
            }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '0.85rem', color: '#7f8c8d', marginBottom: '0.25rem' }}>재고 잔량</div>
                <div style={{ fontWeight: '700', color: '#27ae60' }}>
                  {inventoryInputModal.maxQuantity}
                </div>
              </div>
              <div style={{ width: '1px', backgroundColor: '#e0e0e0' }}></div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '0.85rem', color: '#7f8c8d', marginBottom: '0.25rem' }}>기준 단가</div>
                <div style={{ fontWeight: '700' }}>
                  {formatCurrency(inventoryInputModal.inventory?.unit_price || 0)}원
                </div>
              </div>
            </div>

            {/* 입력 폼 */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '600' }}>수량</label>
                <input
                  type="text"
                  value={inventoryInputModal.quantity ? formatCurrency(parseFloat(inventoryInputModal.quantity)) : ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setInventoryInputModal(prev => ({ ...prev, quantity: val }));
                  }}
                  className="form-control modal-input-highlight"
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    fontSize: '1.1rem',
                    textAlign: 'right',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
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
                  className="form-control modal-input-highlight"
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    fontSize: '1.1rem',
                    textAlign: 'right',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
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
                onClick={() => setInventoryInputModal(prev => ({ ...prev, isOpen: false }))}
                className="modal-btn modal-btn-cancel"
                style={{ flex: 1 }}
              >
                취소
              </button>
              <button
                onClick={handleInventoryInputConfirm}
                className="modal-btn modal-btn-primary"
                style={{ flex: 2 }}
              >
                추가하기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default TradePanel;
