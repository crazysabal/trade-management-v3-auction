import React from 'react';

const InventoryGroupedList = ({ rowData, loading, handleInputChange, formatProduct, formatQty }) => {
    if (loading) {
        return <div className="loading" style={{ textAlign: 'center', padding: '50px' }}>데이터를 불러오는 중...</div>;
    }

    if (rowData.length === 0) {
        return <div style={{ textAlign: 'center', padding: '50px', color: '#888', backgroundColor: 'white', borderRadius: '8px' }}>표시할 재고가 없습니다.</div>;
    }

    // 1. 창고별 그룹화
    const groups = rowData.reduce((acc, item) => {
        const group = acc[item.warehouse_name] || [];
        group.push(item);
        acc[item.warehouse_name] = group;
        return acc;
    }, {});

    return (
        <div className="inventory-grouped-list" style={{
            display: 'flex',
            gap: '1rem',
            overflowX: 'auto',
            paddingBottom: '1rem',
            alignItems: 'flex-start',
            height: '100%'
        }}>
            {Object.entries(groups).map(([warehouseName, items]) => (
                <div key={warehouseName} style={{
                    minWidth: '350px',
                    width: '350px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '100%',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                    {/* 창고 헤더 */}
                    <div style={{
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        backgroundColor: '#2c3e50',
                        color: 'white',
                        borderTopLeftRadius: '8px',
                        borderTopRightRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {warehouseName}
                        </h3>
                        <span style={{ fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
                            {items.length}
                        </span>
                    </div>

                    {/* Item List (Scrollable) */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '0.8rem'
                    }}>
                        {items.map(row => {
                            const diff = parseFloat(row.input_quantity || 0) - parseFloat(row.system_quantity || 0);
                            const isModified = String(row.input_quantity) !== String(row.system_quantity);

                            return (
                                <div key={row.id} style={{
                                    backgroundColor: 'white',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    marginBottom: '0.8rem',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                    border: isModified ? '2px solid #f39c12' : '1px solid #eee'
                                }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                                        <div>
                                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#2c3e50', marginBottom: '4px' }}>
                                                {formatProduct(row)}
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px', fontSize: '0.8rem' }}>
                                                {row.sender && (
                                                    <span style={{ color: '#444', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {row.sender}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#999' }}>
                                            {row.purchase_date}
                                        </div>
                                    </div>

                                    {/* Quantities */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '2px' }}>전산재고</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#34495e' }}>
                                                {formatQty(row.system_quantity)}
                                            </div>
                                        </div>

                                        <div style={{ flex: 1, marginLeft: '1rem' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#e67e22', marginBottom: '2px', fontWeight: 'bold' }}>실사수량</div>
                                            <input
                                                type="number"
                                                value={row.input_quantity}
                                                onChange={(e) => handleInputChange(row.id, e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    textAlign: 'center',
                                                    borderRadius: '6px',
                                                    border: '2px solid #f39c12',
                                                    fontSize: '1.1rem',
                                                    fontWeight: 'bold',
                                                    fontFamily: 'inherit',
                                                    backgroundColor: '#fffaf0',
                                                    color: '#e67e22'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Diff Indicator */}
                                    {diff !== 0 && (
                                        <div style={{
                                            marginTop: '0.8rem',
                                            paddingTop: '0.5rem',
                                            borderTop: '1px dashed #eee',
                                            textAlign: 'right',
                                            fontWeight: 'bold',
                                            fontSize: '0.9rem',
                                            color: diff > 0 ? '#27ae60' : '#e74c3c'
                                        }}>
                                            차이: {diff > 0 ? `+${formatQty(diff)}` : formatQty(diff)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <style>{`
                /* 기본 폰트 적용 (Input 포함) */
                input, button, select, textarea {
                    font-family: inherit;
                }
                
                /* Scrollbar Styling for Kanban */
                .inventory-grouped-list::-webkit-scrollbar {
                    height: 12px;
                }
                .inventory-grouped-list::-webkit-scrollbar-track {
                    background: #f1f2f6;
                    border-radius: 6px;
                }
                .inventory-grouped-list::-webkit-scrollbar-thumb {
                    background: #bdc3c7;
                    border-radius: 6px;
                }
                .inventory-grouped-list::-webkit-scrollbar-thumb:hover {
                    background: #95a5a6;
                }
            `}</style>
        </div>
    );
};

export default InventoryGroupedList;
