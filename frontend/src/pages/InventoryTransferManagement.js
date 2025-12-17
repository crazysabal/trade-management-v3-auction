import React, { useState, useEffect, useRef } from 'react';
import { purchaseInventoryAPI, warehousesAPI, inventoryAdjustmentAPI } from '../services/api';
import StockTransferModal from '../components/StockTransferModal';
import InventoryAdjustmentModal from '../components/InventoryAdjustmentModal';

const InventoryTransferManagement = () => {
    const [inventory, setInventory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reorderMode, setReorderMode] = useState(false); // 창고 순서 변경 모드
    const [columnWidth, setColumnWidth] = useState(320); // Default width

    // Drag & Drop State
    const [draggedItem, setDraggedItem] = useState(null); // 드래그 중인 재고
    const [draggedWarehouse, setDraggedWarehouse] = useState(null); // 드래그 중인 창고 (순서변경)
    const [dragOverWarehouseId, setDragOverWarehouseId] = useState(null); // 드래그 오버 중인 창고 ID (Highlight용)

    // Modal State
    const [transferModal, setTransferModal] = useState({ isOpen: false, inventory: null, toWarehouseId: '' });
    const [adjustmentModal, setAdjustmentModal] = useState({ isOpen: false, inventory: null }); // 여기서 선언


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
        e.stopPropagation(); // 중요: 부모(창고 컬럼)로 이벤트 전파 방지 (부모의 preventDefault 실행 막기)

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id));

        // 중요: 드래그 시작 직후 DOM이 변경되면 드래그가 취소될 수 있으므로 state 업데이트를 지연시킴
        setTimeout(() => {
            setDraggedItem(item);
        }, 0);
    };

    // 통합 DragOver 핸들러
    const handleColumnDragOver = (e, index, warehouseId) => {
        e.preventDefault(); // 항상 Drop 허용을 위해 호출

        // 중요: dropEffect를 명시해야 드롭이 가능한 브라우저가 있음
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
        if (draggedItem && String(draggedItem.warehouse_id) !== String(warehouseId)) {
            setDragOverWarehouseId(warehouseId);
        }
    };

    const handleColumnDragLeave = (e) => {
        // 관련된 타겟을 벗어났을 때만 해제 (자식 요소 진입 시 깜빡임 방지 로직 필요할 수 있음)
        // 여기서는 단순화하여 처리 or onDrop/onDragEnd에서 초기화
    };

    const handleDrop = (e, targetWarehouseId) => {
        e.preventDefault();
        setDragOverWarehouseId(null); // Highlight 해제

        if (reorderMode) return; // 순서 변경 모드면 무시 (handleWarehouseDragEnd에서 처리)

        if (!draggedItem) return;

        // 같은 창고로 드롭하면 무시
        if (String(draggedItem.warehouse_id) === String(targetWarehouseId)) {
            setDraggedItem(null);
            return;
        }

        // 이동 모달 열기
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
            // 서버에 순서 저장
            try {
                const orderedIds = warehouses.map(w => w.id);
                await warehousesAPI.reorder(orderedIds);
                // 성공 알림 생략 혹은 Toast
            } catch (err) {
                console.error('순서 저장 실패:', err);
                alert('순서 저장에 실패했습니다.');
                loadData(); // 실패 시 롤백
            }
        }
    };

    // --- Rendering Helpers ---
    const getInventoryForWarehouse = (warehouseId) => {
        return inventory.filter(item => {
            const matchWh = String(item.warehouse_id) === String(warehouseId);

            // 다중 검색 로직 (띄어쓰기 AND 조건)
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

            // 미지정 처리
            if (warehouseId === 'Unassigned' && !item.warehouse_id) return matchKeyword;

            return matchWh && matchKeyword;
        });
    };

    return (
        <div className="inventory-transfer-page fade-in" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title" style={{ margin: 0 }}>📦 재고 이동 (Kanban)</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem', backgroundColor: '#f1f2f6', padding: '0.2rem 0.8rem', borderRadius: '20px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>너비:</span>
                        <input
                            type="range"
                            min="250"
                            max="450"
                            step="10"
                            value={columnWidth}
                            onChange={(e) => setColumnWidth(Number(e.target.value))}
                            style={{ width: '100px', cursor: 'pointer' }}
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="품목, 출하주, 매입처, 등급 검색 (띄어쓰기)..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', width: '300px' }}
                    />
                    <button
                        onClick={() => setReorderMode(!reorderMode)}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: reorderMode ? '#e74c3c' : '#34495e',
                            color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}
                    >
                        {reorderMode ? '순서 저장 완료' : '창고 순서 변경'}
                    </button>
                    <button
                        onClick={loadData}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* Kanban Board Container */}
            <div style={{
                flex: 1,
                display: 'flex',
                gap: '1rem',
                overflowX: 'auto',
                paddingBottom: '1rem',
                alignItems: 'flex-start'
            }}>
                {loading ? (
                    <div style={{ padding: '2rem' }}>로딩 중...</div>
                ) : (
                    <>
                        {/* 2. 등록된 창고들 */}
                        {warehouses.map((wh, index) => (
                            <div
                                key={wh.id}
                                draggable={reorderMode}
                                onDragStart={(e) => handleWarehouseDragStart(e, index)}
                                onDragOver={(e) => handleColumnDragOver(e, index, wh.id)}
                                onDragLeave={handleColumnDragLeave}
                                onDragEnd={handleWarehouseDragEnd}
                                onDrop={(e) => handleDrop(e, wh.id)}
                                style={{
                                    minWidth: `${columnWidth}px`,
                                    width: `${columnWidth}px`,
                                    backgroundColor: (draggedItem && dragOverWarehouseId === wh.id) ? '#e6fffa' : '#f8f9fa', // Highlight
                                    borderRadius: '8px',
                                    border: (draggedItem && dragOverWarehouseId === wh.id) ? '2px dashed #38b2ac' : '1px solid #e9ecef', // Highlight Border
                                    display: 'flex',
                                    flexDirection: 'column',
                                    maxHeight: '100%',
                                    cursor: reorderMode ? 'move' : 'default',
                                    opacity: (draggedWarehouse === index) ? 0.5 : 1,
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}
                            >
                                {/* Header */}
                                <div style={{
                                    padding: '1rem',
                                    borderBottom: '1px solid #e9ecef',
                                    backgroundColor: (draggedItem && dragOverWarehouseId === wh.id) ? '#b2f5ea' : (wh.is_default ? '#e3f2fd' : 'white'),
                                    borderTopLeftRadius: '8px',
                                    borderTopRightRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#2c3e50' }}>
                                        {reorderMode && '↕ '}
                                        {wh.name}
                                    </h3>
                                    <span style={{ fontSize: '0.8rem', color: '#7f8c8d', backgroundColor: '#eee', padding: '2px 6px', borderRadius: '10px' }}>
                                        {getInventoryForWarehouse(wh.id).length} 건
                                    </span>
                                </div>

                                {/* Inventory List (Scrollable) */}
                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '0.5rem',
                                    minHeight: '100px'
                                }}>
                                    {getInventoryForWarehouse(wh.id).map(item => (
                                        <div
                                            key={item.id}
                                            draggable={!reorderMode}
                                            onDragStart={(e) => handleDragStart(e, item)}
                                            style={{
                                                backgroundColor: 'white',
                                                padding: '0.8rem',
                                                marginBottom: '0.5rem',
                                                borderRadius: '6px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                                border: '1px solid #eee',
                                                cursor: reorderMode ? 'default' : 'grab',
                                                opacity: (draggedItem?.id === item.id) ? 0.5 : 1,
                                                userSelect: 'none' // 텍스트 선택 방지 (드래그 향상)
                                            }}
                                        >
                                            {/* Single Line Main Info (Grid Layout) */}
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr auto 1fr',
                                                alignItems: 'center',
                                                fontWeight: 'bold',
                                                fontSize: '0.95rem',
                                                color: '#333',
                                                marginBottom: '0.4rem',
                                                gap: '8px'
                                            }}>
                                                <div style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                                    {item.product_name} {Number(item.product_weight)}kg ({item.grade})
                                                </div>
                                                <div style={{ textAlign: 'center', color: '#2980b9', whiteSpace: 'nowrap' }}>
                                                    {Number(item.remaining_quantity) % 1 === 0 ? Math.floor(item.remaining_quantity) : Number(item.remaining_quantity)}개
                                                </div>
                                                <div style={{ textAlign: 'right', color: '#555', whiteSpace: 'nowrap' }}>
                                                    {Number(item.unit_price).toLocaleString()}원
                                                </div>
                                            </div>

                                            {/* Sub Info (Sender & Date) */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginTop: '0.5rem',
                                                paddingTop: '0.5rem',
                                                borderTop: '1px solid #f3f4f6',
                                                fontSize: '0.8rem',
                                                color: '#6b7280'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                                                    <span>👤</span>
                                                    <span title={item.sender}>{item.sender}</span>
                                                    {item.company_name && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({item.company_name})</span>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>{item.purchase_date}</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAdjustmentModal({ isOpen: true, inventory: item });
                                                        }}
                                                        style={{
                                                            padding: '2px 6px',
                                                            fontSize: '0.7rem',
                                                            backgroundColor: '#fff',
                                                            border: '1px solid #e74c3c',
                                                            color: '#e74c3c',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                        title="재고 조정/폐기"
                                                    >
                                                        폐기
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {getInventoryForWarehouse(wh.id).length === 0 && (
                                        <div style={{ textAlign: 'center', color: '#adb5bd', fontSize: '0.9rem', padding: '2rem 0' }}>
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
