import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { purchaseInventoryAPI, companyAPI, tradeAPI, paymentAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import TradePrintModal from '../components/TradePrintModal';
import PaymentCard from '../components/PaymentCard';
import TradeDeleteConfirmModal from '../components/TradeDeleteConfirmModal';

function SaleFromInventory() {
  const navigate = useNavigate();
  
  // 기본 정보
  const [companies, setCompanies] = useState([]);
  const [tradeDate, setTradeDate] = useState(getDateString(0));
  const [companyId, setCompanyId] = useState('');
  const [notes, setNotes] = useState('');
  
  // ★ 수정 모드 관련
  const [currentTradeId, setCurrentTradeId] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [linkedPayments, setLinkedPayments] = useState([]); // 기존 저장된 입출금
  const [deletedPaymentIds, setDeletedPaymentIds] = useState([]); // 삭제할 입출금 ID 목록
  const [modifiedPayments, setModifiedPayments] = useState({}); // 수정 대기 중인 입출금
  
  // 재고 목록 (오른쪽)
  const [inventory, setInventory] = useState([]);
  const [inventoryFilter, setInventoryFilter] = useState('');
  
  // 매출 품목 (왼쪽) - 신규: inventory_id 있음, 기존: existing_detail_id 있음
  const [saleItems, setSaleItems] = useState([]);
  
  // 삭제된 기존 품목 (재고 복원 예정 표시용)
  const [deletedExistingItems, setDeletedExistingItems] = useState([]);
  
  // ★ 기존 품목 원본 상태 (수량 변경 추적용)
  const [originalItems, setOriginalItems] = useState([]);
  
  // ★ 삭제 확인 모달
  const [deleteModal, setDeleteModal] = useState({ isOpen: false });
  
  // 드래그 앤 드롭
  const [draggedItem, setDraggedItem] = useState(null);
  
  // 수량/단가 입력 모달
  const [inputModal, setInputModal] = useState({
    isOpen: false,
    inventory: null,
    quantity: '',
    unitPrice: '',
    maxQuantity: 0
  });
  
  // 저장 대기 중인 입금 (전표 저장 시 함께 저장)
  const [pendingPayments, setPendingPayments] = useState([]);
  
  // 거래처 잔고 정보
  const [companySummary, setCompanySummary] = useState(null);
  
  // 모달
  const [modal, setModal] = useState({
    isOpen: false, type: 'info', title: '', message: '',
    onConfirm: () => {}, confirmText: '확인', showCancel: false
  });
  
  // 출력 모달
  const [printModal, setPrintModal] = useState({ isOpen: false, tradeId: null });
  
  const [loading, setLoading] = useState(true);

  // 로컬 시간대 기준 YYYY-MM-DD 형식 반환
  function getDateString(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [companiesRes, inventoryRes] = await Promise.all([
        companyAPI.getAll({ is_active: 'true', type: 'CUSTOMER' }),
        purchaseInventoryAPI.getAll({ has_remaining: 'true' })
      ]);
      setCompanies(companiesRes.data.data || []);
      setInventory(inventoryRes.data.data || []);
    } catch (error) {
      console.error('초기 데이터 로딩 오류:', error);
      showModal('warning', '로딩 실패', '데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const showModal = (type, title, message, onConfirm = () => {}, confirmText = '확인', showCancel = false) => {
    setModal({ isOpen: true, type, title, message, onConfirm, confirmText, showCancel });
  };

  // ★ 기존 전표 로드 함수
  const loadExistingTrade = async (tradeId) => {
    try {
      const response = await tradeAPI.getById(tradeId);
      const { master, details } = response.data.data;
      
      // 기본 정보 설정
      setCurrentTradeId(tradeId);
      setIsEdit(true);
      setTradeDate(master.trade_date?.split('T')[0] || master.trade_date);
      setCompanyId(String(master.company_id));
      setNotes(master.notes || '');
      
      // 기존 품목 변환 (existing_detail_id로 구분, 매칭 정보 포함)
      const existingItems = details.map((d, idx) => {
        const quantity = parseFloat(d.quantity);
        const unitPrice = parseFloat(d.unit_price);
        const purchasePrice = parseFloat(d.purchase_price) || 0;
        const supplyAmount = parseFloat(d.supply_amount);
        const margin = (unitPrice - purchasePrice) * quantity;
        
        return {
          id: `existing-${d.id}`,
          existing_detail_id: d.id,
          product_id: d.product_id,
          product_name: d.product_name,
          product_code: d.product_code,
          grade: d.grade,
          weight: d.product_weight,
          unit: d.unit,
          quantity,
          unit_price: unitPrice,
          supply_amount: supplyAmount,
          purchase_price: purchasePrice, // ★ 매입 단가 추가
          margin, // ★ 마진 계산 추가
          sender: d.sender || d.sender_name,
          shipper_location: d.shipper_location,
          notes: d.notes,
          // ★ 매칭된 재고 정보 (삭제 시 재고 복원 표시용)
          matched_inventory_id: d.matched_inventory_id || null,
          matched_quantity: parseFloat(d.matched_quantity) || 0,
          inventory_id: null,
          // ★ 원본 수량 저장 (수량 변경 추적용)
          original_quantity: quantity
        };
      });
      setSaleItems(existingItems);
      
      // ★ 원본 품목 상태 저장
      setOriginalItems(existingItems.map(item => ({
        id: item.id,
        matched_inventory_id: item.matched_inventory_id,
        original_quantity: item.quantity
      })));
      
      // 삭제된 품목 초기화
      setDeletedExistingItems([]);
      
      // 연결된 입출금 조회
      try {
        const paymentsRes = await paymentAPI.getByTrade(tradeId);
        setLinkedPayments(paymentsRes.data.data || []);
      } catch (err) {
        console.error('입출금 조회 오류:', err);
        setLinkedPayments([]);
      }
      
      // 대기 입출금 및 삭제 목록 초기화
      setPendingPayments([]);
      setDeletedPaymentIds([]);
      
      // 잔고 정보 로드
      try {
        const summaryRes = await paymentAPI.getCompanyTodaySummary(master.company_id, 'SALE', master.trade_date?.split('T')[0]);
        setCompanySummary(summaryRes.data.data);
      } catch (err) {
        console.error('잔고 조회 오류:', err);
        setCompanySummary(null);
      }
      
      return true;
    } catch (error) {
      console.error('전표 로드 오류:', error);
      showModal('warning', '로드 실패', '기존 전표를 불러오는데 실패했습니다.');
      return false;
    }
  };

  // ★ 폼 초기화 (신규 모드)
  const resetToNewMode = (date, newCompanyId) => {
    setCurrentTradeId(null);
    setIsEdit(false);
    setTradeDate(date);
    setCompanyId(newCompanyId);
    setSaleItems([]);
    setPendingPayments([]);
    setLinkedPayments([]);
    setDeletedPaymentIds([]);
    setDeletedExistingItems([]); // 삭제된 품목 초기화
    setOriginalItems([]); // 원본 품목 초기화
    setNotes('');
  };

  // 변경사항 확인
  const hasUnsavedChanges = () => {
    // 수정 모드에서는 품목 변경, 입출금 변경 등을 확인
    if (isEdit) {
      return pendingPayments.length > 0 || deletedPaymentIds.length > 0;
    }
    return saleItems.length > 0 || pendingPayments.length > 0 || notes.trim() !== '';
  };

  // 날짜 변경 핸들러
  const handleDateChange = (newDate) => {
    if (newDate === tradeDate) return;
    
    if (hasUnsavedChanges()) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '저장하지 않은 변경사항',
        message: '저장하지 않은 변경사항이 있습니다.\n계속하면 현재 입력 내용이 사라집니다.\n계속하시겠습니까?',
        confirmText: '계속',
        showCancel: true,
        onConfirm: () => executeTradeSwitch(newDate, companyId)
      });
    } else {
      executeTradeSwitch(newDate, companyId);
    }
  };

  // 거래처 변경 핸들러
  const handleCompanyChange = (option) => {
    const newCompanyId = option ? option.value : '';
    
    if (!option) {
      setCompanyId('');
      setCompanySummary(null);
      return;
    }
    
    if (String(newCompanyId) === String(companyId)) return;
    
    if (hasUnsavedChanges()) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '저장하지 않은 변경사항',
        message: '저장하지 않은 변경사항이 있습니다.\n계속하면 현재 입력 내용이 사라집니다.\n계속하시겠습니까?',
        confirmText: '계속',
        showCancel: true,
        onConfirm: () => executeTradeSwitch(tradeDate, newCompanyId)
      });
    } else {
      executeTradeSwitch(tradeDate, newCompanyId);
    }
  };

  // 실제 전표 전환 실행
  const executeTradeSwitch = async (newDate, newCompanyId) => {
    if (!newCompanyId) {
      setTradeDate(newDate);
      resetToNewMode(newDate, '');
      return;
    }
    
    try {
      const response = await tradeAPI.checkDuplicate({
        company_id: newCompanyId,
        trade_date: newDate,
        trade_type: 'SALE'  // 재고 기반 매출은 항상 SALE
      });
      
      if (response.data.isDuplicate && response.data.existingTradeId) {
        // ★ 기존 전표가 있으면 현재 화면에서 데이터 로드 (페이지 이동 안함)
        await loadExistingTrade(response.data.existingTradeId);
      } else {
        // 기존 전표가 없으면 신규 모드로 초기화
        resetToNewMode(newDate, newCompanyId);
        
        // 잔고 정보 로드
        try {
          const summaryRes = await paymentAPI.getCompanyTodaySummary(newCompanyId, 'SALE', newDate);
          setCompanySummary(summaryRes.data.data);
        } catch (error) {
          console.error('거래처 잔고 조회 오류:', error);
          setCompanySummary(null);
        }
      }
    } catch (error) {
      console.error('전표 확인 오류:', error);
      resetToNewMode(newDate, newCompanyId);
    }
  };

  // 거래처 선택 시 잔고 정보 로드
  useEffect(() => {
    const loadCompanySummary = async () => {
      if (!companyId || !tradeDate) {
        setCompanySummary(null);
        return;
      }
      try {
        const response = await paymentAPI.getCompanyTodaySummary(companyId, 'SALE', tradeDate);
        setCompanySummary(response.data.data);
      } catch (error) {
        console.error('거래처 잔고 조회 오류:', error);
        setCompanySummary(null);
      }
    };
    
    loadCompanySummary();
  }, [companyId, tradeDate]);

  // 거래처 옵션
  const companyOptions = companies.map(company => ({
    value: String(company.id),  // 문자열로 통일
    label: company.alias 
      ? `${company.company_name} - ${company.alias}`
      : company.company_name
  }));

  // 삭제된 기존 품목 + 수량 변경된 품목의 재고 변화량 계산 (inventory_id별)
  const restoredQuantityMap = useMemo(() => {
    const map = {};
    
    // 1. 삭제된 품목: 전체 수량 복원 예정
    deletedExistingItems.forEach(item => {
      if (item.inventory_id) {
        map[item.inventory_id] = (map[item.inventory_id] || 0) + item.quantity;
      }
    });
    
    // 2. 수량 변경된 품목: 차이만큼 복원/차감 예정
    saleItems.forEach(item => {
      // 기존 품목 중 매칭 정보가 있는 것만
      if (item.existing_detail_id && item.matched_inventory_id) {
        const originalItem = originalItems.find(o => o.id === item.id);
        if (originalItem) {
          const quantityDiff = originalItem.original_quantity - parseFloat(item.quantity);
          if (quantityDiff !== 0) {
            map[item.matched_inventory_id] = (map[item.matched_inventory_id] || 0) + quantityDiff;
          }
        }
      }
    });
    
    return map;
  }, [deletedExistingItems, saleItems, originalItems]);

  // 필터링된 재고 (삭제/수량변경된 품목의 수량 변화 반영)
  const filteredInventory = useMemo(() => {
    // 품목의 수량 변화를 반영한 재고 목록 생성
    const adjustedInventory = inventory.map(item => {
      const qtyChange = restoredQuantityMap[item.id] || 0;
      if (qtyChange !== 0) {
        return {
          ...item,
          remaining_quantity: parseFloat(item.remaining_quantity) + qtyChange,
          _hasChange: true,  // 변화 있음 표시
          _qtyChange: qtyChange  // 양수: 복원, 음수: 추가 차감
        };
      }
      return item;
    });
    
    if (!inventoryFilter) return adjustedInventory;
    const keyword = inventoryFilter.toLowerCase();
    return adjustedInventory.filter(item => 
      item.product_name?.toLowerCase().includes(keyword) ||
      item.company_name?.toLowerCase().includes(keyword) ||
      item.shipper_location?.toLowerCase().includes(keyword) ||
      item.sender?.toLowerCase().includes(keyword)
    );
  }, [inventory, inventoryFilter, restoredQuantityMap]);

  // 재고에서 이미 추가된 수량 계산
  const getUsedQuantity = (inventoryId) => {
    return saleItems
      .filter(item => item.inventory_id === inventoryId)
      .reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
  };

  // 드래그 시작
  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  // 드롭 영역 드래그오버
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // 드롭 처리
  const handleDrop = (e) => {
    e.preventDefault();
    if (!draggedItem) return;
    
    // 거래처 선택 여부 확인
    if (!companyId) {
      showModal('warning', '거래처 미선택', '먼저 거래처를 선택해주세요.');
      setDraggedItem(null);
      return;
    }
    
    const usedQty = getUsedQuantity(draggedItem.id);
    const availableQty = parseFloat(draggedItem.remaining_quantity) - usedQty;
    
    if (availableQty <= 0) {
      showModal('warning', '재고 부족', '해당 재고는 이미 모두 사용되었습니다.');
      setDraggedItem(null);
      return;
    }
    
    // 수량/단가 입력 모달 열기
    setInputModal({
      isOpen: true,
      inventory: draggedItem,
      quantity: availableQty.toString(),
      unitPrice: draggedItem.unit_price ? Math.floor(draggedItem.unit_price).toString() : '',
      maxQuantity: availableQty
    });
    
    setDraggedItem(null);
  };

  // 수량/단가 입력 확인
  const handleInputConfirm = () => {
    const qty = parseFloat(inputModal.quantity) || 0;
    const price = parseFloat(inputModal.unitPrice) || 0;
    
    if (qty <= 0) {
      showModal('warning', '입력 오류', '수량을 입력하세요.');
      return;
    }
    
    if (qty > inputModal.maxQuantity) {
      showModal('warning', '수량 초과', `최대 ${inputModal.maxQuantity}개까지 가능합니다.`);
      return;
    }
    
    if (price <= 0) {
      showModal('warning', '입력 오류', '단가를 입력하세요.');
      return;
    }
    
    const inv = inputModal.inventory;
    const shipperInfo = [inv.shipper_location, inv.sender].filter(Boolean).join(' / ') || '';
    const newItem = {
      id: Date.now(), // 임시 ID
      inventory_id: inv.id,
      product_id: inv.product_id,
      product_name: inv.product_name,
      product_weight: inv.product_weight,
      grade: inv.grade,
      company_name: inv.company_name,
      shipper_location: inv.shipper_location,
      sender: inv.sender,
      shipper_info: shipperInfo, // 표시용 조합 문자열
      quantity: qty,
      unit_price: price,
      supply_amount: qty * price,
      purchase_price: inv.unit_price, // 매입가
      margin: (price - (inv.unit_price || 0)) * qty // 마진
    };
    
    setSaleItems(prev => [...prev, newItem]);
    setInputModal({ isOpen: false, inventory: null, quantity: '', unitPrice: '', maxQuantity: 0 });
  };

  // 품목 삭제
  const handleRemoveItem = (itemId) => {
    // 삭제할 품목 찾기
    const itemToRemove = saleItems.find(item => item.id === itemId);
    
    // 기존 품목(매칭된 재고가 있는)이면 삭제 목록에 추가 (재고 복원 표시용)
    if (itemToRemove?.existing_detail_id && itemToRemove?.matched_inventory_id) {
      setDeletedExistingItems(prev => [...prev, {
        inventory_id: itemToRemove.matched_inventory_id,
        quantity: itemToRemove.matched_quantity || itemToRemove.quantity,
        product_name: itemToRemove.product_name
      }]);
    }
    
    // 신규 품목(재고에서 드래그한)이면 사용 수량에서 제외됨 (getUsedQuantity에서 자동 반영)
    
    setSaleItems(prev => prev.filter(item => item.id !== itemId));
  };

  // 품목 수량/단가 수정
  const handleItemChange = (itemId, field, value) => {
    setSaleItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      
      const updated = { ...item, [field]: parseFloat(value) || 0 };
      updated.supply_amount = updated.quantity * updated.unit_price;
      updated.margin = (updated.unit_price - (updated.purchase_price || 0)) * updated.quantity;
      return updated;
    }));
  };

  // 합계 계산
  const totals = useMemo(() => {
    return saleItems.reduce((acc, item) => ({
      quantity: acc.quantity + (parseFloat(item.quantity) || 0),
      amount: acc.amount + (parseFloat(item.supply_amount) || 0),
      margin: acc.margin + (parseFloat(item.margin) || 0)
    }), { quantity: 0, amount: 0, margin: 0 });
  }, [saleItems]);

  // 저장
  const handleSave = async (printAfterSave = false) => {
    if (!companyId) {
      showModal('warning', '입력 오류', '거래처를 선택하세요.');
      return;
    }
    
    const pendingPaymentsTotal = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    if (saleItems.length === 0 && pendingPaymentsTotal === 0 && deletedPaymentIds.length === 0) {
      showModal('warning', '입력 오류', '품목을 추가하거나 입금을 추가하세요.');
      return;
    }
    
    // ★ 수정 모드가 아닐 때만 중복 체크
    if (!isEdit) {
      try {
        const duplicateCheck = await tradeAPI.checkDuplicate({
          company_id: companyId,
          trade_date: tradeDate,
          trade_type: 'SALE'
        });
        
        if (duplicateCheck.data.isDuplicate) {
          // 중복 전표가 있으면 해당 전표 로드
          showModal(
            'info', 
            '기존 전표 발견', 
            `이미 동일 거래처에 ${tradeDate} 날짜로 전표가 존재합니다.\n(전표번호: ${duplicateCheck.data.existingTradeNumber})\n\n기존 전표를 불러와서 수정합니다.`,
            () => loadExistingTrade(duplicateCheck.data.existingTradeId),
            '확인',
            false
          );
          return;
        }
      } catch (error) {
        console.error('중복 체크 오류:', error);
      }
    }
    
    let confirmMessage = '';
    const actionText = isEdit ? '수정' : '저장';
    
    if (saleItems.length > 0 && pendingPaymentsTotal > 0) {
      confirmMessage = `${saleItems.length}건의 품목 (${formatCurrency(totals.amount)}원)과 입금 ${formatCurrency(pendingPaymentsTotal)}원을 ${actionText}하시겠습니까?`;
    } else if (saleItems.length > 0) {
      confirmMessage = `${saleItems.length}건의 품목 (${formatCurrency(totals.amount)}원)을 ${actionText}하시겠습니까?`;
    } else if (pendingPaymentsTotal > 0) {
      confirmMessage = `입금 ${formatCurrency(pendingPaymentsTotal)}원을 ${actionText}하시겠습니까?`;
    } else if (deletedPaymentIds.length > 0) {
      confirmMessage = `입금 ${deletedPaymentIds.length}건을 삭제하시겠습니까?`;
    }
    
    setModal({
      isOpen: true,
      type: 'confirm',
      title: isEdit ? '매출 전표 수정' : '매출 전표 저장',
      message: confirmMessage,
      confirmText: actionText,
      showCancel: true,
      onConfirm: async () => {
        try {
          let savedTradeId = currentTradeId;
          
          // ★ 수정 모드: update API 호출
          if (isEdit && currentTradeId) {
            // 품목이 있는 경우 전표 수정
            if (saleItems.length > 0) {
              const submitData = {
                master: {
                  trade_date: tradeDate,
                  company_id: companyId,
                  trade_type: 'SALE',
                  notes: notes,
                  status: 'CONFIRMED',
                  total_amount: totals.amount,
                  tax_amount: 0,
                  total_price: totals.amount
                },
                details: saleItems.map(item => ({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  supply_amount: item.supply_amount,
                  shipper_name: item.sender || '',
                  shipper_location: item.shipper_location || '',
                  // ★ 재고 기반 전표: 출하주를 비고에 저장
                  notes: item.sender || item.notes || '',
                  // ★ 기존 품목의 매칭 정보 유지: matched_inventory_id를 inventory_id로 전달
                  inventory_id: item.inventory_id || item.matched_inventory_id || null,
                  // ★ 매입 단가 저장 (마진 계산용)
                  purchase_price: item.purchase_price || null
                }))
              };
              
              await tradeAPI.update(currentTradeId, submitData);
            }
            
            // 삭제할 입출금 처리
            for (const paymentId of deletedPaymentIds) {
              await paymentAPI.deleteLinkedTransaction(paymentId);
            }
            setDeletedPaymentIds([]);
            
          } else {
            // ★ 신규 모드: create API 호출
            if (saleItems.length > 0) {
              const submitData = {
                master: {
                  trade_date: tradeDate,
                  company_id: companyId,
                  trade_type: 'SALE',
                  notes: notes,
                  status: 'CONFIRMED'
                },
                details: saleItems.map(item => ({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  supply_amount: item.supply_amount,
                  shipper_name: item.sender || '',
                  shipper_location: item.shipper_location || '',
                  // ★ 재고 기반 전표: 출하주를 비고에 저장
                  notes: item.sender || '',
                  inventory_id: item.inventory_id,
                  // ★ 매입 단가 저장 (마진 계산용)
                  purchase_price: item.purchase_price || null
                }))
              };
              
              const response = await tradeAPI.createSaleFromInventory(submitData);
              savedTradeId = response.data.data?.id;
            }
          }
          
          // 저장 대기 중인 입금들 처리 (신규/수정 공통)
          if (pendingPayments.length > 0) {
            for (const pendingPayment of pendingPayments) {
              await paymentAPI.createTransactionWithAllocation({
                transaction_date: tradeDate,
                company_id: companyId,
                transaction_type: 'RECEIPT',
                amount: pendingPayment.amount,
                payment_method: pendingPayment.payment_method || '계좌이체',
                notes: pendingPayment.notes,
                source_trade_id: savedTradeId
              });
            }
            setPendingPayments([]);
          }
          
          // 재고 목록 갱신 (저장/수정 후 재고 변화 반영)
          try {
            const inventoryRes = await purchaseInventoryAPI.getAll({ has_remaining: 'true' });
            setInventory(inventoryRes.data.data || []);
          } catch (err) {
            console.error('재고 목록 갱신 오류:', err);
          }
          
          // 저장 및 출력인 경우 출력 모달 열기
          if (printAfterSave && savedTradeId) {
            // 출력 모달 닫힌 후 전표 재조회하도록 수정
            setPrintModal({ isOpen: true, tradeId: savedTradeId });
            // 모달 닫기 시 전표 재조회는 printModal onClose에서 처리하므로 여기서 로드
            await loadExistingTrade(savedTradeId);
          } else {
            const message = isEdit
              ? '매출 전표가 수정되었습니다.'
              : (pendingPaymentsTotal > 0
                ? `매출 전표가 저장되었습니다.\n입금 ${formatCurrency(pendingPaymentsTotal)}원도 처리되었습니다.`
                : '매출 전표가 저장되었습니다.');
            
            showModal('success', isEdit ? '수정 완료' : '저장 완료', message, async () => {
              // ★ 저장 후 해당 전표 재조회하여 화면 유지
              if (savedTradeId) {
                await loadExistingTrade(savedTradeId);
              }
            });
          }
        } catch (error) {
          console.error('저장 오류:', error);
          showModal('warning', '저장 실패', error.response?.data?.message || '저장에 실패했습니다.');
        }
      }
    });
  };

  // ★ 전표 삭제 핸들러
  const handleDelete = async () => {
    if (!currentTradeId) return;
    
    try {
      await tradeAPI.delete(currentTradeId);
      
      showModal('success', '삭제 완료', '전표가 삭제되었습니다.', () => {
        // 삭제 후 초기화
        resetToNewMode(tradeDate, companyId);
        // 재고 목록 새로고침
        purchaseInventoryAPI.getAll({ has_remaining: 'true' })
          .then(res => setInventory(res.data.data || []))
          .catch(err => console.error('재고 목록 조회 오류:', err));
        // 잔고 정보 새로고침
        if (companyId) {
          paymentAPI.getCompanyTodaySummary(companyId, 'SALE', tradeDate)
            .then(res => setCompanySummary(res.data.data))
            .catch(err => setCompanySummary(null));
        }
      });
    } catch (error) {
      console.error('삭제 오류:', error);
      showModal('warning', '삭제 실패', error.response?.data?.message || '삭제에 실패했습니다.');
    }
    
    setDeleteModal({ isOpen: false });
  };

  // 포맷팅 함수
  const formatNumber = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  // 날짜 포맷: MM-DD (매칭 모달과 동일)
  const formatDateShort = (dateString) => {
    if (!dateString) return '-';
    const date = dateString.split('T')[0];
    const parts = date.split('-');
    return `${parts[1]}-${parts[2]}`;
  };

  // 품목 표시 형식: "품목명 중량kg (등급)" (매칭 모달과 동일)
  const formatProductName = (item) => {
    const name = item.product_name || '';
    const weight = item.product_weight ? `${parseFloat(item.product_weight)}kg` : '';
    const grade = item.grade ? `(${item.grade})` : '';
    return `${name}${weight ? ` ${weight}` : ''}${grade ? ` ${grade}` : ''}`.trim();
  };

  if (loading) {
    return <div className="loading">로딩 중...</div>;
  }

  return (
    <div className="sale-from-inventory">
      {/* 헤더 */}
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          📦 전표 등록(재고 기반)
          {isEdit && (
            <span style={{
              backgroundColor: '#3498db',
              color: 'white',
              padding: '0.25rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              수정 중
            </span>
          )}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => {
            // 변경사항이 있으면 확인 후 초기화
            if (hasUnsavedChanges() || saleItems.length > 0) {
              setModal({
                isOpen: true,
                type: 'warning',
                title: '초기화 확인',
                message: '현재 입력 중인 내용이 있습니다.\n초기화하시겠습니까?',
                confirmText: '초기화',
                showCancel: true,
                onConfirm: () => {
                  resetToNewMode(getDateString(0), '');
                  setCompanySummary(null);
                  // 재고 목록도 새로고침
                  purchaseInventoryAPI.getAll({ has_remaining: 'true' })
                    .then(res => setInventory(res.data.data || []))
                    .catch(err => console.error('재고 목록 조회 오류:', err));
                }
              });
            } else {
              resetToNewMode(getDateString(0), '');
              setCompanySummary(null);
            }
          }}>
            초기화
          </button>
          {isEdit && (
            <button 
              className="btn btn-danger"
              onClick={() => setDeleteModal({ isOpen: true })}
            >
              삭제
            </button>
          )}
          <button className="btn btn-primary" onClick={() => handleSave(false)}>
            {isEdit ? '수정' : '저장'}
          </button>
          <button className="btn btn-success" onClick={() => handleSave(true)}>
            {isEdit ? '수정 및 출력' : '저장 및 출력'}
          </button>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
          <div style={{ width: '150px' }}>
            <label className="required" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '600' }}>거래일자</label>
            <input
              type="date"
              value={tradeDate}
              onChange={(e) => handleDateChange(e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="required" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '600' }}>거래처</label>
            <SearchableSelect
              options={companyOptions}
              value={companyId}
              onChange={handleCompanyChange}
              placeholder="거래처 선택..."
            />
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 - 2단 레이아웃 */}
      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 280px)' }}>
        
        {/* 왼쪽: 매출 품목 */}
        <div 
          style={{ 
            flex: 1, 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* 헤더 */}
          <div style={{ 
            padding: '0.75rem 1rem', 
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#2c3e50' }}>품목 상세</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#7f8c8d' }}>
                👈 오른쪽 재고에서 드래그
              </span>
              {saleItems.length > 0 && (
                <button 
                  className="btn btn-danger btn-sm"
                  onClick={() => setSaleItems([])}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                >
                  전체삭제
                </button>
              )}
            </div>
          </div>

          {/* 품목 영역 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 스크롤 가능한 테이블 영역 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table className="table" style={{ width: '100%', height: saleItems.length === 0 ? '100%' : 'auto', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '40px' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '40px' }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>No</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>품목</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>수량</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>단가</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>합계</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>마진</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>비고</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody style={{ height: saleItems.length === 0 ? 'calc(100% - 40px)' : 'auto' }}>
                  {saleItems.length === 0 ? (
                    /* 빈 상태 - 전체 영역 사용 */
                    <tr style={{ height: '100%' }}>
                      <td colSpan="8" style={{ padding: '1rem', height: '100%' }}>
                        <div style={{ 
                          height: '100%',
                          minHeight: '200px',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: '#95a5a6',
                          fontSize: '1rem',
                          backgroundColor: '#fafafa',
                          border: '2px dashed #ddd',
                          borderRadius: '8px'
                        }}>
                          👈 오른쪽 재고에서 품목을 드래그하여 추가하세요
                        </div>
                      </td>
                    </tr>
                  ) : (
                    saleItems.map((item, index) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#7f8c8d' }}>{index + 1}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {formatProductName(item)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.quantity ? formatNumber(item.quantity) : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/,/g, '');
                            handleItemChange(item.id, 'quantity', val);
                          }}
                          style={{ 
                            width: '70px', 
                            textAlign: 'center', 
                            padding: '0.5rem', 
                            border: '1px solid #ddd', 
                            borderRadius: '4px',
                            fontSize: '0.9rem'
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.unit_price ? formatCurrency(item.unit_price) : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/,/g, '');
                            handleItemChange(item.id, 'unit_price', val);
                          }}
                          style={{ 
                            width: '90px', 
                            textAlign: 'right', 
                            padding: '0.5rem', 
                            border: '1px solid #ddd', 
                            borderRadius: '4px',
                            fontSize: '0.9rem'
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '500' }}>
                        {formatCurrency(item.supply_amount)}
                      </td>
                      <td style={{ 
                        padding: '0.5rem', 
                        textAlign: 'right',
                        color: item.margin >= 0 ? '#27ae60' : '#e74c3c',
                        fontWeight: '500'
                      }}>
                        {formatCurrency(item.margin)}
                      </td>
                      <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                        {item.sender || item.shipper_info || '-'}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: '#e74c3c', 
                            cursor: 'pointer',
                            fontSize: '1rem'
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* 합계 행 - 항상 하단에 고정 */}
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', flexShrink: 0 }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '40px' }} />
              </colgroup>
              <tfoot>
                <tr style={{ backgroundColor: '#ecf0f1' }}>
                  <td colSpan="4" style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>합계</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '700', color: '#2980b9' }}>
                    {formatCurrency(totals.amount)}
                  </td>
                  <td style={{ 
                    padding: '0.75rem', 
                    textAlign: 'right', 
                    fontWeight: '700',
                    color: totals.margin >= 0 ? '#27ae60' : '#e74c3c'
                  }}>
                    {formatCurrency(totals.margin)}
                  </td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 비고 & 잔고 영역 - 좌우 배치 */}
          <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 1rem', borderTop: '1px solid #eee', alignItems: 'stretch' }}>
            {/* 좌측: 비고 입력 */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#2980b9' }}>비고</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="메모 입력..."
                style={{ 
                  width: '100%', 
                  flex: 1,
                  padding: '10px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  resize: 'none',
                  minHeight: '150px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            {/* 우측: 거래처 잔고 현황 - PaymentCard 컴포넌트 사용 */}
            <PaymentCard
              isPurchase={false}
              companyId={companyId}
              tradeDate={tradeDate}
              companySummary={companySummary}
              currentTodayTotal={totals.amount || 0}
              linkedPayments={linkedPayments.filter(p => !deletedPaymentIds.includes(p.id))}
              pendingPayments={pendingPayments}
              modifiedPayments={modifiedPayments}
              onLinkedPaymentsChange={(newPayments) => setLinkedPayments(newPayments)}
              onPendingPaymentsChange={(newPayments) => setPendingPayments(newPayments)}
              onModifiedPaymentsChange={(newModified) => setModifiedPayments(newModified)}
              onDeletePayment={(paymentId) => setDeletedPaymentIds(prev => [...prev, paymentId])}
              fontScale={1.0}
              showTitle={true}
              title="매출처 잔고"
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>
        </div>

        {/* 오른쪽: 재고 목록 */}
        <div style={{ 
          flex: 1,
          backgroundColor: 'white', 
          borderRadius: '8px', 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* 헤더 */}
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#3498db', 
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: '600', fontSize: '1.1rem' }}>📦 현재 재고</span>
            <span style={{ fontSize: '0.9rem' }}>{filteredInventory.length}건</span>
          </div>

          {/* 검색 */}
          <div style={{ padding: '0.5rem' }}>
            <input
              type="text"
              value={inventoryFilter}
              onChange={(e) => setInventoryFilter(e.target.value)}
              placeholder="품목/매입처/출하주 검색..."
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>

          {/* 재고 목록 - 테이블 형태 */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filteredInventory.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '2rem' }}>
                재고가 없습니다.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#34495e', color: 'white', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', width: '35px', fontSize: '0.85rem' }}>No</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>품목</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>매입처</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>출하지/출하주</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap', width: '60px', fontSize: '0.85rem' }}>매입일</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', width: '70px', fontSize: '0.85rem' }}>단가</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', width: '55px', fontSize: '0.85rem' }}>잔량</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item, index) => {
                    const usedQty = getUsedQuantity(item.id);
                    const availableQty = parseFloat(item.remaining_quantity) - usedQty;
                    const isDisabled = availableQty <= 0;
                    const shipperInfo = [item.shipper_location, item.sender].filter(Boolean).join(' / ') || '-';
                    const hasChange = item._hasChange; // 수량 변화 있음
                    const qtyChange = item._qtyChange || 0;
                    const isRestored = qtyChange > 0; // 복원 예정
                    const isReduced = qtyChange < 0; // 추가 차감 예정
                    
                    return (
                      <tr
                        key={item.id}
                        draggable={!isDisabled}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        style={{
                          backgroundColor: hasChange 
                            ? (isRestored ? '#fff3cd' : '#ffe4e6') // 복원: 노란색, 차감: 분홍색
                            : (isDisabled ? '#f5f5f5' : (draggedItem?.id === item.id ? '#e8f4fd' : 'transparent')),
                          cursor: isDisabled ? 'not-allowed' : 'grab',
                          opacity: isDisabled ? 0.5 : 1,
                          transition: 'background-color 0.2s'
                        }}
                        title={hasChange 
                          ? `저장 시 ${Math.abs(qtyChange)}개 ${isRestored ? '복원' : '차감'} 예정` 
                          : (isDisabled ? '잔량 없음' : '드래그하여 매출 품목에 추가')}
                      >
                        <td style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
                          {index + 1}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: '500' }}>{formatProductName(item)}</span>
                          {hasChange && (
                            <span style={{ 
                              marginLeft: '0.3rem',
                              fontSize: '0.7rem', 
                              backgroundColor: isRestored ? '#ffc107' : '#f87171', 
                              color: isRestored ? '#333' : '#fff', 
                              padding: '1px 4px', 
                              borderRadius: '3px' 
                            }}>
                              {isRestored ? '복원예정' : '차감예정'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                          {item.company_name || '-'}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#666' }}>
                          {shipperInfo}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
                          {formatDateShort(item.purchase_date)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td style={{ 
                          padding: '0.5rem', 
                          textAlign: 'right', 
                          borderBottom: '1px solid #eee',
                          fontSize: '0.85rem',
                          color: hasChange 
                            ? (isRestored ? '#e67e22' : '#dc2626')
                            : (availableQty > 0 ? '#27ae60' : '#e74c3c'),
                          fontWeight: '600'
                        }}>
                          {formatNumber(availableQty)}
                          {hasChange && (
                            <span style={{ fontSize: '0.7rem', color: isRestored ? '#e67e22' : '#dc2626' }}>
                              {' '}({isRestored ? '+' : ''}{qtyChange})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 수량/단가 입력 모달 - 매칭 모달 스타일 */}
      {inputModal.isOpen && createPortal(
        <div className="modal-overlay" onClick={() => setInputModal({ isOpen: false, inventory: null, quantity: '', unitPrice: '', maxQuantity: 0 })}>
          <div 
            className="qty-input-modal"
            style={{ minWidth: '400px', maxWidth: '450px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 품목명 - 강조 표시 */}
            <div style={{ 
              textAlign: 'center', 
              padding: '1rem',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              {/* 품목명 - 첫 번째 줄, 크게 강조 */}
              <div style={{ 
                fontSize: '1.25rem', 
                fontWeight: '700', 
                color: '#1e40af',
                marginBottom: '0.75rem'
              }}>
                {formatProductName(inputModal.inventory || {})}
              </div>
              
              {/* 출하주/출하지 정보 */}
              {(inputModal.inventory?.sender || inputModal.inventory?.shipper_location) && (
                <div style={{ 
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '1.5rem',
                  marginBottom: '0.5rem',
                  flexWrap: 'wrap'
                }}>
                  {inputModal.inventory?.sender && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>출하주:</span>
                      <span style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600', 
                        color: '#059669'
                      }}>
                        {inputModal.inventory.sender}
                      </span>
                    </div>
                  )}
                  {inputModal.inventory?.shipper_location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>출하지:</span>
                      <span style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600', 
                        color: '#0284c7'
                      }}>
                        {inputModal.inventory.shipper_location}
                      </span>
                    </div>
                  )}
                </div>
              )}
              
              {/* 매입처 */}
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                매입처: {inputModal.inventory?.company_name || '-'}
              </div>
            </div>
            
            {/* 정보 영역 */}
            <div className="qty-input-info">
              <div className="qty-input-row">
                <span className="qty-input-label">재고 잔량</span>
                <span className="qty-input-value" style={{ color: '#16a34a', fontWeight: '600' }}>
                  {formatNumber(inputModal.maxQuantity)}
                </span>
              </div>
              <div className="qty-input-row">
                <span className="qty-input-label">매입 단가</span>
                <span className="qty-input-value">{formatCurrency(inputModal.inventory?.unit_price)}원</span>
              </div>
            </div>
            
            {/* 수량/단가 입력 - 한 줄 */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', width: '100%' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.35rem' }}>판매 수량</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={inputModal.quantity ? formatNumber(parseFloat(inputModal.quantity)) : ''}
                  onChange={(e) => {
                    // 콤마 제거 후 숫자와 소수점만 허용
                    const val = e.target.value.replace(/,/g, '');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      const num = parseFloat(val) || 0;
                      setInputModal(prev => ({
                        ...prev,
                        quantity: val,
                        ...(num > prev.maxQuantity ? { quantity: prev.maxQuantity.toString() } : {})
                      }));
                    }
                  }}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('sale-unit-price-input')?.focus();
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setInputModal({ isOpen: false, inventory: null, quantity: '', unitPrice: '', maxQuantity: 0 });
                    }
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem', 
                    fontSize: '1.1rem', 
                    border: '2px solid #e5e7eb', 
                    borderRadius: '8px',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.35rem' }}>판매 단가</label>
                <input
                  id="sale-unit-price-input"
                  type="text"
                  inputMode="numeric"
                  value={inputModal.unitPrice ? formatCurrency(parseInt(inputModal.unitPrice)) : ''}
                  onChange={(e) => {
                    // 콤마 제거 후 숫자만 허용
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setInputModal(prev => ({ ...prev, unitPrice: val }));
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem', 
                    fontSize: '1.1rem', 
                    border: '2px solid #e5e7eb', 
                    borderRadius: '8px',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      handleInputConfirm();
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setInputModal({ isOpen: false, inventory: null, quantity: '', unitPrice: '', maxQuantity: 0 });
                    }
                  }}
                />
              </div>
            </div>
            
            {/* 예상 금액 */}
            {inputModal.quantity && inputModal.unitPrice && (() => {
              const qty = parseFloat(inputModal.quantity) || 0;
              const price = parseFloat(inputModal.unitPrice) || 0;
              const purchasePrice = inputModal.inventory?.unit_price || 0;
              const amount = qty * price;
              const margin = (price - purchasePrice) * qty;
              
              // 소수점 이하가 있으면 표시, 없으면 정수로
              const formatAmount = (val) => {
                return val % 1 === 0 
                  ? formatCurrency(val) 
                  : new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(val);
              };
              
              return (
                <div style={{ 
                  padding: '0.75rem', 
                  backgroundColor: '#f0fdf4', 
                  borderRadius: '8px',
                  textAlign: 'center',
                  marginTop: '1rem',
                  border: '1px solid #bbf7d0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '1.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: '#666' }}>금액 </span>
                      <span style={{ fontSize: '1.15rem', fontWeight: '700', color: '#166534' }}>
                        {formatAmount(amount)}원
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: '#666' }}>마진 </span>
                      <span style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600',
                        color: margin >= 0 ? '#16a34a' : '#dc2626'
                      }}>
                        {formatAmount(margin)}원
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* 버튼 */}
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              marginTop: '1.5rem',
              justifyContent: 'center'
            }}>
              <button 
                className="modal-btn modal-btn-cancel"
                style={{ minWidth: '100px', padding: '0.75rem 1.5rem' }}
                onClick={() => setInputModal({ isOpen: false, inventory: null, quantity: '', unitPrice: '', maxQuantity: 0 })}
              >
                취소
              </button>
              <button 
                className="modal-btn modal-btn-primary"
                style={{ minWidth: '100px', padding: '0.75rem 1.5rem' }}
                onClick={handleInputConfirm}
                disabled={!inputModal.quantity || parseFloat(inputModal.quantity) <= 0 || !inputModal.unitPrice || parseFloat(inputModal.unitPrice) <= 0}
              >
                추가
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

      {/* 전표 삭제 확인 모달 - 공통 컴포넌트 사용 */}
      <TradeDeleteConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false })}
        onConfirm={handleDelete}
        title="전표 삭제 확인"
        warnings={[
          '삭제된 전표는 <strong>복구할 수 없습니다</strong>',
          '연결된 <strong>입출금 내역</strong>이 함께 삭제됩니다',
          '<strong>재고 매칭 정보</strong>도 삭제됩니다 (재고가 복원됩니다)'
        ]}
        additionalContent={
          saleItems.length > 0 && (
            <div style={{ 
              backgroundColor: '#f0f9ff', 
              border: '1px solid #0ea5e9',
              borderRadius: '8px', 
              padding: '0.75rem'
            }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#0369a1' }}>
                📦 품목 상세 내역 <strong>{saleItems.length}건</strong>이 삭제됩니다.
              </p>
            </div>
          )
        }
      />

      {/* 전표 출력 모달 */}
      <TradePrintModal
        isOpen={printModal.isOpen}
        onClose={() => {
          setPrintModal({ isOpen: false, tradeId: null });
          // ★ 출력 모달 닫은 후에도 현재 전표 유지 (이미 loadExistingTrade로 로드됨)
        }}
        tradeId={printModal.tradeId}
      />
    </div>
  );
}

export default SaleFromInventory;



