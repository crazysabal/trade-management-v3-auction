import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, inventoryProductionAPI, productAPI } from '../services/api';
import { formatLocalDate } from '../utils/dateUtils'; // [FIX] Import date utility
import { useConfirmModal } from './ConfirmModal';
import { createPortal } from 'react-dom';
import SearchableSelect from './SearchableSelect';
import ProductionDetailModal from './ProductionDetailModal';
import { useModalDraggable } from '../hooks/useModalDraggable';

const InventoryQuickView = ({ inventoryAdjustments = {}, refreshKey, onInventoryLoaded }) => {
    const [inventory, setInventory] = useState([]);
    const [filteredInventory, setFilteredInventory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const searchInputRef = React.useRef(null);
    const { openModal, ConfirmModalComponent } = useConfirmModal();
    const [panelStatus, setPanelStatus] = useState(() => {
        if (!window.__salesPanelRegistry) return { count: 0, hasReadyPanel: false };
        const entries = Object.values(window.__salesPanelRegistry);
        return {
            count: entries.length,
            hasReadyPanel: entries.some(p => p.hasCompany && !p.isViewMode)
        };
    });
    const isSalesPanelActive = panelStatus.hasReadyPanel;
    const [selectedId, setSelectedId] = useState(null);
    const [showTodayOnly, setShowTodayOnly] = useState(false);

    // [NEW] 바로 분할 모달 상태
    const [quickSplitModal, setQuickSplitModal] = useState({
        isOpen: false,
        sourceInventory: null,
        outputProduct: null,
        splitCount: '',
        sourceUseQuantity: '1',
        products: []
    });
    // [NEW] 전체 품목 리스트 캐시 (소분 가능 여부 판단용)
    const [allProducts, setAllProducts] = useState([]);

    // [NEW] 생산 작업 상세 모달 상태
    const [productionModal, setProductionModal] = useState({
        isOpen: false,
        productionId: null
    });

    const { handleMouseDown: splitHandleMouseDown, draggableStyle: splitDraggableStyle } = useModalDraggable(quickSplitModal.isOpen);

    const filteredInventoryRef = React.useRef(filteredInventory);
    const selectedIdRef = React.useRef(selectedId);

    // Ref 동기화: 이벤트 리스너 내에서 최신 상태 참조를 위함
    useEffect(() => {
        filteredInventoryRef.current = filteredInventory;
    }, [filteredInventory]);

    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);

    useEffect(() => {
        loadInventory();

        // 목록 포커스 복구 및 자동 다음 행 이동
        const recoverListFocus = (shouldAdvance = false) => {
            // 성공 시 다음 행으로 자동 이동 (Auto-Advance)
            if (shouldAdvance) {
                const currentFiltered = filteredInventoryRef.current;
                const currentSelectedId = selectedIdRef.current;
                const currentIndex = currentFiltered.findIndex(item => item.id === currentSelectedId);

                if (currentIndex !== -1 && currentIndex < currentFiltered.length - 1) {
                    const nextItem = currentFiltered[currentIndex + 1];
                    setSelectedId(nextItem.id);
                }
            }

            // 작업이 끝나고 창이 다시 활성화되었을 때 선택된 행에 포커스
            setTimeout(() => {
                const selectedRow = document.querySelector('.inventory-row.is-selected');
                if (selectedRow) {
                    selectedRow.focus();
                }
            }, 60); // DOM 업데이트 및 렌더링 대기를 위해 지연 시간 소폭 조정
        };

        // 전표 상태 변경 리스너
        const handlePanelsUpdate = (e) => {
            setPanelStatus({
                count: e.detail.count,
                hasReadyPanel: e.detail.hasReadyPanel
            });
        };

        // 퀵 추가 완료 후 포커스 복구 및 "성공 시에만 자동 다음 행 이동"
        const handleAddComplete = (e) => {
            recoverListFocus(e.detail?.success === true);
        };

        // [NEW] 퀵 추가 중 오류 발생 시 모달 표시 리스너
        const handleAddError = (e) => {
            openModal({
                type: 'warning',
                title: '추가 실패',
                message: e.detail.message,
                showCancel: false,
                onClose: recoverListFocus // 모달 닫힐 때 포커스 원복
            });
        };

        window.addEventListener('sales-panels-updated', handlePanelsUpdate);
        window.addEventListener('inventory-quick-add-complete', handleAddComplete);
        window.addEventListener('inventory-quick-add-error', handleAddError);

        return () => {
            window.removeEventListener('sales-panels-updated', handlePanelsUpdate);
            window.removeEventListener('inventory-quick-add-complete', handleAddComplete);
            window.removeEventListener('inventory-quick-add-error', handleAddError);
        };
    }, [refreshKey]);

    // [Safety Net] 이벤트 유실 방지를 위한 폴링 동기화 (500ms 주기)
    useEffect(() => {
        const syncStatus = () => {
            if (!window.__salesPanelRegistry) return;
            const entries = Object.values(window.__salesPanelRegistry);
            setPanelStatus(prev => {
                const newCount = entries.length;
                const newHasReady = entries.some(p => p.hasCompany && !p.isViewMode);
                // 상태가 다를 때만 업데이트 (렌더링 최적화)
                if (prev.count !== newCount || prev.hasReadyPanel !== newHasReady) {
                    return { count: newCount, hasReadyPanel: newHasReady };
                }
                return prev;
            });
        };

        const intervalId = setInterval(syncStatus, 500);
        return () => clearInterval(intervalId);
    }, []);

    // 조정 내역(inventoryAdjustments)에 있지만 목록에 없는(소진된) 재고 불러오기
    useEffect(() => {
        const fetchMissingItems = async () => {
            const currentIds = new Set(inventory.map(item => String(item.id)));
            const adjustedIds = Object.keys(inventoryAdjustments);
            const missingIds = adjustedIds.filter(id => !currentIds.has(String(id)));

            if (missingIds.length === 0) return;

            try {
                const promises = missingIds.map(id => purchaseInventoryAPI.getById(id));
                const responses = await Promise.all(promises);
                const newItems = responses
                    .map(res => {
                        const data = res.data?.data || res.data;
                        // getById는 { inventory: {...}, matchings: [...] } 형태를 반환함
                        if (data && data.inventory) {
                            return data.inventory;
                        }
                        return data;
                    })
                    .filter(item => item && item.id);

                if (newItems.length > 0) {
                    setInventory(prev => {
                        // 중복 방지 (비동기 처리 중 이미 추가되었을 수 있음)
                        const existingIds = new Set(prev.map(p => String(p.id)));
                        const uniqueNewItems = newItems.filter(item => !existingIds.has(String(item.id)));

                        // 합치고 정렬 (품목명 > 출하주 > 등급(순번) > 매입일자 순)
                        const merged = [...prev, ...uniqueNewItems];
                        return merged.sort((a, b) => {
                            // 1. 품목명
                            const nameA = a.product_name || '';
                            const nameB = b.product_name || '';
                            const nameDiff = nameA.localeCompare(nameB, 'ko');
                            if (nameDiff !== 0) return nameDiff;

                            // 2. 출하주
                            const senderA = a.sender || '';
                            const senderB = b.sender || '';
                            const senderDiff = senderA.localeCompare(senderB, 'ko');
                            if (senderDiff !== 0) return senderDiff;

                            // 3. 등급 순번 (sort_order)
                            const orderA = a.sort_order || 9999;
                            const orderB = b.sort_order || 9999;
                            if (orderA !== orderB) return orderA - orderB;

                            // 4. 매입일자
                            const dateA = new Date(a.purchase_date || 0);
                            const dateB = new Date(b.purchase_date || 0);
                            return dateA - dateB;
                        });
                    });
                }
            } catch (err) {
                console.error("누락된 재고 정보 조회 실패:", err);
            }
        };

        fetchMissingItems();
    }, [inventoryAdjustments, inventory]);

    const loadInventory = async (idToSelect = null) => {
        setLoading(true);
        try {
            // 1. 재고 목록 조회
            const invResponse = await purchaseInventoryAPI.getAll({ has_remaining: 'true' });
            const invData = invResponse.data?.data || invResponse.data || [];
            const validInvData = Array.isArray(invData) ? invData : [];

            // 2. 전체 품목 리스트 조회 (캐싱되어 있지 않은 경우에만 또는 강제 갱신)
            const prodResponse = await productAPI.getAll();
            const prodData = prodResponse.data?.data || prodResponse.data || [];

            setAllProducts(prodData);
            setInventory(validInvData);
            setFilteredInventory(validInvData); // validInvData 활용 (아래 useEffect에서 처리됨)

            // 퀵스플릿 모달 내 품목 리스트도 미리 캐싱 업데이트
            setQuickSplitModal(prev => ({ ...prev, products: prodData }));

            // [NEW] 분할 등으로 신규 생성된 ID가 있으면 선택 및 포커싱
            if (idToSelect) {
                setTimeout(() => {
                    setSelectedId(idToSelect);
                    setTimeout(() => {
                        const selectedRow = document.querySelector(`.inventory-row.is-selected`);
                        if (selectedRow) {
                            selectedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            selectedRow.focus();
                        }
                    }, 100);
                }, 50);
            }

        } catch (error) {
            console.error('데이터 로드 실패:', error);
            setInventory([]);
            setFilteredInventory([]);
        } finally {
            setLoading(false);
        }
    };

    // 원본 데이터와 조정 데이터를 합쳐서 표시 데이터 계산
    useEffect(() => {
        if (!inventory.length) return;

        const applyAdjustments = (items) => {
            return items.map(item => {
                const delta = inventoryAdjustments[item.id] || 0;
                if (delta === 0) return item;
                return {
                    ...item,
                    remaining_quantity: (parseFloat(item.remaining_quantity) || 0) + delta
                };
            });
        };

        const adjustedInventory = applyAdjustments(inventory);

        // 부모 컴포넌트에 재고 목록 전달 (전표 수정 시 검증용)
        // refreshKey가 바뀌거나 재고가 로드될 때마다 업데이트
        if (onInventoryLoaded) {
            onInventoryLoaded(adjustedInventory);
        }

        // 당일 매입 필터 및 검색어 필터링 적용
        let filtered = adjustedInventory;

        // 1. 당일 매입 필터 적용
        if (showTodayOnly) {
            const today = formatLocalDate(new Date()); // YYYY-MM-DD
            filtered = filtered.filter(item => {
                const purchaseDate = item.purchase_date ? item.purchase_date.split('T')[0] : '';
                return purchaseDate === today;
            });
        }

        // 2. 검색어 필터링 적용
        if (!searchTerm) {
            setFilteredInventory(filtered);
        } else {
            const keywords = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            filtered = filtered.filter(item => {
                const weight = item.product_weight || item.weight;
                // product_weight 사용 시에는 product_weight_unit을 우선적으로 결합하여 정합성 유지
                const unit = item.product_weight ? (item.product_weight_unit || item.weight_unit || 'kg') : (item.weight_unit || 'kg');
                const weightStr = weight ? `${parseFloat(weight)}${unit}` : '';

                // InventoryHistory.js와 동일한 로직 적용
                const primaryText = `${item.product_name || ''} ${weightStr} ${item.grade || ''} ${item.company_name || ''} ${item.sender || ''}`.toLowerCase();
                const secondaryText = `${item.warehouse_name || ''} ${formatDateShort(item.purchase_date)}`.toLowerCase();

                return keywords.every(kw => {
                    // 1. 핵심 검색 대상(품목명, 거래처, 출하주 등)은 항상 부분 일치 허용
                    if (primaryText.includes(kw)) return true;

                    // 2. 부가 필드(창고, 날짜 등)는 키워드가 짧을 경우 단어 시작 매칭으로 오탐 방지
                    if (kw.length <= 2) {
                        const wordsForStrictCheck = secondaryText.split(/[\s,()\[\]\-_]+/);
                        return wordsForStrictCheck.some(word => word.startsWith(kw));
                    }

                    // 3. 키워드가 길면 모든 필드에서 자유로운 부분 일치 허용
                    return secondaryText.includes(kw);
                });
            });
            setFilteredInventory(filtered);
        }
    }, [inventory, inventoryAdjustments, searchTerm, showTodayOnly]);

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
    };

    const toggleIsAvailable = () => {
        setIsAvailable(!isAvailable);
    };

    // ESC 키로 재고 분할 모달 닫기
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && quickSplitModal.isOpen) {
                setQuickSplitModal(prev => ({ ...prev, isOpen: false }));
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [quickSplitModal.isOpen]);


    // 헬퍼 함수들 (SaleFromInventory.js와 동일)
    // [Standard 57] 소수점이 있는 경우에만 최대 2자리까지 표시 (중량/수치용)
    const formatNumber = (value) => {
        const num = parseFloat(value || 0);
        return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    };
    // [NEW] 수량(개수) 전용 포맷터: 소수점 이하 표시 안함
    const formatQuantity = (value) => {
        const num = Math.floor(parseFloat(value || 0));
        return new Intl.NumberFormat('ko-KR').format(num);
    };
    const formatCurrency = (amount) => {
        if (!amount && amount !== 0) return '-';
        return new Intl.NumberFormat('ko-KR').format(Math.floor(amount)) + '원';
    };

    // 퀵 추가 로직 보완: 매출 전표 상태 사전 체크
    const handleQuickAdd = (item) => {
        // 이미 버튼이 비활성화되어 있겠지만, 키보드 Enter 등의 경로를 위해 한번 더 체크
        if (!isSalesPanelActive) {
            openModal({
                type: 'warning',
                title: '활성 전표 없음',
                message: '현재 열려 있는 매출 전표 창이 없습니다.\n먼저 매출 전표 등록 창을 열어주세요.',
                showCancel: false,
                onClose: () => {
                    // 경고창 닫을 때 포커스 다시 행으로 돌려줌
                    setTimeout(() => {
                        const selectedRow = document.querySelector('.inventory-row.is-selected');
                        if (selectedRow) selectedRow.focus();
                    }, 50);
                }
            });
            return;
        }

        // 1.5. 잔량 체크
        if (item.remaining_quantity <= 0) {
            openModal({
                type: 'warning',
                title: '재고 부족',
                message: '해당 품목의 잔량이 없습니다.\n잔량이 0인 품목은 추가할 수 없습니다.',
                showCancel: false,
                onClose: () => {
                    // 경고창 닫을 때 포커스 다시 행으로 돌려줌
                    setTimeout(() => {
                        const selectedRow = document.querySelector('.inventory-row.is-selected');
                        if (selectedRow) selectedRow.focus();
                    }, 50);
                }
            });
            return;
        }

        const event = new CustomEvent('inventory-quick-add', {
            detail: { inventory: item }
        });
        window.dispatchEvent(event);
    };

    // [NEW] 바로 분할 모달 열기 핸들러
    const handleOpenQuickSplit = async (e, inventory) => {
        e.stopPropagation();
        try {
            setLoading(true);
            let productsList = quickSplitModal.products;
            if (productsList.length === 0) {
                const res = await productAPI.getAll();
                productsList = res.data.data || [];
            }

            // 정수 분할 가능한 품목만 필터링 (동일 이름, 작은 중량, 정수 비율)
            const curGrams = getWeightInGrams(inventory.product_weight || inventory.weight, inventory.product_weight_unit || inventory.weight_unit);
            const validTargets = productsList.filter(p => {
                if (p.product_name !== inventory.product_name) return false;
                const pGrams = getWeightInGrams(p.weight, p.weight_unit);
                if (pGrams <= 0 || pGrams >= curGrams) return false;
                const ratio = curGrams / pGrams;
                return Math.abs(ratio - Math.round(ratio)) < 0.001;
            });

            if (validTargets.length === 0) {
                openModal({ type: 'warning', title: '분할 불가', message: '이 재고에서 정수로 분할 가능한 하위 품목이 없습니다.', showCancel: false });
                return;
            }

            // 정렬: 순번(sort_order) 우선, 그 다음 중량 큰 순서
            const sortedTargets = [...validTargets].sort((a, b) => {
                const orderA = a.sort_order || 9999;
                const orderB = b.sort_order || 9999;
                if (orderA !== orderB) return orderA - orderB;
                return getWeightInGrams(b.weight, b.weight_unit) - getWeightInGrams(a.weight, a.weight_unit);
            });

            // 기본 선택값 설정 (정렬된 첫 번째 항목)
            const defaultTarget = sortedTargets[0];

            setQuickSplitModal({
                isOpen: true,
                sourceInventory: inventory,
                outputProduct: defaultTarget,
                splitCount: Math.round(curGrams / getWeightInGrams(defaultTarget.weight, defaultTarget.weight_unit)).toString(),
                sourceUseQuantity: Math.floor(inventory.remaining_quantity || 0).toString(),
                products: productsList,
                validTargets: sortedTargets // 정렬된 목록 저장
            });
        } catch (err) {
            console.error('품목 로딩 실패:', err);
            openModal({ type: 'warning', title: '오류', message: '품목 정보를 불러오는데 실패했습니다.', showCancel: false });
        } finally {
            setLoading(false);
        }
    };

    // [NEW] 바로 분할 실행 핸들러
    const handleExecuteQuickSplit = async () => {
        const { sourceInventory, outputProduct, splitCount, sourceUseQuantity } = quickSplitModal;

        if (!outputProduct || !splitCount || !sourceUseQuantity) {
            openModal({ type: 'warning', title: '입력 오류', message: '결과 품목과 분할 수량을 입력해주세요.', showCancel: false });
            return;
        }

        const useQty = parseFloat(sourceUseQuantity);
        if (useQty <= 0 || useQty > (sourceInventory.remaining_quantity || 0)) {
            openModal({ type: 'warning', title: '수량 오류', message: '분할할 원본 수량이 유효하지 않거나 부족합니다.', showCancel: false });
            return;
        }

        try {
            setLoading(true);
            const payload = {
                ingredients: [{
                    inventory_id: sourceInventory.id,
                    use_quantity: useQty
                }],
                output_product_id: outputProduct.id,
                output_quantity: parseFloat(splitCount) * useQty,
                additional_cost: 0,
                sender: sourceInventory.sender || '',
                memo: '빠른 분할(Quick Split)'
            };

            const response = await inventoryProductionAPI.create(payload);
            const newInventoryId = response.data?.data?.inventory_id;

            setQuickSplitModal(prev => ({ ...prev, isOpen: false }));
            openModal({
                type: 'success',
                title: '성공',
                message: '재고 분할이 완료되었습니다.',
                showCancel: false,
                onConfirm: () => loadInventory(newInventoryId)
            });
        } catch (err) {
            console.error('분할 오류:', err);
            openModal({ type: 'warning', title: '분할 실패', message: err.response?.data?.message || err.message, showCancel: false });
        } finally {
            setLoading(false);
        }
    };

    // 생산 작업 상세 조회
    const handleViewProduction = (productionId) => {
        setProductionModal({
            isOpen: true,
            productionId: productionId
        });
    };
    // 날짜 포맷 (MM-DD)
    const formatDateShort = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}-${day}`;
    };

    const formatProductName = (item) => {
        if (!item) return '';
        const name = item.product_name || '';
        const weight = item.product_weight || item.weight;
        const unit = item.product_weight ? (item.product_weight_unit || item.weight_unit || 'kg') : (item.weight_unit || 'kg');

        // [Standard 57 & 65.10] 중량 표시 (숫자-단위 밀착, 최대 소수점 2자리)
        const weightStr = (weight && parseFloat(weight) > 0)
            ? `${formatNumber(weight)}${unit}`
            : '';

        return `${name}${weightStr ? ` ${weightStr}` : ''}`.trim();
    };

    // [NEW] 중량 단위 정규화 (g 단위로 변환)
    const getWeightInGrams = (weight, unit) => {
        const w = parseFloat(weight || 0);
        if (isNaN(w) || w <= 0) return 0;
        const normalizedUnit = (unit || 'kg').toLowerCase();
        return normalizedUnit === 'kg' ? w * 1000 : w;
    };

    // [NEW] 소분(분할) 가능 여부 판별 핸들러 (정수 분할 검증 포함)
    const isSplittable = (item) => {
        if (!item.product_name) return false;

        const curGrams = getWeightInGrams(item.product_weight || item.weight, item.product_weight_unit || item.weight_unit);
        if (curGrams <= 0) return false;

        // 동일 품목명 중 현재 중량보다 작은 품목이면서 정수로 나누어떨어지는지 확인
        return allProducts.some(p => {
            if (p.product_name !== item.product_name) return false;
            const pGrams = getWeightInGrams(p.weight, p.weight_unit);
            if (pGrams <= 0 || pGrams >= curGrams) return false;

            // 정수로 나누어떨어지는지 확인 (부동소수점 오차 방지를 위해 Math.round 활용)
            const ratio = curGrams / pGrams;
            return Math.abs(ratio - Math.round(ratio)) < 0.001;
        });
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0.5rem', width: 'fit-content', minWidth: '100%' }}>
            {/* 검색바 및 새로고침 */}
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="🔍 품목, 매입처, 출하주, 창고 검색 (띄어쓰기로 다중 검색)"
                        value={searchTerm}
                        onChange={handleSearch}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const firstRow = document.querySelector('.inventory-row');
                                if (firstRow) {
                                    firstRow.focus();
                                    // 첫 행의 ID를 찾아 선택 상태로 만듬
                                    if (filteredInventory.length > 0) {
                                        setSelectedId(filteredInventory[0].id);
                                    }
                                }
                            }
                        }}
                        style={{
                            width: '100%',
                            height: '38px',
                            padding: '0 0.75rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '0.9rem',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0 8px',
                    backgroundColor: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    height: '38px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '0.85rem',
                    color: showTodayOnly ? '#3b82f6' : '#64748b',
                    fontWeight: showTodayOnly ? '600' : '400',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                }}
                    onClick={() => setShowTodayOnly(!showTodayOnly)}
                >
                    <input
                        type="checkbox"
                        checked={showTodayOnly}
                        onChange={() => { }} // 상위 div 클릭으로 제어
                        style={{ cursor: 'pointer' }}
                    />
                    오늘 매입분
                </div>
                <button
                    onClick={() => loadInventory()}
                    disabled={loading}
                    title="재고 새로고침"
                    style={{
                        height: '38px',
                        padding: '0 12px',
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        color: '#475569',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                    onMouseOut={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#f8f9fa'; }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            animation: loading ? 'spin 1.5s linear infinite' : 'none',
                            transition: 'transform 0.3s ease'
                        }}
                    >
                        <path d="M21 2v6h-6"></path>
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                        <path d="M3 22v-6h6"></path>
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                    </svg>
                    <style>{`
                        @keyframes spin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                    `}</style>
                </button>
            </div>

            {/* 목록 */}
            <div style={{ flex: 1, overflowY: 'auto', width: 'fit-content', minWidth: '100%' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>로딩 중...</div>
                ) : filteredInventory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        {searchTerm ? '검색 결과가 없습니다.' : '재고 데이터가 없습니다.'}
                    </div>
                ) : (
                    <table style={{ width: 'auto', minWidth: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>
                            <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                                <th style={{ width: '40px' }}></th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>품목 / 출하주 / 등급</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>잔량</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>단가</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>매입처</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>창고</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>매입일</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInventory.map((item, index) => {
                                // const shipperInfo = [item.shipper_location, item.sender].filter(Boolean).join(' / ') || '-';
                                return (
                                    <tr
                                        key={item.id}
                                        className={`inventory-row ${selectedId === item.id ? 'is-selected' : ''}`}
                                        style={{ borderBottom: '1px solid #eee', cursor: 'grab' }}
                                        tabIndex={0} // 키보드 포커스 허용
                                        draggable={true}
                                        onClick={(e) => {
                                            setSelectedId(item.id);
                                            e.currentTarget.focus();
                                        }}
                                        onDragStart={(e) => {
                                            // 드래그 시작 시에도 해당 행을 선택 상태로 만듦
                                            setSelectedId(item.id);
                                            // 표준 드래그 데이터 설정
                                            e.dataTransfer.effectAllowed = 'copy';
                                            e.dataTransfer.setData('application/json', JSON.stringify(item));
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                setSelectedId(item.id);
                                                handleQuickAdd(item);
                                            } else if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                const nextIndex = index + 1;
                                                if (nextIndex < filteredInventory.length) {
                                                    const nextItem = filteredInventory[nextIndex];
                                                    setSelectedId(nextItem.id);
                                                    e.currentTarget.nextElementSibling?.focus();
                                                }
                                            } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                const prevIndex = index - 1;
                                                if (prevIndex >= 0) {
                                                    const prevItem = filteredInventory[prevIndex];
                                                    setSelectedId(prevItem.id);
                                                    e.currentTarget.previousElementSibling?.focus();
                                                } else if (index === 0) {
                                                    // 목록의 최상단에서 위로 방향키 입력 시 검색창으로 포커스
                                                    e.preventDefault();
                                                    setSelectedId(null); // 선택 해제
                                                    searchInputRef.current?.focus();
                                                }
                                            }
                                        }}
                                    >
                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                            <button
                                                className="btn-quick-add"
                                                title={isSalesPanelActive
                                                    ? "전표에 추가 (Enter)"
                                                    : (panelStatus.count === 0
                                                        ? "활성화된 매출 전표 창이 없습니다"
                                                        : "편집 가능한 매출 전표 창이 없거나 거래처가 선택되지 않았습니다")
                                                }
                                                disabled={!isSalesPanelActive}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // 버튼 클릭 시에도 해당 행을 선택 상태로 만듦
                                                    setSelectedId(item.id);
                                                    e.currentTarget.closest('.inventory-row')?.focus();
                                                    handleQuickAdd(item);
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: '4px',
                                                    cursor: isSalesPanelActive ? 'pointer' : 'not-allowed',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s ease',
                                                    color: isSalesPanelActive ? '#3498db' : '#ccc',
                                                    filter: isSalesPanelActive ? 'none' : 'grayscale(100%)',
                                                    opacity: isSalesPanelActive ? 1 : 0.5,
                                                    outline: 'none'
                                                }}
                                            >
                                                <svg
                                                    viewBox="0 0 24 24"
                                                    width="18"
                                                    height="18"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1))' }}
                                                >
                                                    <line x1="19" y1="12" x2="5" y2="12"></line>
                                                    <polyline points="12 19 5 12 12 5"></polyline>
                                                </svg>
                                            </button>
                                        </td>
                                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ color: '#1e293b' }}>{formatProductName(item)}</span>
                                                <span style={{ color: '#cbd5e1' }}>/</span>
                                                <span style={{ fontWeight: '600', color: '#1e293b' }}>{item.sender || '-'}</span>
                                                <span style={{ color: '#cbd5e1' }}>/</span>
                                                {item.grade ? (
                                                    <span style={{
                                                        color: '#3b82f6',
                                                        backgroundColor: '#eff6ff',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        border: '1px solid #dbeafe'
                                                    }}>
                                                        {item.grade}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#1e293b' }}>-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{
                                            padding: '0.5rem',
                                            textAlign: 'right',
                                            fontWeight: 'bold',
                                            color: item.remaining_quantity <= 0
                                                ? '#e74c3c' // 0 or less -> Red
                                                : (inventoryAdjustments[item.id] !== undefined && inventoryAdjustments[item.id] !== 0)
                                                    ? '#3498db' // Modified but positive -> Blue
                                                    : '#27ae60' // Untouched -> Green
                                        }}>
                                            {formatQuantity(item.remaining_quantity)}개
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {formatCurrency(item.unit_price)}
                                        </td>
                                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                                            {item.company_name || '-'}
                                        </td>
                                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', color: '#666' }}>
                                            {item.warehouse_name || '-'}
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            {formatDateShort(item.purchase_date)}
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                                                {isSplittable(item) && (
                                                    <button
                                                        onClick={(e) => {
                                                            setSelectedId(item.id);
                                                            e.currentTarget.closest('.inventory-row')?.focus();
                                                            handleOpenQuickSplit(e, item);
                                                        }}
                                                        style={{
                                                            background: '#fff3e0',
                                                            border: '1px solid #ffe0b2',
                                                            borderRadius: '6px',
                                                            padding: '2px 8px',
                                                            cursor: 'pointer',
                                                            color: '#ea580c',
                                                            fontSize: '0.9rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#ffedd5'}
                                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff3e0'}
                                                        title="재고 분할 (소분)"
                                                    >
                                                        ✂️
                                                    </button>
                                                )}
                                                {item.production_id && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedId(item.id);
                                                            e.currentTarget.closest('.inventory-row')?.focus();
                                                            handleViewProduction(item.production_id);
                                                        }}
                                                        style={{
                                                            background: '#f3e8ff',
                                                            border: '1px solid #e9d5ff',
                                                            borderRadius: '6px',
                                                            padding: '2px 8px',
                                                            cursor: 'pointer',
                                                            color: '#9333ea',
                                                            fontSize: '0.9rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            transition: 'all 0.2s',
                                                            fontWeight: 'bold'
                                                        }}
                                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#faf5ff'}
                                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3e8ff'}
                                                        title="작업 상세 및 취소"
                                                    >
                                                        🛠️
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '0.8rem', color: '#888' }}>
                총 {filteredInventory.length}건 / 재고합계: {formatQuantity(filteredInventory.reduce((sum, item) => sum + (parseFloat(item.remaining_quantity) || 0), 0))}
            </div>
            {quickSplitModal.isOpen && (
                createPortal(
                    <div className="modal-overlay" style={{ zIndex: 10500 }}>
                        <div style={{
                            backgroundColor: 'white', border: 'none', borderRadius: '24px',
                            width: '440px', maxWidth: '95%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            overflow: 'hidden', display: 'flex', flexDirection: 'column',
                            ...splitDraggableStyle
                        }} onClick={(e) => e.stopPropagation()}>
                            {/* 헤더: Premium Icon Header */}
                            <div
                                style={{
                                    padding: '2.5rem 2rem 1.5rem', textAlign: 'center', backgroundColor: '#fff'
                                }}
                            >
                                <div
                                    onMouseDown={splitHandleMouseDown}
                                    style={{
                                        width: '64px', height: '64px', backgroundColor: '#fff7ed', borderRadius: '18px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem',
                                        fontSize: '1.75rem', color: '#ea580c', border: '1px solid #ffedd5',
                                        cursor: 'grab'
                                    }}
                                >
                                    ✂️
                                </div>
                                <h2 style={{ margin: '0', fontSize: '1.5rem', fontWeight: '900', color: '#1e293b' }}>
                                    재고 분할
                                </h2>
                            </div>

                            <div style={{ padding: '0 2rem 2rem' }}>
                                {/* 원재료 정보: 카드 레이아웃 */}
                                <div style={{
                                    marginBottom: '1.5rem', backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '24px',
                                    border: '1px solid #f1f5f9'
                                }}>
                                    {/* 상단: 품목명 및 생산자 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', padding: '0 4px' }}>
                                        <div style={{ fontSize: '1.2rem', color: '#1e293b', fontWeight: '900', letterSpacing: '-0.02em', flex: 1, marginRight: '1rem' }}>
                                            {formatProductName(quickSplitModal.sourceInventory)}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                            생산자: <span style={{ color: '#475569' }}>{quickSplitModal.sourceInventory?.sender || '-'}</span>
                                        </div>
                                    </div>

                                    {/* 하단: 2열 정보 배지 (현재 재고 & 소분할 수량) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        {/* 현재 재고 박스 */}
                                        <div style={{
                                            padding: '14px', backgroundColor: '#fff', borderRadius: '18px',
                                            border: '1px solid #f1f5f9', textAlign: 'center',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>현재 재고</div>
                                            <div style={{ fontSize: '1.25rem', color: '#334155', fontWeight: '900', lineHeight: 1 }}>
                                                {formatQuantity(quickSplitModal.sourceInventory?.remaining_quantity)}개
                                            </div>
                                        </div>

                                        {/* 소분할 수량 박스 (강조 스타일) */}
                                        <div style={{
                                            padding: '14px', backgroundColor: '#fff7ed', borderRadius: '18px',
                                            border: '1px solid #ffedd5', textAlign: 'center',
                                            boxShadow: '0 4px 12px -2px rgba(234, 88, 12, 0.12)'
                                        }}>
                                            <div style={{ fontSize: '0.7rem', color: '#ea580c', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>소분할 수량</div>
                                            <div style={{ fontSize: '1.25rem', color: '#ea580c', fontWeight: '900', lineHeight: 1 }}>
                                                {formatQuantity(quickSplitModal.sourceUseQuantity)}개
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.5rem', color: '#475569' }}>
                                        결과 품목
                                    </label>
                                    <SearchableSelect
                                        options={(quickSplitModal.validTargets || []).map(p => ({
                                            value: p.id,
                                            label: `${p.product_name}${p.weight ? ` ${parseFloat(p.weight)}${p.weight_unit || 'kg'}` : ''}${p.grade ? ` (${p.grade})` : ''} `,
                                            data: p
                                        }))}
                                        value={quickSplitModal.outputProduct?.id || ''}
                                        onChange={(option) => {
                                            const prod = option?.data;
                                            if (prod) {
                                                const curGrams = getWeightInGrams(quickSplitModal.sourceInventory.product_weight || quickSplitModal.sourceInventory.weight, quickSplitModal.sourceInventory.product_weight_unit || quickSplitModal.sourceInventory.weight_unit);
                                                const pGrams = getWeightInGrams(prod.weight, prod.weight_unit);
                                                setQuickSplitModal(prev => ({
                                                    ...prev,
                                                    outputProduct: prod,
                                                    splitCount: Math.round(curGrams / pGrams).toString()
                                                }));
                                            } else {
                                                setQuickSplitModal(prev => ({
                                                    ...prev,
                                                    outputProduct: null,
                                                    splitCount: ''
                                                }));
                                            }
                                        }}
                                        placeholder="품목 검색 및 선택..."
                                        size="normal"
                                    />
                                </div>

                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '1rem', fontWeight: '800', marginBottom: '0.75rem', color: '#1e293b' }}>
                                        원본 재고 중 몇 개를 소분할까요?
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={quickSplitModal.sourceUseQuantity}
                                                onChange={(e) => {
                                                    const maxQty = Math.floor(quickSplitModal.sourceInventory?.remaining_quantity || 0);
                                                    let val = e.target.value.replace(/[^0-9]/g, ''); // 숫자 이외 제거
                                                    const parsed = parseInt(val);
                                                    if (!isNaN(parsed) && parsed > maxQty) val = maxQty.toString();
                                                    setQuickSplitModal(prev => ({ ...prev, sourceUseQuantity: val }));
                                                }}
                                                placeholder="수량 입력"
                                                min="1"
                                                max={quickSplitModal.sourceInventory?.remaining_quantity}
                                                step="1"
                                                style={{
                                                    width: '100%', padding: '1rem 1.25rem', border: '2px solid #3b82f6', borderRadius: '16px',
                                                    fontSize: '1.25rem', fontWeight: '800', outline: 'none', transition: 'all 0.2s',
                                                    backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center'
                                                }}
                                                autoFocus
                                                onFocus={(e) => e.target.select()}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleExecuteQuickSplit();
                                                }}
                                            />
                                            <div style={{ position: 'absolute', right: '1.25rem', top: '50%', transform: 'translateY(-50%)', fontWeight: '700', color: '#3b82f6' }}>개</div>
                                        </div>
                                        <div style={{ fontSize: '1.5rem', color: '#94a3b8' }}>/</div>
                                        <div style={{ padding: '0 1rem', fontSize: '1rem', color: '#64748b', fontWeight: '600' }}>
                                            보유: {formatQuantity(quickSplitModal.sourceInventory?.remaining_quantity)}개
                                        </div>
                                    </div>
                                </div>

                                <div style={{
                                    backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '20px', marginBottom: '1.5rem',
                                    border: '1px solid #f1f5f9'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600' }}>1개당 생성 수량</span>
                                        <span style={{ fontSize: '1rem', color: '#1e293b', fontWeight: '800' }}>
                                            {formatQuantity(quickSplitModal.splitCount)}개 <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'normal' }}>(중량 비율)</span>
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600' }}>1개당 산정 단가</span>
                                        <span style={{ fontSize: '1rem', color: '#1e293b', fontWeight: '800' }}>
                                            {formatCurrency(Math.floor((quickSplitModal.sourceInventory?.unit_price || 0) / (parseFloat(quickSplitModal.splitCount) || 1)))}
                                        </span>
                                    </div>
                                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '1rem 0' }}></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                        <span style={{ fontSize: '1rem', color: '#1e293b', fontWeight: '800', marginBottom: '4px' }}>총 생성 예정 수량</span>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.5rem', color: '#10b981', fontWeight: '900', lineHeight: 1 }}>
                                                {formatQuantity(parseFloat(quickSplitModal.sourceUseQuantity || 0) * parseFloat(quickSplitModal.splitCount || 0))}개
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                                                {quickSplitModal.outputProduct?.product_name || '결과 품목'} 으로 생성됩니다.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                    <button
                                        onClick={() => setQuickSplitModal(prev => ({ ...prev, isOpen: false }))}
                                        style={{
                                            padding: '0.75rem 1.5rem', border: '1px solid #e2e8f0', backgroundColor: 'white',
                                            borderRadius: '12px', cursor: 'pointer', fontWeight: '600', color: '#64748b'
                                        }}
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleExecuteQuickSplit}
                                        style={{
                                            padding: '0.75rem 2rem', border: 'none', backgroundColor: '#f97316',
                                            color: 'white', borderRadius: '12px', cursor: 'pointer', fontWeight: '700',
                                            boxShadow: '0 4px 6px -1px rgba(249, 115, 22, 0.2)'
                                        }}
                                    >
                                        분할 실행
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            )}
            {ConfirmModalComponent}

            <ProductionDetailModal
                isOpen={productionModal.isOpen}
                onClose={() => {
                    setProductionModal({ isOpen: false, productionId: null });
                    loadInventory(); // 취소 가능성이 있으므로 닫을 때 새로고침
                }}
                jobId={productionModal.productionId}
            />
        </div>
    );
};

export default InventoryQuickView;
