import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, warehousesAPI, inventoryAdjustmentAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import StockTransferModal from '../components/StockTransferModal';
import InventoryAdjustmentModal from '../components/InventoryAdjustmentModal';
import InventoryPrintModal from '../components/InventoryPrintModal';
import InventoryDetailModal from '../components/InventoryDetailModal';
import '../styles/InventoryTransfer.css';

const InventoryTransferManagement = () => {
    const [inventory, setInventory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reorderMode, setReorderMode] = useState(false); // 창고 순서 변경 모드
    const [columnWidth, setColumnWidth] = useState(() => {
        const saved = localStorage.getItem('inventory_transfer_column_width');
        return saved ? Number(saved) : 350;
    });

    // Drag & Drop State
    const [draggedItem, setDraggedItem] = useState(null); // 드래그 중인 재고
    const [draggedWarehouse, setDraggedWarehouse] = useState(null); // 드래그 중인 창고 (순서변경)
    const [dragOverWarehouseId, setDragOverWarehouseId] = useState(null); // 드래그 오버 중인 창고 ID (Highlight용)
    const [isHandlePressed, setIsHandlePressed] = useState(false); // 창고 드래그 핸들 눌림 여부

    // Modal State
    const [transferModal, setTransferModal] = useState({ isOpen: false, inventory: null, inventoryList: [], toWarehouseId: '' });
    const [adjustmentModal, setAdjustmentModal] = useState({ isOpen: false, inventory: null });
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [detailModal, setDetailModal] = useState({ isOpen: false, inventoryId: null });
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
    });

    // Multi-Select State
    const [selectedItems, setSelectedItems] = useState(new Set()); // Set of inventory IDs

    // 필터
    const [searchKeyword, setSearchKeyword] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    // 컬럼 너비 설정 저장
    useEffect(() => {
        localStorage.setItem('inventory_transfer_column_width', columnWidth);
    }, [columnWidth]);

    const loadData = async () => {
        setLoading(true);
        setSelectedItems(new Set()); // 새로고침 시 선택 초기화
        setSearchKeyword(''); // 새로고침 시 검색 필터 초기화
        try {
            const [invRes, whRes] = await Promise.all([
                purchaseInventoryAPI.getAll({ has_remaining: 'true' }),
                warehousesAPI.getAll()
            ]);
            setInventory(invRes.data.data || []);
            // 미사용이면서 재고가 없는 창고는 표시하지 않음
            const filteredWarehouses = (whRes.data.data || []).filter(w => w.is_active || w.stock_count > 0);
            setWarehouses(filteredWarehouses);
        } catch (error) {
            console.error('Data load error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdjustment = async (data) => {
        await inventoryAdjustmentAPI.create(data);
        loadData(); // Reload to reflect changes
    };

    // --- Drag & Drop Handlers (Inventory) ---
    // --- Drag & Drop Handlers (Inventory) ---
    const handleDragStart = (e, item) => {
        e.stopPropagation();

        let draggedItems = [];
        // 만약 드래그하는 아이템이 선택된 상태라면, 선택된 모든 아이템을 함께 드래그
        if (selectedItems.has(item.id)) {
            // 현재 선택된 아이템들 (선택 순서 유지)
            // Set은 삽입 순서를 유지하므로, selectedItems를 순회하면 클릭한 순서대로 정렬됨
            const inventoryMap = new Map(inventory.map(i => [i.id, i]));
            draggedItems = Array.from(selectedItems)
                .map(id => inventoryMap.get(id))
                .filter(item => item !== undefined);
        } else {
            // 선택되지 않은 아이템을 드래그하면 단일 드래그로 처리 (혹은 선택 초기화 후 단일?)
            // UX: 보통 선택되지 않은 아이템을 잡으면 그것만 드래그됨
            draggedItems = [item];
        }

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id)); // Primary ID for compatibility
        e.dataTransfer.setData('application/json', JSON.stringify(draggedItems)); // Full payload
        e.dataTransfer.setData('source-inventory-id', String(item.id));

        setTimeout(() => {
            setDraggedItem(item); // Highlight effect for the primary dragged item
        }, 0);
    };


    // Card DragOver (for reordering within column)
    const handleCardDragOver = (e, targetItem) => {
        e.preventDefault();
        if (reorderMode || !draggedItem || String(draggedItem.warehouse_id) !== String(targetItem.warehouse_id)) return;

        // 다중 선택 여부 확인
        const isMultiSelect = selectedItems.has(draggedItem.id);
        const movingIds = isMultiSelect ? selectedItems : new Set([draggedItem.id]);

        // 타겟이 이동 그룹에 포함되어 있으면 무시
        if (movingIds.has(targetItem.id)) return;

        // 1. 현재 인벤토리에서 이동할 아이템들과 나머지 아이템들 분리
        const currentInventory = [...inventory];

        // 이동할 아이템들 (현재 순서 유지)
        const movingItems = currentInventory.filter(i => movingIds.has(i.id));
        // 나머지 아이템들
        const remainingItems = currentInventory.filter(i => !movingIds.has(i.id));

        // 2. 타겟 위치 찾기 (나머지 아이템들 기준)
        const targetIndex = remainingItems.findIndex(i => i.id === targetItem.id);
        if (targetIndex < 0) return;

        // 3. 타겟 위치에 이동 그룹 삽입 (Insert Before)
        // 마우스 위치에 따라 After/Before 구분하면 더 좋지만, 간단히 Insert Before로 구현
        const newInventory = [
            ...remainingItems.slice(0, targetIndex),
            ...movingItems,
            ...remainingItems.slice(targetIndex)
        ];

        setInventory(newInventory); // 화면상 즉시 반영
    };


    const handleDrop = async (e, targetWarehouseId) => {
        e.preventDefault();
        setDragOverWarehouseId(null);

        if (reorderMode) return;
        if (!draggedItem) return;

        // 같은 창고로 드롭하면 -> 순서 저장
        if (String(draggedItem.warehouse_id) === String(targetWarehouseId)) {
            // 이미 handleCardDragOver에서 state는 업데이트됨
            // 서버에 현재 순서 저장
            const warehouseItems = getInventoryForWarehouse(targetWarehouseId);
            const orderedIds = warehouseItems.map(item => item.id);

            try {
                // API 호출 (purchaseInventoryAPI.reorder 구현 필요 - api.js에 추가해야함)
                // 지금은 services/api.js에 추가되지 않았으므로 여기서는 직접 호출하거나 추가해야함
                // 하지만 일단 api.js에 추가되지 않았으므로 axios 직접 호출 대신, api.js에 추가하는 것이 맞음.
                // 임시로 직접 호출 로직을 넣을 순 없으니, api.js에 reorder가 있다고 가정.
                await purchaseInventoryAPI.reorder(orderedIds);
            } catch (err) {
                console.error('순서 저장 실패', err);
                loadData(); // 롤백
            }

            setDraggedItem(null);
            return;
        }

        // 다른 창고로 드롭하면 -> 이동 모달 열기
        // 드래그된 데이터 파싱
        let inventoryList = [];
        try {
            const jsonData = e.dataTransfer.getData('application/json');
            if (jsonData) {
                inventoryList = JSON.parse(jsonData);
            } else {
                inventoryList = [draggedItem];
            }
        } catch (err) {
            inventoryList = [draggedItem];
        }

        // 이동 불가 케이스: 다중 이동 시 다른 창고에 있는 아이템들이 섞여있다면?
        // 백엔드/모달 로직 상 문제는 없지만, 단일 창고로 이동하게 됨. 기능상 OK.

        setTransferModal({
            isOpen: true,
            inventory: inventoryList.length === 1 ? inventoryList[0] : null,
            inventoryList: inventoryList,
            toWarehouseId: targetWarehouseId
        });
        setDraggedItem(null);
    };

    const toggleSelection = (e, id) => {
        e.stopPropagation();
        const newSet = new Set(selectedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedItems(newSet);
    };

    const handleToggleWarehouseSelection = (e, items) => {
        e.stopPropagation();
        if (!items || items.length === 0) return;

        const newSet = new Set(selectedItems);
        const allInWarehouseSelected = items.every(item => newSet.has(item.id));

        if (allInWarehouseSelected) {
            // 해당 창고 아이템 모두 해제
            items.forEach(item => newSet.delete(item.id));
        } else {
            // 해당 창고 아이템 모두 선택 추가
            items.forEach(item => newSet.add(item.id));
        }
        setSelectedItems(newSet);
    };

    // --- Drag & Drop Handlers (Warehouse Reorder) ---
    const handleWarehouseDragStart = (e, index) => {
        if (!isHandlePressed) {
            e.preventDefault();
            return;
        }
        setDraggedWarehouse(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleColumnDragOver = (e, index, warehouseId) => {
        e.preventDefault();

        // 1. 창고 순서 변경 (드래그 중인 것이 창고인 경우)
        if (draggedWarehouse !== null && draggedWarehouse !== index) {
            const newWarehouses = [...warehouses];
            const draggedWh = newWarehouses[draggedWarehouse];
            newWarehouses.splice(draggedWarehouse, 1);
            newWarehouses.splice(index, 0, draggedWh);
            setWarehouses(newWarehouses);
            setDraggedWarehouse(index); // 새로운 인덱스로 업데이트하여 부드러운 위치 변경 유도
            return;
        }

        // 2. 재고 이동시 타겟 창고 강조 (드래그 중인 것이 재고인 경우)
        if (draggedItem && String(draggedItem.warehouse_id) !== String(warehouseId)) {
            setDragOverWarehouseId(warehouseId);
        }
    };

    const handleColumnDragLeave = () => {
        // 특별한 로직 필요 없음 (Highlight는 Drop이나 End에서 정리)
    };

    const handleWarehouseDragEnd = async () => {
        setDraggedWarehouse(null);
        setDragOverWarehouseId(null);
        setDraggedItem(null);
        setIsHandlePressed(false); // Reset handle state

        try {
            const orderedIds = warehouses.map(w => w.id);
            await warehousesAPI.reorder(orderedIds);
        } catch (err) {
            console.error('순서 저장 실패:', err);
            loadData();
        }
    };

    // --- Print Handler ---
    const handlePrint = () => {
        setPrintModalOpen(true);
    };

    // 날짜 포맷 (MM-DD)
    const formatDateShort = (dateString) => {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${month}-${day}`;
        } catch (e) {
            return dateString;
        }
    };

    // 1. 검색어로 필터링된 전체 인벤토리 (useMemo로 최적화 및 통계 계산용)
    const filteredInventory = React.useMemo(() => {
        const keywords = searchKeyword.toLowerCase().trim().split(/\s+/).filter(k => k);

        return inventory.filter(item => {
            if (keywords.length === 0) return true;

            // product_weight 사용 시에는 product_weight_unit을 우선적으로 결합하여 정합성 유지
            const unit = item.product_weight ? (item.product_weight_unit || item.weight_unit || 'kg') : (item.weight_unit || 'kg');
            const weightStr = Number(item.product_weight) > 0 ? ` ${Number(item.product_weight)}${unit}` : '';

            const targetString = `
                ${item.product_name || ''}
                ${item.grade || ''}
                ${weightStr}
                ${item.sender || ''}
                ${item.company_name || ''}
                ${item.business_name || ''}
                ${Number(item.remaining_quantity) || ''}
                ${Number(item.unit_price) || ''}
                ${item.purchase_date || ''}
            `.toLowerCase();

            return keywords.every(k => targetString.includes(k));
        });
    }, [inventory, searchKeyword]);

    // 2. 창고별 인벤토리 가져오기 (filteredInventory 기반)
    const getInventoryForWarehouse = (warehouseId) => {
        return filteredInventory.filter(item => {
            if (warehouseId === 'Unassigned') return !item.warehouse_id;
            return String(item.warehouse_id) === String(warehouseId);
        });
    };

    // 3. 통계 계산 Helper
    const calculateStats = (items) => {
        const count = items.length;
        const totalQuantity = items.reduce((sum, item) => sum + Number(item.remaining_quantity), 0);
        const totalValue = items.reduce((sum, item) => sum + (Number(item.remaining_quantity) * Number(item.unit_price)), 0);
        return { count, totalQuantity, totalValue };
    };

    const totalStats = calculateStats(filteredInventory);

    return (
        <div className="inventory-transfer-page fade-in">
            <div className="page-header">
                <div className="header-controls" style={{ marginLeft: 0, width: '100%', justifyContent: 'flex-start', gap: '1rem' }}>
                    <div className="search-wrapper">
                        <input
                            type="text"
                            placeholder="🔍 품목, 화주, 매입처... (필터링)"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            className={`search-input ${searchKeyword ? 'filtered' : ''}`}
                            style={{ width: '380px' }} // Width control via slider or fixed
                        />
                        {searchKeyword && (
                            <button
                                onClick={() => setSearchKeyword('')}
                                className="btn-filter-clear"
                                title="필터 초기화"
                            >
                                &times;
                            </button>
                        )}
                    </div>
                    <button
                        onClick={loadData}
                        className="btn-refresh"
                    >
                        새로고침
                    </button>
                    <button
                        className="btn-print"
                        onClick={handlePrint}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        🖨 목록 출력
                    </button>

                    {/* 전체 재고 통계 (우측 정렬) */}
                    <div className={`stats-summary-container ${searchKeyword ? 'filtered' : ''}`}>
                        <span className={`stats-label ${searchKeyword ? 'filtered' : ''}`}>
                            {searchKeyword ? '🔍 검색 건수: ' : '전체 재고: '}
                            <strong className={searchKeyword ? 'stats-value filtered' : ''} style={{ color: !searchKeyword ? '#1e293b' : undefined }}>
                                {totalStats.count}건
                                {searchKeyword && ` / 전체 ${inventory.length}건`}
                            </strong>
                        </span>
                        <div className={`stats-divider ${searchKeyword ? 'filtered' : ''}`}></div>
                        <span className={`stats-label ${searchKeyword ? 'filtered' : ''}`}>
                            {searchKeyword ? '결과 수량: ' : '전체 수량: '}
                            <strong className={searchKeyword ? 'stats-value filtered' : ''} style={{ color: !searchKeyword ? '#1e293b' : undefined }}>
                                {totalStats.totalQuantity.toLocaleString()}개
                            </strong>
                        </span>
                        <div className={`stats-divider ${searchKeyword ? 'filtered' : ''}`}></div>
                        <span style={{ color: '#64748b' }}>
                            {searchKeyword ? '결과 금액: ' : '총 재고금액: '}
                            <strong className={searchKeyword ? 'stats-value filtered' : ''} style={{ color: !searchKeyword ? '#2563eb' : undefined }}>
                                {Math.floor(totalStats.totalValue).toLocaleString()}원
                            </strong>
                        </span>
                    </div>
                </div>
            </div>

            {/* Kanban Board Container */}
            <div className="kanban-container">
                {loading ? (
                    <div className="loading-container">로딩 중...</div>
                ) : (
                    <>
                        {warehouses.map((wh, index) => {
                            const whData = getInventoryForWarehouse(wh.id);
                            const whStats = calculateStats(whData);
                            return (
                                <div
                                    key={wh.id}
                                    draggable={isHandlePressed}
                                    onDragStart={(e) => handleWarehouseDragStart(e, index)}
                                    onDragOver={(e) => handleColumnDragOver(e, index, wh.id)}
                                    onDragLeave={handleColumnDragLeave}
                                    onDragEnd={handleWarehouseDragEnd}
                                    onDrop={(e) => handleDrop(e, wh.id)}
                                    className={`warehouse-column ${draggedItem && dragOverWarehouseId === wh.id ? 'highlight' : ''} ${draggedWarehouse === index ? 'dragging' : ''}`}
                                    style={{
                                        width: 'auto',
                                        flexShrink: 0
                                    }}
                                >
                                    {/* Header */}
                                    <div className={`warehouse-header ${draggedItem && dragOverWarehouseId === wh.id ? 'highlight' : (wh.is_default ? 'default' : '')}`}>
                                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                                            <div
                                                className="warehouse-drag-handle"
                                                onMouseDown={() => setIsHandlePressed(true)}
                                                onMouseUp={() => setIsHandlePressed(false)}
                                                title="드래그하여 순서 변경"
                                            >
                                                ⋮⋮
                                            </div>
                                            <h3 className="warehouse-title" style={{ margin: 0 }}>
                                                {wh.name} {!wh.is_active && <span className="inactive-label">(비활성)</span>}
                                            </h3>

                                            {whData.length > 0 && (
                                                <button
                                                    onClick={(e) => handleToggleWarehouseSelection(e, whData)}
                                                    className={`btn-select-all ${whData.every(item => selectedItems.has(item.id)) ? 'active' : ''}`}
                                                    title="전체 선택/해제"
                                                >
                                                    ✓ 전체 선택
                                                </button>
                                            )}

                                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="warehouse-count">
                                                    {whStats.count} 건
                                                </span>
                                                <span style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                    {Math.floor(whStats.totalValue).toLocaleString()} 원
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inventory List */}
                                    <div className="inventory-list">
                                        {whData.map(item => (
                                            <div
                                                key={item.id}
                                                draggable={true}
                                                onDragStart={(e) => handleDragStart(e, item)}
                                                onDragOver={(e) => handleCardDragOver(e, item)}
                                                onClick={(e) => toggleSelection(e, item.id)}
                                                data-order={[...selectedItems].indexOf(item.id) + 1}
                                                className={`inventory-card ${draggedItem?.id === item.id ? 'dragging' : ''} ${selectedItems.has(item.id) ? 'selected' : ''}`}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="card-content">
                                                    <div className="card-main-info" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ color: '#1e293b' }}>
                                                            {item.product_name}
                                                            {Number(item.product_weight) > 0 && ` ${Number(item.product_weight)}${item.product_weight_unit || item.weight_unit || 'kg'}`}
                                                        </span>
                                                        <span style={{ color: '#cbd5e1' }}>/</span>
                                                        <span style={{ fontWeight: '600', color: '#1e293b' }}>{item.sender}</span>
                                                        <span style={{ color: '#cbd5e1' }}>/</span>
                                                        {item.grade ? (
                                                            <span className="grade-badge">
                                                                {item.grade}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#1e293b' }}>-</span>
                                                        )}

                                                        <span style={{ flex: 1 }}></span> {/* Spacer */}

                                                        <span className="info-qty" style={{ fontWeight: 'bold', color: '#2980b9' }}>
                                                            {Number(item.remaining_quantity) % 1 === 0 ? Math.floor(item.remaining_quantity) : Number(item.remaining_quantity)}개
                                                        </span>
                                                        <span className="info-price" style={{ color: '#555' }}>
                                                            {Number(item.unit_price).toLocaleString()}원
                                                        </span>
                                                    </div>

                                                    <div className="card-sub-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid #f0f0f0', paddingTop: '4px' }}>
                                                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: '#7f8c8d', alignItems: 'center', lineHeight: '1' }}>
                                                            <span title={item.business_name}>{item.company_name || '-'}</span>
                                                            <span style={{ fontSize: '0.7rem', color: '#bdc3c7' }}>|</span>
                                                            <span>{formatDateShort(item.purchase_date)}</span>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setAdjustmentModal({ isOpen: true, inventory: item });
                                                                }}
                                                                className="btn-adjust"
                                                                title="재고 조정/폐기"
                                                                style={{ margin: 0 }}
                                                            >
                                                                🗑️ 조정/폐기
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDetailModal({ isOpen: true, inventoryId: item.id });
                                                                }}
                                                                className="btn-detail"
                                                                title="매입 상세 보기"
                                                            >
                                                                🔍
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {whData.length === 0 && (
                                            <div className="inventory-empty">
                                                재고 없음
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            <StockTransferModal
                isOpen={transferModal.isOpen}
                inventory={transferModal.inventory}
                inventoryList={transferModal.inventoryList}
                defaultToWarehouseId={transferModal.toWarehouseId}
                onClose={() => setTransferModal({ isOpen: false, inventory: null, inventoryList: [], toWarehouseId: '' })}
                onSuccess={() => {
                    loadData();
                    setSelectedItems(new Set()); // Clear selection after successful transfer
                }}
            />

            <InventoryAdjustmentModal
                isOpen={adjustmentModal.isOpen}
                inventory={adjustmentModal.inventory}
                onClose={() => setAdjustmentModal({ ...adjustmentModal, isOpen: false })}
                onConfirm={handleAdjustment}
            />

            <InventoryPrintModal
                isOpen={printModalOpen}
                onClose={() => setPrintModalOpen(false)}
                inventory={inventory}
                warehouses={warehouses}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                type={confirmModal.type}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                confirmText="확인"
                showCancel={false}
            />

            <InventoryDetailModal
                isOpen={detailModal.isOpen}
                inventoryId={detailModal.inventoryId}
                onClose={() => setDetailModal({ isOpen: false, inventoryId: null })}
            />
        </div>
    );
};

export default InventoryTransferManagement;
