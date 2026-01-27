import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { purchaseInventoryAPI, inventoryAuditAPI } from '../../services/api';
import useTableDnd from '../../hooks/useTableDnd';
import TableDndRow from '../TableDndRow';

// 테이블 행 컴포넌트 - React.memo로 최적화
const AuditRow = memo(function AuditRow({
    item,
    index,
    canReorder,
    audit,
    onUpdate,
    columnWidths,
    provided,
    snapshot,
    onSync
}) {
    const systemQty = parseFloat(item.system_quantity);
    const currentQty = parseFloat(item.current_quantity !== undefined ? item.current_quantity : item.system_quantity);
    const actualQty = parseFloat(item.actual_quantity);
    const diff = actualQty - systemQty;

    // 전산재고와 실제 시스템 재고 간의 불일치 여부
    const isOutOfSync = Math.abs(systemQty - currentQty) > 0.0001;

    const handleQtyChange = (itemId, value) => {
        const numValue = value === '' ? 0 : parseInt(value, 10);
        onUpdate([{ id: itemId, actual_quantity: numValue }]);
    };

    const handleNotesChange = (itemId, notes) => {
        onUpdate([{ id: itemId, diff_notes: notes }]);
    };

    const handleCheck = (item) => {
        onUpdate([{
            id: item.id,
            is_checked: !item.is_checked
        }]);
    };

    const formatQty = (val) => {
        const num = parseFloat(val);
        return num % 1 === 0 ? num.toLocaleString() : num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    };

    const isDragging = snapshot.isDragging || snapshot.isDropAnimating;

    const style = {
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.9 : 1,
        backgroundColor: snapshot.isDragging ? '#f8fafc' : (item.is_checked ? '#f0fff4' : (index % 2 === 0 ? '#ffffff' : '#f8fafc')),
        boxShadow: snapshot.isDragging ? '0 10px 20px rgba(0,0,0,0.15)' : 'none',
        borderTop: index > 0 ? '1px solid #e2e8f0' : 'none',
        zIndex: isDragging ? 9999 : 'auto'
    };

    return (
        <tr
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`${diff !== 0 ? 'has-diff' : ''} ${item.is_checked ? 'is-checked' : ''} ${snapshot.isDragging ? 'drag-over' : ''} no-select`}
            data-id={item.id}
            style={style}
        >
            {canReorder && (
                <td
                    className="no-select touch-none drag-handle"
                    {...provided.dragHandleProps}
                    style={{
                        textAlign: 'center',
                        cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                        color: snapshot.isDragging ? '#3182ce' : '#cbd5e0',
                        fontSize: '1.2rem',
                        width: isDragging ? columnWidths[0] : '40px',
                        touchAction: 'none',
                        transition: 'color 0.2s',
                        padding: '0.5rem 0'
                    }}
                >
                    ≡
                </td>
            )}

            <td style={{ padding: '0.6rem 0.75rem', ...(snapshot.isDragging ? { width: columnWidths[canReorder ? 1 : 0] } : {}) }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#2d3748', lineHeight: '1.4' }}>
                    <span style={{ marginRight: '6px' }}>{item.product_name}</span>
                    {item.product_weight && <span style={{ marginRight: '6px' }}>{parseFloat(item.product_weight)}{item.weight_unit || item.product_weight_unit || 'kg'}</span>}
                    {item.sender && <span style={{ marginRight: '6px' }}>{item.sender}</span>}
                    {item.grade && <span style={{ marginRight: '6px' }}>({item.grade})</span>}
                    <span style={{ color: '#4a5568', fontWeight: 500, marginRight: '6px' }}>{parseFloat(item.system_quantity).toLocaleString()}개</span>
                    <span style={{ color: '#718096', fontSize: '0.9rem', fontWeight: 400 }}>{parseFloat(item.unit_cost || 0).toLocaleString()}원</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '2px' }}>
                    {item.purchase_store_name || item.sender || '매입처 미지정'} | {item.purchase_date || '-'}
                </div>
            </td>
            <td style={{ textAlign: 'right', fontWeight: 600, color: '#4a5568', position: 'relative', ...(snapshot.isDragging ? { width: columnWidths[canReorder ? 2 : 1] } : {}) }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '1rem' }}>{formatQty(systemQty)}</span>
                    {isOutOfSync && audit.status === 'IN_PROGRESS' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <span style={{ fontSize: '0.7rem', color: '#e53e3e', backgroundColor: '#fff5f5', padding: '1px 4px', borderRadius: '3px', fontWeight: 500, border: '1px solid #feb2b2' }}>
                                실시간: {formatQty(currentQty)}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onSync(item.id); }}
                                title="현재 시스템 재고로 전산재고 동기화"
                                style={{
                                    border: 'none',
                                    background: '#3182ce',
                                    color: 'white',
                                    borderRadius: '3px',
                                    padding: '1px 4px',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                🔄 동기화
                            </button>
                        </div>
                    )}
                </div>
            </td>
            <td style={{ textAlign: 'center', ...(snapshot.isDragging ? { width: columnWidths[canReorder ? 3 : 2] } : {}) }}>
                <input
                    type="text"
                    inputMode="numeric"
                    className="qty-input"
                    value={parseInt(item.actual_quantity) || 0}
                    disabled={audit.status !== 'IN_PROGRESS'}
                    onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d+$/.test(val)) {
                            handleQtyChange(item.id, val);
                        }
                    }}
                    style={{
                        height: '34px',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '0 0.5rem',
                        width: '100%',
                        textAlign: 'center'
                    }}
                />
            </td>
            <td style={{ textAlign: 'center', ...(snapshot.isDragging ? { width: columnWidths[canReorder ? 4 : 3] } : {}) }}>
                {diff !== 0 ? (
                    <span className={`diff-badge ${diff > 0 ? 'diff-positive' : 'diff-negative'}`}>
                        {diff > 0 ? '+' : ''}{formatQty(diff)}
                    </span>
                ) : (
                    <span style={{ color: '#cbd5e0' }}>-</span>
                )}
            </td>
            <td style={{ textAlign: 'center', ...(snapshot.isDragging ? { width: columnWidths[canReorder ? 5 : 4] } : {}) }}>
                <button
                    onClick={() => handleCheck(item)}
                    style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        border: item.is_checked ? '1px solid #48bb78' : '1px solid #cbd5e0',
                        backgroundColor: item.is_checked ? '#48bb78' : 'white',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        margin: '0 auto',
                        padding: 0
                    }}
                    disabled={audit.status !== 'IN_PROGRESS'}
                >
                    {item.is_checked && '✓'}
                </button>
            </td>
            <td style={snapshot.isDragging ? { width: columnWidths[canReorder ? 6 : 5] } : {}}>
                <input
                    type="text"
                    className="form-control"
                    placeholder="사유..."
                    value={item.diff_notes || ''}
                    disabled={audit.status !== 'IN_PROGRESS'}
                    onChange={e => handleNotesChange(item.id, e.target.value)}
                    style={{
                        height: '34px',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        padding: '0 0.5rem',
                        width: '100%'
                    }}
                />
            </td>
        </tr>
    );
});

const AuditDesk = ({ audit, items, onUpdate, isSaving, reorderMode, setReorderMode, onRefresh }) => {
    const [search, setSearch] = useState('');
    const [filterWithDiff, setFilterWithDiff] = useState(false);

    const handleAutoSave = async (itemsToSave) => {
        try {
            const orderedIds = itemsToSave.map(item => item.inventory_id || item.purchase_inventory_id);
            if (orderedIds.some(id => !id)) return;
            await purchaseInventoryAPI.reorder(orderedIds);
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    };

    const {
        localItems,
        setLocalItems,
        columnWidths,
        onDragStart,
        onDragEnd
    } = useTableDnd(items, handleAutoSave);

    // Update local items when props change (sync with server/parent)
    useEffect(() => {
        if (!items) return;

        setLocalItems(prevLocal => {
            if (prevLocal.length === 0) return items;
            const itemMap = new Map(items.map(i => [i.id, i]));
            const merged = prevLocal.map(localItem => {
                const updated = itemMap.get(localItem.id);
                return updated ? { ...localItem, ...updated } : localItem;
            });

            if (merged.length < items.length) {
                const localIds = new Set(prevLocal.map(i => i.id));
                const newItems = items.filter(i => !localIds.has(i.id));
                return [...merged, ...newItems];
            }
            return merged;
        });
    }, [items]);

    const filteredItems = useMemo(() => {
        const sourceItems = (!search.trim() && !filterWithDiff) ? localItems : items;
        if (!sourceItems) return [];

        return sourceItems.filter(item => {
            if (!search.trim() && !filterWithDiff) return true;
            const hasDiff = parseFloat(item.actual_quantity) !== parseFloat(item.system_quantity);
            if (filterWithDiff && !hasDiff) return false;
            if (!search.trim()) return true;

            const keywords = search.toLowerCase().trim().split(/\s+/).filter(k => k);
            const systemQty = parseFloat(item.system_quantity);
            const searchableText = [
                item.product_name || '',
                item.product_weight ? `${parseFloat(item.product_weight)}${item.product_weight_unit || item.weight_unit || 'kg'}` : '',
                item.sender || '',
                item.grade || '',
                systemQty.toString(),
                item.purchase_store_name || '',
                item.purchase_date || '',
                item.diff_notes || ''
            ].join(' ').toLowerCase();

            return keywords.every(k => searchableText.includes(k));
        });
    }, [items, localItems, search, filterWithDiff]);

    const stats = useMemo(() => {
        if (!items) return { total: 0, matched: 0, withDiff: 0 };
        const total = items.length;
        const matched = items.filter(i => parseFloat(i.actual_quantity) === parseFloat(i.system_quantity)).length;
        const withDiff = total - matched;
        return { total, matched, withDiff };
    }, [items]);

    const canReorder = !search.trim() && !filterWithDiff;

    return (
        <div className="audit-desk-layout" style={{
            display: 'block',
            height: 'auto',
            overflow: 'visible'
        }}>
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 110,
                backgroundColor: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.5rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
                <div className="audit-stats-grid">
                    <div className="audit-stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderLeftColor: '#4a5568', marginBottom: 0 }}>
                        <div className="stat-label" style={{ marginBottom: 0 }}>전체 품목</div>
                        <div className="stat-value" style={{ fontSize: '1.1rem' }}>{stats.total} <span className="stat-unit" style={{ fontSize: '0.9rem' }}>건</span></div>
                    </div>
                    <div className="audit-stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderLeftColor: '#38a169', marginBottom: 0 }}>
                        <div className="stat-label" style={{ marginBottom: 0 }}>일치 품목</div>
                        <div className="stat-value" style={{ fontSize: '1.1rem' }}>{stats.matched} <span className="stat-unit" style={{ fontSize: '0.9rem' }}>건</span></div>
                    </div>
                    <div className="audit-stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderLeftColor: '#e53e3e', marginBottom: 0 }}>
                        <div className="stat-label" style={{ marginBottom: 0 }}>차이 발생</div>
                        <div className="stat-value" style={{ fontSize: '1.1rem', color: stats.withDiff > 0 ? '#e53e3e' : 'inherit' }}>
                            {stats.withDiff} <span className="stat-unit" style={{ fontSize: '0.9rem' }}>건</span>
                        </div>
                    </div>
                </div>

                <div className="search-filter-container" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="filter-row" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ whiteSpace: 'nowrap', margin: 0, fontWeight: 'bold' }}>검색</label>
                            <input
                                type="text"
                                placeholder="🔍 품목, 출하주, 매입처, 수량, 단가, 비고... (띄어쓰기로 다중 검색)"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    flex: 1,
                                    height: '36px',
                                    padding: '0 0.75rem',
                                    fontSize: '0.9rem',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    backgroundColor: canReorder ? 'white' : '#f7fafc'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none', margin: 0 }}>
                                <input
                                    type="checkbox"
                                    style={{ width: '16px', height: '16px' }}
                                    checked={filterWithDiff}
                                    onChange={e => setFilterWithDiff(e.target.checked)}
                                />
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#4a5568' }}>차이 있는 항목만 보기</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Standard 35.28: Delegate scroll to parent, force overflow visible for both X and Y to avoid DnD nested scroll detection */}
            <div className="audit-table-container" style={{ overflow: 'visible' }}>
                <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
                    <table className="audit-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <thead style={{ position: 'sticky', top: '130px', zIndex: 10 }}>
                            <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                                {canReorder && (
                                    <th style={{ width: '40px', backgroundColor: '#2d3748', borderBottom: '1px solid #1a202c', textAlign: 'center' }}>☰</th>
                                )}
                                <th style={{ width: '30%', backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>품목</th>
                                <th style={{ width: '10%', backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>전산 재고</th>
                                <th style={{ width: '110px', backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>실사 재고</th>
                                <th style={{ width: '80px', backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>차이</th>
                                <th style={{ width: '50px', backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>확인</th>
                                <th style={{ width: '30%', backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>비고 (차이 사유)</th>
                            </tr>
                        </thead>
                        <Droppable droppableId="audit-list" type="AUDIT_ITEM">
                            {(provided) => (
                                <tbody ref={provided.innerRef} {...provided.droppableProps}>
                                    {filteredItems.map((item, index) => (
                                        <Draggable
                                            key={item.id}
                                            draggableId={String(item.id)}
                                            index={index}
                                            isDragDisabled={!canReorder}
                                        >
                                            {(provided, snapshot) => (
                                                <TableDndRow provided={provided} snapshot={snapshot}>
                                                    <AuditRow
                                                        item={item}
                                                        index={index}
                                                        canReorder={canReorder}
                                                        audit={audit}
                                                        onUpdate={onUpdate}
                                                        columnWidths={columnWidths}
                                                        provided={provided}
                                                        snapshot={snapshot}
                                                        onSync={async (itemId) => {
                                                            try {
                                                                const res = await inventoryAuditAPI.syncItem(audit.id, itemId);
                                                                if (res.data.success) {
                                                                    onRefresh(); // 부모 컴포넌트 새로고침 (데이터 다시 가져오기)
                                                                }
                                                            } catch (error) {
                                                                console.error('동기화 실패:', error);
                                                                alert('동기화 중 오류가 발생했습니다.');
                                                            }
                                                        }}
                                                    />
                                                </TableDndRow>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </tbody>
                            )}
                        </Droppable>
                    </table>
                </DragDropContext>
                {filteredItems.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#a0aec0' }}>
                        검색 결과가 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditDesk;
