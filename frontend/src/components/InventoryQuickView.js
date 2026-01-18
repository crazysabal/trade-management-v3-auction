import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI } from '../services/api';
import { useConfirmModal } from './ConfirmModal';

const InventoryQuickView = ({ inventoryAdjustments = {}, refreshKey, onInventoryLoaded }) => {
    const [inventory, setInventory] = useState([]);
    const [filteredInventory, setFilteredInventory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
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

        // 퀵 추가 완료 후 포커스 복구 및 "자동 다음 행 이동"
        const handleAddComplete = () => {
            recoverListFocus(true);
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

    const loadInventory = async () => {
        setLoading(true);
        try {
            // SaleFromInventory.js와 동일하게 상세 목록(Lot) 조회
            const response = await purchaseInventoryAPI.getAll({ has_remaining: 'true' });
            const data = response.data?.data || response.data || [];
            const validData = Array.isArray(data) ? data : [];

            setInventory(validData);
            setFilteredInventory(validData);
        } catch (error) {
            console.error('재고 조회 실패:', error);
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

        // 검색어 필터링 적용
        if (!searchTerm) {
            setFilteredInventory(adjustedInventory);
        } else {
            const keywords = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            const filtered = adjustedInventory.filter(item => {
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
    }, [inventory, inventoryAdjustments, searchTerm]);

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
    };



    // 헬퍼 함수들 (SaleFromInventory.js와 동일)
    const formatNumber = (value) => new Intl.NumberFormat('ko-KR').format(value || 0);
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
                showCancel: false
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

        // 2. 이벤트 발송
        const event = new CustomEvent('inventory-quick-add', {
            detail: { inventory: item }
        });
        window.dispatchEvent(event);
    };
    // 날짜 포맷 (MM-DD)
    const formatDateShort = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}-${day}`;
    };

    // 품목명 포맷
    const formatProductName = (item) => {
        if (!item) return '';
        const parts = [item.product_name];
        const weight = item.product_weight || item.weight;
        // product_weight 사용 시에는 product_weight_unit을 우선적으로 결합하여 정합성 유지
        const unit = item.product_weight ? (item.product_weight_unit || item.weight_unit || 'kg') : (item.weight_unit || 'kg');
        if (weight && parseFloat(weight) > 0) {
            // parseFloat를 사용하여 불필요한 소수점 0 제거 (5.00 -> 5, 5.50 -> 5.5)
            parts.push(`${parseFloat(weight)}${unit}`);
        }
        return parts.join(' ');
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0.5rem' }}>
            {/* 검색바 */}
            <div style={{ marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="🔍 품목, 매입처, 출하주, 창고 검색 (띄어쓰기로 다중 검색)"
                    value={searchTerm}
                    onChange={handleSearch}
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

            {/* 목록 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>로딩 중...</div>
                ) : filteredInventory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        {searchTerm ? '검색 결과가 없습니다.' : '재고 데이터가 없습니다.'}
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>
                            <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                                <th style={{ width: '40px' }}></th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>품목명</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>출하주</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>등급</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', width: '50px' }}>잔량</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', width: '60px' }}>단가</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>매입처</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>창고</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap', width: '50px' }}>매입일</th>
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
                                            <div style={{ fontWeight: '500' }}>{formatProductName(item)}</div>
                                        </td>
                                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', color: '#666' }}>
                                            {item.sender || '-'}
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap', color: '#666' }}>
                                            {item.grade || '-'}
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
                                            {formatNumber(item.remaining_quantity)}
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
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '0.8rem', color: '#888' }}>
                총 {filteredInventory.length}건 / 재고합계: {formatNumber(filteredInventory.reduce((sum, item) => sum + (parseFloat(item.remaining_quantity) || 0), 0))}
            </div>
            {ConfirmModalComponent}
        </div>
    );
};

export default InventoryQuickView;
