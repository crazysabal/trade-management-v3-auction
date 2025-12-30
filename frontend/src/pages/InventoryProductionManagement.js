import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { purchaseInventoryAPI, inventoryProductionAPI, productAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import ProductionDetailModal from '../components/ProductionDetailModal'; // [NEW]
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

    // [NEW] Detail Modal State
    const [detailModal, setDetailModal] = useState({
        isOpen: false,
        productionId: null
    });

    useEffect(() => {
        loadData();
    }, []);

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
        setConfirmModal({
            isOpen: true,
            title: '작업 취소',
            message: '정말로 이 생산 이력을 취소하시겠습니까?\n(생산된 재고가 삭제되고 사용된 재료가 복구됩니다)',
            type: 'delete',
            showCancel: true,
            confirmText: '작업 취소',
            cancelText: '닫기',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setLoading(true);
                try {
                    await inventoryProductionAPI.cancel(id);
                    setConfirmModal({
                        isOpen: true,
                        title: '취소 완료',
                        message: '작업 이력이 취소되었습니다.',
                        type: 'success',
                        showCancel: false,
                        confirmText: '확인',
                        onConfirm: () => { }
                    });
                    loadData(); // Reload all data
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
            const weightStr = product.weight ? `${parseFloat(product.weight)}kg` : '';
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
            alert('수량을 입력하세요.');
            return;
        }

        if (qty > inputModal.maxQuantity) {
            alert(`최대 ${inputModal.maxQuantity}개까지 가능합니다.`);
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
        <div className="fade-in" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>


            <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>

                <div style={{ display: 'flex', gap: '12px', flex: 'none', overflow: 'hidden', alignItems: 'flex-start' }}>

                    {/* [Left Panel] Available Ingredients */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #eef2f7', height: '780px' }}>
                        <div style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fafbfc', height: '100px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#555' }}>📦 자재 선택</h3>
                                <span style={{ fontSize: '0.85rem', color: '#888', backgroundColor: '#eee', padding: '2px 8px', borderRadius: '10px' }}>{filteredInventory.length} 건</span>
                            </div>
                            <input
                                type="text"
                                placeholder="품목, 등급, 출하주, 창고, 매입처 검색..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.95rem' }}
                            />
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', backgroundColor: '#fdfdfd' }}>
                            {filteredInventory.map(item => (
                                <div
                                    key={item.id}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    // [NEW] Multi-select props
                                    onClick={(e) => toggleInventorySelection(e, item.id)}
                                    data-order={[...selectedInventoryIds].indexOf(item.id) + 1}
                                    className={`inventory-card ${selectedInventoryIds.has(item.id) ? 'selected' : ''}`}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="card-content">
                                        <div className="card-main-info" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ marginRight: 0 }}>{item.product_name}</span>
                                            {Number(item.product_weight) > 0 && <span style={{ color: '#555' }}>{Number(item.product_weight)}kg</span>}
                                            <span style={{ color: '#27ae60' }}>{item.sender}</span>
                                            {item.grade && <span style={{ color: '#7f8c8d' }}>({item.grade})</span>}

                                            <span style={{ flex: 1 }}></span>

                                            <span className="info-qty" style={{ fontWeight: 'bold', color: '#2980b9' }}>
                                                {Number(item.remaining_quantity).toLocaleString()}개
                                            </span>
                                            <span className="info-price" style={{ color: '#555' }}>
                                                {Number(item.unit_price).toLocaleString()}원
                                            </span>
                                        </div>

                                        <div className="card-sub-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid #f0f0f0', paddingTop: '4px' }}>
                                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: '#7f8c8d', alignItems: 'center', lineHeight: '1' }}>
                                                <span>{item.company_name || '-'}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#bdc3c7' }}>|</span>
                                                <span>{item.purchase_date}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#bdc3c7' }}>|</span>
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
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            boxShadow: isDragOver ? '0 0 0 2px #3498db, 0 8px 20px rgba(52, 152, 219, 0.2)' : '0 4px 15px rgba(0,0,0,0.05)',
                            overflow: 'hidden',
                            border: isDragOver ? '1px solid #3498db' : '1px solid #eef2f7',
                            transition: 'all 0.2s',
                            height: '780px'
                        }}
                    >
                        <div style={{ padding: '0.8rem', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fff8f0', display: 'flex', alignItems: 'center', gap: '8px', height: '100px', boxSizing: 'border-box' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#e67e22' }}>🛠️ 작업대</h3>
                            <span style={{ fontSize: '0.8rem', color: '#e67e22', backgroundColor: '#fff3cd', padding: '2px 8px', borderRadius: '4px' }}>자재를 이곳으로 드래그하세요</span>
                        </div>

                        {/* Ingredient List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', backgroundColor: isDragOver ? '#f0f9ff' : 'white', transition: 'background-color 0.2s' }}>
                            {selectedIngredients.length === 0 ? (
                                <div style={{
                                    height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    color: '#ccc', border: '2px dashed #eee', borderRadius: '8px'
                                }}>
                                    <span style={{ fontSize: '2rem', marginBottom: '10px' }}>📥</span>
                                    <span>자재를 드래그하여 추가하세요</span>
                                </div>
                            ) : selectedIngredients.map(item => (
                                <div key={item.id} className="inventory-card" style={{ position: 'relative' }}>
                                    {/* Remove Button */}
                                    <button
                                        onClick={() => handleRemoveIngredient(item.id)}
                                        style={{
                                            position: 'absolute',
                                            top: '4px',
                                            right: '4px',
                                            border: 'none',
                                            background: 'transparent',
                                            color: '#95a5a6',
                                            fontSize: '1.2rem',
                                            cursor: 'pointer',
                                            padding: '0 4px',
                                            lineHeight: 1,
                                            zIndex: 2
                                        }}
                                        title="제거"
                                    >
                                        ×
                                    </button>

                                    <div className="card-content">
                                        <div className="card-main-info" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingRight: '15px' }}>
                                            <span style={{ marginRight: 0 }}>{item.product_name}</span>
                                            {Number(item.product_weight) > 0 && <span style={{ color: '#555' }}>{Number(item.product_weight)}kg</span>}
                                            <span style={{ color: '#27ae60' }}>{item.sender}</span>
                                            {item.grade && <span style={{ color: '#7f8c8d' }}>({item.grade})</span>}

                                            <span style={{ flex: 1 }}></span>

                                            <span className="info-qty" style={{ fontWeight: 'bold', color: '#2980b9' }}>
                                                {Number(item.use_quantity).toLocaleString()}개
                                            </span>
                                            <span className="info-price" style={{ color: '#555' }}>
                                                {Number(item.unit_price).toLocaleString()}원
                                            </span>
                                        </div>

                                        <div className="card-sub-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid #f0f0f0', paddingTop: '4px' }}>
                                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: '#7f8c8d', alignItems: 'center', lineHeight: '1' }}>
                                                <span>{item.company_name || '-'}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#bdc3c7' }}>|</span>
                                                <span>{item.purchase_date}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#bdc3c7' }}>|</span>
                                                <span>{item.warehouse_name}</span>
                                            </div>
                                            <span style={{ fontWeight: 'bold', color: '#e74c3c' }}>
                                                {(Number(item.unit_price) * Number(item.use_quantity)).toLocaleString()}원
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Cost & Output Config */}
                        <div style={{ padding: '1.2rem', backgroundColor: '#f8f9fa', borderTop: '1px solid #eee' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Row 1: Cost */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '110px', color: '#555' }}>
                                        <span>💰</span>
                                        <span>재료비 합계</span>
                                    </div>
                                    <strong style={{ color: '#2c3e50', fontSize: '1.1rem' }}>{totalIngredientCost.toLocaleString()} 원</strong>
                                </div>

                                {/* Row 2: Output */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '110px', color: '#555' }}>
                                        <span>📦</span>
                                        <span>생산 결과</span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <SearchableSelect
                                            options={productOptions}
                                            value={outputProductId}
                                            onChange={(opt) => setOutputProductId(opt?.value || '')}
                                            placeholder="품목 선택..."
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input
                                            type="number"
                                            value={outputQuantity}
                                            onChange={e => { if (!e.target.value.includes('.') && Number(e.target.value) >= 0) setOutputQuantity(e.target.value) }}
                                            className="production-input text-right"
                                            step="1"
                                            min="0"
                                            placeholder="수량"
                                            style={{ width: '60px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'center' }}
                                        />
                                        <span style={{ color: '#666', fontSize: '0.9rem' }}>개</span>
                                    </div>
                                </div>
                                {/* Row 3: Memo Input */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '110px', color: '#555', marginTop: '6px' }}>
                                        <span>📝</span>
                                        <span>메모</span>
                                    </div>
                                    <textarea
                                        value={memo}
                                        onChange={e => setMemo(e.target.value)}
                                        placeholder="작업 관련 메모를 입력하세요..."
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            border: '1px solid #ddd',
                                            borderRadius: '4px',
                                            fontSize: '0.9rem',
                                            resize: 'vertical',
                                            minHeight: '40px',
                                            maxHeight: '80px',
                                            fontFamily: 'inherit'
                                        }}
                                    />
                                </div>
                                {/* Action Bar (Unified) */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ color: '#7f8c8d' }}>예상 생산 단가:</span>
                                        <strong style={{ fontSize: '1.4rem', color: '#27ae60' }}>{Number(estimatedUnitPrice).toLocaleString()} 원</strong>
                                    </div>

                                    <button
                                        onClick={handleSubmit}
                                        disabled={loading}
                                        style={{
                                            padding: '12px 30px', backgroundColor: '#e67e22', color: 'white',
                                            border: 'none', borderRadius: '6px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer',
                                            opacity: loading ? 0.7 : 1, boxShadow: '0 4px 6px rgba(230, 126, 34, 0.2)'
                                        }}
                                    >
                                        {loading ? '처리 중...' : '작업 완료'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* History Section [NEW] */}
                <div style={{ marginTop: '12px', backgroundColor: 'white', borderRadius: '12px', padding: '0.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #eef2f7' }}>
                    <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50', fontSize: '1.1rem' }}>📜 최근 작업 이력</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8f9fa', color: '#666', borderBottom: '2px solid #eee' }}>
                                    <th style={{ padding: '10px', textAlign: 'left' }}>작업일시</th>
                                    <th style={{ padding: '10px', textAlign: 'left' }}>생산 품목</th>
                                    <th style={{ padding: '10px', textAlign: 'right' }}>수량</th>
                                    <th style={{ padding: '10px', textAlign: 'right' }}>단가</th>
                                    <th style={{ padding: '10px', textAlign: 'left' }}>비고</th>
                                    <th style={{ padding: '10px', textAlign: 'center' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>로딩 중...</td></tr>
                                ) : history.length === 0 ? (
                                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>최근 이력이 없습니다.</td></tr>
                                ) : (
                                    history.map((historyItem) => {
                                        // Format: [Name] [Weight]kg ([Grade])
                                        const weightStr = Number(historyItem.output_product_weight || 0) > 0 ? ` ${Number(historyItem.output_product_weight)}kg` : '';
                                        const gradeStr = historyItem.output_product_grade ? ` (${historyItem.output_product_grade})` : '';
                                        const displayName = `${historyItem.output_product_name}${weightStr}${gradeStr}`;

                                        return (
                                            <tr key={historyItem.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                                <td style={{ padding: '10px' }}>
                                                    {(() => {
                                                        const d = new Date(historyItem.created_at);
                                                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toLocaleTimeString()}`;
                                                    })()}
                                                </td>
                                                <td style={{ padding: '10px', fontWeight: 'bold', color: '#2c3e50' }}>{displayName}</td>
                                                <td style={{ padding: '10px', textAlign: 'right' }}>{Number(historyItem.output_quantity).toLocaleString()}</td>
                                                <td style={{ padding: '10px', textAlign: 'right' }}>{Math.round(historyItem.unit_cost || 0).toLocaleString()} 원</td>
                                                <td style={{ padding: '10px', color: '#7f8c8d' }}>{historyItem.memo || '-'}</td>
                                                <td style={{ padding: '10px', textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                    <button
                                                        onClick={() => handleShowDetail(historyItem.id)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            color: '#2980b9',
                                                            backgroundColor: '#f0f9ff',
                                                            border: '1px solid #abd5f7',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}
                                                        title="재료 상세 보기"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                            <polyline points="14 2 14 8 20 8"></polyline>
                                                            <line x1="16" y1="13" x2="8" y2="13"></line>
                                                            <line x1="16" y1="17" x2="8" y2="17"></line>
                                                            <polyline points="10 9 9 9 8 9"></polyline>
                                                        </svg>
                                                        상세
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancelProduction(historyItem.id)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            color: '#c0392b',
                                                            backgroundColor: '#fff0f0',
                                                            border: '1px solid #fab1a0',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
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
                productionId={detailModal.productionId}
            />

            {/* Input Modal */}
            {
                inputModal.isOpen && createPortal(
                    <div className="modal-overlay" onClick={() => setInputModal({ isOpen: false, inventory: null, quantity: '', maxQuantity: 0 })}>
                        <div
                            className="qty-input-modal"
                            style={{
                                minWidth: '350px',
                                maxWidth: '400px',
                                backgroundColor: 'white',
                                padding: '1.5rem',
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50', textAlign: 'center', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', color: '#3498db' }}>
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                                </svg>
                                작업 수량 입력
                            </h3>

                            <div style={{
                                marginBottom: '1rem',
                                padding: '1.2rem',
                                backgroundColor: '#fff',
                                borderRadius: '12px',
                                border: '1px solid #e0e0e0',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)'
                            }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2c3e50', marginBottom: '1rem', textAlign: 'center' }}>
                                    {inputModal.inventory?.product_name}
                                    {Number(inputModal.inventory?.product_weight) > 0 && ` ${Number(inputModal.inventory?.product_weight)}kg`}
                                    {inputModal.inventory?.grade && ` (${inputModal.inventory?.grade})`}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', fontSize: '0.95rem' }}>

                                    <div style={{ display: 'flex', alignItems: 'center', color: '#555' }}>
                                        <span style={{ color: '#888', marginRight: '6px', minWidth: '50px' }}>생산자:</span>
                                        <strong>{inputModal.inventory?.sender}</strong>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', color: '#555' }}>
                                        <span style={{ color: '#888', marginRight: '6px', minWidth: '50px' }}>매입처:</span>
                                        {inputModal.inventory?.company_name}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', color: '#555' }}>
                                        <span style={{ color: '#888', marginRight: '6px', minWidth: '50px' }}>보관:</span>
                                        {inputModal.inventory?.warehouse_name}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', color: '#555' }}>
                                            <span style={{ color: '#888', marginRight: '6px' }}>매입일:</span>
                                            {inputModal.inventory?.purchase_date}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', color: '#555' }}>
                                            <span style={{ color: '#888', marginRight: '6px' }}>단가:</span>
                                            {Number(inputModal.inventory?.unit_price).toLocaleString()}원
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed #ddd', textAlign: 'center' }}>
                                    <span style={{ color: '#888', marginRight: '8px', fontSize: '0.9rem' }}>현재 잔고</span>
                                    <strong style={{ color: '#27ae60', fontSize: '1.2rem' }}>{Number(inputModal.maxQuantity).toLocaleString()}</strong>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#555' }}>투입 수량</label>
                                <input
                                    type="text"
                                    onFocus={(e) => e.target.select()}
                                    value={inputModal.quantity ? Number(inputModal.quantity.replace(/,/g, '')).toLocaleString() : ''}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/,/g, '');
                                        if (val === '' || /^\d+$/.test(val)) {
                                            setInputModal(prev => ({ ...prev, quantity: val }));
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleInputConfirm();
                                        if (e.key === 'Escape') setInputModal({ isOpen: false, inventory: null, quantity: '', maxQuantity: 0 });
                                    }}
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '0.8rem',
                                        fontSize: '1.2rem',
                                        border: '2px solid #3498db',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                        fontWeight: 'bold',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setInputModal({ isOpen: false, inventory: null, quantity: '', maxQuantity: 0 })}
                                    style={{
                                        flex: 1,
                                        padding: '0.8rem',
                                        backgroundColor: '#95a5a6',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '1rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleInputConfirm}
                                    style={{
                                        flex: 1,
                                        padding: '0.8rem',
                                        backgroundColor: '#3498db',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '1rem',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    추가
                                </button>
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
