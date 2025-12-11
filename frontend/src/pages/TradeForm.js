import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { tradeAPI, companyAPI, productAPI, paymentAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import TradePrintModal from '../components/TradePrintModal';
import PaymentModal from '../components/PaymentModal';

function TradeForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const defaultType = searchParams.get('type') || 'SALE';
  const initialCompanyId = searchParams.get('company') || '';
  const initialDate = searchParams.get('date') || '';

  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  
  // 포커스 관리를 위한 refs
  const companyRef = useRef(null);
  const productRefs = useRef([]);
  const quantityRefs = useRef([]);
  const unitPriceRefs = useRef([]);
  const shipperLocationRefs = useRef([]);
  const senderRefs = useRef([]);
  const notesRefs = useRef([]);

  // 로컬 시간대 기준 YYYY-MM-DD 형식 반환 (UTC 문제 해결)
  const formatLocalDate = (date) => {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [master, setMaster] = useState({
    trade_type: defaultType,
    trade_date: initialDate || formatLocalDate(new Date()),
    company_id: initialCompanyId,
    payment_method: '',
    notes: '',
    status: 'CONFIRMED',
    total_amount: 0,
    tax_amount: 0,
    total_price: 0
  });

  const [details, setDetails] = useState([]);
  
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: '확인',
    showCancel: false
  });

  // 거래처 잔고 정보
  const [companySummary, setCompanySummary] = useState(null);
  
  // 입금/출금 상태 (전표 저장 시 함께 처리)
  const [paymentModal, setPaymentModal] = useState({
    isOpen: false,
    amount: '',
    displayAmount: '',
    payment_method: '계좌이체',
    notes: ''
  });
  
  // 미결제 전표 목록 (FIFO 미리보기용)
  const [unpaidTrades, setUnpaidTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

  // 변경사항 감지를 위한 초기 데이터 저장
  const [initialData, setInitialData] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // 출력 모달 상태
  const [printModal, setPrintModal] = useState({ isOpen: false, tradeId: null });

  // 연결된 입출금 내역 (수정 모드에서 사용)
  const [linkedPayments, setLinkedPayments] = useState([]);
  const [editingPayment, setEditingPayment] = useState(null); // 수정 중인 입출금
  
  // 저장 대기 중인 새 입금 (전표 저장 시 함께 저장)
  const [pendingPayments, setPendingPayments] = useState([]);
  
  // 새 입금 추가 모달
  const [addPaymentModal, setAddPaymentModal] = useState({
    isOpen: false,
    amount: '',
    displayAmount: '',
    payment_method: '계좌이체',
    notes: ''
  });

  // 변경사항 감지 함수 - 직접 비교
  const checkDirty = useCallback(() => {
    if (!initialData) return false;
    
    // master 비교 (주요 필드)
    if (master.trade_date !== initialData.master.trade_date) return true;
    if (String(master.company_id || '') !== String(initialData.master.company_id || '')) return true;
    if ((master.notes || '') !== (initialData.master.notes || '')) return true;
    
    // details 비교
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
      if ((current.sender_name || '') !== (initial.sender_name || '')) return true;
    }
    
    // 입금/출금 예정 확인
    if (paymentModal.amount && parseFloat(paymentModal.amount) > 0) return true;
    
    return false;
  }, [initialData, master, details, paymentModal.amount]);

  // isDirty 상태 업데이트 - master, details, paymentModal 변경시 재계산
  useEffect(() => {
    const dirty = checkDirty();
    setIsDirty(dirty);
  }, [checkDirty]);

  // 브라우저 새로고침/탭 닫기 시 경고
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // 나가기 확인 모달
  const [leaveModal, setLeaveModal] = useState(false);

  // 나가기 시도 (취소 버튼 또는 뒤로가기) - 직접 비교
  const handleLeaveAttempt = useCallback(() => {
    const currentDirty = checkDirty();
    if (currentDirty) {
      setLeaveModal(true);
    } else {
      navigate('/trades');
    }
  }, [checkDirty, navigate]);

  // 나가기 확인
  const handleConfirmLeave = () => {
    setLeaveModal(false);
    setIsDirty(false); // 강제로 dirty 해제
    navigate('/trades');
  };

  // 나가기 취소
  const handleCancelLeave = () => {
    setLeaveModal(false);
  };

  // 브라우저 뒤로가기 버튼 처리
  useEffect(() => {
    const handlePopState = (e) => {
      if (isDirty) {
        // 뒤로가기 방지 - 현재 위치로 다시 push
        window.history.pushState(null, '', window.location.href);
        setLeaveModal(true);
      }
    };

    // 현재 위치를 history에 push (뒤로가기 감지용)
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isDirty]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (isEdit) {
      loadTrade();
    } else {
      // 신규 등록 시 초기 데이터 설정 (변경 감지용)
      setInitialData({
        master: { ...master },
        details: []
      });
      
      // URL 파라미터로 전달된 거래처가 있으면 잔고 정보 로드 및 빈 행 추가
      if (initialCompanyId) {
        loadCompanySummary(initialCompanyId, defaultType, master.trade_date);
        setTimeout(() => {
          addDetailRow();
        }, 100);
    } else {
      // 신규 등록 시 거래처에 포커스
      setTimeout(() => {
        if (companyRef.current) {
          companyRef.current.focus();
        }
      }, 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadInitialData = async () => {
    try {
      const typeFilter = defaultType === 'PURCHASE' ? 'SUPPLIER' : 'CUSTOMER';
      const [companiesRes, productsRes] = await Promise.all([
        companyAPI.getAll({ is_active: 'true', type: typeFilter }),
        productAPI.getAll({ is_active: 'true' })
      ]);
      setCompanies(companiesRes.data.data);
      setProducts(productsRes.data.data);
    } catch (error) {
      console.error('초기 데이터 로딩 오류:', error);
      showModal('warning', '로딩 실패', '데이터를 불러오는데 실패했습니다.');
    }
  };

  const loadTrade = async () => {
    try {
      const response = await tradeAPI.getById(id);
      const data = response.data.data;
      
      // 날짜 형식 변환 (ISO -> YYYY-MM-DD)
      // MySQL DATE 타입이 "2025-12-05T00:00:00.000Z" 형태로 올 수 있음
      // 시간대 변환 문제를 피하기 위해 문자열에서 직접 YYYY-MM-DD 추출
      if (data.master.trade_date) {
        const dateStr = data.master.trade_date.toString();
        // ISO 형식인 경우 앞 10자리만 추출 (UTC 시간대 무시)
        if (dateStr.includes('T')) {
          data.master.trade_date = dateStr.substring(0, 10);
        } else if (dateStr.length === 10 && dateStr.includes('-')) {
          // 이미 YYYY-MM-DD 형식이면 그대로 사용
          data.master.trade_date = dateStr;
        } else {
          // 다른 형식인 경우 로컬 시간 기준으로 변환
          const dateObj = new Date(dateStr);
          data.master.trade_date = formatLocalDate(dateObj);
        }
      }
      
      setMaster(data.master);
      const loadedDetails = data.details.length > 0 ? data.details : [];
      setDetails(loadedDetails);
      
      // 초기 데이터 저장 (변경 감지용)
      setInitialData({
        master: { ...data.master },
        details: loadedDetails.map(d => ({ ...d }))
      });
      
      // 기존 전표인 경우 거래처 잔고 정보 로드
      if (data.master.company_id) {
        await loadCompanySummary(data.master.company_id, data.master.trade_type, data.master.trade_date);
      }
      
      // 연결된 입출금 내역 조회
      try {
        const paymentsRes = await paymentAPI.getByTrade(id);
        setLinkedPayments(paymentsRes.data.data || []);
      } catch (err) {
        console.error('연결된 입출금 조회 오류:', err);
        setLinkedPayments([]);
      }
    } catch (error) {
      console.error('거래전표 로딩 오류:', error);
      showModal('warning', '로딩 실패', '거래전표를 불러오는데 실패했습니다.', () => navigate('/trades'));
    }
  };

  const showModal = (type, title, message, onConfirm = () => {}, confirmText = '확인', showCancel = false) => {
    setModal({
      isOpen: true,
      type,
      title,
      message,
      confirmText,
      showCancel,
      onConfirm
    });
  };

  const createEmptyDetail = () => ({
    product_id: '',
    quantity: '',
    unit_price: '',
    supply_amount: 0,
    notes: ''
  });

  // 날짜 이동 (로컬 시간대 기준) - 내부용
  const calculateNewDate = (days) => {
    const [year, month, day] = master.trade_date.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);
    currentDate.setDate(currentDate.getDate() + days);
    return formatLocalDate(currentDate);
  };

  // 날짜 변경 핸들러 (버튼 클릭)
  const handleDateChange = (days) => {
    const newDate = calculateNewDate(days);
    processDateOrCompanyChange(newDate, master.company_id);
  };

  // 날짜 변경 핸들러 (직접 입력)
  const handleDateInputChange = (newDate) => {
    if (newDate === master.trade_date) return;
    processDateOrCompanyChange(newDate, master.company_id);
  };

  // 날짜/거래처 변경 시 공통 처리 로직
  const processDateOrCompanyChange = async (newDate, newCompanyId) => {
    // 변경사항이 있는지 확인
    if (checkDirty() || pendingPayments.length > 0) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '저장하지 않은 변경사항',
        message: '저장하지 않은 변경사항이 있습니다.\n계속하면 현재 입력 내용이 사라집니다.\n계속하시겠습니까?',
        confirmText: '계속',
        showCancel: true,
        onConfirm: () => executeTradeSwitch(newDate, newCompanyId)
      });
    } else {
      await executeTradeSwitch(newDate, newCompanyId);
    }
  };

  // 실제 전표 전환 실행
  const executeTradeSwitch = async (newDate, newCompanyId) => {
    if (!newCompanyId) {
      // 거래처가 없으면 날짜만 변경
      setMaster({ ...master, trade_date: newDate });
      return;
    }
    
    try {
      const response = await tradeAPI.checkDuplicate({
        company_id: newCompanyId,
        trade_date: newDate,
        trade_type: master.trade_type
      });
      
      if (response.data.isDuplicate && response.data.existingTradeId) {
        // 기존 전표가 있으면 해당 전표로 이동
        window.location.href = `/trades/edit/${response.data.existingTradeId}`;
      } else {
        // 기존 전표가 없으면 빈 폼으로 초기화 (신규 등록 모드)
        window.location.href = `/trades/new?type=${master.trade_type}&company=${newCompanyId}&date=${newDate}`;
      }
    } catch (error) {
      console.error('전표 확인 오류:', error);
      // 오류 시 날짜만 변경
      setMaster({ ...master, trade_date: newDate });
    }
  };

  const handleMasterChange = (e) => {
    const { name, value } = e.target;
    setMaster({ ...master, [name]: value });
  };

  // 거래처 변경 핸들러
  const handleCompanyChange = async (option) => {
    const newCompanyId = option ? option.value : '';
    
    if (!option) {
      // 거래처 선택 해제
      setMaster({ ...master, company_id: '' });
      setCompanySummary(null);
      return;
    }
    
    // 같은 거래처 선택 시 무시
    if (newCompanyId === String(master.company_id)) return;
    
    // 날짜/거래처 변경 공통 처리
    processDateOrCompanyChange(master.trade_date, newCompanyId);
  };

  // 거래처 잔고 정보 조회
  const loadCompanySummary = async (companyId, tradeType, tradeDate) => {
    if (!companyId) {
      setCompanySummary(null);
      return;
    }
    try {
      const response = await paymentAPI.getCompanyTodaySummary(companyId, tradeType, tradeDate);
      if (response.data.success) {
        setCompanySummary(response.data.data);
      }
    } catch (error) {
      console.error('거래처 잔고 정보 조회 오류:', error);
      setCompanySummary(null);
    }
  };

  // 날짜 변경 시 잔고 정보 재조회
  useEffect(() => {
    if (master.company_id) {
      loadCompanySummary(master.company_id, master.trade_type, master.trade_date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master.trade_date]);

  const handleDetailChange = (index, field, value) => {
    const newDetails = [...details];
    newDetails[index][field] = value;

    // 품목 선택 시 단위 자동 입력
    if (field === 'product_id') {
      // eslint-disable-next-line eqeqeq
      const product = products.find(p => p.id == value);
      if (product) {
        newDetails[index].unit = product.unit || '';
      }
    }

    // 금액 계산
    if (field === 'quantity' || field === 'unit_price') {
      const quantity = parseFloat(newDetails[index].quantity) || 0;
      const unitPrice = parseFloat(newDetails[index].unit_price) || 0;
      newDetails[index].supply_amount = Math.round(quantity * unitPrice);
    }

    setDetails(newDetails);
    calculateTotals(newDetails);
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

  // 엔터 키 핸들러 - 수량에서 단가로
  const handleQuantityKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (unitPriceRefs.current[index]) {
        unitPriceRefs.current[index].focus();
      }
    }
  };

  // 엔터 키 핸들러 - 단가에서 출하지(매입) 또는 비고(매출)로
  const handleUnitPriceKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (master.trade_type === 'PURCHASE' && shipperLocationRefs.current[index]) {
        shipperLocationRefs.current[index].focus();
      } else if (notesRefs.current[index]) {
        notesRefs.current[index].focus();
      }
    }
  };

  // 엔터 키 핸들러 - 출하지에서 출하주로
  const handleShipperLocationKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (senderRefs.current[index]) {
        senderRefs.current[index].focus();
      }
    }
  };

  // 엔터 키 핸들러 - 출하주에서 비고로
  const handleSenderKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (notesRefs.current[index]) {
        notesRefs.current[index].focus();
      }
    }
  };

  // 엔터 키 핸들러 - 비고에서 다음 행 추가
  const handleNotesKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // 새 행 추가
      const newDetail = createEmptyDetail();
      const newIndex = details.length;
      setDetails(prevDetails => [...prevDetails, newDetail]);
      // 새 행 추가 후 품목 선택으로 포커스 이동
      setTimeout(() => {
        if (productRefs.current[newIndex]) {
          productRefs.current[newIndex].focus();
        }
      }, 50);
    }
  };

  const calculateTotals = (detailsList) => {
    const totalAmount = detailsList.reduce((sum, d) => sum + (parseFloat(d.supply_amount) || 0), 0);
    setMaster(prev => ({
      ...prev,
      total_amount: totalAmount,
      total_price: totalAmount
    }));
  };

  // 품목 추가
  const addDetailRow = () => {
    const newIndex = details.length;
    const newDetails = [...details, createEmptyDetail()];
    setDetails(newDetails);
    setSelectedRowIndex(newIndex);
    // 새 행의 품목으로 포커스 이동
    setTimeout(() => {
      if (productRefs.current[newIndex]) {
        productRefs.current[newIndex].focus();
      }
    }, 50);
  };

  // 선택된 행 삭제
  const removeSelectedRow = () => {
    if (selectedRowIndex === null || details.length === 0) {
      showModal('warning', '삭제 불가', '삭제할 품목을 선택하세요.');
      return;
    }
    const newDetails = details.filter((_, i) => i !== selectedRowIndex);
    setDetails(newDetails);
    setSelectedRowIndex(null);
    calculateTotals(newDetails);
  };

  // 저장 (전표 + 입출금)
  const handleSave = async (openPrintAfterSave = false) => {
    if (!master.company_id) {
      showModal('warning', '입력 오류', '거래처를 선택하세요.');
      return;
    }

    const validDetails = details.filter(d => d.product_id && d.quantity);
    const pendingPaymentsTotal = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // 품목도 없고 입출금도 없으면 저장 불가
    if (validDetails.length === 0 && pendingPaymentsTotal === 0) {
      showModal('warning', '입력 오류', '최소 1개의 품목을 입력하거나 입출금을 추가하세요.');
      return;
    }

    try {
      // 동일 거래처/날짜/전표유형 중복 체크
      const duplicateCheck = await tradeAPI.checkDuplicate({
        company_id: master.company_id,
        trade_date: master.trade_date,
        trade_type: master.trade_type,
        exclude_trade_id: isEdit ? id : undefined
      });
      
      if (duplicateCheck.data.isDuplicate) {
        showModal(
          'warning', 
          '중복 전표', 
          `이미 동일 거래처에 ${master.trade_date} 날짜로 전표가 존재합니다.\n(전표번호: ${duplicateCheck.data.existingTradeNumber})\n\n기존 전표를 수정하시겠습니까?`,
          () => navigate(`/trades/edit/${duplicateCheck.data.existingTradeId}`),
          '기존 전표 수정',
          true
        );
        return;
      }
      const submitData = {
        master,
        details: validDetails
      };

      // 전표 저장
      let savedTradeId = isEdit ? parseInt(id) : null;
      let needsRematching = false;
      let unmatchedItems = [];

      if (isEdit) {
        const updateResponse = await tradeAPI.update(id, submitData);
        // 수정 응답에서 재매칭 필요 정보 확인
        if (updateResponse.data.needsRematching) {
          needsRematching = true;
          unmatchedItems = updateResponse.data.unmatchedItems || [];
        }
      } else {
        const createResponse = await tradeAPI.create(submitData);
        savedTradeId = createResponse.data.data?.id;
      }

      // 저장 대기 중인 입금들 처리 (메시지용으로 합계 미리 계산)
      const savedPaymentsTotal = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      if (pendingPayments.length > 0 && savedTradeId) {
        const transactionType = master.trade_type === 'SALE' ? 'RECEIPT' : 'PAYMENT';
        
        for (const pendingPayment of pendingPayments) {
          await paymentAPI.createTransactionWithAllocation({
            transaction_date: master.trade_date,
            company_id: master.company_id,
            transaction_type: transactionType,
            amount: pendingPayment.amount,
            payment_method: pendingPayment.payment_method || '계좌이체',
            notes: pendingPayment.notes,
            source_trade_id: savedTradeId,
            allocations: [{ trade_master_id: savedTradeId, amount: pendingPayment.amount }]
          });
        }
        // 저장 완료 후 대기 목록 초기화
        setPendingPayments([]);
      }

      // 저장 완료 후 변경사항 초기화 (페이지 나가기 시 경고 방지)
      setIsDirty(false);
      setInitialData(null);

      // 저장 및 출력인 경우 출력 모달 열기
      if (openPrintAfterSave && savedTradeId) {
        setPrintModal({ isOpen: true, tradeId: savedTradeId });
      } else {
        let message = savedPaymentsTotal > 0
          ? `거래전표가 ${isEdit ? '수정' : '등록'}되었습니다.\n${master.trade_type === 'SALE' ? '입금' : '출금'} ${formatCurrency(savedPaymentsTotal)}원도 처리되었습니다.`
          : `거래전표가 ${isEdit ? '수정' : '등록'}되었습니다.`;
        
        // 재매칭 필요 안내 추가
        if (needsRematching && unmatchedItems.length > 0) {
          message += `\n\n⚠️ ${unmatchedItems.length}개 품목의 재매칭이 필요합니다.`;
        }
        
        if (isEdit) {
          // 수정인 경우: 재매칭 필요 여부에 따라 다른 처리
          if (needsRematching) {
            setModal({
              isOpen: true,
              type: 'warning',
              title: '저장 완료 - 재매칭 필요',
              message: message + '\n\n마감(매칭) 화면으로 이동하시겠습니까?',
              confirmText: '매칭 화면으로',
              showCancel: true,
              onConfirm: () => navigate('/matching')
            });
          } else {
            showModal('success', '저장 완료', message, () => navigate('/trades'));
          }
        } else {
          // 신규인 경우: 초기화하여 연속 등록 가능
          showModal('success', '저장 완료', message, () => {
            // 폼 초기화
            setMaster({
              trade_type: master.trade_type, // 전표 유형 유지
              trade_date: formatLocalDate(new Date()),
              company_id: '',
              payment_method: '',
              notes: '',
              status: 'CONFIRMED',
              total_amount: 0,
              tax_amount: 0,
              total_price: 0
            });
            setDetails([]);
            setPaymentModal({
              isOpen: false,
              amount: '',
              displayAmount: '',
              payment_method: '계좌이체',
              notes: ''
            });
            setCompanySummary(null);
            // 거래처 콤보박스에 포커스
            if (companyRef.current) {
              companyRef.current.focus();
            }
          });
        }
      }
    } catch (error) {
      console.error('거래전표 저장 오류:', error);
      showModal('warning', '저장 실패', error.response?.data?.message || '거래전표 저장에 실패했습니다.');
    }
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '';
    return new Intl.NumberFormat('ko-KR').format(value);
  };

  // 입금/출금 모달 열기
  // 전표 삭제 (수정 모드에서만)
  const handleDelete = () => {
    if (!isEdit) return;
    
    setModal({
      isOpen: true,
      type: 'confirm',
      title: '전표 삭제',
      message: `전표 "${master.trade_number || ''}"를 삭제하시겠습니까?\n연결된 입출금 기록도 함께 삭제됩니다.`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await tradeAPI.delete(id);
          showModal('success', '삭제 완료', '전표가 삭제되었습니다.', () => {
            navigate('/trades');
          });
        } catch (error) {
          console.error('전표 삭제 오류:', error);
          const errorData = error.response?.data;
          if (errorData?.errorType === 'MATCHING_EXISTS') {
            // 매칭된 내역이 있는 경우 상세 정보 표시
            const items = errorData.matchingData?.items || [];
            const itemList = items.map(item => 
              `• ${item.productName} → ${item.saleTradeNumber} (${item.customerName})`
            ).join('\n');
            showModal('warning', '삭제 불가', 
              `매출과 매칭된 내역이 있어 삭제할 수 없습니다.\n\n${itemList}\n\n마감 화면에서 매칭을 먼저 취소하세요.`
            );
          } else {
            showModal('warning', '삭제 실패', errorData?.message || '전표 삭제에 실패했습니다.');
          }
        }
      }
    });
  };

  const openPaymentModal = async () => {
    if (!master.company_id) {
      showModal('warning', '입력 오류', '거래처를 먼저 선택하세요.');
      return;
    }
    
    // 미결제 전표 목록 조회
    setLoadingTrades(true);
    try {
      const response = await paymentAPI.getUnpaidTrades(master.company_id, master.trade_type);
      setUnpaidTrades(response.data.data || []);
    } catch (error) {
      console.error('미결제 전표 조회 오류:', error);
      setUnpaidTrades([]);
    }
    setLoadingTrades(false);
    
    setPaymentModal(prev => ({ ...prev, isOpen: true }));
  };

  // 입금/출금 모달 확인
  const handlePaymentConfirm = () => {
    const amount = parseFloat(paymentModal.amount.replace(/,/g, '')) || 0;
    if (amount === 0 || paymentModal.amount === '-') {
      showModal('warning', '입력 오류', `${isPurchase ? '출금액' : '입금액'}을 입력하세요.`);
      return;
    }
    
    // 마이너스 금액인 경우 (기초잔고 설정) - 바로 처리
    if (amount < 0) {
      setPaymentModal(prev => ({ ...prev, isOpen: false }));
      checkDirty();
      return;
    }
    
    // 잔고 초과 여부 확인
    const currentBalance = companySummary?.final_balance || 0;
    const actionName = isPurchase ? '출금' : '입금';
    
    if (amount > currentBalance) {
      const overAmount = amount - currentBalance;
      const newBalance = currentBalance - amount;
      
      setModal({
        isOpen: true,
        type: 'warning',
        title: '⚠️ 잔고 초과 경고',
        message: `${actionName} 금액이 현재 잔고를 초과합니다.\n\n` +
          `• 현재 잔고: ${formatCurrency(currentBalance)}원\n` +
          `• ${actionName} 금액: ${formatCurrency(amount)}원\n` +
          `• 초과 금액: ${formatCurrency(overAmount)}원\n\n` +
          `${actionName} 후 잔고: ${formatCurrency(Math.abs(newBalance))}원 (${isPurchase ? '선급금' : '선수금'})\n\n` +
          `계속 진행하시겠습니까?`,
        confirmText: '진행',
        showCancel: true,
        onConfirm: () => {
          setPaymentModal(prev => ({ ...prev, isOpen: false }));
        }
      });
      return;
    }
    
    // 잔고 이하면 바로 모달 닫기
    setPaymentModal(prev => ({ ...prev, isOpen: false }));
  };

  // 입금/출금 취소
  const handlePaymentCancel = () => {
    setPaymentModal({ isOpen: false, amount: '', displayAmount: '', payment_method: '계좌이체', notes: '' });
  };

  // 금액 입력 핸들러 (천단위 콤마, 마이너스 허용 - 기초잔고 설정용)
  const handlePaymentAmountChange = (e) => {
    const rawValue = e.target.value.replace(/[^\d-]/g, '');
    // 마이너스는 맨 앞에만 허용
    const value = rawValue.replace(/(?!^)-/g, '');
    const numericValue = value.replace(/-/g, '');
    const isNegative = value.startsWith('-');
    const formattedValue = numericValue 
      ? (isNegative ? '-' : '') + new Intl.NumberFormat('ko-KR').format(parseInt(numericValue)) 
      : (value === '-' ? '-' : '');
    setPaymentModal(prev => ({
      ...prev,
      amount: value,
      displayAmount: formattedValue
    }));
  };

  // 전액 버튼 클릭
  const handleFullPayment = () => {
    if (companySummary && companySummary.final_balance > 0) {
      const amount = Math.floor(companySummary.final_balance);
      setPaymentModal(prev => ({
        ...prev,
        amount: String(amount),
        displayAmount: new Intl.NumberFormat('ko-KR').format(amount)
      }));
    }
  };

  // FIFO 배분 계산 (미리보기용)
  const calculateFifoAllocation = () => {
    const amount = parseFloat(paymentModal.amount) || 0;
    let remaining = amount;
    let paidCount = 0;
    let partialCount = 0;
    let totalAllocated = 0;
    
    const allocations = unpaidTrades.map(trade => {
      const unpaidAmount = parseFloat(trade.unpaid_amount) || 0;
      let allocatedAmount = 0;
      let status = 'pending';
      
      if (remaining > 0 && unpaidAmount > 0) {
        allocatedAmount = Math.min(remaining, unpaidAmount);
        remaining -= allocatedAmount;
        totalAllocated += allocatedAmount;
        
        if (allocatedAmount >= unpaidAmount) {
          status = 'paid';
          paidCount++;
        } else {
          status = 'partial';
          partialCount++;
        }
      }
      
      return { ...trade, allocatedAmount, status };
    });
    
    const balanceAfter = (companySummary?.final_balance || 0) - totalAllocated;
    
    return { allocations, paidCount, partialCount, totalAllocated, balanceAfter };
  };

  const fifoAllocation = calculateFifoAllocation();

  // 연결된 입출금 삭제
  const handleDeleteLinkedPayment = async (paymentId) => {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: '입출금 삭제',
      message: '이 입출금 내역을 삭제하시겠습니까?\n삭제 시 거래처 잔고가 복원됩니다.',
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await paymentAPI.deleteLinkedTransaction(paymentId);
          // 목록 새로고침
          const paymentsRes = await paymentAPI.getByTrade(id);
          setLinkedPayments(paymentsRes.data.data || []);
          // 잔고 정보 새로고침
          if (master.company_id) {
            await loadCompanySummary(master.company_id, master.trade_type, master.trade_date);
          }
          showModal('success', '삭제 완료', '입출금 내역이 삭제되었습니다.');
        } catch (error) {
          console.error('입출금 삭제 오류:', error);
          showModal('warning', '삭제 실패', '입출금 삭제에 실패했습니다.');
        }
      }
    });
  };

  // 연결된 입출금 수정
  const handleUpdateLinkedPayment = async () => {
    if (!editingPayment) return;
    
    try {
      await paymentAPI.updateTransaction(editingPayment.id, {
        amount: editingPayment.amount,
        payment_method: editingPayment.payment_method,
        notes: editingPayment.notes
      });
      // 목록 새로고침
      const paymentsRes = await paymentAPI.getByTrade(id);
      setLinkedPayments(paymentsRes.data.data || []);
      // 잔고 정보 새로고침
      if (master.company_id) {
        await loadCompanySummary(master.company_id, master.trade_type, master.trade_date);
      }
      setEditingPayment(null);
      showModal('success', '수정 완료', '입출금 내역이 수정되었습니다.');
    } catch (error) {
      console.error('입출금 수정 오류:', error);
      showModal('warning', '수정 실패', '입출금 수정에 실패했습니다.');
    }
  };

  // 새 입금 추가 모달 열기
  const handleOpenAddPayment = () => {
    setAddPaymentModal({
      isOpen: true,
      amount: '',
      displayAmount: '',
      payment_method: '계좌이체',
      notes: ''
    });
  };

  // 새 입금 금액 변경
  const handleAddPaymentAmountChange = (e) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    const displayValue = rawValue ? new Intl.NumberFormat('ko-KR').format(parseInt(rawValue)) : '';
    setAddPaymentModal(prev => ({
      ...prev,
      amount: rawValue,
      displayAmount: displayValue
    }));
  };

  // 새 입금 추가 (저장 대기 - 전표 저장 시 함께 저장됨)
  const handleSaveNewPayment = () => {
    const amount = parseFloat(addPaymentModal.amount) || 0;
    if (amount <= 0) {
      showModal('warning', '입력 오류', '입금 금액을 입력해주세요.');
      return;
    }

    // pendingPayments에 추가 (전표 저장 시 함께 저장됨)
    const newPayment = {
      tempId: Date.now(), // 임시 ID
      amount: amount,
      payment_method: addPaymentModal.payment_method,
      notes: addPaymentModal.notes,
      isPending: true // 저장 대기 중 표시
    };
    
    setPendingPayments(prev => [...prev, newPayment]);
    setAddPaymentModal({ isOpen: false, amount: '', displayAmount: '', payment_method: '계좌이체', notes: '' });
    setIsDirty(true); // 변경사항 있음 표시
  };
  
  // 저장 대기 중인 입금 삭제
  const handleRemovePendingPayment = (tempId) => {
    setPendingPayments(prev => prev.filter(p => p.tempId !== tempId));
  };

  // 금액 입력 포맷팅
  const formatAmountInput = (value) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    return new Intl.NumberFormat('ko-KR').format(parseInt(numericValue));
  };

  // 옵션 변환 (별칭이 있으면 label에 표시하여 검색 가능하도록 함)
  const companyOptions = companies.map(company => ({
    value: company.id,
    label: company.alias 
      ? `${company.company_name} - ${company.alias}`
      : company.company_name
  }));

  // 품목명 오름차순, sort_order 오름차순으로 정렬
  const sortedProducts = [...products].sort((a, b) => {
    const nameCompare = (a.product_name || '').localeCompare(b.product_name || '', 'ko');
    if (nameCompare !== 0) return nameCompare;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const productOptions = sortedProducts.map(product => {
    const weightStr = product.weight ? `${parseFloat(product.weight)}kg` : '';
    return {
      value: product.id,
      label: `${product.product_name}${weightStr ? ` ${weightStr}` : ''}${product.grade ? ` (${product.grade})` : ''}`
    };
  });

  const isPurchase = master.trade_type === 'PURCHASE';

  return (
    <div className="trade-form">
      {/* 페이지 헤더 */}
      <div className="page-header">
        <h1 className="page-title">
          {isPurchase ? '매입 전표' : '매출 전표'} {isEdit ? '수정' : '등록'}
        </h1>
        <div className="header-buttons" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isEdit && (
            <>
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                삭제
              </button>
              <span style={{ width: '1px', height: '24px', backgroundColor: '#ddd', margin: '0 0.5rem' }}></span>
            </>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleLeaveAttempt}>
            취소
          </button>
          <button type="button" className="btn btn-primary" onClick={() => handleSave(false)}>
            저장
          </button>
          <button type="button" className="btn btn-success" onClick={() => handleSave(true)}>
            저장 및 출력
          </button>
        </div>
      </div>

      {/* 기본 정보 카드 */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title">기본 정보</h2>
        
        <div className="form-row">
          <div className="form-group">
            <label className="required">거래일자</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button 
                type="button" 
                className="btn btn-sm" 
                onClick={() => handleDateChange(-1)}
                style={{ padding: '6px 10px', minWidth: 'auto' }}
              >
                ◀
              </button>
              <input
                type="date"
                name="trade_date"
                value={master.trade_date}
                onChange={(e) => handleDateInputChange(e.target.value)}
                style={{ flex: 1 }}
                required
              />
              <button 
                type="button" 
                className="btn btn-sm" 
                onClick={() => handleDateChange(1)}
                style={{ padding: '6px 10px', minWidth: 'auto' }}
              >
                ▶
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="required">거래처</label>
            <SearchableSelect
              ref={companyRef}
              options={companyOptions}
              value={master.company_id}
              onChange={handleCompanyChange}
              placeholder="거래처 선택..."
              noOptionsMessage="거래처 없음"
              isDisabled={isEdit}
            />
          </div>
        </div>

      </div>

      {/* 메인 콘텐츠 영역 (왼쪽: 품목 상세, 오른쪽: 잔고 정보) */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* 왼쪽: 품목 상세 카드 */}
        <div className="card" style={{ flex: '1 1 65%', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>품목 상세</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                try {
                  const productsRes = await productAPI.getAll({ is_active: 'true' });
                  setProducts(productsRes.data?.data || []);
                  setModal({
                    isOpen: true,
                    type: 'success',
                    title: '새로고침 완료',
                    message: '품목 목록이 갱신되었습니다.',
                    confirmText: '확인',
                    showCancel: false,
                    onConfirm: () => {}
                  });
                } catch (error) {
                  console.error('품목 새로고침 오류:', error);
                }
              }}
            >
              🔄 품목 새로고침
            </button>
            <button type="button" className="btn btn-success btn-sm" onClick={addDetailRow}>
              + 추가
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={removeSelectedRow}>
              삭제
            </button>
          </div>
        </div>
        
          <div className="table-container" style={{ minHeight: '400px' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px', whiteSpace: 'nowrap', padding: '8px 4px' }}>No</th>
                <th style={{ width: '25%', padding: '8px' }}>품목</th>
                <th style={{ width: '80px', whiteSpace: 'nowrap', padding: '8px 4px' }}>수량</th>
                <th style={{ width: '100px', whiteSpace: 'nowrap', padding: '8px 4px' }}>단가</th>
                <th style={{ width: '100px', whiteSpace: 'nowrap', padding: '8px 4px' }}>합계</th>
                {isPurchase && <th style={{ width: '120px', whiteSpace: 'nowrap', padding: '8px 4px' }}>출하지</th>}
                {isPurchase && <th style={{ width: '100px', whiteSpace: 'nowrap', padding: '8px 4px' }}>출하주</th>}
                <th style={{ padding: '8px' }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, index) => (
                <tr 
                  key={index} 
                  onClick={() => setSelectedRowIndex(index)}
                  style={{ 
                    backgroundColor: selectedRowIndex === index ? '#e3f2fd' : 'transparent',
                    cursor: 'pointer',
                    height: '44px'
                  }}
                >
                  <td className="text-center" style={{ padding: '6px' }}>{index + 1}</td>
                  <td style={{ padding: '4px 6px' }}>
                    <SearchableSelect
                      ref={el => productRefs.current[index] = el}
                      options={productOptions}
                      value={detail.product_id}
                      onChange={(option) => handleDetailSelectChange(index, option)}
                      placeholder="품목 검색..."
                      noOptionsMessage="품목 없음"
                    />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input
                      ref={el => quantityRefs.current[index] = el}
                      type="text"
                      value={detail.quantity ? formatCurrency(Math.floor(detail.quantity)) : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        handleDetailChange(index, 'quantity', val);
                      }}
                      onKeyDown={(e) => handleQuantityKeyDown(e, index)}
                      style={{ 
                        width: '100%', 
                        height: '36px',
                        padding: '0 10px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px', 
                        fontSize: '0.95rem',
                        textAlign: 'right'
                      }}
                      placeholder="0"
                    />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input
                      ref={el => unitPriceRefs.current[index] = el}
                      type="text"
                      value={detail.unit_price ? formatCurrency(Math.floor(detail.unit_price)) : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        handleDetailChange(index, 'unit_price', val);
                      }}
                      onKeyDown={(e) => handleUnitPriceKeyDown(e, index)}
                      style={{ 
                        width: '100%', 
                        height: '36px',
                        padding: '0 10px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px', 
                        fontSize: '0.95rem',
                        textAlign: 'right'
                      }}
                      placeholder="0"
                    />
                  </td>
                  <td className="text-right" style={{ padding: '6px 10px', fontWeight: '600', color: '#1565c0', verticalAlign: 'middle' }}>
                    {formatCurrency(detail.supply_amount)}
                  </td>
                  {isPurchase && (
                    <td 
                      style={{ padding: '4px 6px' }}
                      onClick={() => setSelectedRowIndex(index)}
                    >
                      <input
                        ref={el => shipperLocationRefs.current[index] = el}
                        type="text"
                        value={detail.shipper_location || ''}
                        onChange={(e) => handleDetailChange(index, 'shipper_location', e.target.value)}
                        onKeyDown={(e) => handleShipperLocationKeyDown(e, index)}
                        style={{ 
                          width: '100%', 
                          height: '36px',
                          padding: '0 10px', 
                          border: '1px solid #ddd', 
                          borderRadius: '4px', 
                          fontSize: '0.95rem'
                        }}
                        placeholder=""
                      />
                    </td>
                  )}
                  {isPurchase && (
                    <td 
                      style={{ padding: '4px 6px' }}
                      onClick={() => setSelectedRowIndex(index)}
                    >
                      <input
                        ref={el => senderRefs.current[index] = el}
                        type="text"
                        value={detail.sender || ''}
                        onChange={(e) => handleDetailChange(index, 'sender', e.target.value)}
                        onKeyDown={(e) => handleSenderKeyDown(e, index)}
                        style={{ 
                          width: '100%', 
                          height: '36px',
                          padding: '0 10px', 
                          border: '1px solid #ddd', 
                          borderRadius: '4px', 
                          fontSize: '0.95rem'
                        }}
                        placeholder=""
                      />
                    </td>
                  )}
                  <td style={{ padding: '4px 6px' }}>
                    <input
                      ref={el => notesRefs.current[index] = el}
                      type="text"
                      value={detail.notes || ''}
                      onChange={(e) => handleDetailChange(index, 'notes', e.target.value)}
                      onKeyDown={(e) => handleNotesKeyDown(e, index)}
                      style={{ 
                        width: '100%', 
                        height: '36px',
                        padding: '0 10px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px', 
                        fontSize: '0.95rem'
                      }}
                      placeholder=""
                    />
                  </td>
                </tr>
              ))}
              {/* 빈 행 추가 (최소 10행 표시) */}
              {Array.from({ length: Math.max(0, 10 - details.length) }).map((_, i) => (
                <tr key={`empty-${i}`} style={{ height: '44px' }}>
                  <td style={{ padding: '6px', color: '#ccc' }}>{details.length + i + 1}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  {isPurchase && <td></td>}
                  <td></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={isPurchase ? 5 : 4} className="text-right">합계</td>
                <td className="text-right" style={{ color: '#c62828', fontSize: '1.1rem' }}>
                  {formatCurrency(master.total_amount)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 비고 */}
          <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>비고</label>
          <textarea
            name="notes"
            value={master.notes}
            onChange={handleMasterChange}
              rows="2"
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical' }}
            placeholder="메모 입력..."
          />
          </div>
        </div>

        {/* 오른쪽: 잔고 정보 카드 */}
        <div style={{ flex: '0 0 320px', minWidth: '320px' }}>
          {/* 거래처 잔고 현황 - 항상 표시 */}
          {(() => {
            // companySummary가 없으면 기본값 0 사용
            const summary = companySummary || {
              today_total: 0,
              previous_balance: 0,
              subtotal: 0,
              today_payment: 0,
              final_balance: 0
            };
            const hasCompany = !!master.company_id;
            
            return (
            <div className="card" style={{ marginBottom: 0 }}>
              <h2 className="card-title" style={{ marginBottom: '1rem', fontSize: '1rem' }}>
                {isPurchase ? '💰 매입처 잔고' : '💰 매출처 잔고'}
              </h2>
              
              {/* 잔고 정보 리스트 - 순서: 금일 합계 → 전잔고 → 전잔고+금일 → 입금/출금 → 잔고 */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '0.7rem 0.5rem',
                  borderBottom: '1px solid #eee',
                  backgroundColor: '#f0f7ff',
                  borderRadius: '4px 4px 0 0'
                }}>
                  <span style={{ color: '#1565c0', fontSize: '1.1rem', fontWeight: '500' }}>금일 합계</span>
                  <span style={{ fontWeight: '600', fontSize: '1.1rem', color: isPurchase ? '#c62828' : '#1565c0' }}>
                    {formatCurrency(summary.today_total)}원
                  </span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '0.7rem 0',
                  borderBottom: '1px solid #eee'
                }}>
                  <span style={{ color: '#666', fontSize: '1.1rem' }}>전잔고</span>
                  <span style={{ fontWeight: '600', fontSize: '1.1rem', color: '#333' }}>
                    {formatCurrency(summary.previous_balance)}원
                  </span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '0.7rem 0',
                  borderBottom: '1px solid #eee'
                }}>
                  <span style={{ color: '#666', fontSize: '1.1rem' }}>전잔고 + 금일</span>
                  <span style={{ fontWeight: '600', fontSize: '1.1rem', color: '#333' }}>
                    {formatCurrency(summary.subtotal)}원
                  </span>
                </div>
                {/* 입금/출금 행 - 금액 표시 (저장 대기 포함) */}
                {(() => {
                  // 저장 대기 중인 입금 합계
                  const pendingPaymentsTotal = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                  const hasPending = pendingPaymentsTotal > 0;
                  // 표시할 금액 (기존 입금 + 저장 대기)
                  const displayTotal = summary.today_payment + pendingPaymentsTotal;
                  const pendingCount = pendingPayments.length;
                  
                  return (
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '0.7rem 0',
                      borderBottom: '1px solid #eee'
                    }}>
                      <span style={{ color: '#666', fontSize: '1.1rem' }}>
                        {isPurchase ? '출금' : '입금'}
                        {hasPending && <span style={{ fontSize: '0.85rem', color: '#ffc107' }}> ({pendingCount}건 대기)</span>}
                      </span>
                      <span style={{ fontWeight: '600', fontSize: '1.1rem', color: hasPending ? '#1565c0' : '#2e7d32' }}>
                        {formatCurrency(displayTotal)}원
                      </span>
                    </div>
                  );
                })()}
              </div>
              
              {/* 잔고 - 예정 금액 반영 */}
              {(() => {
                // 저장 대기 중인 입금 합계
                const pendingPaymentsTotal = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                // 예상 잔고 계산
                const expectedBalance = summary.final_balance - pendingPaymentsTotal;
                const hasPending = pendingPaymentsTotal > 0;
                
                // 잔고 상태별 색상: 양수(미수금)=주황, 0(완납)=녹색, 음수(선수금)=파란
                const balanceColor = expectedBalance > 0 ? '#e65100' : expectedBalance < 0 ? '#1565c0' : '#2e7d32';
                const balanceBg = expectedBalance > 0 ? '#fff3e0' : expectedBalance < 0 ? '#e3f2fd' : '#e8f5e9';
                
                return (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '0.75rem',
                    backgroundColor: balanceBg,
                    borderRadius: '6px',
                    marginTop: '0.75rem'
                  }}>
                    <span style={{ 
                      color: balanceColor, 
                      fontSize: '1.15rem',
                      fontWeight: '600'
                    }}>잔고{hasPending ? ' (예정)' : ''}</span>
                    <span style={{ 
                      fontWeight: '700', 
                      color: balanceColor,
                      fontSize: '1.3rem'
                    }}>
                      {expectedBalance < 0 ? '-' : ''}{formatCurrency(Math.abs(expectedBalance))}원
                    </span>
                  </div>
                );
              })()}
              
              {/* 입출금 내역 섹션 - 항상 표시 */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#555', margin: 0 }}>
                    📋 {isPurchase ? '출금' : '입금'} 내역
                  </h3>
                  <button
                    type="button"
                    onClick={handleOpenAddPayment}
                    disabled={!hasCompany}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.95rem',
                      backgroundColor: hasCompany ? (isPurchase ? '#3498db' : '#27ae60') : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: hasCompany ? 'pointer' : 'not-allowed'
                    }}
                  >
                    + {isPurchase ? '출금' : '입금'} 추가
                  </button>
                </div>
                
                {/* 입금 내역이 있을 때 */}
                {(linkedPayments.length > 0 || pendingPayments.length > 0) ? (
                  <>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {/* 저장된 입금 내역 */}
                    {linkedPayments.map(payment => {
                      const linkType = payment.link_type;
                      const displayAmount = linkType === 'allocated' ? payment.allocated_amount : payment.amount;
                      
                      // 유형별 스타일
                      const typeStyles = {
                        direct: { bg: '#f0fff4', border: '#4caf50', label: '직접', labelBg: '#4caf50' },
                        allocated: { bg: '#e3f2fd', border: '#2196f3', label: '배분', labelBg: '#2196f3' },
                        general: { bg: '#f3e5f5', border: '#9c27b0', label: '수금/지급', labelBg: '#9c27b0' }
                      };
                      const style = typeStyles[linkType] || typeStyles.direct;
                      
                      return (
                        <div key={`${payment.id}-${payment.link_type}`} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.6rem',
                          backgroundColor: style.bg,
                          borderRadius: '4px',
                          marginBottom: '0.5rem',
                          fontSize: '1.05rem',
                          borderLeft: `3px solid ${style.border}`
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {formatCurrency(displayAmount)}원
                              {linkType !== 'direct' && (
                                <span style={{ 
                                  fontSize: '0.85rem', 
                                  backgroundColor: style.labelBg, 
                                  color: 'white', 
                                  padding: '2px 6px', 
                                  borderRadius: '3px' 
                                }}>
                                  {style.label}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.95rem', color: '#888' }}>
                              {payment.transaction_date?.split('T')[0]} | {payment.payment_method || '미지정'}
                              {linkType === 'allocated' && payment.amount !== displayAmount && (
                                <span> (총 {formatCurrency(payment.amount)}원 중)</span>
                              )}
                            </div>
                          </div>
                          {/* 직접 연결된 입금만 수정/삭제 가능 */}
                          {linkType === 'direct' && (
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                type="button"
                                onClick={() => setEditingPayment(payment)}
                                style={{
                                  padding: '4px 12px',
                                  fontSize: '0.95rem',
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
                                  padding: '4px 12px',
                                  fontSize: '0.95rem',
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
                    
                    {/* 저장 대기 중인 입금 내역 */}
                    {pendingPayments.map(payment => (
                      <div key={payment.tempId} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem',
                        backgroundColor: '#fff3cd',
                        borderRadius: '4px',
                        marginBottom: '0.5rem',
                        fontSize: '1.05rem',
                        borderLeft: '3px solid #ffc107',
                        border: '1px dashed #ffc107'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {formatCurrency(payment.amount)}원
                            <span style={{ 
                              fontSize: '0.85rem', 
                              backgroundColor: '#ffc107', 
                              color: '#333', 
                              padding: '1px 4px', 
                              borderRadius: '3px' 
                            }}>
                              저장 대기
                            </span>
                          </div>
                          <div style={{ fontSize: '0.95rem', color: '#888' }}>
                            {payment.payment_method || '미지정'}
                            {payment.notes && ` | ${payment.notes}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePendingPayment(payment.tempId)}
                          style={{
                            padding: '4px 12px',
                            fontSize: '0.95rem',
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
                    ))}
                  </div>
                  {isEdit && (
                    <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.5rem' }}>
                      * <span style={{ color: '#4caf50' }}>■</span> 직접 | <span style={{ color: '#2196f3' }}>■</span> 배분 | <span style={{ color: '#9c27b0' }}>■</span> 수금/지급 | <span style={{ color: '#ffc107' }}>■</span> 대기
                    </div>
                  )}
                  </>
                ) : (
                  <div style={{ 
                    padding: '1.5rem', 
                    textAlign: 'center', 
                    color: '#999',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    fontSize: '0.95rem'
                  }}>
                    {isPurchase ? '출금' : '입금'} 내역이 없습니다
                  </div>
                )}
                
                <div style={{ fontSize: '0.9rem', color: '#888', marginTop: '0.75rem', textAlign: 'center' }}>
                  * {isPurchase ? '출금' : '입금'}은 전표 저장 시 함께 처리됩니다
                </div>
              </div>
            </div>
            );
          })()}
        </div>
      </div>

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

      {/* 입금/출금 모달 - 공통 컴포넌트 사용 */}
      <PaymentModal
        isOpen={paymentModal.isOpen}
        onClose={handlePaymentCancel}
        onConfirm={(paymentData) => {
          setPaymentModal({
            isOpen: false,
            amount: paymentData.amount,
            displayAmount: paymentData.displayAmount,
            payment_method: paymentData.payment_method,
            notes: paymentData.notes
          });
        }}
        isPurchase={isPurchase}
        companyId={master.company_id}
        companyName={companies.find(c => c.id === parseInt(master.company_id))?.company_name || ''}
        tradeDate={master.trade_date}
        companySummary={companySummary}
        initialPayment={{
          amount: paymentModal.amount,
          displayAmount: paymentModal.displayAmount,
          payment_method: paymentModal.payment_method,
          notes: paymentModal.notes
        }}
      />

      {/* 연결된 입출금 수정 모달 */}
      {editingPayment && (
        <div className="modal-overlay" onClick={() => setEditingPayment(null)}>
          <div 
            className="modal-container" 
            style={{ maxWidth: '400px', padding: '1.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>
              {isPurchase ? '💸 출금' : '💰 입금'} 수정
            </h3>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>금액</label>
              <input
                type="text"
                value={formatCurrency(editingPayment.amount)}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d]/g, '');
                  setEditingPayment(prev => ({ ...prev, amount: value }));
                }}
                style={{ textAlign: 'right' }}
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>결제방법</label>
              <select
                value={editingPayment.payment_method || ''}
                onChange={(e) => setEditingPayment(prev => ({ ...prev, payment_method: e.target.value }))}
              >
                <option value="">선택</option>
                <option value="현금">현금</option>
                <option value="계좌이체">계좌이체</option>
                <option value="카드">카드</option>
                <option value="어음">어음</option>
                <option value="기타">기타</option>
              </select>
            </div>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>비고</label>
              <input
                type="text"
                value={editingPayment.notes || ''}
                onChange={(e) => setEditingPayment(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="메모"
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingPayment(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleUpdateLinkedPayment}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 새 입금 추가 모달 */}
      {addPaymentModal.isOpen && (
        <div className="modal-overlay" onClick={() => setAddPaymentModal(prev => ({ ...prev, isOpen: false }))}>
          <div 
            className="modal-container" 
            style={{ maxWidth: '400px', padding: '1.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>
              {isPurchase ? '💸 출금' : '💰 입금'} 추가
            </h3>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>금액 *</label>
              <input
                type="text"
                value={addPaymentModal.displayAmount}
                onChange={handleAddPaymentAmountChange}
                placeholder="0"
                style={{ textAlign: 'right' }}
                autoFocus
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>결제방법</label>
              <select
                value={addPaymentModal.payment_method}
                onChange={(e) => setAddPaymentModal(prev => ({ ...prev, payment_method: e.target.value }))}
              >
                <option value="현금">현금</option>
                <option value="계좌이체">계좌이체</option>
                <option value="카드">카드</option>
                <option value="어음">어음</option>
                <option value="기타">기타</option>
              </select>
            </div>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>비고</label>
              <input
                type="text"
                value={addPaymentModal.notes}
                onChange={(e) => setAddPaymentModal(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="메모"
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAddPaymentModal(prev => ({ ...prev, isOpen: false }))}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveNewPayment}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 나가기 확인 모달 */}
      <ConfirmModal
        isOpen={leaveModal}
        onClose={handleCancelLeave}
        onConfirm={handleConfirmLeave}
        title="변경사항이 있습니다"
        message="저장하지 않은 변경사항이 있습니다. 페이지를 나가시겠습니까?"
        type="warning"
        confirmText="나가기"
        cancelText="취소"
        showCancel={true}
      />

      {/* 전표 출력 모달 */}
      <TradePrintModal
        isOpen={printModal.isOpen}
        onClose={() => {
          setPrintModal({ isOpen: false, tradeId: null });
          if (isEdit) {
            // 수정인 경우: 목록으로 이동
            navigate('/trades');
          } else {
            // 신규인 경우: 초기화하여 연속 등록 가능
            setMaster({
              trade_type: master.trade_type,
              trade_date: formatLocalDate(new Date()),
              company_id: '',
              payment_method: '',
              notes: '',
              status: 'CONFIRMED',
              total_amount: 0,
              tax_amount: 0,
              total_price: 0
            });
            setDetails([]);
            setPaymentModal({
              isOpen: false,
              amount: '',
              displayAmount: '',
              payment_method: '계좌이체',
              notes: ''
            });
            setCompanySummary(null);
            if (companyRef.current) {
              companyRef.current.focus();
            }
          }
        }}
        tradeId={printModal.tradeId}
      />
    </div>
  );
}

export default TradeForm;
