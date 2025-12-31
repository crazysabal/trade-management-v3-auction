import React, { useState, useMemo, useEffect, useRef } from 'react';
import { inventoryAuditAPI, purchaseInventoryAPI } from '../../services/api';

const AuditScanner = ({ audit, items, onUpdate, isSaving, onRefresh, reorderMode, setReorderMode }) => {
    const [search, setSearch] = useState('');
    const [filterWithDiff, setFilterWithDiff] = useState(false);
    const [localItems, setLocalItems] = useState([]);
    const [isReordering, setIsReordering] = useState(false);

    // DnD State
    // DnD State
    const [draggingId, setDraggingId] = useState(null); // ID of item being dragged
    const [dragOverlayStyle, setDragOverlayStyle] = useState(null); // Style for the floating overlay
    const [dropTarget, setDropTarget] = useState(null); // Visual highlight for drop target

    const dragItemIndex = useRef(null); // Current index in localItems
    const dropTargetIndex = useRef(null); // Calculated target index
    const touchStart = useRef({ y: 0, top: 0, height: 0 }); // Initial metrics
    const itemRefs = useRef({}); // DOM refs
    const itemsRef = useRef([]); // Ref to hold up-to-date items for sync access causing events

    useEffect(() => {
        setLocalItems(items);
        itemsRef.current = items;
    }, [items]);

    const filteredItems = useMemo(() => {
        const sourceItems = reorderMode ? localItems : items;

        return sourceItems.filter(item => {
            // 차이 항목만 보기 필터
            const systemQty = parseFloat(item.system_quantity);
            const actualQty = parseFloat(item.actual_quantity);
            const hasDiff = systemQty !== actualQty;

            if (filterWithDiff && !hasDiff) return false;

            if (!search.trim()) return true;

            const keywords = search.toLowerCase().trim().split(/\s+/).filter(k => k);
            const unitCost = parseFloat(item.unit_cost || 0);

            const searchableText = [
                item.product_name || '',
                item.product_weight ? `${parseFloat(item.product_weight)}kg` : '',
                item.sender || '',
                item.grade || '',
                systemQty.toString(),
                Math.floor(actualQty).toString(), // 실사 수량도 검색 대상에 포함
                item.purchase_store_name || '',
                item.purchase_date || ''
            ].join(' ').toLowerCase();

            return keywords.every(k => searchableText.includes(k));
        });
    }, [items, localItems, reorderMode, search, filterWithDiff]);

    const handleMatch = (item) => {
        onUpdate([{ id: item.id, actual_quantity: item.system_quantity }]);
    };

    const adjustQty = (item, delta) => {
        const currentCharge = parseInt(item.actual_quantity) || 0;
        const next = Math.max(0, currentCharge + delta);
        onUpdate([{ id: item.id, actual_quantity: next, is_checked: false }]);
    };

    const handleQtyChange = (itemId, value) => {
        const numValue = parseInt(value) || 0;
        onUpdate([{ id: itemId, actual_quantity: numValue, is_checked: false }]);
    };

    const handleCheck = (item) => {
        onUpdate([{
            id: item.id,
            is_checked: !item.is_checked,
            actual_quantity: item.actual_quantity
        }]);
    };

    const toggleReorder = () => {
        if (!reorderMode) {
            // 필터가 있는지 확인
            if (search.trim() || filterWithDiff) {
                alert('순서 변경은 전체 목록에서만 가능합니다.\n검색어와 필터를 해제해주세요.');
                return;
            }
            setLocalItems([...items]);
            setReorderMode(true);
        } else {
            // 완료 (Auto Saved 상태이므로 모드 종료)
            setReorderMode(false);
            setLocalItems([]);
            onRefresh(); // Ensure data sync on exit
        }
    };

    const handleAutoSave = async (itemsToSave) => {
        setIsReordering(true);
        try {
            const orderedIds = itemsToSave.map(item => item.inventory_id || item.purchase_inventory_id);
            if (orderedIds.some(id => !id)) {
                console.error('Missing IDs for auto-save');
                return;
            }
            // Silent save
            await purchaseInventoryAPI.reorder(orderedIds);
            // We do NOT refresh here to prevent jumpiness, we refresh on Close.
        } catch (error) {
            console.error('Auto-save failed:', error);
            alert('순서 저장에 실패했습니다.');
        } finally {
            setIsReordering(false);
        }
    };

    // --- Touch Drag & Drop Logic (Overlay Pattern + Global Listeners) ---
    const handleTouchStart = (e, index, item) => {
        // Prevent default to avoid scrolling/refresh?
        // Usually better to let user scroll if they don't hold the handle, 
        // but since this IS the handle event, we might want to prevent default.
        // e.preventDefault(); 

        // Sync Data Snapshop
        itemsRef.current = [...localItems];

        const el = itemRefs.current[index];
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const touchY = e.touches[0].clientY;

        // Init Refs
        dragItemIndex.current = index;
        dropTargetIndex.current = index; // Init target as self
        touchStart.current = {
            y: touchY,
            top: rect.top,
            height: rect.height,
            width: rect.width,
            left: rect.left
        };

        // Init State for Overlay
        setDraggingId(item.id);
        setDragOverlayStyle({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            yOffset: 0
        });

        // Attach Global Listeners
        window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
        window.addEventListener('touchend', handleWindowTouchEnd);
        window.addEventListener('touchcancel', handleWindowTouchEnd);
    };

    const handleWindowTouchMove = (e) => {
        if (dragItemIndex.current === null) return;
        if (e.cancelable) e.preventDefault(); // Stop scrolling globally while dragging

        const touchY = e.touches[0].clientY;
        const deltaY = touchY - touchStart.current.y;

        // Update Overlay Position
        setDragOverlayStyle(prev => {
            if (!prev) return null;
            return {
                ...prev,
                yOffset: deltaY
            };
        });

        // Find Closest Item Logic (Robust)
        const currentCenterY = touchStart.current.top + deltaY + (touchStart.current.height / 2);
        let closestIndex = dragItemIndex.current;
        let minDistance = Number.MAX_VALUE;

        const currentItems = itemsRef.current;
        for (let idx = 0; idx < currentItems.length; idx++) {
            const el = itemRefs.current[idx];
            if (!el) continue;

            const rect = el.getBoundingClientRect();
            const targetCenterY = rect.top + (rect.height / 2);
            const distance = Math.abs(currentCenterY - targetCenterY);

            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = idx;
            }
        }

        // Only update if changed
        dropTargetIndex.current = closestIndex;

        // Update Visual State (with check to avoid excess renders)
        setDropTarget(prev => prev === closestIndex ? prev : closestIndex);
    };

    const handleWindowTouchEnd = () => {
        const fromIndex = dragItemIndex.current;
        const toIndex = dropTargetIndex.current;

        console.log('TouchEnd:', { fromIndex, toIndex });

        if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
            // Double check bounds
            if (toIndex >= 0 && toIndex < itemsRef.current.length) {
                const newItems = [...itemsRef.current];
                const [moved] = newItems.splice(fromIndex, 1);
                newItems.splice(toIndex, 0, moved);

                setLocalItems(newItems);
                itemsRef.current = newItems; // Sync immediately

                // Trigger Auto Save
                handleAutoSave(newItems);
            }
        }

        // Cleanup
        setDraggingId(null);
        setDragOverlayStyle(null);
        setDropTarget(null);
        dragItemIndex.current = null;
        dropTargetIndex.current = null;

        // Remove Global Listeners
        window.removeEventListener('touchmove', handleWindowTouchMove);
        window.removeEventListener('touchend', handleWindowTouchEnd);
        window.removeEventListener('touchcancel', handleWindowTouchEnd);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            window.removeEventListener('touchmove', handleWindowTouchMove);
            window.removeEventListener('touchend', handleWindowTouchEnd);
            window.removeEventListener('touchcancel', handleWindowTouchEnd);
        };
    }, []);

    // Helper to check if index is checked (for background restoration) but clearing style is better.
    const isChecked = (index) => {
        if (index === undefined) return false;
        const item = localItems[index];
        return item && item.is_checked;
    };

    const saveReorder = async () => {
        setIsReordering(true);
        try {
            // Extract purchase_inventory_ids. 
            // Query provides ai.inventory_id (which is the purchase_inventory_id).
            const orderedIds = localItems.map(item => item.inventory_id || item.purchase_inventory_id);
            if (orderedIds.some(id => !id)) {
                alert('일부 항목의 원본 재고 ID를 찾을 수 없습니다.');
                return;
            }

            const res = await purchaseInventoryAPI.reorder(orderedIds);
            if (res.data.success) {
                await onRefresh(); // 데이터 새로고침
                setReorderMode(false);
                setLocalItems([]);
            }
        } catch (error) {
            console.error('순서 저장 실패:', error);
            alert('순서 저장에 실패했습니다.');
        } finally {
            setIsReordering(false);
        }
    };

    const formatQty = (val) => {
        const num = parseFloat(val);
        return Math.floor(num).toLocaleString();
    };

    // Find the item being dragged for the overlay
    const draggingItemContent = useMemo(() => {
        if (!draggingId) return null;
        return localItems.find(item => item.id === draggingId);
    }, [draggingId, localItems]);

    return (
        <div className="scanner-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="white-ribbon" style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="🔍 품목/출하주/수량..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: 1, height: '40px', fontSize: '1rem', border: '1px solid #e2e8f0' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none', height: '40px', paddingLeft: '0.25rem', whiteSpace: 'nowrap' }}>
                        <input
                            type="checkbox"
                            checked={filterWithDiff}
                            onChange={e => setFilterWithDiff(e.target.checked)}
                            style={{ width: '18px', height: '18px' }}
                        />
                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#4a5568' }}>차이</span>
                    </label>

                    {/* Reorder Buttons (Moved here) */}
                    {audit.status === 'IN_PROGRESS' && (
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {reorderMode ? (
                                <button
                                    onClick={toggleReorder}
                                    className="btn btn-primary"
                                    style={{ height: '40px', padding: '0 0.75rem', fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                                >
                                    완료
                                </button>
                            ) : (
                                <button
                                    onClick={toggleReorder}
                                    className="btn btn-outline-primary"
                                    style={{ height: '40px', padding: '0 0.75rem', fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                                >
                                    순서
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>



            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1rem' }}>
                {filteredItems.map(item => {
                    const systemQty = parseFloat(item.system_quantity);
                    const actualQty = parseFloat(item.actual_quantity);
                    const isConfirmed = actualQty === systemQty;
                    const hasDiff = actualQty !== systemQty;
                    const isChecked = !!item.is_checked;

                    const isDraggingThis = draggingId === item.id;
                    const isDropTarget = dropTarget === filteredItems.indexOf(item); // Highlight Check

                    return (
                        <div
                            key={item.id}
                            ref={el => itemRefs.current[filteredItems.indexOf(item)] = el}
                            data-index={filteredItems.indexOf(item)}
                            className={`scanner-card ${hasDiff ? 'has-diff' : ''}`}
                            style={{
                                border: isChecked ? '2px solid #48bb78' : isDropTarget ? '3px solid #3182ce' : '1px solid #e2e8f0', // Blue border for target
                                backgroundColor: isChecked ? '#f0fff4' : isDropTarget ? '#ebf8ff' : 'white',
                                position: 'relative',
                                opacity: isDraggingThis ? 0.3 : 1, // Visual ghost
                                transform: isDraggingThis ? 'scale(0.95)' : isDropTarget ? 'scale(1.02)' : 'none',
                                transition: isDraggingThis ? 'none' : 'transform 0.1s',
                                zIndex: isDropTarget ? 10 : 1
                            }}
                        >
                            {/* Conditional Rendering based on Reorder Mode */}
                            {
                                reorderMode ? (
                                    // REORDER MODE: Simplified Layout
                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.5rem', gap: '0.75rem' }}>
                                        {/* Simplified Content (Left) */}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '1.05rem', color: '#2d3748', fontWeight: 600, marginBottom: '0.1rem' }}>
                                                {item.product_name} {item.product_weight ? `${parseFloat(item.product_weight)}kg` : ''} {item.sender} {item.grade ? `(${item.grade})` : ''} <span style={{ color: '#e53e3e' }}>{formatQty(item.actual_quantity)}개</span> <span style={{ color: '#718096', fontWeight: 400, fontSize: '0.9rem' }}>{parseFloat(item.unit_cost || 0).toLocaleString()}원</span>
                                            </div>
                                            <div style={{ fontSize: '0.9rem', color: '#718096', display: 'flex', gap: '0.5rem' }}>
                                                <span>{item.purchase_store_name || '매입처미정'}</span>
                                                <span style={{ color: '#cbd5e0' }}>|</span>
                                                <span>{item.purchase_date || '-'}</span>
                                            </div>
                                        </div>

                                        {/* Drag Handle (Right) - Hamburger Icon */}
                                        <div
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                padding: '0 0.5rem', cursor: 'grab', touchAction: 'none'
                                            }}
                                            onTouchStart={(e) => handleTouchStart(e, filteredItems.indexOf(item), item)}
                                        >
                                            <span style={{ fontSize: '1.5rem', color: '#718096', fontWeight: 'bold' }}>≡</span>
                                        </div>
                                    </div>
                                ) : (
                                    // NORMAL MODE: Detailed Layout
                                    <>
                                        {isChecked && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '10px',
                                                right: '10px',
                                                backgroundColor: '#48bb78',
                                                color: 'white',
                                                borderRadius: '50%',
                                                width: '24px',
                                                height: '24px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.9rem',
                                                fontWeight: 'bold',
                                                zIndex: 5
                                            }}>✓</div>
                                        )}
                                        <div className="scanner-card-header" style={{ paddingBottom: '0.25rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <div className="product-name" style={{ color: '#2d3748', fontSize: '1.05rem', marginBottom: '0.2rem', fontWeight: 600 }}>
                                                    {item.product_name} {item.product_weight ? `${parseFloat(item.product_weight)}kg` : ''} {item.sender} {item.grade ? `(${item.grade})` : ''} <span style={{ color: '#e53e3e' }}>{formatQty(systemQty)}개</span> <span style={{ color: '#718096', fontSize: '0.9rem', fontWeight: 400 }}>{parseFloat(item.unit_cost || 0).toLocaleString()}원</span>
                                                </div>
                                                <div className="sender-info" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#718096' }}>
                                                    <span>{item.purchase_store_name || '매입처미정'}</span>
                                                    <span style={{ color: '#cbd5e0' }}>|</span>
                                                    <span>{item.purchase_date || '-'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="scanner-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem', gap: '1rem' }}>
                                            <div style={{ textAlign: 'center', minWidth: '60px' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#a0aec0' }}>전산재고</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4a5568' }}>{formatQty(systemQty)}</div>
                                            </div>

                                            <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '5px', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn btn-outline-secondary"
                                                    style={{ height: '45px', fontSize: '1.2rem', width: '45px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    onClick={() => adjustQty(item, -1)}
                                                    disabled={audit.status !== 'IN_PROGRESS'}
                                                >-</button>

                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <input
                                                        type="number"
                                                        className="qty-input"
                                                        style={{ width: '100%', height: '45px', fontSize: '1.4rem', textAlign: 'center', fontWeight: 'bold' }}
                                                        value={Math.floor(item.actual_quantity)}
                                                        onChange={e => handleQtyChange(item.id, e.target.value)}
                                                        disabled={audit.status !== 'IN_PROGRESS'}
                                                        step="1"
                                                    />
                                                </div>

                                                <button
                                                    className="btn btn-outline-secondary"
                                                    style={{ height: '45px', fontSize: '1.2rem', width: '45px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    onClick={() => adjustQty(item, 1)}
                                                    disabled={audit.status !== 'IN_PROGRESS'}
                                                >+</button>

                                                <button
                                                    style={{
                                                        height: '45px',
                                                        width: '60px',
                                                        flex: 'none',
                                                        fontSize: '0.9rem',
                                                        fontWeight: 600,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        backgroundColor: isChecked ? '#48bb78' : 'white',
                                                        color: isChecked ? 'white' : '#718096',
                                                        border: isChecked ? '1px solid #48bb78' : '1px solid #a0aec0',
                                                        borderRadius: '0.25rem',
                                                        marginLeft: '0.5rem'
                                                    }}
                                                    onClick={() => handleCheck(item)}
                                                    disabled={audit.status !== 'IN_PROGRESS'}
                                                >
                                                    {isChecked ? '완료' : '확인'}
                                                </button>
                                            </div>
                                        </div>

                                        {hasDiff && (
                                            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                                                <span className={`diff-badge ${actualQty > systemQty ? 'diff-positive' : 'diff-negative'}`}>
                                                    오차: {actualQty - systemQty > 0 ? '+' : ''}{formatQty(actualQty - systemQty)}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )
                            }
                        </div>
                    );
                })}
            </div>

            {
                filteredItems.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#a0aec0' }}>
                        검색 결과가 없습니다.
                    </div>
                )
            }
            {/* Drag Overlay Portal (Inline) */}
            {
                draggingId && dragOverlayStyle && draggingItemContent && (
                    <div style={{
                        position: 'fixed',
                        top: dragOverlayStyle.top + dragOverlayStyle.yOffset,
                        left: dragOverlayStyle.left,
                        width: dragOverlayStyle.width,
                        height: dragOverlayStyle.height,
                        zIndex: 9999,
                        pointerEvents: 'none', // Allow touch events to pass through
                        backgroundColor: 'white',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        border: '2px solid #3182ce',
                        borderRadius: '0.25rem',
                        opacity: 0.95,
                        transform: 'scale(1.02)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        gap: '0.75rem'
                    }}>
                        {/* Simplified Content */}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '1.05rem', color: '#2d3748', fontWeight: 600, marginBottom: '0.1rem' }}>
                                {draggingItemContent.product_name} {draggingItemContent.product_weight ? `${parseFloat(draggingItemContent.product_weight)}kg` : ''} {draggingItemContent.sender} {draggingItemContent.grade ? `(${draggingItemContent.grade})` : ''} <span style={{ color: '#e53e3e' }}>{formatQty(draggingItemContent.actual_quantity)}개</span> <span style={{ color: '#718096', fontWeight: 400, fontSize: '0.9rem' }}>{parseFloat(draggingItemContent.unit_cost || 0).toLocaleString()}원</span>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#718096', display: 'flex', gap: '0.5rem' }}>
                                <span>{draggingItemContent.purchase_store_name || '매입처미정'}</span>
                                <span style={{ color: '#cbd5e0' }}>|</span>
                                <span>{draggingItemContent.purchase_date || '-'}</span>
                            </div>
                        </div>

                        {/* Drag Handle (Right) */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 0.5rem'
                        }}>
                            <span style={{ fontSize: '1.5rem', color: '#3182ce', fontWeight: 'bold' }}>≡</span>
                        </div>
                    </div>
                )}

            {/* Drag Overlay Portal (Inline) */}
        </div >
    );
};

export default AuditScanner;
