import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { auctionAPI, productAPI, tradeAPI, companyAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';

function AuctionImport() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [mappings, setMappings] = useState({});
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [step, setStep] = useState(1); // 1: 크롤링, 2: 데이터 확인, 3: 매입전표 생성
  
  // 로컬 시간대 기준 YYYY-MM-DD 형식 반환 (UTC 문제 해결)
  const formatLocalDate = (date) => {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [crawlData, setCrawlData] = useState({
    account_id: '',
    crawl_date: formatLocalDate(new Date())
  });

  const [importConfig, setImportConfig] = useState({
    supplier_id: '', // 기본 매입처
    trade_date: formatLocalDate(new Date())
  });
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: '확인',
    showCancel: false
  });

  // 선택된 항목 (삭제용)
  const [selectedItems, setSelectedItems] = useState(new Set());

  useEffect(() => {
    loadInitialData();
  }, []);

  // 매핑 키 생성 함수 (품목명 + 중량 + 등급 조합)
  // 백엔드와 동일하게 빈 문자열 사용 (NULL은 UNIQUE KEY에서 작동 안함)
  const getMappingKey = (productName, weight, grade) => {
    const normalizedWeight = weight !== undefined && weight !== null && weight !== '' 
      ? parseFloat(weight).toFixed(2) 
      : '';
    const normalizedGrade = grade && String(grade).trim() !== '' ? String(grade).trim() : '';
    return `${productName}_${normalizedWeight}_${normalizedGrade}`;
  };

  // 품목명만으로 키 생성 (기존 매핑 호환용)
  const getProductNameOnlyKey = (productName) => {
    return `${productName}__`;  // 빈 문자열 사용
  };

  // 매핑 조회 (정확한 키 우선, 없으면 품목명만으로 폴백)
  const getMappedProductId = (productName, weight, grade) => {
    const exactKey = getMappingKey(productName, weight, grade);
    if (mappings[exactKey]) {
      return mappings[exactKey];
    }
    // 폴백: 품목명만으로 검색 (기존 매핑 지원)
    const fallbackKey = getProductNameOnlyKey(productName);
    return mappings[fallbackKey] || null;
  };

  const loadInitialData = async () => {
    try {
      // 각 API를 개별적으로 호출하여 하나가 실패해도 나머지는 로드되도록 함
      const [accountsRes, productsRes, companiesRes] = await Promise.all([
        auctionAPI.getAccounts(),
        productAPI.getAll({ is_active: 'true' }),
        companyAPI.getAll({ type: 'SUPPLIER', is_active: 'true' })
      ]);
      
      const accountsData = accountsRes.data?.data || [];
      const filteredAccounts = accountsData.filter(a => a.is_active);
      
      setAccounts(filteredAccounts);
      setProducts(productsRes.data?.data || []);
      setCompanies(companiesRes.data?.data || []);
      
      // 매핑 데이터는 별도로 로드 (실패해도 다른 데이터에 영향 없음)
      try {
        const mappingsRes = await auctionAPI.getMappings();
        const mappingObj = {};
        mappingsRes.data.data.forEach(m => {
          if (m.system_product_id) {  // 매핑된 것만 추가
            // 품목명 + 중량 + 등급 조합으로 키 생성
            const key = getMappingKey(m.auction_product_name, m.auction_weight, m.auction_grade);
            mappingObj[key] = m.system_product_id;
          }
        });
        setMappings(mappingObj);
      } catch (mappingError) {
        console.warn('매핑 데이터 로딩 실패:', mappingError);
      }
      
    } catch (error) {
      console.error('초기 데이터 로딩 오류:', error);
    }
  };

  const handleCrawl = async () => {
    if (!crawlData.account_id) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '입력 오류',
        message: '경매 계정을 선택하세요.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    setLoading(true);
    setLoadingMessage('낙찰 내역을 가져오는 중입니다... (30초~1분 소요)');
    try {
      const response = await auctionAPI.crawl(crawlData);
      setModal({
        isOpen: true,
        type: 'success',
        title: '크롤링 완료',
        message: response.data.message,
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
      
      // 크롤링된 데이터 조회
      const rawDataRes = await auctionAPI.getRawData({
        auction_date: crawlData.crawl_date,
        status: 'PENDING'
      });
      
      // 매핑 데이터 다시 로드 (최신 매핑 정보 반영)
      try {
        const mappingsRes = await auctionAPI.getMappings();
        const mappingObj = {};
        mappingsRes.data.data.forEach(m => {
          if (m.system_product_id) {  // 매핑된 것만 추가
            // 품목명 + 중량 + 등급 조합으로 키 생성
            const key = getMappingKey(m.auction_product_name, m.auction_weight, m.auction_grade);
            mappingObj[key] = m.system_product_id;
          }
        });
        setMappings(mappingObj);
      } catch (mappingError) {
        console.warn('매핑 데이터 로딩 실패:', mappingError);
      }
      
      setRawData(rawDataRes.data.data);
      setStep(2);
    } catch (error) {
      console.error('크롤링 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '크롤링 실패',
        message: error.response?.data?.message || '크롤링에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProductMapping = async (rawItem, productId) => {
    // 로컬 상태 먼저 업데이트 (UI 즉시 반영)
    const key = getMappingKey(rawItem.product_name, rawItem.weight, rawItem.grade);
    setMappings(prevMappings => ({
      ...prevMappings,
      [key]: productId || null  // productId가 없으면 null (매핑 해제)
    }));
    
    try {
      // 매칭 저장 (품목명 + 중량 + 등급 조합)
      await auctionAPI.saveMapping({
        auction_product_name: rawItem.product_name,
        auction_weight: rawItem.weight,
        auction_grade: rawItem.grade,
        system_product_id: productId,
        match_type: 'MANUAL'
      });
      // 성공 시 확인창 없이 조용히 처리
    } catch (error) {
      console.error('매칭 저장 오류:', error);
      // 실패 시 로컬 상태 롤백
      setMappings(prevMappings => {
        const newMappings = { ...prevMappings };
        delete newMappings[key];
        return newMappings;
      });
      setModal({
        isOpen: true,
        type: 'warning',
        title: '매칭 실패',
        message: '매칭 저장에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
    }
  };

  const handleImport = async () => {
    console.log('handleImport called');
    console.log('supplier_id:', importConfig.supplier_id);
    console.log('mappings:', mappings);
    console.log('rawData:', rawData);
    
    if (!importConfig.supplier_id) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '입력 오류',
        message: '매입처를 선택하세요.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    // 미매칭 품목 확인 (정확한 키 또는 품목명 폴백으로 확인)
    const unmatchedItems = rawData.filter(item => {
      return !getMappedProductId(item.product_name, item.weight, item.grade);
    });
    if (unmatchedItems.length > 0) {
      setModal({
        isOpen: true,
        type: 'confirm',
        title: '미매칭 품목 확인',
        message: `${unmatchedItems.length}개의 미매칭 품목이 있습니다. 계속하시겠습니까?`,
        confirmText: '계속',
        showCancel: true,
        onConfirm: () => processImport()
      });
      return;
    }
    
    processImport();
  };

  const processImport = async () => {

    setLoading(true);
    setLoadingMessage('매입 전표를 생성하는 중입니다...');
    try {
      // 매입 전표 생성
      const details = rawData
        .filter(item => {
          return getMappedProductId(item.product_name, item.weight, item.grade); // 매칭된 품목만
        })
        .map((item, index) => {
          const mappedId = getMappedProductId(item.product_name, item.weight, item.grade);
          // eslint-disable-next-line eqeqeq
          const matchedProduct = products.find(p => p.id == mappedId);
          void matchedProduct; // 향후 사용 예정
          return {
            seq_no: index + 1,
            product_id: mappedId,
            quantity: item.count || 1,
            total_weight: parseFloat(item.weight) || 0,
            unit_price: Math.floor(item.unit_price || 0),
            supply_amount: Math.floor(item.total_price || 0),
            tax_amount: 0,
            total_amount: Math.floor(item.total_price || 0),
            auction_price: Math.floor(item.unit_price || 0),
            shipper_location: item.shipper_location || null,
            sender: item.sender || null,
            notes: ''
          };
        });

      const master = {
        trade_type: 'PURCHASE',
        trade_date: importConfig.trade_date,
        company_id: importConfig.supplier_id,
        total_amount: details.reduce((sum, d) => sum + d.supply_amount, 0),
        tax_amount: 0,
        total_price: details.reduce((sum, d) => sum + d.total_amount, 0),
        status: 'CONFIRMED',
        notes: `경매 낙찰 자동 임포트 (${crawlData.crawl_date})`
      };

      await tradeAPI.create({ master, details });
      
      setModal({
        isOpen: true,
        type: 'success',
        title: '생성 완료',
        message: `${details.length}건의 매입 전표가 생성되었습니다.`,
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => navigate('/trades?type=PURCHASE')
      });
      
    } catch (error) {
      console.error('임포트 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '생성 실패',
        message: '매입 전표 생성에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
    } finally {
      setLoading(false);
    }
  };

  // 품목명 조회 함수 (향후 UI에서 사용 예정)
  // eslint-disable-next-line no-unused-vars
  const getProductName = (productId) => {
    // eslint-disable-next-line eqeqeq
    const product = products.find(p => p.id == productId);
    if (!product) return '-';
    const pureName = product.product_name?.replace(/\([^)]*\)$/, '').trim();
    return `${pureName}${product.grade ? ` (${product.grade})` : ''}`;
  };

  const getMappedCount = () => {
    return rawData.filter(item => {
      return getMappedProductId(item.product_name, item.weight, item.grade);
    }).length;
  };

  // 개별 항목 삭제
  const handleDeleteItem = async (id) => {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: '삭제 확인',
      message: '이 항목을 삭제하시겠습니까?',
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await auctionAPI.deleteRawData(id);
          setRawData(prev => prev.filter(item => item.id !== id));
          setSelectedItems(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
        } catch (error) {
          console.error('삭제 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '삭제 실패',
            message: '삭제에 실패했습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {}
          });
        }
      }
    });
  };

  // 선택된 항목 일괄 삭제
  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '선택 필요',
        message: '삭제할 항목을 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    setModal({
      isOpen: true,
      type: 'confirm',
      title: '일괄 삭제 확인',
      message: `선택된 ${selectedItems.size}개 항목을 삭제하시겠습니까?`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await auctionAPI.deleteRawDataBulk(Array.from(selectedItems));
          setRawData(prev => prev.filter(item => !selectedItems.has(item.id)));
          setSelectedItems(new Set());
        } catch (error) {
          console.error('일괄 삭제 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '삭제 실패',
            message: '삭제에 실패했습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {}
          });
        }
      }
    });
  };

  // 전체 선택/해제
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedItems(new Set(rawData.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  // 개별 선택
  const handleSelectItem = (id, checked) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="loading-content">
          <div className="spinner"></div>
          <p>{loadingMessage || '처리 중...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auction-import">
      <div className="page-header">
        <h1 className="page-title">경매 낙찰 데이터 가져오기</h1>
      </div>

      {/* Step 1: 크롤링 실행 */}
      {step === 1 && (
        <div className="card">
          <h2 className="card-title">낙찰 내역 크롤링</h2>
          
          <div className="form-row">
            <div className="form-group">
              <label className="required">경매 계정</label>
              <SearchableSelect
                options={accounts.map(account => ({
                  value: account.id,
                  label: `${account.account_name} (${account.username})`
                }))}
                value={crawlData.account_id}
                onChange={(option) => setCrawlData({...crawlData, account_id: option ? option.value : ''})}
                placeholder="계정 검색..."
                noOptionsMessage="계정 없음"
              />
            </div>
            <div className="form-group">
              <label className="required">경매일자</label>
              <input
                type="date"
                value={crawlData.crawl_date}
                onChange={(e) => setCrawlData({...crawlData, crawl_date: e.target.value})}
              />
            </div>
          </div>

          <div style={{marginTop: '1.5rem'}}>
            <button onClick={handleCrawl} className="btn btn-primary" disabled={!crawlData.account_id}>
              🔄 낙찰 내역 가져오기
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 데이터 확인 및 매칭 */}
      {step === 2 && (
        <>
          <div style={{marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end'}}>
            <button onClick={() => setStep(1)} className="btn btn-secondary">
              🔄 처음으로
            </button>
          </div>
          <div className="card" style={{marginBottom: '1.5rem', backgroundColor: '#e7f3ff'}}>
            <h3 style={{margin: '0 0 1rem 0'}}>📊 크롤링 결과</h3>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem'}}>
              <div>
                <strong>총 건수:</strong> {rawData.length}건
              </div>
              <div>
                <strong>매칭 완료:</strong> <span style={{color: '#27ae60'}}>{getMappedCount()}건</span>
              </div>
              <div>
                <strong>미매칭:</strong> <span style={{color: '#e74c3c'}}>{rawData.length - getMappedCount()}건</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                <h2 className="card-title" style={{margin: 0}}>품목 매칭 확인</h2>
                {selectedItems.size > 0 && (
                  <button 
                    onClick={handleDeleteSelected}
                    className="btn btn-danger"
                    style={{fontSize: '0.85rem', padding: '0.4rem 0.8rem'}}
                  >
                    ✕ 선택 삭제 ({selectedItems.size}건)
                  </button>
                )}
              </div>
              <button 
                onClick={async () => {
                  try {
                    const productsRes = await productAPI.getAll({ is_active: 'true' });
                    setProducts(productsRes.data?.data || []);
                    setModal({
                      isOpen: true,
                      type: 'success',
                      title: '새로고침 완료',
                      message: '시스템 품목 목록이 갱신되었습니다.',
                      confirmText: '확인',
                      showCancel: false,
                      onConfirm: () => {}
                    });
                  } catch (error) {
                    console.error('품목 새로고침 오류:', error);
                  }
                }}
                className="btn btn-secondary"
                style={{fontSize: '0.85rem', padding: '0.4rem 0.8rem'}}
              >
                🔄 시스템 품목 새로고침
              </button>
            </div>
            
            <div className="table-container" style={{maxHeight: 'none', overflow: 'visible'}}>
              <table>
                <thead>
                  <tr>
                    <th style={{width: '40px', textAlign: 'center'}}>
                      <input
                        type="checkbox"
                        checked={rawData.length > 0 && selectedItems.size === rawData.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        title="전체 선택"
                        style={{width: '18px', height: '18px', cursor: 'pointer', accentColor: '#e74c3c'}}
                      />
                    </th>
                    <th>입하번호</th>
                    <th>경매장 품목명</th>
                    <th>출하지</th>
                    <th>출하주</th>
                    <th>등급</th>
                    <th className="text-right">수량</th>
                    <th className="text-right">중량</th>
                    <th className="text-right">단가</th>
                    <th style={{minWidth: '250px'}}>시스템 품목</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // 입하번호 기준 색상 계산 (흰색/회색 번갈아)
                    const groupColors = ['#ffffff', '#f1f3f5'];
                    const groupMap = new Map();
                    let colorIndex = 0;
                    
                    rawData.forEach(item => {
                      const groupKey = item.arrive_no;
                      if (!groupMap.has(groupKey)) {
                        groupMap.set(groupKey, groupColors[colorIndex % groupColors.length]);
                        colorIndex++;
                      }
                    });
                    
                    return rawData.map(item => {
                    // 매핑 확인 (정확한 키 또는 품목명 폴백)
                    const mappedProductId = getMappedProductId(item.product_name, item.weight, item.grade);
                    const isMapped = !!mappedProductId;
                    // 그룹 색상 가져오기 (입하번호 기준)
                    const groupKey = item.arrive_no;
                    const groupColor = groupMap.get(groupKey);
                    // 단가 포맷팅: 소수점 제거, 3자리 콤마
                    const formattedPrice = Math.floor(item.unit_price || 0).toLocaleString();
                    
                    // 낙찰 내역 중량, 등급
                    const totalWeight = parseFloat(item.weight) || 0;
                    const auctionGrade = item.grade || '';
                    
                    // 품목명 오름차순, sort_order 오름차순으로 먼저 정렬
                    const sortedProducts = [...products].sort((a, b) => {
                      const nameCompare = (a.product_name || '').localeCompare(b.product_name || '', 'ko');
                      if (nameCompare !== 0) return nameCompare;
                      return (a.sort_order || 0) - (b.sort_order || 0);
                    });

                    // react-select용 옵션 생성 (품목명 중량 (등급))
                    const productOptions = sortedProducts.map(product => {
                      const pureName = product.product_name?.replace(/\([^)]*\)$/, '').trim();
                      const productWeight = product.weight ? parseFloat(product.weight) : 0;
                      const productGrade = product.grade || '';
                      const weightStr = productWeight > 0
                        ? `${productWeight.toFixed(1).replace(/\.0$/, '')}kg` 
                        : '';
                      return {
                        value: product.id,
                        label: `${pureName}${weightStr ? ` ${weightStr}` : ''}${productGrade ? ` (${productGrade})` : ''}`,
                        weight: productWeight,
                        grade: productGrade,
                        sortOrder: product.sort_order || 0,
                        productName: product.product_name || ''
                      };
                    });
                    
                    // 중량과 등급이 모두 일치하는 품목을 상단에 정렬
                    const sortedOptions = [...productOptions].sort((a, b) => {
                      // 중량 일치 체크 (0.05 허용)
                      const aWeightMatch = totalWeight > 0 && Math.abs(a.weight - totalWeight) < 0.05;
                      const bWeightMatch = totalWeight > 0 && Math.abs(b.weight - totalWeight) < 0.05;
                      
                      // 등급 일치 체크 (대소문자 무시)
                      const aGradeMatch = auctionGrade && a.grade && 
                        a.grade.toLowerCase() === auctionGrade.toLowerCase();
                      const bGradeMatch = auctionGrade && b.grade && 
                        b.grade.toLowerCase() === auctionGrade.toLowerCase();
                      
                      // 중량 + 등급 모두 일치하는 경우 최우선
                      const aFullMatch = aWeightMatch && aGradeMatch;
                      const bFullMatch = bWeightMatch && bGradeMatch;
                      if (aFullMatch && !bFullMatch) return -1;
                      if (!aFullMatch && bFullMatch) return 1;
                      
                      // 중량만 일치하는 경우 두번째 우선
                      if (aWeightMatch && !bWeightMatch) return -1;
                      if (!aWeightMatch && bWeightMatch) return 1;
                      
                      // 등급만 일치하는 경우 세번째 우선
                      if (aGradeMatch && !bGradeMatch) return -1;
                      if (!aGradeMatch && bGradeMatch) return 1;
                      
                      // 그 외에는 품목명, sort_order 순서 유지
                      const nameCompare = (a.productName || '').localeCompare(b.productName || '', 'ko');
                      if (nameCompare !== 0) return nameCompare;
                      return (a.sortOrder || 0) - (b.sortOrder || 0);
                    });
                    
                    // 현재 선택된 값 (타입 변환하여 비교)
                    const selectedOption = mappedProductId 
                      ? sortedOptions.find(opt => String(opt.value) === String(mappedProductId))
                      : null;
                    
                    return (
                      <tr key={item.id} style={{backgroundColor: !isMapped ? '#fff3cd' : groupColor}}>
                        <td style={{textAlign: 'center'}}>
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                            style={{width: '18px', height: '18px', cursor: 'pointer', accentColor: '#e74c3c'}}
                          />
                        </td>
                        <td>{item.arrive_no}</td>
                        <td><strong>{item.product_name}</strong></td>
                        <td>{item.shipper_location || '-'}</td>
                        <td>{item.sender || '-'}</td>
                        <td>{item.grade || '-'}</td>
                        <td className="text-right">{item.count || 0}개</td>
                        <td className="text-right">
                          {totalWeight > 0 ? `${totalWeight}kg` : '-'}
                        </td>
                        <td className="text-right">{formattedPrice}원</td>
                        <td>
                          <Select
                            value={selectedOption}
                            onChange={(option) => handleProductMapping(item, option ? option.value : '')}
                            options={sortedOptions}
                            placeholder="품목 검색..."
                            isClearable
                            isSearchable
                            filterOption={(option, inputValue) => {
                              if (!inputValue) return true;
                              const label = option.label.toLowerCase();
                              const keywords = inputValue.toLowerCase().trim().split(/\s+/);
                              return keywords.every(keyword => label.includes(keyword));
                            }}
                            noOptionsMessage={() => "품목 없음"}
                            formatOptionLabel={(option) => {
                              // 중량과 등급이 모두 일치하는 경우
                              const weightMatch = totalWeight > 0 && Math.abs(option.weight - totalWeight) < 0.05;
                              const gradeMatch = auctionGrade && option.grade && 
                                option.grade.toLowerCase() === auctionGrade.toLowerCase();
                              const isFullMatch = weightMatch && gradeMatch;
                              const isPartialMatch = weightMatch || gradeMatch;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {isFullMatch && (
                                    <span style={{
                                      backgroundColor: '#10b981',
                                      color: 'white',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold'
                                    }}>
                                      추천
                                    </span>
                                  )}
                                  {!isFullMatch && isPartialMatch && (
                                    <span style={{
                                      backgroundColor: '#f59e0b',
                                      color: 'white',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold'
                                    }}>
                                      {weightMatch ? '중량' : '등급'}
                                    </span>
                                  )}
                                  <span>{option.label}</span>
                                </div>
                              );
                            }}
                            styles={{
                              control: (base) => ({
                                ...base,
                                minHeight: '32px',
                                backgroundColor: isMapped ? '#d4edda' : '#fff3cd',
                                borderColor: isMapped ? '#28a745' : '#ffc107',
                                '&:hover': {
                                  borderColor: isMapped ? '#28a745' : '#ffc107'
                                }
                              }),
                              valueContainer: (base) => ({
                                ...base,
                                padding: '0 8px'
                              }),
                              input: (base) => ({
                                ...base,
                                margin: 0,
                                padding: 0
                              }),
                              indicatorSeparator: () => ({
                                display: 'none'
                              }),
                              dropdownIndicator: (base) => ({
                                ...base,
                                padding: '4px'
                              }),
                              option: (base, state) => {
                                // 중량과 등급이 모두 일치하는 경우
                                const weightMatch = totalWeight > 0 && Math.abs(state.data.weight - totalWeight) < 0.05;
                                const gradeMatch = auctionGrade && state.data.grade && 
                                  state.data.grade.toLowerCase() === auctionGrade.toLowerCase();
                                const isFullMatch = weightMatch && gradeMatch;
                                const isPartialMatch = weightMatch || gradeMatch;
                                return {
                                  ...base,
                                  backgroundColor: state.isSelected 
                                    ? '#1976d2' 
                                    : state.isFocused 
                                      ? '#e3f2fd' 
                                      : isFullMatch 
                                        ? '#ecfdf5' 
                                        : isPartialMatch
                                          ? '#fffbeb'
                                          : 'white',
                                  color: state.isSelected ? 'white' : '#333',
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  borderLeft: !state.isSelected 
                                    ? isFullMatch 
                                      ? '3px solid #10b981' 
                                      : isPartialMatch 
                                        ? '3px solid #f59e0b'
                                        : 'none'
                                    : 'none'
                                };
                              },
                              menu: (base) => ({
                                ...base,
                                zIndex: 9999
                              }),
                              menuList: (base) => ({
                                ...base,
                                maxHeight: '400px'  // 적절한 높이로 제한
                              })
                            }}
                          />
                        </td>
                      </tr>
                    );
                  });
                  })()}
                </tbody>
              </table>
            </div>

            <div style={{marginTop: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
              <h3 style={{margin: '0 0 1rem 0'}}>매입 전표 생성 설정</h3>
              <div className="form-row">
                <div className="form-group">
                  <label className="required">매입처 (생산자)</label>
                  <SearchableSelect
                    options={companies.map(company => ({
                      value: company.id,
                      label: company.alias 
                        ? `${company.company_name} - ${company.alias}`
                        : company.company_name
                    }))}
                    value={importConfig.supplier_id}
                    onChange={(option) => setImportConfig({...importConfig, supplier_id: option ? option.value : ''})}
                    placeholder="매입처 검색..."
                    noOptionsMessage="거래처 없음"
                  />
                </div>
                <div className="form-group">
                  <label className="required">거래일자</label>
                  <input
                    type="date"
                    value={importConfig.trade_date}
                    onChange={(e) => setImportConfig({...importConfig, trade_date: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button onClick={() => setStep(1)} className="btn btn-secondary">
                처음으로
              </button>
              <button 
                onClick={handleImport} 
                className="btn btn-primary"
                disabled={getMappedCount() === 0 || !importConfig.supplier_id}
              >
                매입 전표 생성 ({getMappedCount()}건)
              </button>
            </div>
          </div>
        </>
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
    </div>
  );
}

export default AuctionImport;
