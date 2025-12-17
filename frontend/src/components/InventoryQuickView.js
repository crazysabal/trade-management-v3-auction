import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI } from '../services/api';

const InventoryQuickView = () => {
    const [inventory, setInventory] = useState([]);
    const [filteredInventory, setFilteredInventory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadInventory();
    }, []);

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

    const handleSearch = (e) => {
        const rawTerm = e.target.value;
        setSearchTerm(rawTerm);

        // 검색어를 공백으로 분리하고 빈 문자열 제거
        const terms = rawTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);

        if (terms.length === 0) {
            setFilteredInventory(inventory);
            return;
        }

        const filtered = inventory.filter(item => {
            // 중량 표시값 계산 (5.00 -> 5)
            const weightRaw = item.weight || item.product_weight;
            const weightStr = weightRaw ? `${parseFloat(weightRaw)}kg` : '';

            // 검색 대상 필드들을 하나의 문자열로 결합
            const searchableText = [
                item.product_name,
                item.company_name,
                item.sender,
                item.shipper_location,
                weightStr,
                item.grade
            ].filter(Boolean).join(' ').toLowerCase();

            // 모든 검색어가 포함되어야 함 (AND 조건)
            return terms.every(term => searchableText.includes(term));
        });
        setFilteredInventory(filtered);
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
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
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
                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: item.remaining_quantity <= 0 ? '#e74c3c' : '#27ae60' }}>
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
