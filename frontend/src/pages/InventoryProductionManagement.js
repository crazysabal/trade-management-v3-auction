import React, { useState, useEffect, useMemo } from 'react';
import { purchaseInventoryAPI, inventoryProductionAPI, productAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';

const InventoryProductionManagement = () => {
    // --- State ---
    const [availableInventory, setAvailableInventory] = useState([]);
    const [selectedIngredients, setSelectedIngredients] = useState([]);
    const [products, setProducts] = useState([]);

    // Output Form
    const [outputProductId, setOutputProductId] = useState('');
    const [outputQuantity, setOutputQuantity] = useState(1);
    const [additionalCost, setAdditionalCost] = useState(0);
    const [memo, setMemo] = useState('');

    // UI State
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDragOver, setIsDragOver] = useState(false); // Drop Zone Visual

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [invRes, prodRes] = await Promise.all([
                purchaseInventoryAPI.getAll({ has_remaining: 'true', status: 'AVAILABLE' }),
                productAPI.getAll()
            ]);
            setAvailableInventory(invRes.data.data || []);
            setProducts(prodRes.data.data || []);
        } catch (error) {
            console.error('Initial Load Error:', error);
            alert('데이터 로딩 실패');
        } finally {
            setLoading(false);
        }
    };

    // --- Drag & Drop Handlers ---
    const handleDragStart = (e, item) => {
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

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const data = e.dataTransfer.getData('application/json');
        if (data) {
            try {
                const item = JSON.parse(data);
                handleAddIngredient(item);
            } catch (err) {
                console.error('Drop Parse Error', err);
            }
        }
    };

    // --- Logic Handlers ---
    const handleAddIngredient = (item) => {
        if (selectedIngredients.find(i => i.id === item.id)) return; // No duplicates

        const newItem = {
            ...item,
            use_quantity: item.remaining_quantity // Default to max
        };
        setSelectedIngredients(prev => [...prev, newItem]);
    };

    const handleRemoveIngredient = (id) => {
        setSelectedIngredients(prev => prev.filter(i => i.id !== id));
    };

    const handleQuantityChange = (id, val) => {
        const num = Number(val);
        setSelectedIngredients(prev => prev.map(item => {
            if (item.id === id) {
                if (num > item.remaining_quantity) return { ...item, use_quantity: item.remaining_quantity };
                return { ...item, use_quantity: num };
            }
            return item;
        }));
    };

    const handleSubmit = async () => {
        if (selectedIngredients.length === 0) return alert('재료를 선택해주세요.');
        if (!outputProductId) return alert('생산할 품목을 선택해주세요.');
        if (outputQuantity <= 0) return alert('생산 수량을 입력해주세요.');

        if (!window.confirm(`총 ${selectedIngredients.length}개의 재료를 사용하여 작업을 진행하시겠습니까?`)) return;

        setLoading(true);
        try {
            const payload = {
                ingredients: selectedIngredients.map(i => ({
                    inventory_id: i.id,
                    use_quantity: i.use_quantity
                })),
                output_product_id: outputProductId,
                output_quantity: outputQuantity,
                additional_cost: additionalCost,
                memo
            };

            await inventoryProductionAPI.create(payload);
            alert('작업이 완료되었습니다.');

            // Reset
            setSelectedIngredients([]);
            setOutputProductId('');
            setOutputQuantity(1);
            setAdditionalCost(0);
            setMemo('');
            loadData();

        } catch (error) {
            console.error('Submit Error:', error);
            alert('작업 실패: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    // --- Calculations ---
    const totalIngredientCost = useMemo(() => {
        return selectedIngredients.reduce((sum, item) => {
            return sum + (Number(item.unit_price) * Number(item.use_quantity));
        }, 0);
    }, [selectedIngredients]);

    const finalTotalCost = totalIngredientCost + Number(additionalCost);
    const estimatedUnitPrice = outputQuantity > 0 ? (finalTotalCost / outputQuantity) : 0;

    const filteredInventory = availableInventory.filter(item => {
        if (selectedIngredients.find(i => i.id === item.id)) return false;
        if (!searchTerm) return true;
        return item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.grade?.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const productOptions = products.map(p => ({
        value: p.id,
        label: `${p.product_name} (${p.grade}, ${p.weight})`
    }));

    return (
        <div className="fade-in" style={{ padding: '2rem', height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <h2 style={{ color: '#2c3e50', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.8rem' }}>🔨</span> 재고 작업 (Repacking)
            </h2>

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
                            placeholder="품목명, 등급 검색..."
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
                                onClick={() => handleAddIngredient(item)}
                                style={{
                                    padding: '12px',
                                    border: '1px solid #eee',
                                    borderRadius: '8px',
                                    marginBottom: '10px',
                                    backgroundColor: 'white',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                                    cursor: 'grab',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 5px 12px rgba(0,0,0,0.08)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.02)';
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>{item.product_name}</span>
                                    <span style={{ fontWeight: 'bold', color: '#2980b9' }}>{Number(item.remaining_quantity).toLocaleString()}개</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#7f8c8d' }}>
                                    <span>{item.grade} | {item.warehouse_name}</span>
                                    <span>{Number(item.unit_price).toLocaleString()}원</span>
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
                                display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '12px',
                                padding: '12px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fafafa'
                            }}>
                                <div style={{ flex: 1.5 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#333' }}>{item.product_name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#888' }}>단가: {Number(item.unit_price).toLocaleString()}원</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', display: 'block', color: '#666', marginBottom: '4px' }}>투입 수량 (Max: {item.remaining_quantity})</label>
                                    <input
                                        type="number"
                                        value={item.use_quantity}
                                        onChange={e => handleQuantityChange(item.id, e.target.value)}
                                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                                    />
                                </div>
                                <div style={{ flex: 1, textAlign: 'right' }}>
                                    <div style={{ fontWeight: 'bold', color: '#e74c3c' }}>{(Number(item.unit_price) * Number(item.use_quantity)).toLocaleString()}원</div>
                                </div>
                                <button
                                    onClick={() => handleRemoveIngredient(item.id)}
                                    style={{
                                        border: 'none', background: '#ffebee', color: '#c0392b', width: '30px', height: '30px',
                                        borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                    title="제거"
                                >
                                    ✕
                                </button>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#666' }}>부자재/기타 비용</span>
                                    <input
                                        type="number"
                                        value={additionalCost}
                                        onChange={e => setAdditionalCost(Number(e.target.value))}
                                        style={{ width: '100px', textAlign: 'right', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#2c3e50' }}>결과물 설정</h4>
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#666' }}>생산 품목</label>
                                    <SearchableSelect
                                        options={productOptions}
                                        value={outputProductId}
                                        onChange={setOutputProductId}
                                        placeholder="품목 선택..."
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#666' }}>생산 수량</label>
                                    <input
                                        type="number"
                                        value={outputQuantity}
                                        onChange={e => setOutputQuantity(Number(e.target.value))}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '1.5rem 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: '#7f8c8d' }}>예상 생산 단가:</span>
                                <strong style={{ fontSize: '1.4rem', color: '#27ae60' }}>{Math.round(estimatedUnitPrice).toLocaleString()} 원</strong>
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
    );
};

export default InventoryProductionManagement;
