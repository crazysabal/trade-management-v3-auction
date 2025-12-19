import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI } from '../services/api';

const InventoryQuickView = ({ inventoryAdjustments = {}, refreshKey, onInventoryLoaded }) => {
    const [inventory, setInventory] = useState([]);
    const [filteredInventory, setFilteredInventory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadInventory();
    }, [refreshKey]);

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
            const response = await purchaseInventoryAPI.getAll({ status: 'AVAILABLE' });
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
            // ... (rest of logic)
            const terms = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            const filtered = adjustedInventory.filter(item => {
                const searchTarget = `
                    ${item.product_name || ''} 
                    ${item.sender || ''} 
                    ${item.shipper_location || ''} 
                    ${item.grade || ''}
                `.toLowerCase();
                return terms.every(term => searchTarget.includes(term));
            });
            setFilteredInventory(filtered);
        }
    }, [inventory, inventoryAdjustments, searchTerm]);

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
    };



    // 헬퍼 함수들 (SaleFromInventory.js와 동일)
    const formatNumber = (value) => new Intl.NumberFormat('ko-KR').format(value || 0);
    const formatCurrency = (value) => new Intl.NumberFormat('ko-KR').format(value || 0);

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
        const weight = item.weight || item.product_weight;
        if (weight) {
            // parseFloat를 사용하여 불필요한 소수점 0 제거 (5.00 -> 5, 5.50 -> 5.5)
            parts.push(`${parseFloat(weight)}kg`);
        }
        if (item.grade) parts.push(`(${item.grade})`);
        return parts.join(' ');
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 검색바 */}
            <div style={{ marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="품목/매입처/출하주 검색..."
                    value={searchTerm}
                    onChange={handleSearch}
                    style={{
                        width: '100%',
                        padding: '8px',
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
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>품목</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>출하주</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', width: '50px' }}>잔량</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', width: '60px' }}>단가</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>매입처</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap' }}>출하지</th>
                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap', width: '50px' }}>매입일</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInventory.map((item, index) => {
                                const shipperInfo = [item.shipper_location, item.sender].filter(Boolean).join(' / ') || '-';
                                return (
                                    <tr
                                        key={item.id}
                                        style={{ borderBottom: '1px solid #eee', cursor: 'grab' }}
                                        draggable={true}
                                        onDragStart={(e) => {
                                            // 표준 드래그 데이터 설정
                                            e.dataTransfer.effectAllowed = 'copy';
                                            e.dataTransfer.setData('application/json', JSON.stringify(item));
                                        }}
                                    >
                                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                                            <div style={{ fontWeight: '500' }}>{formatProductName(item)}</div>
                                        </td>
                                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', color: '#666' }}>
                                            {item.sender || '-'}
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
                                            {item.shipper_location || '-'}
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
        </div>
    );
};

export default InventoryQuickView;
