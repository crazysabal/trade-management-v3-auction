import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { matchingAPI } from '../services/api';
import { Link } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal';

function MatchingPage() {
  // 조회 조건
  const [dateRange, setDateRange] = useState({
    start_date: getDateString(-14),
    end_date: getDateString(0)
  });

  // 날짜 목록
  const [dateList, setDateList] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);

  // 매출 데이터
  const [salesData, setSalesData] = useState([]);

  // 미매칭 전체 전표 (오른쪽 패널)
  const [unmatchedTrades, setUnmatchedTrades] = useState([]);

  // 매칭 모달
  const [matchingModal, setMatchingModal] = useState({
    isOpen: false,
    trade: null,
    items: [],
    inventory: [],
    selections: {}
  });

  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({
    isOpen: false, type: 'info', title: '', message: '',
    onConfirm: () => { }, confirmText: '확인', showCancel: false
  });

  // 드래그 앤 드롭 상태
  const [draggedInventory, setDraggedInventory] = useState(null);
  const [dropTargetItem, setDropTargetItem] = useState(null);

  // 수량 입력 모달
  const [qtyInputModal, setQtyInputModal] = useState({
    isOpen: false,
    saleItem: null,
    inventory: null,
    quantity: 0,
    maxQuantity: 0
  });

  // 기존 매칭 내역 모달
  const [matchingHistoryModal, setMatchingHistoryModal] = useState({
    isOpen: false,
    saleItem: null,
    matchings: []
  });

  // 선택된 매출 품목 (재고 추천용)
  const [selectedSaleItem, setSelectedSaleItem] = useState(null);

  // 매칭 모달 닫기
  const closeMatchingModal = () => {
    setMatchingModal({ isOpen: false, trade: null, items: [], inventory: [], selections: {} });
    setSelectedSaleItem(null); // 선택된 품목 초기화
    // 메인 데이터 새로고침 (모달에서 매칭 작업이 이루어졌을 수 있으므로)
    loadData();
  };

  // ESC 키로 모달 닫기 기능 제거 (사용자 요청: 실수 방지)
  // ESC 키로 모달 닫기 (사용자 요청: 부활)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // 확인 모달이 열려있으면 동작하지 않음 (확인 모달에서 처리)
        if (modal.isOpen) return;

        e.preventDefault();
        e.stopPropagation();

        // 가장 위에 있는 모달부터 닫기 (역순)
        if (qtyInputModal.isOpen) {
          handleQtyInputCancel();
        } else if (matchingHistoryModal.isOpen) {
          closeMatchingHistoryModal();
        } else if (matchingModal.isOpen) {
          closeMatchingModal();
        }
      }
    };

    if (matchingModal.isOpen || qtyInputModal.isOpen || matchingHistoryModal.isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [matchingModal.isOpen, qtyInputModal.isOpen, matchingHistoryModal.isOpen, modal.isOpen]);

  // 로컬 시간대 기준 YYYY-MM-DD 형식 반환 (UTC 문제 해결)
  function getDateString(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getDayOfWeek(dateString) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const date = new Date(dateString);
    return days[date.getDay()];
  }

  function isWeekend(dateString) {
    const date = new Date(dateString);
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await matchingAPI.getAllSales(dateRange);
      const allSales = response.data.data || [];

      const dateMap = new Map();
      const start = new Date(dateRange.start_date);
      const end = new Date(dateRange.end_date);

      for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
        // 로컬 시간대 기준 날짜 문자열 생성
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dateMap.set(dateStr, {
          date: dateStr,
          dayOfWeek: getDayOfWeek(dateStr),
          isWeekend: isWeekend(dateStr),
          trades: [],
          totalAmount: 0,
          unmatchedCount: 0
        });
      }

      // 미매칭 전표 목록 (오름차순)
      const unmatched = [];

      allSales.forEach(trade => {
        const dateStr = trade.trade_date.split('T')[0];
        if (dateMap.has(dateStr)) {
          const dateData = dateMap.get(dateStr);
          dateData.trades.push(trade);
          dateData.totalAmount += parseFloat(trade.total_amount) || 0;
          if (trade.overall_status !== 'MATCHED') {
            dateData.unmatchedCount++;
            unmatched.push(trade);
          }
        }
      });

      // 오름차순 정렬 (날짜순, 같은 날짜면 거래처명순)
      unmatched.sort((a, b) => {
        const dateCompare = a.trade_date.localeCompare(b.trade_date);
        if (dateCompare !== 0) return dateCompare;
        return a.customer_name.localeCompare(b.customer_name);
      });

      setUnmatchedTrades(unmatched);

      const dates = Array.from(dateMap.values());
      setDateList(dates);

      const today = getDateString(0);
      const todayData = dates.find(d => d.date === today);
      if (todayData) {
        setSelectedDate(todayData);
        setSalesData(todayData.trades);
      } else if (dates.length > 0) {
        setSelectedDate(dates[0]);
        setSalesData(dates[0].trades);
      }

    } catch (error) {
      console.error('데이터 로딩 오류:', error);
      setModal({
        isOpen: true, type: 'warning', title: '로딩 실패',
        message: '데이터를 불러오는데 실패했습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (dateData) => {
    setSelectedDate(dateData);
    setSalesData(dateData.trades);
  };

  // 전표 더블클릭 시 매칭 모달 열기
  const handleTradeDoubleClick = async (trade) => {
    try {
      const response = await matchingAPI.getTradeInventory(trade.trade_master_id);
      const { items, inventory } = response.data.data || { items: [], inventory: [] };

      const initialSelections = {};
      items.forEach(item => {
        initialSelections[item.sale_detail_id] = {};
      });

      setMatchingModal({
        isOpen: true,
        trade,
        items,
        inventory,
        selections: initialSelections
      });

    } catch (error) {
      console.error('재고 조회 오류:', error);
      setModal({
        isOpen: true, type: 'warning', title: '조회 실패',
        message: '재고 정보를 불러오는데 실패했습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
    }
  };

  const formatCurrency = (value) => new Intl.NumberFormat('ko-KR').format(value || 0);

  const formatNumber = (value) => new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value || 0);

  const formatDateShort = (dateString) => {
    if (!dateString) return '-';
    const date = dateString.split('T')[0];
    const parts = date.split('-');
    return `${parts[1]}-${parts[2]}`;
  };

  // 품목 표시 형식: "품목명 중량kg (등급)" - 전표 등록 화면과 동일
  const formatProductName = (item) => {
    const name = item.product_name || '';
    const weight = item.product_weight ? `${parseFloat(item.product_weight)}kg` : '';
    const grade = item.grade ? `(${item.grade})` : '';
    return `${name}${weight ? ` ${weight}` : ''}${grade ? ` ${grade}` : ''}`.trim();
  };

  // 품목 금액 계산 (supply_amount가 없으면 quantity * unit_price)
  const getItemAmount = (item) => {
    if (item.supply_amount) {
      return parseFloat(item.supply_amount);
    }
    return parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0);
  };

  // 전체 합계 금액 계산
  const getTotalAmount = () => {
    return matchingModal.items.reduce((sum, item) => sum + getItemAmount(item), 0);
  };

  // 품목별 마진액 계산 (매출 단가 - 매입 단가) × 매칭 수량
  const getItemMargin = (item) => {
    if (!item.matchings || item.matchings.length === 0) return null;

    const saleUnitPrice = parseFloat(item.unit_price || 0);
    let totalMargin = 0;

    for (const matching of item.matchings) {
      const purchaseUnitPrice = parseFloat(matching.purchase_unit_price || 0);
      const matchedQty = parseFloat(matching.matched_quantity || 0);
      totalMargin += (saleUnitPrice - purchaseUnitPrice) * matchedQty;
    }

    return totalMargin;
  };

  // 전체 마진액 합계
  const getTotalMargin = () => {
    return matchingModal.items.reduce((sum, item) => {
      const margin = getItemMargin(item);
      return sum + (margin || 0);
    }, 0);
  };

  // 매칭 모달 관련 함수들
  const handleMatchingQtyChange = (saleDetailId, inventoryId, qty) => {
    setMatchingModal(prev => {
      const newSelections = { ...prev.selections };
      if (!newSelections[saleDetailId]) {
        newSelections[saleDetailId] = {};
      }
      if (qty <= 0) {
        delete newSelections[saleDetailId][inventoryId];
      } else {
        newSelections[saleDetailId][inventoryId] = qty;
      }
      return { ...prev, selections: newSelections };
    });
  };

  // 드래그 시작 핸들러
  const handleDragStart = (e, inventory) => {
    setDraggedInventory(inventory);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', inventory.id);
  };

  // 드래그 종료 핸들러
  const handleDragEnd = () => {
    setDraggedInventory(null);
    setDropTargetItem(null);
  };

  // 드래그 오버 핸들러 (드롭 허용)
  const handleDragOver = (e, saleItem) => {
    e.preventDefault();
    // 왼쪽에서 품목이 선택되어 있고, 선택된 품목과 동일한 경우에만 드롭 허용
    if (selectedSaleItem &&
      selectedSaleItem.sale_detail_id === saleItem.sale_detail_id &&
      draggedInventory &&
      draggedInventory.product_id === saleItem.product_id) {
      e.dataTransfer.dropEffect = 'copy';
      setDropTargetItem(saleItem.sale_detail_id);
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  // 드래그 리브 핸들러
  const handleDragLeave = () => {
    setDropTargetItem(null);
  };

  // 드롭 핸들러
  const handleDrop = (e, saleItem) => {
    e.preventDefault();
    setDropTargetItem(null);

    if (!draggedInventory) return;

    // 왼쪽에서 품목이 선택되어 있는지 확인
    if (!selectedSaleItem) {
      setModal({
        isOpen: true, type: 'warning', title: '품목 미선택',
        message: '먼저 왼쪽에서 매칭할 매출 품목을 선택해주세요.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
      return;
    }

    // 선택된 품목과 드롭 대상이 동일한지 확인
    if (selectedSaleItem.sale_detail_id !== saleItem.sale_detail_id) {
      setModal({
        isOpen: true, type: 'warning', title: '대상 불일치',
        message: '선택된 매출 품목에만 드롭할 수 있습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
      return;
    }

    // 품목 일치 확인
    if (draggedInventory.product_id !== saleItem.product_id) {
      setModal({
        isOpen: true, type: 'warning', title: '품목 불일치',
        message: '동일한 품목만 매칭할 수 있습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
      return;
    }

    // 재고 잔량 확인
    const usedQty = getUsedQuantityForInventory(draggedInventory.id);
    const availableQty = parseFloat(draggedInventory.remaining_quantity) - usedQty;

    if (availableQty <= 0) {
      setModal({
        isOpen: true, type: 'warning', title: '재고 부족',
        message: '해당 재고는 이미 모두 사용되었습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
      return;
    }

    // 기본 수량: 미매칭 수량과 가용 재고 중 작은 값
    const defaultQty = Math.min(parseFloat(saleItem.unmatched_quantity), availableQty);

    // 수량 입력 모달 열기
    setQtyInputModal({
      isOpen: true,
      saleItem,
      inventory: draggedInventory,
      quantity: defaultQty,
      maxQuantity: Math.min(parseFloat(saleItem.unmatched_quantity), availableQty)
    });

    setDraggedInventory(null);
  };

  // 수량 입력 모달 확인 - 바로 DB에 저장
  const handleQtyInputConfirm = async () => {
    const { saleItem, inventory, quantity } = qtyInputModal;

    if (quantity <= 0) {
      setQtyInputModal({ isOpen: false, saleItem: null, inventory: null, quantity: 0, maxQuantity: 0 });
      return;
    }

    try {
      // 바로 API 호출하여 매칭 저장
      await matchingAPI.match({
        sale_detail_id: saleItem.sale_detail_id,
        matchings: [{
          purchase_inventory_id: inventory.id,
          quantity: quantity
        }]
      });

      setQtyInputModal({ isOpen: false, saleItem: null, inventory: null, quantity: 0, maxQuantity: 0 });

      // 매칭 모달 데이터 새로고침
      if (matchingModal.trade) {
        const response = await matchingAPI.getTradeInventory(matchingModal.trade.trade_master_id);
        const { items, inventory: inv } = response.data.data || { items: [], inventory: [] };

        setMatchingModal(prev => ({
          ...prev,
          items,
          inventory: inv
        }));
      }

      // 메인 데이터는 모달 닫을 때 새로고침하므로 여기서는 생략 (깜박임 방지)

    } catch (error) {
      setModal({
        isOpen: true, type: 'warning', title: '매칭 실패',
        message: error.response?.data?.message || '매칭 저장에 실패했습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
    }
  };

  // 수량 입력 모달 취소
  const handleQtyInputCancel = () => {
    setQtyInputModal({ isOpen: false, saleItem: null, inventory: null, quantity: 0, maxQuantity: 0 });
  };

  // 기존 매칭 내역 모달 열기
  const openMatchingHistoryModal = (saleItem) => {
    setMatchingHistoryModal({
      isOpen: true,
      saleItem,
      matchings: saleItem.matchings || []
    });
  };

  // 기존 매칭 내역 모달 닫기
  const closeMatchingHistoryModal = () => {
    setMatchingHistoryModal({ isOpen: false, saleItem: null, matchings: [] });
  };

  // 매칭 취소 확인 모달 띄우기
  const confirmCancelMatching = (matchingId) => {
    setModal({
      isOpen: true,
      type: 'delete', // 빨간색 아이콘/버튼 스타일
      title: '매칭 취소',
      message: '정말로 이 매칭 내역을 취소하시겠습니까?\n취소 후에는 되돌릴 수 없습니다.',
      confirmText: '취소하기',
      showCancel: true,
      onConfirm: () => handleCancelExistingMatching(matchingId)
    });
  };

  // 기존 매칭 취소 (DB에서 삭제)
  const handleCancelExistingMatching = async (matchingId) => {
    try {
      await matchingAPI.cancel(matchingId);

      // 매칭 모달 데이터 새로고침
      if (matchingModal.trade) {
        const response = await matchingAPI.getTradeInventory(matchingModal.trade.trade_master_id);
        const { items, inventory } = response.data.data || { items: [], inventory: [] };

        const initialSelections = {};
        items.forEach(item => {
          initialSelections[item.sale_detail_id] = {};
        });

        setMatchingModal(prev => ({
          ...prev,
          items,
          inventory,
          selections: initialSelections
        }));

        // 매칭 내역 모달도 업데이트
        if (matchingHistoryModal.saleItem) {
          const updatedItem = items.find(i => i.sale_detail_id === matchingHistoryModal.saleItem.sale_detail_id);
          if (updatedItem) {
            setMatchingHistoryModal(prev => ({
              ...prev,
              saleItem: updatedItem,
              matchings: updatedItem.matchings || []
            }));
          }
        }
      }

      setModal({
        isOpen: true, type: 'success', title: '취소 완료',
        message: '매칭이 취소되었습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
    } catch (error) {
      setModal({
        isOpen: true, type: 'warning', title: '취소 실패',
        message: error.response?.data?.message || '매칭 취소에 실패했습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
    }
  };

  const getSelectedTotalForItem = (saleDetailId) => {
    const selections = matchingModal.selections[saleDetailId] || {};
    return Object.values(selections).reduce((sum, qty) => sum + parseFloat(qty || 0), 0);
  };

  const getUsedQuantityForInventory = (inventoryId) => {
    let total = 0;
    for (const selections of Object.values(matchingModal.selections)) {
      if (selections[inventoryId]) {
        total += parseFloat(selections[inventoryId] || 0);
      }
    }
    return total;
  };

  const canExecuteMatching = () => {
    if (!matchingModal.items) return false;

    let hasAnyMatching = false;

    for (const item of matchingModal.items) {
      const selectedTotal = getSelectedTotalForItem(item.sale_detail_id);
      if (selectedTotal > 0) {
        hasAnyMatching = true;
        if (selectedTotal > item.unmatched_quantity) return false;
      }
    }

    for (const inv of matchingModal.inventory) {
      const usedQty = getUsedQuantityForInventory(inv.id);
      if (usedQty > inv.remaining_quantity) return false;
    }

    return hasAnyMatching;
  };

  const handleMatch = async () => {
    if (!matchingModal.trade) return;

    const matchings = [];

    for (const [saleDetailId, inventorySelections] of Object.entries(matchingModal.selections)) {
      const items = [];
      for (const [inventoryId, quantity] of Object.entries(inventorySelections)) {
        if (parseFloat(quantity) > 0) {
          items.push({
            purchase_inventory_id: parseInt(inventoryId),
            quantity: parseFloat(quantity)
          });
        }
      }
      if (items.length > 0) {
        matchings.push({ sale_detail_id: parseInt(saleDetailId), items });
      }
    }

    if (matchings.length === 0) {
      setModal({
        isOpen: true, type: 'warning', title: '매칭 수량 없음',
        message: '매칭할 수량을 입력하세요.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
      return;
    }

    try {
      const response = await matchingAPI.matchTrade({
        trade_master_id: matchingModal.trade.trade_master_id,
        matchings
      });

      setMatchingModal({ isOpen: false, trade: null, items: [], inventory: [], selections: {} });

      setModal({
        isOpen: true, type: 'success', title: '매칭 완료',
        message: response.data.message,
        confirmText: '확인', showCancel: false,
        onConfirm: () => {
          loadData();
        }
      });
    } catch (error) {
      setModal({
        isOpen: true, type: 'warning', title: '매칭 실패',
        message: error.response?.data?.message || '매칭에 실패했습니다.',
        confirmText: '확인', showCancel: false, onConfirm: () => { }
      });
    }
  };

  const getSortedInventoryForModal = () => {
    if (!matchingModal.items || matchingModal.items.length === 0) return matchingModal.inventory;
    const productIds = matchingModal.items.map(item => item.product_id);
    return [...matchingModal.inventory].sort((a, b) => {
      const aMatch = productIds.includes(a.product_id);
      const bMatch = productIds.includes(b.product_id);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return new Date(a.purchase_date) - new Date(b.purchase_date);
    });
  };

  const isMatchingProduct = (invProductId) => {
    // 선택된 매출 품목이 있을 때만 추천 표시
    if (!selectedSaleItem) {
      return false;
    }
    return selectedSaleItem.product_id === invProductId;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span className="badge badge-warning">미매칭</span>;
      case 'PARTIAL':
        return <span className="badge badge-info">부분</span>;
      case 'MATCHED':
        return <span className="badge badge-success">완료</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  // 통계
  const stats = {
    total: salesData.length,
    pending: salesData.filter(s => s.overall_status === 'PENDING').length,
    partial: salesData.filter(s => s.overall_status === 'PARTIAL').length,
    matched: salesData.filter(s => s.overall_status === 'MATCHED').length
  };

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="matching-page" style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 1rem' }}>
      {/* 페이지 헤더 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>🔗 마감 (매출-매입 매칭)</h1>
      </div>

      {/* 검색 필터 */}
      <div className="search-filter-container">
        <div className="filter-row">
          <div className="filter-group" style={{ minWidth: '150px', flex: 'none' }}>
            <label>시작일</label>
            <input
              type="date"
              value={dateRange.start_date}
              onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
            />
          </div>
          <div className="filter-group" style={{ minWidth: '150px', flex: 'none' }}>
            <label>종료일</label>
            <input
              type="date"
              value={dateRange.end_date}
              onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
            />
          </div>
          <div className="filter-group" style={{ flex: 'none' }}>
            <label>&nbsp;</label>
            <button onClick={loadData} className="btn btn-primary">조회</button>
          </div>
          <div style={{ flex: 1 }}></div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', paddingTop: '1.5rem' }}>
            <span>전체: <strong>{stats.total}</strong></span>
            <span style={{ color: '#e74c3c' }}>미매칭: <strong>{stats.pending}</strong></span>
            <span style={{ color: '#f39c12' }}>부분: <strong>{stats.partial}</strong></span>
            <span style={{ color: '#27ae60' }}>완료: <strong>{stats.matched}</strong></span>
          </div>
        </div>
      </div>

      {/* 3단 레이아웃 */}
      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 250px)', minHeight: '400px' }}>
        {/* 왼쪽: 날짜 목록 */}
        <div className="card" style={{ width: '150px', flexShrink: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title" style={{ margin: 0, padding: '0.8rem', borderRadius: 0, fontSize: '1rem', flexShrink: 0 }}>날짜</h3>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%' }}>
              <tbody>
                {dateList.map((dateData) => {
                  const isSelected = selectedDate?.date === dateData.date;
                  const dayColor = dateData.dayOfWeek === '토' ? '#3498db' :
                    dateData.dayOfWeek === '일' ? '#e74c3c' : '#333';

                  return (
                    <tr
                      key={dateData.date}
                      onClick={() => handleDateSelect(dateData)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#ebf5fb' : 'transparent'
                      }}
                    >
                      <td style={{
                        padding: '0.6rem 0.8rem',
                        borderBottom: '1px solid #eee',
                        color: dayColor,
                        fontWeight: isSelected ? '600' : '400'
                      }}>
                        {dateData.date.substring(5)}
                      </td>
                      <td style={{
                        padding: '0.6rem 0.4rem',
                        borderBottom: '1px solid #eee',
                        color: dayColor,
                        textAlign: 'center'
                      }}>
                        {dateData.dayOfWeek}
                      </td>
                      <td style={{
                        padding: '0.6rem 0.4rem',
                        borderBottom: '1px solid #eee',
                        textAlign: 'center'
                      }}>
                        {dateData.unmatchedCount > 0 && (
                          <span style={{
                            backgroundColor: '#e74c3c',
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontSize: '0.75rem'
                          }}>
                            {dateData.unmatchedCount}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 가운데: 선택된 날짜의 매출 거래처 목록 */}
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title" style={{ margin: 0, padding: '0.8rem', borderRadius: 0, fontSize: '1rem', flexShrink: 0 }}>
            매출 전표 {selectedDate && <span style={{ fontWeight: '400', fontSize: '0.9rem' }}>({selectedDate.date})</span>}
          </h3>
          <div className="table-container" style={{ boxShadow: 'none', borderRadius: 0, flex: 1, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>거래처명</th>
                  <th className="text-right">매출액</th>
                  <th className="text-right">잔고</th>
                  <th className="text-right">마진</th>
                  <th className="text-center">마진율</th>
                  <th className="text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {salesData.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center" style={{ padding: '2rem', color: '#7f8c8d' }}>
                      매출 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  salesData.map((sale) => {
                    const margin = parseFloat(sale.margin) || 0;
                    const marginRate = parseFloat(sale.margin_rate) || 0;
                    const balance = parseFloat(sale.balance) || 0;
                    const isFullyMatched = sale.overall_status === 'MATCHED';

                    return (
                      <tr
                        key={sale.trade_master_id}
                        onDoubleClick={() => handleTradeDoubleClick(sale)}
                        style={{ cursor: 'pointer' }}
                        title="더블클릭하여 매칭"
                      >
                        <td style={{ fontWeight: '500' }}>{sale.customer_name}</td>
                        <td className="text-right">{formatCurrency(sale.total_amount)}</td>
                        <td className="text-right" style={{ color: balance > 0 ? '#e74c3c' : '#27ae60' }}>
                          {formatCurrency(balance)}
                        </td>
                        <td className="text-right" style={{ color: isFullyMatched ? (margin >= 0 ? '#27ae60' : '#e74c3c') : '#9ca3af' }}>
                          {isFullyMatched ? formatCurrency(margin) : '-'}
                        </td>
                        <td className="text-center" style={{
                          color: isFullyMatched ? (marginRate >= 0 ? '#27ae60' : '#e74c3c') : '#9ca3af',
                          fontWeight: '500'
                        }}>
                          {isFullyMatched ? `${marginRate}%` : '-'}
                        </td>
                        <td className="text-center">{getStatusBadge(sale.overall_status)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {salesData.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: '#f8f9fa', fontWeight: '600', borderTop: '2px solid #ddd' }}>
                    <td style={{ padding: '0.6rem' }}>합계 ({salesData.length}건)</td>
                    <td className="text-right" style={{ padding: '0.6rem' }}>
                      {formatCurrency(salesData.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0))}
                    </td>
                    <td className="text-right" style={{ padding: '0.6rem', color: '#e74c3c' }}>
                      {formatCurrency(salesData.reduce((sum, s) => sum + parseFloat(s.balance || 0), 0))}
                    </td>
                    <td className="text-right" style={{
                      padding: '0.6rem',
                      color: salesData.filter(s => s.overall_status === 'MATCHED').reduce((sum, s) => sum + parseFloat(s.margin || 0), 0) >= 0 ? '#27ae60' : '#e74c3c'
                    }}>
                      {formatCurrency(salesData.filter(s => s.overall_status === 'MATCHED').reduce((sum, s) => sum + parseFloat(s.margin || 0), 0))}
                    </td>
                    <td className="text-center" style={{ padding: '0.6rem', color: '#7f8c8d' }}>-</td>
                    <td className="text-center" style={{ padding: '0.6rem', color: '#7f8c8d' }}>-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div style={{ padding: '0.5rem 0.8rem', borderTop: '1px solid #eee', backgroundColor: '#f8f9fa', fontSize: '0.85rem', color: '#7f8c8d' }}>
            💡 전표를 더블클릭하면 매칭 작업을 할 수 있습니다.
          </div>
        </div>

        {/* 오른쪽: 미매칭 전체 전표 목록 */}
        <div className="card" style={{ width: '220px', flexShrink: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title" style={{ margin: 0, padding: '0.8rem', borderRadius: 0, fontSize: '1rem', flexShrink: 0 }}>
            미매칭 전표 <span style={{ fontWeight: '400', fontSize: '0.85rem' }}>({unmatchedTrades.length}건)</span>
          </h3>
          <div className="table-container" style={{ boxShadow: 'none', borderRadius: 0, flex: 1, overflowY: 'auto' }}>
            {unmatchedTrades.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#7f8c8d' }}>
                미매칭 전표가 없습니다.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '70px' }}>날짜</th>
                    <th>거래처</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedTrades.map((trade) => (
                    <tr
                      key={trade.trade_master_id}
                      onDoubleClick={() => handleTradeDoubleClick(trade)}
                      style={{ cursor: 'pointer' }}
                      title="더블클릭하여 매칭"
                    >
                      <td style={{ fontSize: '0.9rem' }}>{formatDateShort(trade.trade_date)}</td>
                      <td style={{ fontWeight: '500' }}>{trade.customer_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 매칭 모달 - Portal로 body에 렌더링 */}
      {matchingModal.isOpen && createPortal(
        <div className="modal-overlay">
          <div
            className="matching-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="matching-modal-header">
              <div className="matching-modal-header-info">
                <h2>📋 매출-매입 매칭</h2>
                <div className="matching-modal-header-summary">
                  <span className="summary-item">
                    <span className="summary-label">거래일</span>
                    <span className="summary-value">{matchingModal.trade?.trade_date?.split('T')[0] || '-'}</span>
                  </span>
                  <span className="summary-divider">|</span>
                  <span className="summary-item">
                    <span className="summary-label">거래처</span>
                    <span className="summary-value highlight">{matchingModal.trade?.customer_name || '-'}</span>
                  </span>
                  <span className="summary-divider">|</span>
                  <span className="summary-item">
                    <span className="summary-label">합계</span>
                    <span className="summary-value" style={{ color: '#1f2937', fontWeight: '600' }}>
                      {formatCurrency(getTotalAmount())}원
                    </span>
                  </span>
                  <span className="summary-divider">|</span>
                  <span className="summary-item">
                    <span className="summary-label">마진</span>
                    <span className="summary-value" style={{
                      color: getTotalMargin() >= 0 ? '#16a34a' : '#dc2626',
                      fontWeight: '600'
                    }}>
                      {getTotalMargin() !== 0
                        ? `${getTotalMargin() >= 0 ? '+' : ''}${formatCurrency(getTotalMargin())}원`
                        : '-'}
                    </span>
                  </span>
                </div>
              </div>
              <div className="matching-modal-header-buttons">
                <button className="btn btn-secondary" onClick={closeMatchingModal}>
                  닫기
                </button>
              </div>
            </div>

            {/* 바디 */}
            <div className="matching-modal-body">
              {/* 왼쪽: 매출 품목 */}
              <div className="card matching-modal-card">
                <div className="matching-modal-card-header">
                  <h3 className="card-title">📦 매출 품목</h3>
                  <div className="matching-modal-status">
                    <span className="status-item pending">
                      미매칭 <strong>{matchingModal.items.filter(i => parseFloat(i.unmatched_quantity) > 0).length}건</strong>
                    </span>
                    <span className="status-item selected">
                      완료 <strong>{matchingModal.items.filter(i => parseFloat(i.unmatched_quantity) <= 0).length}건</strong>
                    </span>
                  </div>
                </div>

                <div className="table-container matching-modal-table">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '35px' }}>No</th>
                        <th style={{ whiteSpace: 'nowrap' }}>품목</th>
                        <th className="text-right" style={{ whiteSpace: 'nowrap' }}>수량</th>
                        <th className="text-right" style={{ whiteSpace: 'nowrap' }}>단가</th>
                        <th className="text-right" style={{ whiteSpace: 'nowrap' }}>금액</th>
                        <th style={{ whiteSpace: 'nowrap' }}>비고</th>
                        <th className="text-center" style={{ whiteSpace: 'nowrap' }}>매칭됨</th>
                        <th className="text-center" style={{ whiteSpace: 'nowrap' }}>미매칭</th>
                        <th className="text-right" style={{ whiteSpace: 'nowrap' }}>마진</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingModal.items.map((item, index) => {
                        const isDropTarget = dropTargetItem === item.sale_detail_id;
                        const unmatchedQty = parseFloat(item.unmatched_quantity);
                        const isComplete = unmatchedQty <= 0;
                        const isSelected = selectedSaleItem?.sale_detail_id === item.sale_detail_id;

                        return (
                          <tr
                            key={item.sale_detail_id}
                            className={`${isComplete ? 'completed-row' : ''} ${isDropTarget ? 'drop-target' : ''} ${isSelected ? 'selected-row' : ''}`}
                            onClick={() => setSelectedSaleItem(isSelected ? null : item)}
                            onDragOver={(e) => handleDragOver(e, item)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, item)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="text-center">{index + 1}</td>
                            <td style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>{formatProductName(item)}</td>
                            <td className="text-right">{formatNumber(item.quantity)}</td>
                            <td className="text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="text-right" style={{ fontWeight: '600', color: '#1565c0' }}>
                              {formatCurrency(getItemAmount(item))}
                            </td>
                            <td style={{ fontSize: '0.9rem', color: '#666', whiteSpace: 'nowrap' }}>{item.notes || '-'}</td>
                            <td className="text-center">
                              {item.matchings && item.matchings.length > 0 ? (
                                <button
                                  className="btn-saved-matching"
                                  onClick={() => openMatchingHistoryModal(item)}
                                  title="클릭하여 매칭 내역 확인/취소"
                                >
                                  {formatNumber(item.matched_quantity)}
                                </button>
                              ) : (
                                <span style={{ color: '#bdc3c7' }}>-</span>
                              )}
                            </td>
                            <td className="text-center" style={{
                              color: unmatchedQty > 0 ? '#e74c3c' : '#27ae60',
                              fontWeight: '600'
                            }}>
                              {unmatchedQty > 0 ? formatNumber(unmatchedQty) : '✓'}
                            </td>
                            <td className="text-right" style={{
                              fontWeight: '600',
                              color: getItemMargin(item) !== null
                                ? (getItemMargin(item) >= 0 ? '#16a34a' : '#dc2626')
                                : '#bdc3c7'
                            }}>
                              {getItemMargin(item) !== null
                                ? `${getItemMargin(item) >= 0 ? '+' : ''}${formatCurrency(getItemMargin(item))}`
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {matchingModal.items.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan="2" className="text-right">합계</td>
                          <td className="text-right">{formatNumber(matchingModal.items.reduce((sum, i) => sum + parseFloat(i.quantity || 0), 0))}</td>
                          <td></td>
                          <td className="text-right" style={{ fontWeight: '600', color: '#1565c0' }}>
                            {formatCurrency(getTotalAmount())}
                          </td>
                          <td></td>
                          <td className="text-center" style={{ color: '#3498db', fontWeight: '600' }}>
                            {matchingModal.items.filter(i => parseFloat(i.matched_quantity || 0) > 0).length}건
                          </td>
                          <td className="text-center" style={{ color: '#e74c3c', fontWeight: '600' }}>
                            {matchingModal.items.filter(i => parseFloat(i.unmatched_quantity) > 0).length}건
                          </td>
                          <td className="text-right" style={{
                            fontWeight: '600',
                            color: getTotalMargin() >= 0 ? '#16a34a' : '#dc2626'
                          }}>
                            {getTotalMargin() !== 0
                              ? `${getTotalMargin() >= 0 ? '+' : ''}${formatCurrency(getTotalMargin())}`
                              : '-'}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* 오른쪽: 매입 재고 */}
              <div className="card matching-modal-card matching-modal-card-wide">
                <div className="matching-modal-card-header">
                  <h3 className="card-title">📋 매입 재고</h3>
                  {selectedSaleItem ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.3rem 0.8rem',
                      backgroundColor: '#e0f2fe',
                      borderRadius: '6px',
                      fontSize: '0.85rem'
                    }}>
                      <span style={{ color: '#0369a1', fontWeight: '500' }}>
                        🎯 {formatProductName(selectedSaleItem)}
                      </span>
                      <span style={{ color: '#64748b' }}>
                        (미매칭: {formatNumber(selectedSaleItem.unmatched_quantity)})
                      </span>
                      <button
                        onClick={() => setSelectedSaleItem(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: '1rem',
                          padding: '0 4px'
                        }}
                        title="선택 해제"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className="matching-modal-hint">💡 매출 품목을 클릭하면 추천 재고가 표시됩니다</span>
                  )}
                </div>

                <div className="table-container matching-modal-table">
                  {matchingModal.inventory.length === 0 ? (
                    <div className="matching-modal-empty">사용 가능한 재고가 없습니다.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '30px' }}>No</th>
                          <th style={{ whiteSpace: 'nowrap' }}>품목</th>
                          <th style={{ whiteSpace: 'nowrap' }}>매입처</th>
                          <th style={{ whiteSpace: 'nowrap' }}>출하주</th>
                          <th style={{ width: '65px', whiteSpace: 'nowrap' }}>매입일</th>
                          <th className="text-right" style={{ whiteSpace: 'nowrap' }}>단가</th>
                          <th className="text-right" style={{ width: '50px', whiteSpace: 'nowrap' }}>잔량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedInventoryForModal().map((inv, index) => {
                          const isMatching = isMatchingProduct(inv.product_id);
                          const effectiveRemaining = parseFloat(inv.remaining_quantity);

                          // 출하주 정보 조합
                          const shipperInfo = [inv.shipper_location, inv.sender].filter(Boolean).join(' / ') || '-';

                          return (
                            <tr
                              key={inv.id}
                              className={isMatching ? 'matching-row' : ''}
                              draggable={effectiveRemaining > 0}
                              onDragStart={(e) => handleDragStart(e, inv)}
                              onDragEnd={handleDragEnd}
                              style={{ cursor: effectiveRemaining > 0 ? 'grab' : 'default' }}
                              title={effectiveRemaining > 0 ? '드래그하여 매출 품목에 매칭' : '잔량 없음'}
                            >
                              <td className="text-center">{index + 1}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {isMatching && <span className="badge badge-success" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>추천</span>}
                                  <span style={{ fontWeight: isMatching ? '600' : '400' }}>{formatProductName(inv)}</span>
                                </div>
                              </td>
                              <td style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{inv.company_name}</td>
                              <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{shipperInfo}</td>
                              <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{formatDateShort(inv.purchase_date)}</td>
                              <td className="text-right" style={{ fontSize: '0.9rem' }}>
                                {formatCurrency(inv.unit_price)}
                              </td>
                              <td className="text-right" style={{
                                color: effectiveRemaining > 0 ? '#27ae60' : '#e74c3c',
                                fontWeight: '600'
                              }}>
                                {formatNumber(effectiveRemaining)}
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

      {/* 수량 입력 모달 */}
      {qtyInputModal.isOpen && createPortal(
        <div className="modal-overlay">
          <div
            className="qty-input-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 아이콘 */}
            <div className="qty-input-modal-icon">
              <span>📦</span>
            </div>

            {/* 제목 */}
            <h2 className="qty-input-modal-title">매칭 수량 입력</h2>

            {/* 부제목 */}
            <p className="qty-input-modal-subtitle">
              {formatProductName(qtyInputModal.saleItem)}
            </p>

            {/* 정보 영역 */}
            <div className="qty-input-info">
              <div className="qty-input-row">
                <span className="qty-input-label">매입처</span>
                <span className="qty-input-value">{qtyInputModal.inventory?.company_name}</span>
              </div>
              <div className="qty-input-row">
                <span className="qty-input-label">출하주</span>
                <span className="qty-input-value">
                  {[qtyInputModal.inventory?.shipper_location, qtyInputModal.inventory?.sender].filter(Boolean).join(' / ') || '-'}
                </span>
              </div>
              <div className="qty-input-row">
                <span className="qty-input-label">미매칭 수량</span>
                <span className="qty-input-value" style={{ color: '#dc2626', fontWeight: '600' }}>
                  {formatNumber(qtyInputModal.saleItem?.unmatched_quantity)}
                </span>
              </div>
              <div className="qty-input-row">
                <span className="qty-input-label">재고 잔량</span>
                <span className="qty-input-value" style={{ color: '#16a34a', fontWeight: '600' }}>
                  {formatNumber(qtyInputModal.inventory?.remaining_quantity)}
                </span>
              </div>
            </div>

            {/* 수량 입력 */}
            <div className="qty-input-field">
              <label>매칭할 수량</label>
              <input
                type="text"
                inputMode="decimal"
                value={qtyInputModal.quantity === 0 ? '' : qtyInputModal.quantity}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || val === '.') {
                    setQtyInputModal(prev => ({ ...prev, quantity: 0 }));
                  } else {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                      setQtyInputModal(prev => ({
                        ...prev,
                        quantity: Math.min(num, prev.maxQuantity)
                      }));
                    }
                  }
                }}
                autoFocus
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    handleQtyInputConfirm();
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    handleQtyInputCancel();
                  }
                }}
              />
              <span className="qty-input-hint">최대: {formatNumber(qtyInputModal.maxQuantity)}</span>
            </div>

            {/* 버튼 */}
            <div className="qty-input-modal-buttons">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={handleQtyInputCancel}
              >
                취소
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handleQtyInputConfirm}
                disabled={qtyInputModal.quantity <= 0}
              >
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 기존 매칭 내역 모달 */}
      {matchingHistoryModal.isOpen && createPortal(
        <div className="modal-overlay">
          <div
            className="matching-history-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 아이콘 */}
            <div className="matching-history-modal-icon">
              <span>📋</span>
            </div>

            {/* 제목 */}
            <h2 className="matching-history-modal-title">매칭 내역</h2>

            {/* 부제목 */}
            <p className="matching-history-modal-subtitle">
              {formatProductName(matchingHistoryModal.saleItem)}
              <br />
              <span style={{ fontSize: '0.85rem' }}>총 수량: {formatNumber(matchingHistoryModal.saleItem?.quantity)}</span>
            </p>

            {/* 매칭 내역 목록 */}
            {matchingHistoryModal.matchings.length === 0 ? (
              <div className="matching-history-empty">저장된 매칭 내역이 없습니다.</div>
            ) : (
              <div className="matching-history-list">
                {matchingHistoryModal.matchings.map((m) => (
                  <div key={m.matching_id} className="matching-history-card">
                    {/* 정보 영역 */}
                    <div className="matching-card-info">
                      <div className="matching-card-row">
                        <span className="matching-card-label">출하주</span>
                        <span className="matching-card-value">{m.sender || '-'}</span>
                      </div>
                      <div className="matching-card-row">
                        <span className="matching-card-label">수량</span>
                        <span className="matching-card-value highlight">{formatNumber(m.matched_quantity)}</span>
                      </div>
                      <div className="matching-card-row">
                        <span className="matching-card-label">단가</span>
                        <span className="matching-card-value">{formatCurrency(m.purchase_unit_price)}</span>
                      </div>
                      <div className="matching-card-row">
                        <span className="matching-card-label">매입일</span>
                        <span className="matching-card-value">{formatDateShort(m.purchase_date)}</span>
                        <span className="company-badge">{m.purchase_company}</span>
                      </div>
                    </div>

                    {/* 취소 버튼 */}
                    <button
                      className="matching-card-cancel-btn"
                      onClick={() => confirmCancelMatching(m.matching_id)}
                    >
                      취소
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 합계 정보 */}
            {matchingHistoryModal.matchings.length > 0 && (
              <div className="matching-history-info" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>저장된 매칭 합계</span>
                  <strong style={{ color: '#3b82f6' }}>
                    {formatNumber(matchingHistoryModal.matchings.reduce((sum, m) => sum + parseFloat(m.matched_quantity), 0))}
                  </strong>
                </div>
              </div>
            )}

            {/* 버튼 */}
            <div className="matching-history-modal-buttons">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={closeMatchingHistoryModal}
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default MatchingPage;
