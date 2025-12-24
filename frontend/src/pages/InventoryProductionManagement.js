import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { purchaseInventoryAPI, inventoryProductionAPI, productAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import './InventoryProductionManagement.css';

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

        // Removed "Already added" check to allow adding remaining quantity
        // if (selectedIngredients.find(item => item.id === draggedItem.id)) { ... }

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
            <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
                <h1 className="page-title" style={{ margin: 0 }}>
                    🔨 재고 작업 (Repacking)
                </h1>
            </div>

            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

                <div style={{ display: 'flex', gap: '2rem', flex: 1, overflow: 'hidden' }}>

                    {/* [Left Panel] Available Ingredients */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #eef2f7' }}>
                        <div style={{ padding: '1.2rem', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fafbfc' }}>
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
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: '#fdfdfd' }}>
                            {filteredInventory.map(item => (
                                <div
                                    key={item.id}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    style={{
                                        backgroundColor: 'white',
                                        padding: '0.8rem',
                                        marginBottom: '0.5rem',
                                        borderRadius: '6px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                        border: '1px solid #eee',
                                        cursor: 'grab',
                                        position: 'relative',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 5px 12px rgba(0,0,0,0.08)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                                    }}
                                >
                                    {/* Top Row: Name, Weight, Grade, Qty, Price */}
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
                                            {item.product_name} {Number(item.product_weight) > 0 && `${Number(item.product_weight)}kg`} ({item.grade})
                                        </div>
                                        <div style={{ textAlign: 'center', color: '#2980b9', whiteSpace: 'nowrap' }}>
                                            {Number(item.remaining_quantity).toLocaleString()}개
                                        </div>
                                        <div style={{ textAlign: 'right', color: '#555', whiteSpace: 'nowrap' }}>
                                            {Number(item.unit_price).toLocaleString()}원
                                        </div>
                                    </div>

                                    {/* Bottom Row: Sender, Warehouse, Date */}
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                            <span>👤</span>
                                            <span title={item.sender}>{item.sender}</span>
                                            {item.company_name && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({item.company_name})</span>}
                                            <span style={{ marginLeft: '6px', color: '#999', borderLeft: '1px solid #ddd', paddingLeft: '6px' }}>{item.warehouse_name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>{item.purchase_date}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* [Arrow] */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bdc3c7', fontSize: '2rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#ecf0f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ➔
                        </div>
                    </div>

                    {/* [Right Panel] Workbench (Drop Zone) */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{
                            flex: 1.2,
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            boxShadow: isDragOver ? '0 0 0 2px #3498db, 0 8px 20px rgba(52, 152, 219, 0.2)' : '0 4px 15px rgba(0,0,0,0.05)',
                            overflow: 'hidden',
                            border: isDragOver ? '1px solid #3498db' : '1px solid #eef2f7',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{ padding: '1.2rem', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fff8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#e67e22' }}>🛠️ 작업대</h3>
                            <span style={{ fontSize: '0.8rem', color: '#e67e22', backgroundColor: '#fff3cd', padding: '2px 8px', borderRadius: '4px' }}>자재를 이곳으로 드래그하세요</span>
                        </div>

                        {/* Ingredient List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: isDragOver ? '#f0f9ff' : 'white', transition: 'background-color 0.2s' }}>
                            {selectedIngredients.length === 0 ? (
                                <div style={{
                                    height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    color: '#ccc', border: '2px dashed #eee', borderRadius: '8px'
                                }}>
                                    <span style={{ fontSize: '2rem', marginBottom: '10px' }}>📥</span>
                                    <span>자재를 드래그하여 추가하세요</span>
                                </div>
                            ) : selectedIngredients.map(item => (
                                <div key={item.id} style={{
                                    marginBottom: '10px',
                                    padding: '12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '8px',
                                    backgroundColor: 'white',
                                    position: 'relative'
                                }}>
                                    {/* Remove Button */}
                                    <button
                                        onClick={() => handleRemoveIngredient(item.id)}
                                        style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            border: 'none',
                                            background: 'transparent',
                                            color: '#999',
                                            fontSize: '1.2rem',
                                            cursor: 'pointer',
                                            padding: '0 4px',
                                            lineHeight: 1,
                                            zIndex: 1
                                        }}
                                        title="제거"
                                    >
                                        ×
                                    </button>

                                    {/* Top Row: Name, Qty, Price */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1fr)', gap: '10px', alignItems: 'center' }}>
                                        <div style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                            {item.product_name} {Number(item.product_weight) > 0 && `${Number(item.product_weight)}kg`} ({item.grade})
                                        </div>
                                        <div style={{ textAlign: 'center', color: '#2980b9', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                                            {Number(item.use_quantity).toLocaleString()}개
                                        </div>
                                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap', marginRight: '20px', color: '#555' }}>
                                            {Number(item.unit_price).toLocaleString()}원
                                        </div>
                                    </div>

                                    {/* Bottom Row: Sender, Warehouse, Date */}
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                            <span>👤</span>
                                            <span title={item.sender}>{item.sender}</span>
                                            {item.company_name && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({item.company_name})</span>}
                                            <span style={{ marginLeft: '6px', color: '#999', borderLeft: '1px solid #ddd', paddingLeft: '6px' }}>{item.warehouse_name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>{item.purchase_date}</span>
                                            <span style={{ height: '12px', borderLeft: '1px solid #ddd' }}></span>
                                            <span style={{ fontWeight: 'bold', color: '#e74c3c' }}>
                                                {(Number(item.unit_price) * Number(item.use_quantity)).toLocaleString()}원
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Cost & Output Config */}
                        <div style={{ padding: '1.5rem', backgroundColor: '#f8f9fa', borderTop: '1px solid #eee' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#2c3e50' }}>비용 설정</h4>
                                    <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#666' }}>재료비 합계</span>
                                        <strong>{totalIngredientCost.toLocaleString()} 원</strong>
                                    </div>

                                </div>

                                <div>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#2c3e50' }}>결과물 설정</h4>
                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#666' }}>생산 품목</label>
                                        <SearchableSelect
                                            options={productOptions}
                                            value={outputProductId}
                                            onChange={(opt) => setOutputProductId(opt?.value || '')}
                                            placeholder="품목 선택..."
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#666' }}>생산 수량</label>
                                        <input
                                            type="number"
                                            value={outputQuantity}
                                            onChange={e => { if (!e.target.value.includes('.') && Number(e.target.value) >= 0) setOutputQuantity(e.target.value) }}
                                            className="production-input text-right"
                                            step="1"
                                            min="0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '1.5rem 0' }} />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ marginTop: '2rem', backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #eef2f7', margin: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50', fontSize: '1.1rem' }}>📜 최근 작업 이력</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8f9fa', color: '#666', borderBottom: '2px solid #eee' }}>
                                <th style={{ padding: '10px', textAlign: 'left' }}>작업일시</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>생산 품목</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>수량</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>비고</th>
                                <th style={{ padding: '10px', textAlign: 'center' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>최근 이력이 없습니다.</td>
                                </tr>
                            ) : (
                                history.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '10px' }}>{new Date(item.created_at).toLocaleString()}</td>
                                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#333' }}>{item.output_product_name}</td>
                                        <td style={{ padding: '10px', textAlign: 'right', color: '#2980b9' }}>
                                            {Number(item.output_quantity).toLocaleString()}{item.unit}
                                        </td>
                                        <td style={{ padding: '10px', color: '#777' }}>{item.memo}</td>
                                        <td style={{ padding: '10px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleCancelProduction(item.id)}
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
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>


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
