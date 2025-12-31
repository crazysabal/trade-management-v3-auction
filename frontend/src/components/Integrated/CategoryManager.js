import React, { useState, useEffect } from 'react';
import { categoryAPI } from '../../services/api';
import CategoryInputModal from './CategoryInputModal';
import ConfirmModal from '../ConfirmModal';

// Extracted CategoryItem Component for stable identity
const CategoryItem = ({
    category,
    isChild,
    selectedCategoryId,
    collapsedIds,
    getChildren,
    toggleCollapse,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDragEnd,
    onSelectCategory,
    handleToggleActive,
    handleAdd,
    handleEdit,
    handleDelete,
    styles
}) => {
    const isSelected = selectedCategoryId === category.id;
    const children = getChildren(category.id);
    const isCollapsed = collapsedIds.has(category.id);
    const hasChildren = children.length > 0;
    const rowRef = React.useRef(null);

    return (
        <div style={styles.itemContainer}>
            <div
                ref={rowRef}
                style={{
                    ...styles.item(isSelected),
                    opacity: 1,
                    border: styles.item(isSelected).border
                }}
                onDragEnter={(e) => handleDragEnter(e, category)}
                onDragOver={handleDragOver}
                onClick={() => onSelectCategory && onSelectCategory(category)}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (hasChildren) toggleCollapse(category.id);
                }}
                className="category-item-hover"
            >
                <div style={styles.itemName}>
                    {/* Explicit Drag Handle */}
                    <div
                        className="drag-handle"
                        style={styles.dragHandle}
                        title="드래그하여 이동"
                        draggable
                        onDragStart={(e) => handleDragStart(e, category, rowRef.current)}
                        onDragEnd={(e) => handleDragEnd(e)}
                    >
                        ≡
                    </div>
                    <span
                        style={{ fontSize: '1.2rem', cursor: hasChildren ? 'pointer' : 'default', flexShrink: 0 }}
                        onClick={(e) => {
                            if (hasChildren) {
                                e.stopPropagation();
                                toggleCollapse(category.id);
                            }
                        }}
                    >
                        {isChild ? '└' : (hasChildren ? (isCollapsed ? '📁' : '📂') : '📁')}
                    </span>
                    <span style={{
                        whiteSpace: 'nowrap',
                        flex: 1,
                        marginRight: '0.5rem'
                    }}>
                        {category.category_name}
                    </span>
                    <span
                        onClick={(e) => handleToggleActive(category, e)}
                        style={styles.badge(category.is_active)}
                        title="상태 변경"
                    >
                        {category.is_active ? '사용중' : '미사용'}
                    </span>
                </div>

                <div style={styles.actions}>
                    {!isChild && (
                        <button
                            style={styles.actionBtn('#3b82f6')}
                            onClick={(e) => { e.stopPropagation(); handleAdd(category.id); }}
                        >
                            추가
                        </button>
                    )}
                    <button
                        style={styles.actionBtn('#64748b')}
                        onClick={(e) => { e.stopPropagation(); handleEdit(category); }}
                    >
                        수정
                    </button>
                    <button
                        style={styles.actionBtn('#ef4444')}
                        onClick={(e) => handleDelete(category.id, category.category_name, e)}
                    >
                        삭제
                    </button>
                </div>
            </div>

            {children.length > 0 && !isCollapsed && (
                <div style={styles.subList}>
                    {children.map(child => (
                        <CategoryItem
                            key={child.id}
                            category={child}
                            isChild={true}
                            selectedCategoryId={selectedCategoryId}
                            collapsedIds={collapsedIds}
                            getChildren={getChildren}
                            toggleCollapse={toggleCollapse}
                            handleDragStart={handleDragStart}
                            handleDragEnter={handleDragEnter}
                            handleDragOver={handleDragOver}
                            handleDragEnd={handleDragEnd}
                            onSelectCategory={onSelectCategory}
                            handleToggleActive={handleToggleActive}
                            handleAdd={handleAdd}
                            handleEdit={handleEdit}
                            handleDelete={handleDelete}
                            styles={styles}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

function CategoryManager({ onSelectCategory, selectedCategoryId }) {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        onConfirm: () => { },
        confirmText: '확인',
        showCancel: false
    });

    // Modal State for Add/Edit
    const [inputModal, setInputModal] = useState({
        isOpen: false,
        initialData: null,
        parentId: null
    });

    // Styles
    const styles = {
        container: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#f8fafc'
        },
        header: {
            padding: '1.25rem',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        },
        title: {
            margin: 0,
            fontSize: '1.1rem',
            fontWeight: '700',
            color: '#0f172a'
        },
        iconButton: {
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '0.4rem 1.2rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.3rem'
        },
        list: {
            flex: 1,
            overflow: 'auto', // Enable Both Scroll
            padding: '1rem'
        },
        itemContainer: {
            marginBottom: '0.5rem',
            width: 'fit-content', // Shrink/Grow to fit content
            minWidth: '100%'      // But at least full panel width
        },
        item: (isSelected) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
            border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            position: 'relative',
            minHeight: '52px'
        }),
        itemName: {
            fontSize: '0.95rem',
            fontWeight: '600',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1
        },
        subList: {
            paddingLeft: '1.5rem',
            marginTop: '0.25rem',
            borderLeft: '2px solid #e2e8f0',
            marginLeft: '1rem'
        },
        actions: {
            display: 'flex',
            gap: '0.25rem',
            opacity: 0.8,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            marginLeft: '0.5rem'
        },
        actionBtn: (color) => ({
            padding: '0.25rem 0.6rem',
            fontSize: '0.75rem',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: color,
            color: 'white',
            fontWeight: '500',
            whiteSpace: 'nowrap'
        }),
        badge: (isActive) => ({
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.7rem',
            backgroundColor: isActive ? '#dcfce7' : '#f1f5f9',
            color: isActive ? '#166534' : '#64748b',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            flexShrink: 0
        }),
        dragHandle: {
            cursor: 'grab',
            marginRight: '0.5rem',
            color: '#94a3b8',
            fontSize: '1.2rem',
            lineHeight: '1',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center'
        }
    };

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true);
            const response = await categoryAPI.getAll();
            setCategories(response.data.data);
        } catch (error) {
            console.error('Error loading categories:', error);
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    // Logic Helpers
    const mainCategories = categories.filter(c => c.level === 1 || !c.parent_id);
    const getChildren = (parentId) => categories.filter(c => c.parent_id === parentId);

    // Handlers
    const handleAdd = (parentId = null) => {
        const siblings = parentId ? getChildren(parentId) : mainCategories;
        // Pre-calculate next sort order if needed, or let modal handle default
        const nextOrder = Math.max(0, ...siblings.map(c => c.sort_order || 0)) + 1;

        setInputModal({
            isOpen: true,
            initialData: { sort_order: nextOrder }, // Pass hint for order
            parentId: parentId
        });
    };

    const handleEdit = (category) => {
        setInputModal({
            isOpen: true,
            initialData: category,
            parentId: category.parent_id
        });
    };

    const handleDelete = (id, checkName, e) => {
        e?.stopPropagation();
        setModal({
            isOpen: true,
            type: 'delete',
            title: '삭제 확인',
            message: `'${checkName}' 분류를 삭제하시겠습니까?`,
            confirmText: '삭제',
            showCancel: true,
            onConfirm: async () => {
                try {
                    await categoryAPI.delete(id);
                    loadCategories();
                } catch (error) {
                    // Error handling
                }
            }
        });
    };

    const handleToggleActive = async (category, e) => {
        e?.stopPropagation();
        // Optimistic Update: Update UI immediately
        setCategories(prev => prev.map(c =>
            c.id === category.id ? { ...c, is_active: !c.is_active } : c
        ));

        try {
            await categoryAPI.update(category.id, { ...category, is_active: !category.is_active });
            // No need to reload if successful, but can do silent sync to be safe
            loadCategories(true);
        } catch (error) {
            // Revert on failure
            loadCategories(true);
        }
    };

    // Collapse State
    const [collapsedIds, setCollapsedIds] = useState(new Set());

    // DnD State
    const draggingItemRef = React.useRef(null);
    const dragNode = React.useRef(null);

    const toggleCollapse = (id) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleDragStart = (e, category, node) => {
        draggingItemRef.current = category;
        dragNode.current = e.target;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', category.id);

        // Set Drag Image to the whole row
        if (node) {
            e.dataTransfer.setDragImage(node, 0, 0);
        }
    };

    const handleDragEnter = (e, targetCategory) => {
        e.preventDefault();
        e.stopPropagation();

        const draggingItem = draggingItemRef.current;

        if (!draggingItem || draggingItem.id === targetCategory.id) return;

        // Strict Sibling Check
        if (draggingItem.parent_id !== targetCategory.parent_id) return;

        setCategories(prev => {
            const list = [...prev];
            const dragIndex = list.findIndex(c => c.id === draggingItem.id);
            const targetIndex = list.findIndex(c => c.id === targetCategory.id);

            if (dragIndex === -1 || targetIndex === -1) return prev;
            if (dragIndex === targetIndex) return prev;

            // Perform Swap for visual feedback
            const newList = [...list];
            const [moved] = newList.splice(dragIndex, 1);
            newList.splice(targetIndex, 0, moved);

            return newList;
        });
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnd = async (e) => {
        if (dragNode.current) {
            dragNode.current.style.opacity = '1';
            dragNode.current = null;
        }

        draggingItemRef.current = null;

        // Trigger Save immediately
        saveOrder();
    };

    // Track categories for safe saving
    const categoriesRef = React.useRef(categories);
    useEffect(() => {
        categoriesRef.current = categories;
    }, [categories]);

    const saveOrder = async () => {
        const categories = categoriesRef.current; // access latest state
        const allUpdates = [];
        const byParent = {};

        categories.forEach(c => {
            const pid = c.parent_id || 'root';
            if (!byParent[pid]) byParent[pid] = [];
            byParent[pid].push(c);
        });

        Object.keys(byParent).forEach(pid => {
            const siblings = byParent[pid];
            siblings.forEach((cat, idx) => {
                if (cat.sort_order !== idx + 1) {
                    allUpdates.push({ id: cat.id, sort_order: idx + 1 });
                }
            });
        });

        if (allUpdates.length > 0) {
            try {
                await categoryAPI.reorder({ items: allUpdates });
                loadCategories(true); // Silent Sync
            } catch (e) {
                console.error(e);
                loadCategories(false); // Revert
            }
        }
    };



    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.headerActions}>
                    <button onClick={() => handleAdd(null)} style={styles.iconButton} title="대분류 추가">
                        <span>+</span> 대분류 추가
                    </button>
                </div>
            </div>

            <div style={styles.list}>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>로딩 중...</div>
                ) : mainCategories.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                        등록된 분류가 없습니다.
                    </div>
                ) : (
                    mainCategories.map(cat => (
                        <CategoryItem
                            key={cat.id}
                            category={cat}
                            isChild={false}
                            selectedCategoryId={selectedCategoryId}
                            collapsedIds={collapsedIds}
                            getChildren={getChildren}
                            toggleCollapse={toggleCollapse}
                            handleDragStart={handleDragStart}
                            handleDragEnter={handleDragEnter}
                            handleDragOver={handleDragOver}
                            handleDragEnd={handleDragEnd}
                            onSelectCategory={onSelectCategory}
                            handleToggleActive={handleToggleActive}
                            handleAdd={handleAdd}
                            handleEdit={handleEdit}
                            handleDelete={handleDelete}
                            styles={styles}
                        />
                    ))
                )}
            </div>

            {/* Input Modal */}
            <CategoryInputModal
                isOpen={inputModal.isOpen}
                onClose={() => setInputModal(prev => ({ ...prev, isOpen: false }))}
                onSuccess={() => {
                    loadCategories();
                    setInputModal(prev => ({ ...prev, isOpen: false }));
                }}
                initialData={inputModal.initialData}
                parentId={inputModal.parentId}
            />

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
        </div>
    );
}

export default CategoryManager;
