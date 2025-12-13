import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { productAPI, categoryAPI } from '../../services/api';
import SearchableSelect from '../SearchableSelect';
import ConfirmModal from '../ConfirmModal';
import ProductInputModal from './ProductInputModal';

function ProductManager({ selectedCategoryId }) {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        category_id: '',
        is_active: ''
    });

    // Drag State
    const [draggedGroupName, setDraggedGroupName] = useState(null);
    const [dragOverGroupName, setDragOverGroupName] = useState(null);
    const [draggedProduct, setDraggedProduct] = useState(null);
    const [dragOverProduct, setDragOverProduct] = useState(null);

    // View State
    const [cardHeight, setCardHeight] = useState(300);

    const [modal, setModal] = useState({
        isOpen: false,
        type: 'confirm',
        title: '',
        message: '',
        onConfirm: () => { },
        confirmText: '확인',
        showCancel: true
    });

    const [inputModal, setInputModal] = useState({
        isOpen: false,
        isEdit: false,
        initialData: null,
        copyFromId: null
    });

    // Styles
    const styles = {
        container: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#f1f5f9'
        },
        header: {
            padding: '1.25rem',
            backgroundColor: 'white',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem'
        },
        headerTitle: {
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#0f172a'
        },
        filterBar: {
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flex: 1
        },
        searchInput: {
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.9rem',
            minWidth: '200px',
            flex: 1
        },
        grid: {
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1.5rem',
            alignContent: 'start'
        },
        card: (isDragging) => ({
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: isDragging ? '0 20px 25px -5px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'all 0.2s',
            opacity: isDragging ? 0.5 : 1,
            transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        }),
        cardHeader: {
            padding: '1rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            cursor: 'grab' // Header is draggable
        },
        groupName: {
            fontWeight: '700',
            fontSize: '1.1rem',
            color: '#1e293b'
        },
        cardBody: {
            padding: '0.5rem',
            flex: 1, // Fill remaining space
            overflowY: 'auto',
            // transition: 'height 0.3s ease' // Transition might need to be on the card itself or removed
        },
        variantRow: (isDragging, isOver) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid #f1f5f9',
            fontSize: '0.9rem',
            backgroundColor: isDragging ? '#f1f5f9' : (isOver ? '#e0f2fe' : 'transparent'),
            cursor: 'grab',
            opacity: isDragging ? 0.5 : 1
        }),
        badge: (isActive) => ({
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.7rem',
            backgroundColor: isActive ? '#dcfce7' : '#f1f5f9',
            color: isActive ? '#166534' : '#64748b',
            fontWeight: '600',
            cursor: 'pointer'
        }),
        actionButton: (color, text) => ({
            color: color,
            backgroundColor: 'transparent', // minimal style
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8rem',
            padding: '0.2rem 0.5rem',
            fontWeight: '600',
            textDecoration: 'none'
        })
    };

    useEffect(() => {
        if (selectedCategoryId === null) {
            setFilters(prev => ({ ...prev, category_id: '' }));
        } else if (selectedCategoryId !== undefined) {
            // Parent Category Logic: If selected is parent, we should filter by parent OR children
            const isParent = categories.find(c => c.id === selectedCategoryId && !c.parent_id);
            if (isParent) {
                // The backend might not support array filtering for category_id directly in this setup, 
                // providing a special comma-separated string or just handling it client side if needed.
                // Assuming backend supports simple exact match, we might need client-side filtering or multiple calls.
                // Let's try client-side filtering approach for now to avoid backend changes if possible 
                // OR send a specific signal.
                // BETTER: Just set partial logic here, or fetch all and filter client side?
                // Given the requirement "Show subcategories", let's clear the exact category_id filter for the API 
                // and filter in memory, OR find all child IDs.
                const childIds = categories.filter(c => c.parent_id === selectedCategoryId).map(c => c.id);
                const allIds = [selectedCategoryId, ...childIds];
                setFilters(prev => ({ ...prev, category_id: '', _targetCategoryIds: allIds }));
            } else {
                setFilters(prev => ({ ...prev, category_id: selectedCategoryId, _targetCategoryIds: null }));
            }
        }
    }, [selectedCategoryId, categories]);

    useEffect(() => {
        loadProducts();
    }, [filters]);

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const response = await categoryAPI.getAll({ is_active: 'true' });
            setCategories(response.data.data);
        } catch (e) { console.error(e); }
    };

    const loadProducts = async () => {
        try {
            setLoading(true);
            // If we have targetCategoryIds (client side filtering for parent logic), fetch ALL or broader scope?
            // Fetching all for now to ensure we have data to filter. 
            // Optimally backend should handle "category_id=1&include_children=true" but we are sticking to frontend logic as per plan.
            const apiFilters = { ...filters };
            if (apiFilters._targetCategoryIds) delete apiFilters.category_id; // Fetch all if we need to filter multiple
            delete apiFilters._targetCategoryIds; // Don't send internal flag

            const response = await productAPI.getAll(apiFilters);
            let data = response.data.data;

            // Client-side recursive filtering
            if (filters._targetCategoryIds) {
                data = data.filter(p => filters._targetCategoryIds.includes(p.category_id));
            }

            setProducts(data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    // Grouping Logic
    const getGroupedData = () => {
        const groups = {};
        products.forEach(p => {
            const name = p.product_name || 'Uncategorized';
            if (!groups[name]) {
                groups[name] = { name, items: [], minSort: p.sort_order || 9999, categoryName: p.category_name };
            }
            groups[name].items.push(p);
            if ((p.sort_order || 9999) < groups[name].minSort) groups[name].minSort = p.sort_order;
        });

        // Sort variants within group by sort_order
        Object.values(groups).forEach(g => {
            g.items.sort((a, b) => (a.sort_order || 9999) - (b.sort_order || 9999));
        });
        return Object.values(groups).sort((a, b) => a.minSort - b.minSort);
    };

    const grouped = getGroupedData();

    // --- Group Drag Handlers ---
    const handleDragStart = (e, groupName) => {
        // Only allow drag if the target is the header (or a specific handle within it)
        if (!e.target.closest('.card-header-draggable')) {
            e.preventDefault();
            return;
        }
        setDraggedGroupName(groupName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, groupName) => {
        e.preventDefault();
        if (draggedGroupName === groupName || draggedProduct) return; // Don't allow group drag over if product is being dragged
        setDragOverGroupName(groupName);
    };

    const handleDrop = async (e, targetGroupName) => {
        e.preventDefault();

        // Case 1: Reordering Groups
        if (draggedGroupName && draggedGroupName !== targetGroupName && !draggedProduct) {
            const currentOrder = grouped.map(g => g.name);
            const fromIndex = currentOrder.indexOf(draggedGroupName);
            const toIndex = currentOrder.indexOf(targetGroupName);

            if (fromIndex < 0 || toIndex < 0) return;

            const newOrder = [...currentOrder];
            newOrder.splice(fromIndex, 1);
            newOrder.splice(toIndex, 0, draggedGroupName);

            try {
                const items = [];
                let sortCounter = 1;
                newOrder.forEach(gName => {
                    const group = grouped.find(g => g.name === gName);
                    group.items.forEach(p => {
                        items.push({ id: p.id, sort_order: sortCounter++ });
                    });
                });
                await productAPI.reorder({ items });
                loadProducts();
            } catch (err) { console.error(err); }
        }

        setDraggedGroupName(null);
        setDragOverGroupName(null);
    };

    const handleDragEnd = () => {
        setDraggedGroupName(null);
        setDragOverGroupName(null);
        setDraggedProduct(null);
        setDragOverProduct(null);
    };

    // --- Variant Drag Handlers ---
    const handleVariantDragStart = (e, product) => {
        e.stopPropagation(); // Prevent card drag
        setDraggedProduct(product);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleVariantDragOver = (e, product) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedProduct || draggedProduct.id === product.id) return;

        // Only allow reordering within same group (same product_name)
        if (draggedProduct.product_name !== product.product_name) return;

        setDragOverProduct(product);
    };

    const handleVariantDrop = async (e, targetProduct) => {
        e.preventDefault();
        e.stopPropagation();

        if (!draggedProduct || draggedProduct.id === targetProduct.id) {
            handleDragEnd();
            return;
        }

        // Check same group
        if (draggedProduct.product_name !== targetProduct.product_name) {
            handleDragEnd();
            return;
        }

        // Reorder logic within the group
        const group = grouped.find(g => g.name === draggedProduct.product_name);
        if (!group) return;

        const items = [...group.items];
        const fromIndex = items.findIndex(p => p.id === draggedProduct.id);
        const toIndex = items.findIndex(p => p.id === targetProduct.id);

        if (fromIndex < 0 || toIndex < 0) return;

        // Move item
        items.splice(fromIndex, 1);
        items.splice(toIndex, 0, draggedProduct);

        // Let's grab ALL products, update the array locally, then send full reorder.
        const allGroups = [...grouped];
        const gIdx = allGroups.findIndex(g => g.name === group.name);
        allGroups[gIdx] = { ...group, items: items }; // Update this group with new item order

        // Flatten
        const flatItems = [];
        let counter = 1;
        allGroups.forEach(g => {
            g.items.forEach(p => {
                flatItems.push({ id: p.id, sort_order: counter++ });
            });
        });

        try {
            await productAPI.reorder({ items: flatItems });
            loadProducts();

        } catch (err) { console.error(err); }

        handleDragEnd();
    };

    const handleToggleActive = async (p) => {
        try {
            await productAPI.update(p.id, { ...p, is_active: !p.is_active });
            // Local update
            setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: !prod.is_active } : prod));
        } catch (e) { }
    };

    const handleDelete = (id, name) => {
        setModal({
            isOpen: true,
            type: 'delete',
            title: '삭제',
            message: `${name} 삭제하시겠습니까?`,
            confirmText: '삭제',
            showCancel: true,
            onConfirm: async () => {
                try {
                    await productAPI.delete(id);
                    setModal(prev => ({ ...prev, isOpen: false }));
                    loadProducts();
                } catch (e) {
                    const errorMsg = e.response?.data?.message || '삭제 중 오류가 발생했습니다.';
                    setModal({
                        isOpen: true,
                        type: 'warning',
                        title: '삭제 불가',
                        message: errorMsg,
                        confirmText: '확인',
                        showCancel: false,
                        onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
                    });
                }
            }
        });
    };

    // Modal Handlers
    const openNew = () => setInputModal({ isOpen: true, isEdit: false, initialData: null, copyFromId: null });
    const openEdit = (product) => setInputModal({ isOpen: true, isEdit: true, initialData: product, copyFromId: null });
    const openAddGrade = (id) => setInputModal({ isOpen: true, isEdit: false, initialData: null, copyFromId: id });
    const closeInputModal = () => setInputModal({ ...inputModal, isOpen: false });

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <div style={styles.filterBar}>
                    <h2 style={styles.headerTitle}>📦 품목 카탈로그</h2>
                    <input
                        type="text"
                        placeholder="품목 검색..."
                        value={filters.search}
                        onChange={e => setFilters({ ...filters, search: e.target.value })}
                        style={styles.searchInput}
                    />
                    {/* Status Filter */}
                    <select
                        value={filters.is_active}
                        onChange={e => setFilters({ ...filters, is_active: e.target.value })}
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    >
                        <option value="">전체 상태</option>
                        <option value="true">사용중</option>
                        <option value="false">미사용</option>
                    </select>

                    {/* View Settings: Height Slider */}
                    <div style={{ width: '1px', height: '24px', backgroundColor: '#e2e8f0', margin: '0 0.5rem' }}></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>높이: {cardHeight}px</span>
                        <input
                            type="range"
                            min="70"
                            max="500"
                            step="10"
                            value={cardHeight}
                            onChange={(e) => setCardHeight(parseInt(e.target.value))}
                            style={{ width: '100px', cursor: 'pointer' }}
                            title="카드 높이 조절"
                        />
                    </div>
                </div>

                <button
                    onClick={openNew}
                    className="btn btn-primary"
                    style={{
                        textDecoration: 'none',
                        padding: '0.6rem 1.2rem',
                        borderRadius: '8px',
                        fontWeight: '600',
                        boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                        border: 'none',
                        cursor: 'pointer',
                        flex: 'none', // Prevent stretching
                        whiteSpace: 'nowrap'
                    }}
                >
                    + 신규 등록
                </button>
            </header>

            <div style={styles.grid}>
                {grouped.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>
                        조건에 맞는 품목이 없습니다.
                    </div>
                )}
                {grouped.map((group) => (
                    <div
                        key={group.name}
                        style={{
                            ...styles.card(draggedGroupName === group.name),
                            height: `${cardHeight}px`
                        }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, group.name)}
                        onDragOver={(e) => handleDragOver(e, group.name)}
                        onDrop={(e) => handleDrop(e, group.name)}
                        onDragEnd={handleDragEnd}
                    >
                        <div style={styles.cardHeader} className="card-header-draggable">
                            <div className="card-header-draggable">
                                <div className="card-header-draggable" style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>{group.categoryName}</div>
                                <div className="card-header-draggable" style={styles.groupName}>{group.name}</div>
                            </div>
                            <button
                                onClick={() => openAddGrade(group.items[0].id)}
                                style={{
                                    backgroundColor: '#eff6ff',
                                    color: '#3b82f6',
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: '600'
                                }}
                            >
                                + 등급추가
                            </button>
                        </div>
                        <div style={styles.cardBody}>
                            {group.items.map(product => (
                                <div
                                    key={product.id}
                                    style={styles.variantRow(draggedProduct && draggedProduct.id === product.id, dragOverProduct && dragOverProduct.id === product.id)}
                                    draggable
                                    onDragStart={(e) => handleVariantDragStart(e, product)}
                                    onDragOver={(e) => handleVariantDragOver(e, product)}
                                    onDrop={(e) => handleVariantDrop(e, product)}
                                    onDragEnd={handleDragEnd}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{
                                            backgroundColor: '#e2e8f0',
                                            padding: '0.1rem 0.4rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            minWidth: '30px',
                                            textAlign: 'center'
                                        }}>
                                            {product.grade || '-'}
                                        </span>
                                        <span style={{ color: '#475569' }}>
                                            {product.weight ? `${parseFloat(product.weight)}kg` : '-'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span
                                            style={styles.badge(product.is_active)}
                                            onClick={() => handleToggleActive(product)}
                                        >
                                            {product.is_active ? '사용' : '미사용'}
                                        </span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button onClick={() => openEdit(product)} style={styles.actionButton('#3b82f6', '수정')}>
                                                수정
                                            </button>
                                            <button
                                                onClick={() => handleDelete(product.id, product.product_name)}
                                                style={styles.actionButton('#ef4444', '삭제')}
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

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

            <ProductInputModal
                isOpen={inputModal.isOpen}
                onClose={closeInputModal}
                initialData={inputModal.initialData}
                isEdit={inputModal.isEdit}
                copyFromId={inputModal.copyFromId}
                onSuccess={loadProducts}
            />
        </div>
    );
}

export default ProductManager;
