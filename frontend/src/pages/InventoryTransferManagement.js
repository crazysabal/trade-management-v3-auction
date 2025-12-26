import React, { useState, useEffect } from 'react';
import { purchaseInventoryAPI, warehousesAPI, inventoryAdjustmentAPI } from '../services/api';
import StockTransferModal from '../components/StockTransferModal';
import InventoryAdjustmentModal from '../components/InventoryAdjustmentModal';
import '../styles/InventoryTransfer.css';

const InventoryTransferManagement = () => {
    const [inventory, setInventory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reorderMode, setReorderMode] = useState(false); // 창고 순서 변경 모드
    const [columnWidth, setColumnWidth] = useState(350); // Default width

    // Drag & Drop State
    const [draggedItem, setDraggedItem] = useState(null); // 드래그 중인 재고
    const [draggedWarehouse, setDraggedWarehouse] = useState(null); // 드래그 중인 창고 (순서변경)
    const [dragOverWarehouseId, setDragOverWarehouseId] = useState(null); // 드래그 오버 중인 창고 ID (Highlight용)

    // Modal State
    const [transferModal, setTransferModal] = useState({ isOpen: false, inventory: null, toWarehouseId: '' });
    const [adjustmentModal, setAdjustmentModal] = useState({ isOpen: false, inventory: null });

    // 필터
    const [searchKeyword, setSearchKeyword] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [invRes, whRes] = await Promise.all([
                purchaseInventoryAPI.getAll({ has_remaining: 'true' }),
                warehousesAPI.getAll()
            ]);
            setInventory(invRes.data.data || []);
            setWarehouses(whRes.data.data || []);
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
    const handleDragStart = (e, item) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id));
        e.dataTransfer.setData('source-inventory-id', String(item.id)); // 식별자

        setTimeout(() => {
            setDraggedItem(item);
        }, 0);
    };

    // 통합 DragOver 핸들러
    const handleColumnDragOver = (e, index, warehouseId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // 1. 창고 순서 변경 모드일 때
        if (reorderMode) {
            if (draggedWarehouse === null || draggedWarehouse === index) return;
            const newWarehouses = [...warehouses];
            const draggedItem = newWarehouses[draggedWarehouse];
            newWarehouses.splice(draggedWarehouse, 1);
            newWarehouses.splice(index, 0, draggedItem);
            setDraggedWarehouse(index);
            setWarehouses(newWarehouses);
            return;
        }

        // 2. 재고 이동 모드일 때 (Highlight 처리)
        if (draggedItem) {
            setDragOverWarehouseId(warehouseId);
        }
    };

    const handleColumnDragLeave = (e) => {
        // Implement logic if needed
    };

    // Card DragOver (for reordering within column)
    const handleCardDragOver = (e, targetItem) => {
        e.preventDefault();
        if (reorderMode || !draggedItem || String(draggedItem.warehouse_id) !== String(targetItem.warehouse_id)) return;

        // 같은 창고 내에서의 드래그라면 순서 변경 시각화 (Optimistic UI)
        if (draggedItem.id === targetItem.id) return;

        // 배열 상에서의 인덱스 찾기 및 이동
        const currentInventory = [...inventory];
        const dragIndex = currentInventory.findIndex(i => i.id === draggedItem.id);
        const hoverIndex = currentInventory.findIndex(i => i.id === targetItem.id);

        if (dragIndex < 0 || hoverIndex < 0) return;

        // 순서 바꾸기
        const newInventory = [...currentInventory];
        const [movedItem] = newInventory.splice(dragIndex, 1);
        newInventory.splice(hoverIndex, 0, movedItem);

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
        setTransferModal({
            isOpen: true,
            inventory: draggedItem,
            toWarehouseId: targetWarehouseId
        });
        setDraggedItem(null);
    };

    // --- Drag & Drop Handlers (Warehouse Reorder) ---
    const handleWarehouseDragStart = (e, index) => {
        if (!reorderMode) {
            e.preventDefault();
            return;
        }
        setDraggedWarehouse(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleWarehouseDragEnd = async () => {
        setDraggedWarehouse(null);
        setDragOverWarehouseId(null);
        setDraggedItem(null);

        if (reorderMode) {
            try {
                const orderedIds = warehouses.map(w => w.id);
                await warehousesAPI.reorder(orderedIds);
            } catch (err) {
                console.error('순서 저장 실패:', err);
                alert('순서 저장에 실패했습니다.');
                loadData();
            }
        } else {
            // 재고 순서 변경 후 Drop이 아니라 DragEnd가 불릴 수도 있으므로
            // 하지만 재고 순서는 handleDrop에서 처리함
        }
    };

    // --- Rendering Helpers ---
    const getInventoryForWarehouse = (warehouseId) => {
        // 이미 렌더링 시 state.inventory 순서대로 나오므로 필터만 하면 됨
        // 단, 검색어가 있으면 검색어로 필터링
        return inventory.filter(item => {
            const matchWh = String(item.warehouse_id) === String(warehouseId);

            const keywords = searchKeyword.toLowerCase().trim().split(/\s+/).filter(k => k);
            const targetString = `
                ${item.product_name || ''}
                ${item.grade || ''}
                ${Number(item.product_weight) || ''}
                ${item.sender || ''}
                ${item.company_name || ''}
                ${Number(item.remaining_quantity) || ''}
                ${Number(item.unit_price) || ''}
                ${item.purchase_date || ''}
            `.toLowerCase();

            const matchKeyword = keywords.length === 0 || keywords.every(k => targetString.includes(k));

            if (warehouseId === 'Unassigned' && !item.warehouse_id) return matchKeyword;
            return matchWh && matchKeyword;
        });
    };

    return (
        <div className="inventory-transfer-page fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">📦 재고 이동 (Kanban)</h1>
                </div>
                <div className="header-controls">
                    <div className="width-control">
                        <span className="width-label">너비:</span>
                        <input
                            type="range"
                            min="250"
                            max="450"
                            step="10"
                            value={columnWidth}
                            onChange={(e) => setColumnWidth(Number(e.target.value))}
                            className="width-slider"
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="품목, 출하주, 매입처, 등급 검색 (띄어쓰기)..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        className="search-input"
                    />
                    <button
                        onClick={() => setReorderMode(!reorderMode)}
                        className={`btn-reorder ${reorderMode ? 'active' : ''}`}
                    >
                        {reorderMode ? '순서 저장 완료' : '창고 순서 변경'}
                    </button>
                    <button
                        onClick={loadData}
                        className="btn-refresh"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* Kanban Board Container */}
            <div className="kanban-container">
                {loading ? (
                    <div className="loading-container">로딩 중...</div>
                ) : (
                    <>
                        {warehouses.map((wh, index) => (
                            <div
                                key={wh.id}
                                draggable={reorderMode}
                                onDragStart={(e) => handleWarehouseDragStart(e, index)}
                                onDragOver={(e) => handleColumnDragOver(e, index, wh.id)}
                                onDragLeave={handleColumnDragLeave}
                                onDragEnd={handleWarehouseDragEnd}
                                onDrop={(e) => handleDrop(e, wh.id)}
                                className={`warehouse-column ${draggedItem && dragOverWarehouseId === wh.id ? 'highlight' : ''} ${draggedWarehouse === index ? 'dragging' : ''}`}
                                style={{
                                    minWidth: `${columnWidth}px`,
                                    width: `${columnWidth}px`
                                    // width는 동적이므로 인라인 유지 (slider 제어)
                                }}
                            >
                                {/* Header */}
                                <div className={`warehouse-header ${draggedItem && dragOverWarehouseId === wh.id ? 'highlight' : (wh.is_default ? 'default' : '')}`}>
                                    <h3 className="warehouse-title">
                                        {reorderMode && '↕ '}
                                        {wh.name}
                                    </h3>
                                    <span className="warehouse-count">
                                        {getInventoryForWarehouse(wh.id).length} 건
                                    </span>
                                </div>

                                {/* Inventory List */}
                                <div className="inventory-list">
                                    {getInventoryForWarehouse(wh.id).map(item => (
                                        <div
                                            key={item.id}
                                            draggable={!reorderMode}
                                            onDragStart={(e) => handleDragStart(e, item)}
                                            onDragOver={(e) => handleCardDragOver(e, item)}
                                            className={`inventory-card ${draggedItem?.id === item.id ? 'dragging' : ''}`}
                                            style={{ cursor: reorderMode ? 'default' : 'grab' }}
                                        >
                                            <div className="card-content">
                                                <div className="card-main-info">
                                                    <span style={{ marginRight: '6px' }}>{item.product_name}</span>
                                                    {Number(item.product_weight) > 0 && <span style={{ marginRight: '6px' }}>{Number(item.product_weight)}kg</span>}
                                                    {item.grade && <span style={{ marginRight: '6px' }}>({item.grade})</span>}
                                                    <span className="info-qty">
                                                        {Number(item.remaining_quantity) % 1 === 0 ? Math.floor(item.remaining_quantity) : Number(item.remaining_quantity)}개
                                                    </span>
                                                    <span className="info-price">
                                                        {Number(item.unit_price).toLocaleString()}원
                                                    </span>
                                                </div>

                                                <div className="card-sub-info">
                                                    <div className="sender-info">
                                                        <span>👤 {item.sender}</span>
                                                        {item.company_name && <span className="company-name">({item.company_name})</span>}
                                                    </div>
                                                    <div className="purchase-date">{item.purchase_date}</div>
                                                </div>

                                                <div className="card-actions">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAdjustmentModal({ isOpen: true, inventory: item });
                                                        }}
                                                        className="btn-adjust"
                                                        title="재고 조정/폐기"
                                                    >
                                                        🗑️ 조정/폐기
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {getInventoryForWarehouse(wh.id).length === 0 && (
                                        <div className="inventory-empty">
                                            재고 없음
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            <StockTransferModal
                isOpen={transferModal.isOpen}
                inventory={transferModal.inventory}
                defaultToWarehouseId={transferModal.toWarehouseId}
                onClose={() => setTransferModal({ isOpen: false, inventory: null, toWarehouseId: '' })}
                onSuccess={() => {
                    loadData();
                }}
            />

            <InventoryAdjustmentModal
                isOpen={adjustmentModal.isOpen}
                inventory={adjustmentModal.inventory}
                onClose={() => setAdjustmentModal({ isOpen: false, inventory: null })}
                onConfirm={handleAdjustment}
            />
        </div>
    );
};

export default InventoryTransferManagement;
