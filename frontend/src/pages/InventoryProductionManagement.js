import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { purchaseInventoryAPI, inventoryProductionAPI, productAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import ProductionDetailModal from '../components/ProductionDetailModal';
import { useModalDraggable } from '../hooks/useModalDraggable'; // [NEW]
import './InventoryProductionManagement.css';
import '../styles/InventoryTransfer.css';

const InventoryProductionManagement = () => {
    // --- State ---
    const [availableInventory, setAvailableInventory] = useState([]);
    const [selectedIngredients, setSelectedIngredients] = useState([]);
    const [products, setProducts] = useState([]);
    const [history, setHistory] = useState([]); // [NEW] History State

    // Output Form
    const [outputProductId, setOutputProductId] = useState('');
    const [outputQuantity, setOutputQuantity] = useState(1);
    const [sender, setSender] = useState(''); // [NEW] 출하주
    const [memo, setMemo] = useState('');

    // Input Modal State
    const [inputModal, setInputModal] = useState({
        isOpen: false,
        inventory: null,
        quantity: '',
        maxQuantity: 0
    });

    // Confirmation Modal
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { }
    });

    // UI State
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDragOver, setIsDragOver] = useState(false); // Drop Zone Visual

    const [draggedItem, setDraggedItem] = useState(null);
    const [selectedInventoryIds, setSelectedInventoryIds] = useState(new Set()); // [NEW] Multi-select State

    const [detailModal, setDetailModal] = useState({
        isOpen: false,
        productionId: null
    });

    const { handleMouseDown: handleInputDrag, draggableStyle: inputDragStyle } = useModalDraggable(inputModal.isOpen, { isCentered: true });

    useEffect(() => {
        loadData();
    }, []);

    // [NEW] 작업대 품목 수에 따른 출하주 자동 입력/초기화
    useEffect(() => {
        if (selectedIngredients.length === 1) {
            // 품목이 1건일 때 해당 품목의 출하주 자동 입력
            setSender(selectedIngredients[0].sender || '');
        } else if (selectedIngredients.length === 0 || selectedIngredients.length >= 2) {
            // 0건이거나 2건 이상일 때 초기화
            setSender('');
        }
    }, [selectedIngredients]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [invRes, prodRes, histRes] = await Promise.all([
                purchaseInventoryAPI.getAll({ has_remaining: 'true', status: 'AVAILABLE' }),
                productAPI.getAll(),
                inventoryProductionAPI.getRecent() // [NEW] Fetch History
            ]);
            setAvailableInventory(invRes.data.data || []);
            setProducts(prodRes.data.data || []);
            setHistory(histRes.data.data || []);
        } catch (error) {
            console.error('Initial Load Error:', error);
            // alert('데이터 로딩 실패');
            setConfirmModal({
                isOpen: true,
                title: '오류',
                message: '데이터 로딩 실패',
                type: 'warning',
                showCancel: false,
                confirmText: '확인',
                onConfirm: () => { }
            });
        } finally {
            setLoading(false);
        }
    };

    // --- Drag & Drop Handlers ---
    const handleDragStart = (e, item) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify(item));
        // Drag Image styling if needed, default ghost is usually fine
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        setIsDragOver(false);
    };



    const handleRemoveIngredient = (id) => {
        setSelectedIngredients(prev => prev.filter(i => i.id !== id));
    };

    const handleQuantityChange = (id, val) => {
        if (val.includes('.')) return;
        const num = Number(val);
        if (num < 0) return;
        setSelectedIngredients(prev => prev.map(item => {
            if (item.id === id) {
                if (num > item.remaining_quantity) return { ...item, use_quantity: item.remaining_quantity };
                return { ...item, use_quantity: val };
            }
            return item;
        }));
    };



    const handleSubmit = async () => {
        if (selectedIngredients.length === 0) {
            setConfirmModal({ isOpen: true, title: '확인', message: '재료를 선택해주세요.', type: 'warning', showCancel: false, confirmText: '확인', onConfirm: () => { } });
            return;
        }
        if (!outputProductId) {
            setConfirmModal({ isOpen: true, title: '확인', message: '생산할 품목을 선택해주세요.', type: 'warning', showCancel: false, confirmText: '확인', onConfirm: () => { } });
            return;
        }
        if (outputQuantity <= 0) {
            setConfirmModal({ isOpen: true, title: '확인', message: '생산 수량을 입력해주세요.', type: 'warning', showCancel: false, confirmText: '확인', onConfirm: () => { } });
            return;
        }

        setConfirmModal({
            isOpen: true,
            title: '작업 확인',
            message: `총 ${selectedIngredients.length}개의 재료를 사용하여 작업을 진행하시겠습니까?`,
            type: 'confirm', // Default question style
            showCancel: true,
            confirmText: '생산 확정',
            cancelText: '취소',
            onConfirm: executeProduction
        });
    };

    const executeProduction = async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
            const payload = {
                ingredients: selectedIngredients.map(i => ({
                    inventory_id: i.id,
                    use_quantity: i.use_quantity
                })),
                output_product_id: outputProductId,
                output_quantity: outputQuantity,
                sender: sender, // [NEW] 출하주
                additional_cost: 0,
                memo
            };

            await inventoryProductionAPI.create(payload);
            setConfirmModal({
                isOpen: true,
                title: '작업 완료',
                message: '생산 작업이 정상적으로 처리되었습니다.',
                type: 'success',
                showCancel: false,
                confirmText: '확인',
                onConfirm: () => { }
            });

            // Reset
            setSelectedIngredients([]);
            setOutputProductId('');
            setOutputQuantity(1);
            setSender(''); // [NEW] 출하주 리셋
            setMemo('');
            loadData();

        } catch (error) {
            console.error('Submit Error:', error);
            setConfirmModal({
                isOpen: true,
                title: '작업 실패',
                message: '작업 처리 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message),
                type: 'warning',
                showCancel: false,
                confirmText: '확인',
                onConfirm: () => { }
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCancelProduction = async (id) => {
        const target = history.find(h => h.id === id);
        const weightStr = Number(target?.output_product_weight || 0) > 0 ? ` ${Number(target.output_product_weight)}${target.output_product_weight_unit || 'kg'}` : '';
        const gradeStr = target?.output_product_grade ? ` (${target.output_product_grade})` : '';
        const displayName = `${target?.output_product_name || '작업'}${weightStr}${gradeStr}`;

        const createdDate = target ? new Date(target.created_at).toLocaleDateString() : '';

        setConfirmModal({
            isOpen: true,
            title: '생산 작업 취소',
            message: `'${createdDate} ${displayName}' 생산 이력을 취소하시겠습니까?\n\n[주의]\n1. 생산된 재고가 삭제됩니다.\n2. 사용된 재료가 원본 재고로 복구됩니다.`,
            type: 'delete',
            showCancel: true,
            confirmText: '작업 취소 실행',
            cancelText: '닫기',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setLoading(true);
                try {
                    await inventoryProductionAPI.cancel(id);
                    setConfirmModal({
                        isOpen: true,
                        title: '취소 완료',
                        message: '생산 작업이 정상적으로 취소되었습니다.',
                        type: 'success',
                        showCancel: false,
                        confirmText: '확인',
                        onConfirm: () => { }
                    });
                    loadData();
                } catch (error) {
                    console.error('Cancel Error:', error);
                    setConfirmModal({
                        isOpen: true,
                        title: '취소 실패',
                        message: '취소 처리 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message),
                        type: 'warning',
                        showCancel: false,
                        confirmText: '확인',
                        onConfirm: () => { }
                    });
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleShowDetail = (id) => {
        setDetailModal({ isOpen: true, productionId: id });
    };

    // --- Multi-Select Handler ---
    const toggleInventorySelection = (e, id) => {
        // Prevent drag start if clicking only
        // e.stopPropagation(); // Might interfere with drag if not careful, but needed for click

        const newSet = new Set(selectedInventoryIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedInventoryIds(newSet);
    };

    // --- Calculations ---
    const totalIngredientCost = useMemo(() => {
        return selectedIngredients.reduce((sum, item) => {
            return sum + (Number(item.unit_price) * Number(item.use_quantity));
        }, 0);
    }, [selectedIngredients]);

    const finalTotalCost = totalIngredientCost;
    const estimatedUnitPrice = outputQuantity > 0 ? (finalTotalCost / outputQuantity) : 0;

    const filteredInventory = availableInventory
        .map(item => {
            const selected = selectedIngredients.find(i => i.id === item.id);
            if (selected) {
                return {
                    ...item,
                    remaining_quantity: Number(item.remaining_quantity) - Number(selected.use_quantity)
                };
            }
            return item;
        })
        .filter(item => {
            if (item.remaining_quantity <= 0) return false;
            if (!searchTerm) return true;

            const lowerTerm = searchTerm.toLowerCase();
            return (
                (item.product_name && item.product_name.toLowerCase().includes(lowerTerm)) ||
                (item.grade && item.grade.toLowerCase().includes(lowerTerm)) ||
                (item.sender && item.sender.toLowerCase().includes(lowerTerm)) ||
                (item.company_name && item.company_name.toLowerCase().includes(lowerTerm)) ||
                (item.warehouse_name && item.warehouse_name.toLowerCase().includes(lowerTerm))
            );
        });

    const productOptions = useMemo(() => {
        const sorted = [...products].sort((a, b) => {
            const nameCompare = (a.product_name || '').localeCompare(b.product_name || '', 'ko');
            if (nameCompare !== 0) return nameCompare;
            return (a.sort_order || 0) - (b.sort_order || 0);
        });

        return sorted.map(product => {
            const weightStr = product.weight ? `${parseFloat(product.weight)}${product.weight_unit || 'kg'}` : '';
            return {
                value: product.id,
                label: `${product.product_name}${weightStr ? ` ${weightStr}` : ''}${product.grade ? ` (${product.grade})` : ''}`
            };
        });
    }, [products]);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);

        if (!draggedItem) return;

        // Check if bulk drag
        if (selectedInventoryIds.has(draggedItem.id)) {
            // Bulk Add
            const itemsToAdd = availableInventory.filter(item => selectedInventoryIds.has(item.id));

            handleAddIngredientsBulk(itemsToAdd);

            // Clear selection after drop? Optional. Let's clear it for better UX.
            setSelectedInventoryIds(new Set());
            setDraggedItem(null);
            return;
        }

        const availableQty = parseFloat(draggedItem.remaining_quantity);

        // Open Input Modal
        setInputModal({
            isOpen: true,
            inventory: draggedItem,
            quantity: availableQty.toString(), // Default to max
            maxQuantity: availableQty
        });

        setDraggedItem(null);
    };

    const handleAddIngredientsBulk = (items) => {
        setSelectedIngredients(prev => {
            const currentIds = new Set(prev.map(p => p.id));
            const newItems = [...prev];

            items.forEach(newItem => {
                if (currentIds.has(newItem.id)) {
                    // Update existing component? Maybe just add remaining? 
                    // Logic: If already exists, we maximize usage or add nothing?
                    // Let's maximize based on remaining_quantity.
                    // But filteredInventory logic subtracts used quantity.
                    // If we drag from filteredInventory, 'remaining_quantity' is the *available* remaining.
                    // So we can assume we add that amount.

                    // Actually, if it's already in selectedIngredients, handleAddIngredient logic is:
                    // new_use = old_use + added.
                    // If we bulk add, we assume we add *all remaining*.
                    const existingIndex = newItems.findIndex(p => p.id === newItem.id);
                    const existingItem = newItems[existingIndex];

                    // Allow adding up to real remaining?
                    // "remaining_quantity" in "filteredInventory" is (Total - Used).
                    // So we add that amount.
                    // But "newItem" comes from "availableInventory" (Total).
                    // We need to calculate how much is left to add.

                    // Simpler approach: Just use handleAddIngredient logic for each, but we need the quantity.
                    // We assume quantity = (Item's Total Remaining - Already Used).
                    // But checking `availableInventory` gives us Total Remaining.
                    // We need to know how much is already used in `selectedIngredients`.

                    const alreadyUsed = Number(existingItem.use_quantity);
                    const totalRem = Number(newItem.remaining_quantity);
                    const canAdd = totalRem - alreadyUsed;

                    if (canAdd > 0) {
                        newItems[existingIndex] = { ...existingItem, use_quantity: totalRem };
                    }
                } else {
                    newItems.push({ ...newItem, use_quantity: Number(newItem.remaining_quantity) });
                }
            });

            return newItems;
        });
        setSearchTerm('');
    };

    const handleInputConfirm = () => {
        const qty = parseFloat(inputModal.quantity) || 0;

        if (qty <= 0) {
            setConfirmModal({
                isOpen: true,
                type: 'warning',
                title: '수량 입력',
                message: '수량을 입력하세요.',
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                showCancel: false
            });
            return;
        }

        if (qty > inputModal.maxQuantity) {
            setConfirmModal({
                isOpen: true,
                type: 'warning',
                title: '수량 초과',
                message: `최대 ${inputModal.maxQuantity}개까지 가능합니다.`,
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                showCancel: false
            });
            return;
        }

        const initialQuantity = parseInt(qty, 10);
        handleAddIngredient(inputModal.inventory, initialQuantity);
        setInputModal({ isOpen: false, inventory: null, quantity: '', maxQuantity: 0 });
    };

    const handleAddIngredient = (item, quantity) => {
        setSelectedIngredients(prev => {
            const exists = prev.find(p => p.id === item.id);
            if (exists) {
                return prev.map(p => p.id === item.id
                    ? { ...p, use_quantity: Number(p.use_quantity) + quantity }
                    : p
                );
            }
            return [...prev, { ...item, use_quantity: quantity }];
        });
        setSearchTerm('');
    };

    return (
        <div className="production-container fade-in">
            <div className="production-page-body">
                <div className="production-main-columns">

                    {/* [Left Panel] Available Ingredients */}
                    <div className="production-panel">
                        <div className="panel-header ingredients">
                            <div className="panel-header-row" style={{ gap: '1rem', marginBottom: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 'fit-content' }}>
                                    <h3 className="panel-title">📦 자재 선택</h3>
                                    <span className="badge-count">{filteredInventory.length} 건</span>
                                </div>
                                <div className="search-input-wrapper" style={{ flex: 1, marginTop: 0 }}>
                                    <input
                                        type="text"
                                        className="production-input"
                                        placeholder="품목, 등급, 출하주, 창고, 매입처 검색..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="panel-content">
                            {filteredInventory.length === 0 ? (
                                <div style={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#ccc',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}>
                                    <span style={{ fontSize: '2rem' }}>📦</span>
                                    <span>가용 재고가 없습니다.</span>
                                </div>
                            ) : filteredInventory.map(item => (
                                <div
                                    key={item.id}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    onClick={(e) => toggleInventorySelection(e, item.id)}
                                    data-order={[...selectedInventoryIds].indexOf(item.id) + 1}
                                    className={`inventory-card ${selectedInventoryIds.has(item.id) ? 'selected' : ''}`}
                                >
                                    <div className="card-content">
                                        <div className="card-main-info">
                                            <span>{item.product_name}</span>
                                            {Number(item.product_weight) > 0 && <span style={{ color: '#555' }}>{Number(item.product_weight)}{item.weight_unit || 'kg'}</span>}
                                            <span style={{ color: '#27ae60' }}>{item.sender}</span>
                                            {item.grade && <span style={{ color: '#7f8c8d' }}>({item.grade})</span>}
                                            <span style={{ flex: 1 }}></span>
                                            <span className="info-qty">{Number(item.remaining_quantity).toLocaleString()}개</span>
                                            <span className="info-price">{Number(item.unit_price).toLocaleString()}원</span>
                                        </div>

                                        <div className="card-sub-info">
                                            <div className="sub-info-text">
                                                <span>{item.company_name || '-'}</span>
                                                <span className="sub-info-divider">|</span>
                                                <span>{item.purchase_date?.substring(5)}</span>
                                                <span className="sub-info-divider">|</span>
                                                <span>{item.warehouse_name}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* [Right Panel] Workbench (Drop Zone) */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`production-panel workbench drop-zone ${isDragOver ? 'drag-over' : ''}`}
                    >
                        <div className="panel-header workbench">
                            <div className="panel-header-row">
                                <h3 className="panel-title workbench-title">🛠️ 작업대</h3>
                                <span className="workbench-guide">자재를 이곳으로 드래그하세요</span>
                            </div>
                        </div>

                        {/* Ingredient List */}
                        <div className={`panel-content ${isDragOver ? 'drag-over' : ''}`}>
                            {selectedIngredients.length === 0 ? (
                                <div className="empty-workbench">
                                    <span className="empty-workbench-icon">📥</span>
                                    <span>자재를 드래그하여 추가하세요</span>
                                </div>
                            ) : selectedIngredients.map(item => (
                                <div key={item.id} className="inventory-card">
                                    <button
                                        onClick={() => handleRemoveIngredient(item.id)}
                                        className="close-btn"
                                        style={{ position: 'absolute', top: '4px', right: '4px', zIndex: 2 }}
                                        title="제거"
                                    >
                                        ×
                                    </button>

                                    <div className="card-content">
                                        <div className="card-main-info" style={{ paddingRight: '15px' }}>
                                            <span>{item.product_name}</span>
                                            {Number(item.product_weight) > 0 && <span style={{ color: '#555' }}>{Number(item.product_weight)}{item.weight_unit || 'kg'}</span>}
                                            <span style={{ color: '#27ae60' }}>{item.sender}</span>
                                            {item.grade && <span style={{ color: '#7f8c8d' }}>({item.grade})</span>}
                                            <span style={{ flex: 1 }}></span>
                                            <span className="info-qty">{Number(item.use_quantity).toLocaleString()}개</span>
                                            <span className="info-price">{Number(item.unit_price).toLocaleString()}원</span>
                                        </div>

                                        <div className="card-sub-info">
                                            <div className="sub-info-text">
                                                <span>{item.company_name || '-'}</span>
                                                <span className="sub-info-divider">|</span>
                                                <span>{item.purchase_date?.substring(5)}</span>
                                                <span className="sub-info-divider">|</span>
                                                <span>{item.warehouse_name}</span>
                                            </div>
                                            <span className="sub-info-total">
                                                {(Number(item.unit_price) * Number(item.use_quantity)).toLocaleString()}원
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Cost & Output Config */}
                        <div className="workbench-footer">
                            <div className="footer-config-container">
                                <div className="config-row">
                                    <div className="row-label">
                                        <span>💰</span>
                                        <span>재료비 합계</span>
                                    </div>
                                    <strong className="config-total-value">{totalIngredientCost.toLocaleString()} 원</strong>
                                </div>

                                <div className="output-config">
                                    <div className="row-label">
                                        <span>📦</span>
                                        <span>생산 결과</span>
                                    </div>
                                    <div className="output-select-wrapper">
                                        <SearchableSelect
                                            options={productOptions}
                                            value={outputProductId}
                                            onChange={(opt) => setOutputProductId(opt?.value || '')}
                                            placeholder="품목 선택..."
                                        />
                                    </div>
                                    <div className="output-qty-wrapper">
                                        <input
                                            type="number"
                                            value={outputQuantity}
                                            onChange={e => { if (!e.target.value.includes('.') && Number(e.target.value) >= 0) setOutputQuantity(e.target.value) }}
                                            className="output-qty-input"
                                            step="1"
                                            min="0"
                                            placeholder="수량"
                                        />
                                        <span style={{ color: '#666', fontSize: '0.9rem' }}>개</span>
                                    </div>
                                </div>

                                <div className="config-row">
                                    <div className="row-label">
                                        <span>👤</span>
                                        <span>출하주</span>
                                    </div>
                                    <input
                                        type="text"
                                        className="production-input"
                                        value={sender}
                                        onChange={e => setSender(e.target.value)}
                                        placeholder="생산물 출하주 정보를 입력하세요..."
                                        style={{ flex: 1 }}
                                    />
                                </div>

                                <div className="config-row">
                                    <div className="row-label">
                                        <span>📝</span>
                                        <span>메모</span>
                                    </div>
                                    <textarea
                                        value={memo}
                                        className="memo-input"
                                        onChange={e => setMemo(e.target.value)}
                                        placeholder="작업 관련 메모를 입력하세요..."
                                    />
                                </div>

                                <div className="action-bar">
                                    <div className="price-summary">
                                        <span className="price-summary-label">예상 생산 단가:</span>
                                        <strong className="price-summary-value">{Math.round(estimatedUnitPrice).toLocaleString()} 원</strong>
                                    </div>

                                    <button
                                        onClick={handleSubmit}
                                        disabled={loading}
                                        className="submit-btn"
                                    >
                                        {loading ? '처리 중...' : '작업 완료'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* History Section [NEW] */}
                <div className="history-container">
                    <h3 className="history-title">📜 최근 작업 이력</h3>
                    <div className="history-table-wrapper">
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>작업일시</th>
                                    <th>생산 품목</th>
                                    <th style={{ textAlign: 'right' }}>수량</th>
                                    <th style={{ textAlign: 'right' }}>단가</th>
                                    <th>비고</th>
                                    <th style={{ textAlign: 'center' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>로딩 중...</td></tr>
                                ) : history.length === 0 ? (
                                    <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>최근 이력이 없습니다.</td></tr>
                                ) : (
                                    history.map((historyItem) => {
                                        const weightStr = Number(historyItem.output_product_weight || 0) > 0 ? ` ${Number(historyItem.output_product_weight)}${historyItem.output_product_weight_unit || 'kg'}` : '';
                                        const gradeStr = historyItem.output_product_grade ? ` (${historyItem.output_product_grade})` : '';
                                        const displayName = `${historyItem.output_product_name}${weightStr}${gradeStr}`;

                                        return (
                                            <tr key={historyItem.id}>
                                                <td className="history-item-date">
                                                    {(() => {
                                                        const d = new Date(historyItem.created_at);
                                                        return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                                    })()}
                                                </td>
                                                <td className="history-item-name">{displayName}</td>
                                                <td className="history-item-qty">{Number(historyItem.output_quantity).toLocaleString()}</td>
                                                <td className="history-item-price">{Math.round(historyItem.unit_cost || 0).toLocaleString()} 원</td>
                                                <td style={{ color: '#7f8c8d' }}>{historyItem.memo || '-'}</td>
                                                <td className="history-actions">
                                                    <button onClick={() => handleShowDetail(historyItem.id)} className="history-btn detail" title="재료 상세 보기">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                            <polyline points="14 2 14 8 20 8"></polyline>
                                                            <line x1="16" y1="13" x2="8" y2="13"></line>
                                                            <line x1="16" y1="17" x2="8" y2="17"></line>
                                                            <polyline points="10 9 9 9 8 9"></polyline>
                                                        </svg>
                                                        상세
                                                    </button>
                                                    <button onClick={() => handleCancelProduction(historyItem.id)} className="history-btn cancel">
                                                        취소
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>





            {/* Detail Modal */}
            {/* Detail Modal */}
            <ProductionDetailModal
                isOpen={detailModal.isOpen}
                onClose={() => setDetailModal({ isOpen: false, productionId: null })}
                jobId={detailModal.productionId}
            />

            {/* Input Modal */}
            {
                inputModal.isOpen && createPortal(
                    <div className="modal-overlay" style={{ zIndex: 12000 }}>
                        <div
                            className="qty-input-modal"
                            style={inputDragStyle}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header-premium draggable-header" onMouseDown={handleInputDrag}>
                                <h3 className="modal-header-title drag-pointer-none">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3498db' }}>
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                                    </svg>
                                    자재 투입 수량 설정
                                </h3>
                                <button className="close-btn drag-pointer-auto" onClick={() => setInputModal({ isOpen: false, inventory: null, quantity: '', maxQuantity: 0 })}>&times;</button>
                            </div>

                            <div className="modal-body-premium">
                                <div style={{
                                    backgroundColor: '#f8fafc',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    marginBottom: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                    fontSize: '0.9rem',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b' }}>품목/중량</span>
                                        <span style={{ fontWeight: '600', color: '#1e293b' }}>
                                            {inputModal.inventory?.product_name} {inputModal.inventory?.product_weight ? `${parseFloat(inputModal.inventory?.product_weight)}${inputModal.inventory?.weight_unit || inputModal.inventory?.product_weight_unit || 'kg'}` : ''}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b' }}>출하주/등급</span>
                                        <span style={{ fontWeight: '600', color: '#1e293b' }}>
                                            {inputModal.inventory?.sender || '-'} / {inputModal.inventory?.grade || '-'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b' }}>매입처/창고</span>
                                        <span style={{ fontWeight: '600', color: '#1e293b' }}>
                                            {inputModal.inventory?.company_name} / {inputModal.inventory?.warehouse_name}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b' }}>매입 일자</span>
                                        <span style={{ fontWeight: '600', color: '#1e293b' }}>
                                            {inputModal.inventory?.purchase_date}
                                        </span>
                                    </div>
                                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '0.4rem 0' }}></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: '#64748b' }}>현재 가용 재고</span>
                                        <span style={{ fontWeight: 'bold', color: '#2563eb', fontSize: '1.1rem' }}>
                                            {parseFloat(inputModal.maxQuantity).toString()} 개
                                        </span>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#475569', fontSize: '0.95rem' }}>투입할 수량 입력</label>
                                    <input
                                        type="text"
                                        onFocus={(e) => e.target.select()}
                                        className="qty-input-large"
                                        value={inputModal.quantity ? Number(inputModal.quantity.replace(/,/g, '')).toLocaleString() : ''}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/,/g, '');
                                            if (val === '' || /^\d+$/.test(val)) {
                                                setInputModal(prev => ({ ...prev, quantity: val }));
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleInputConfirm();
                                        }}
                                        autoFocus
                                    />
                                    <span className="modal-qty-guide" style={{ color: inputModal.quantity > inputModal.maxQuantity ? '#ef4444' : '#64748b' }}>
                                        {inputModal.quantity > inputModal.maxQuantity ? '⚠️ 가용 재고를 초과할 수 없습니다.' : `최대 ${parseFloat(inputModal.maxQuantity).toString()}개 입력 가능`}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={() => setInputModal({ isOpen: false, inventory: null, quantity: '', maxQuantity: 0 })}
                                        className="modal-btn modal-btn-cancel"
                                        style={{ flex: 1, height: '48px' }}
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleInputConfirm}
                                        className="modal-btn modal-btn-primary"
                                        style={{ flex: 1, height: '48px', fontWeight: 'bold' }}
                                    >
                                        작업대에 추가
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* Confirm Modal */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                showCancel={confirmModal.showCancel}
                confirmText={confirmModal.confirmText}
                cancelText={confirmModal.cancelText}
            />
        </div>
    );
};

export default InventoryProductionManagement;
