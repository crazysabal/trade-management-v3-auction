import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { openProductPopup } from '../utils/popup';
import Select from 'react-select';
import { auctionAPI, productAPI, tradeAPI, companyAPI, warehousesAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';

// --- Utilities ---
const getWeightInKg = (weight, unit) => {
    const w = parseFloat(weight) || 0;
    if (unit?.toLowerCase() === 'g') return w / 1000;
    return w;
};

// --- Sub Component: AuctionItemRow ---
const AuctionItemRow = React.memo(({
    item,
    isMapped,
    groupColor,
    formattedPrice,
    mappedProductId,
    baseOptions,
    onMappingChange,
    isSelected,
    onSelectionChange
}) => {
    // Generate options for this specific row (sorting logic only)
    // This avoids re-creating thousands of option objects every render
    const sortedOptions = useMemo(() => {
        const totalWeight = parseFloat(item.weight) || 0;
        const auctionGrade = item.grade || '';

        // Sort the pre-computed baseOptions
        return [...baseOptions].sort((a, b) => {
            const aKg = getWeightInKg(a.weight, a.weightUnit);
            const bKg = getWeightInKg(b.weight, b.weightUnit);

            // Weight match (tolerance 0.05kg)
            const aWeightMatch = totalWeight > 0 && Math.abs(aKg - totalWeight) < 0.05;
            const bWeightMatch = totalWeight > 0 && Math.abs(bKg - totalWeight) < 0.05;

            // Grade match (case insensitive)
            const aGradeMatch = auctionGrade && a.grade &&
                String(a.grade).toLowerCase() === String(auctionGrade).toLowerCase();
            const bGradeMatch = auctionGrade && b.grade &&
                String(b.grade).toLowerCase() === String(auctionGrade).toLowerCase();

            // Full match priority
            const aFullMatch = aWeightMatch && aGradeMatch;
            const bFullMatch = bWeightMatch && bGradeMatch;
            if (aFullMatch && !bFullMatch) return -1;
            if (!aFullMatch && bFullMatch) return 1;

            // Weight match priority
            if (aWeightMatch && !bWeightMatch) return -1;
            if (!aWeightMatch && bWeightMatch) return 1;

            // Grade match priority
            if (aGradeMatch && !bGradeMatch) return -1;
            if (!aGradeMatch && bGradeMatch) return 1;

            // Fallback: sortOrder, name
            if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
            return (a.productName || '').localeCompare(b.productName || '', 'ko');
        });
    }, [baseOptions, item.weight, item.grade]);

    // Find currently selected option
    const selectedOption = useMemo(() =>
        mappedProductId ? baseOptions.find(opt => String(opt.value) === String(mappedProductId)) : null
        , [mappedProductId, baseOptions]);

    // Handle Select change
    const handleChange = useCallback((option) => {
        onMappingChange(item, option ? option.value : '');
    }, [item, onMappingChange]);

    // Handle Checkbox change
    const handleCheck = useCallback((e) => {
        onSelectionChange(item.id, e.target.checked);
    }, [item.id, onSelectionChange]);

    const totalWeight = parseFloat(item.weight) || 0;
    const auctionGrade = item.grade || '';

    // Custom format option label
    const formatOptionLabel = useCallback(({ label, weight, grade, weightUnit }) => {
        const optionWeightKg = getWeightInKg(weight, weightUnit);
        const weightMatch = totalWeight > 0 && Math.abs(optionWeightKg - totalWeight) < 0.05;
        const gradeMatch = auctionGrade && grade && String(grade).toLowerCase() === String(auctionGrade).toLowerCase();
        const isFullMatch = weightMatch && gradeMatch;
        const isPartialMatch = weightMatch || gradeMatch;

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isFullMatch && (
                    <span style={{ backgroundColor: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                        추천
                    </span>
                )}
                {!isFullMatch && isPartialMatch && (
                    <span style={{ backgroundColor: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                        {weightMatch ? '중량' : '등급'}
                    </span>
                )}
                <span>{label}</span>
            </div>
        );
    }, [totalWeight, auctionGrade]);

    // Custom styles for Select
    const selectStyles = useMemo(() => ({
        control: (base) => ({
            ...base,
            minHeight: '32px',
            backgroundColor: isMapped ? '#d4edda' : '#fff3cd',
            borderColor: isMapped ? '#28a745' : '#ffc107',
            '&:hover': { borderColor: isMapped ? '#28a745' : '#ffc107' }
        }),
        valueContainer: (base) => ({ ...base, padding: '0 8px' }),
        input: (base) => ({ ...base, margin: 0, padding: 0 }),
        indicatorSeparator: () => ({ display: 'none' }),
        dropdownIndicator: (base) => ({ ...base, padding: '4px' }),
        menu: (base) => ({ ...base, zIndex: 9999 }),
        menuPortal: (base) => ({ ...base, zIndex: 99999 }), // Fix z-index issue
        menuList: (base) => ({ ...base, maxHeight: '400px' })
    }), [isMapped]);

    return (
        <tr style={{ backgroundColor: !isMapped ? '#fff3cd' : groupColor }}>
            <td style={{ textAlign: 'center' }}>
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={handleCheck}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#e74c3c' }}
                />
            </td>
            <td>{item.arrive_no}</td>
            <td><strong>{item.product_name}</strong></td>
            <td>{item.shipper_location || '-'}</td>
            <td>{item.sender || '-'}</td>
            <td>{item.grade || '-'}</td>
            <td className="text-right">{item.count || 0}개</td>
            <td className="text-right">{totalWeight > 0 ? `${totalWeight}${item.product_weight_unit || item.weight_unit || 'kg'}` : '-'}</td>
            <td className="text-right">{formattedPrice}원</td>
            <td>
                <SearchableSelect
                    value={mappedProductId}
                    onChange={handleChange}
                    options={sortedOptions}
                    placeholder="품목 검색..."
                    isClearable
                    size="small"
                    noOptionsMessage="품목 없음"
                    formatOptionLabel={formatOptionLabel}
                    styles={selectStyles}
                />
            </td>
        </tr>
    );
});

// --- Main Component ---
function AuctionImportV2({ isWindow, onTradeChange, onClose }) {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState([]);
    const [rawData, setRawData] = useState([]);
    const [mappings, setMappings] = useState({});
    const [products, setProducts] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [step, setStep] = useState(1);
    const [selectedItems, setSelectedItems] = useState(new Set());

    const [crawlData, setCrawlData] = useState({
        account_id: '',
        crawl_date: new Date().toISOString().split('T')[0]
    });

    const [importConfig, setImportConfig] = useState({
        supplier_id: '',
        trade_date: new Date().toISOString().split('T')[0],
        warehouse_id: ''
    });

    const [modal, setModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        onConfirm: () => { },
        confirmText: '확인',
        showCancel: false
    });

    // Calculate Base Options once per products update
    const baseOptions = useMemo(() => {
        return products.map(product => {
            const pureName = product.product_name?.replace(/\([^)]*\)$/, '').trim();
            const productWeight = product.weight ? parseFloat(product.weight) : 0;
            const productGrade = product.grade || '';
            const weightUnit = product.weight_unit || 'kg'; // 기본값 kg
            const weightStr = productWeight > 0 ? `${productWeight.toFixed(1).replace(/\.0$/, '')}${weightUnit}` : '';

            return {
                value: product.id,
                label: `${pureName}${weightStr ? ` ${weightStr}` : ''}${productGrade ? ` (${productGrade})` : ''}`,
                subLabel: product.product_code || '', // 추가 정보 표시용
                weight: productWeight,
                weightUnit: weightUnit,
                grade: productGrade,
                sortOrder: product.sort_order || 0,
                productName: product.product_name || '',
                data: { code: product.product_code || '' } // 필터링용 데이터 확장
            };
        }).sort((a, b) => (a.sortOrder - b.sortOrder) || a.productName.localeCompare(b.productName, 'ko'));
    }, [products]);

    // Helper functions
    const getMappingKey = useCallback((productName, weight, grade) => {
        const normalizedWeight = weight !== undefined && weight !== null && weight !== '' ? parseFloat(weight).toFixed(2) : '';
        const normalizedGrade = grade && String(grade).trim() !== '' ? String(grade).trim() : '';
        return `${productName}_${normalizedWeight}_${normalizedGrade}`;
    }, []);

    const getProductNameOnlyKey = useCallback((productName) => `${productName}__`, []);

    const getMappedProductId = useCallback((productName, weight, grade) => {
        const exactKey = getMappingKey(productName, weight, grade);
        if (mappings[exactKey]) return mappings[exactKey];
        const fallbackKey = getProductNameOnlyKey(productName);
        return mappings[fallbackKey] || null;
    }, [mappings, getMappingKey, getProductNameOnlyKey]);

    // 유틸리티: 로컬 시간대 기준 YYYY-MM-DD 반환
    const formatLocalDate = (date) => {
        const d = date || new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const today = formatLocalDate(new Date());

    const allMapped = useMemo(() => {
        if (rawData.length === 0) return false;
        return rawData.every(item => getMappedProductId(item.product_name, item.weight, item.grade));
    }, [rawData, getMappedProductId]);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const [accountsRes, productsRes, companiesRes, warehousesRes] = await Promise.all([
                auctionAPI.getAccounts(),
                productAPI.getAll({ is_active: 'true' }),
                companyAPI.getAll({ type: 'SUPPLIER', is_active: 'true' }),
                warehousesAPI.getAll({ active_only: 'true' })
            ]);

            const accountsData = accountsRes.data?.data || [];
            const activeAccounts = accountsData.filter(a => a.is_active);
            setAccounts(activeAccounts);
            if (activeAccounts.length === 1) {
                setCrawlData(prev => ({ ...prev, account_id: activeAccounts[0].id }));
            }

            setProducts(productsRes.data?.data || []);
            setCompanies(companiesRes.data?.data || []);
            setWarehouses(warehousesRes.data?.data || []);

            // 기본 창고 설정
            const defaultWh = warehousesRes.data?.data?.find(w => w.is_default);
            if (defaultWh) {
                setImportConfig(prev => ({ ...prev, warehouse_id: defaultWh.id }));
            }

            try {
                const mappingsRes = await auctionAPI.getMappings();
                const mappingObj = {};
                mappingsRes.data.data.forEach(m => {
                    if (m.system_product_id) {
                        const key = getMappingKey(m.auction_product_name, m.auction_weight, m.auction_grade);
                        mappingObj[key] = m.system_product_id;
                    }
                });
                setMappings(mappingObj);
            } catch (mappingError) {
                console.warn('매핑 로딩 실패:', mappingError);
            }
        } catch (error) {
            console.error('초기 데이터 오류:', error);
        }
    };

    const handleCrawl = async () => {
        if (!crawlData.account_id) {
            setModal({ isOpen: true, type: 'warning', title: '입력 오류', message: '경매 계정을 선택하세요.', showCancel: false });
            return;
        }
        setLoading(true);
        setLoadingMessage('낙찰 데이터를 가져오는 중입니다... (약 30초~1분 소요)');
        try {
            const response = await auctionAPI.crawl(crawlData);
            setModal({
                isOpen: true,
                type: 'success',
                title: '완료',
                message: response.data.message,
                showCancel: false,
                confirmText: '확인',
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });

            const rawDataRes = await auctionAPI.getRawData({
                auction_date: crawlData.crawl_date,
                account_id: crawlData.account_id,
                status: 'PENDING'
            });
            // Sort by arrive_no (Entry Number) ascending
            const sortedData = (rawDataRes.data.data || []).sort((a, b) => {
                const numA = parseInt(a.arrive_no, 10) || 0;
                const numB = parseInt(b.arrive_no, 10) || 0;
                return numA - numB;
            });
            setRawData(sortedData);

            // Reload mappings (in case backend updated anything or just to be safe)
            const mappingsRes = await auctionAPI.getMappings();
            const mappingObj = {};
            mappingsRes.data.data.forEach(m => {
                if (m.system_product_id) {
                    const key = getMappingKey(m.auction_product_name, m.auction_weight, m.auction_grade);
                    mappingObj[key] = m.system_product_id;
                }
            });
            setMappings(mappingObj);

            setStep(2);
        } catch (error) {
            setModal({
                isOpen: true,
                type: 'warning',
                title: '실패',
                message: error.response?.data?.message || '크롤링 실패',
                showCancel: false,
                confirmText: '확인',
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            setLoading(false);
        }
    };

    // Memoized Handler for Row Mapping Change
    const handleProductMapping = useCallback(async (rawItem, productId) => {
        const key = getMappingKey(rawItem.product_name, rawItem.weight, rawItem.grade);

        // Optimsitic UI Update
        setMappings(prev => ({ ...prev, [key]: productId || null }));

        try {
            await auctionAPI.saveMapping({
                auction_product_name: rawItem.product_name,
                auction_weight: rawItem.weight,
                auction_grade: rawItem.grade,
                system_product_id: productId,
                match_type: 'MANUAL'
            });
        } catch (error) {
            console.error('매핑 저장 실패:', error);
            // Rollback
            setMappings(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setModal({
                isOpen: true,
                type: 'warning',
                title: '실패',
                message: '매칭 저장 실패',
                showCancel: false,
                confirmText: '확인',
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    }, [getMappingKey]);

    const handleSelectionChange = useCallback((id, checked) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    const handleSelectAll = useCallback((checked) => {
        if (checked) setSelectedItems(new Set(rawData.map(item => item.id)));
        else setSelectedItems(new Set());
    }, [rawData]);

    const handleDeleteSelected = async () => {
        if (selectedItems.size === 0) return;
        setModal({
            isOpen: true,
            type: 'confirm',
            title: '삭제 확인',
            message: `선택된 ${selectedItems.size}개 항목을 삭제하시겠습니까?`,
            showCancel: true,
            confirmText: '삭제',
            onConfirm: async () => {
                try {
                    await auctionAPI.deleteRawDataBulk(Array.from(selectedItems));
                    setRawData(prev => prev.filter(item => !selectedItems.has(item.id)));
                    setSelectedItems(new Set());
                    setModal(prev => ({ ...prev, isOpen: false }));
                } catch (e) {
                    console.error(e);
                    setModal({
                        isOpen: true,
                        type: 'warning',
                        title: '실패',
                        message: '삭제에 실패했습니다.',
                        showCancel: false
                    });
                }
            }
        });
    };

    const processImport = async () => {
        // ... logic same as V1 ...
        // Simplified for brevity in this prompt, but logic remains identical
        setLoading(true);
        setLoadingMessage('매입 전표를 생성하는 중입니다...');
        try {
            const importItems = rawData.filter(item => getMappedProductId(item.product_name, item.weight, item.grade));
            const importIds = importItems.map(item => item.id);

            const details = importItems.map((item, index) => {
                const mappedId = getMappedProductId(item.product_name, item.weight, item.grade);
                return {
                    seq_no: index + 1,
                    product_id: mappedId,
                    quantity: item.count || 1,
                    total_weight: parseFloat(item.weight) || 0,
                    unit_price: Math.floor(item.unit_price || 0),
                    supply_amount: Math.floor(item.total_price || 0),
                    tax_amount: 0,
                    total_amount: Math.floor(item.total_price || 0),
                    auction_price: Math.floor(item.unit_price || 0),
                    shipper_location: item.shipper_location || null,
                    sender: item.sender || null,
                    notes: ''
                };
            });

            const master = {
                trade_type: 'PURCHASE',
                trade_date: importConfig.trade_date,
                company_id: importConfig.supplier_id,
                total_amount: details.reduce((sum, d) => sum + d.supply_amount, 0),
                tax_amount: 0,
                total_price: details.reduce((sum, d) => sum + d.total_amount, 0),
                status: 'CONFIRMED',
                notes: `경매 낙찰 자동 임포트 (${crawlData.crawl_date})`,
                warehouse_id: importConfig.warehouse_id || null
            };

            await tradeAPI.create({ master, details });

            // Mark items as IMPORTED to prevent duplicates
            try {
                await auctionAPI.updateStatusBulk(importIds, 'IMPORTED');
            } catch (statusError) {
                console.warn('경매 데이터 상태 업데이트 실패 (수동 삭제 권장):', statusError);
            }

            setModal({
                isOpen: true,
                type: 'success',
                title: '완료',
                message: `${details.length}건 생성 완료`,
                showCancel: false,
                onConfirm: () => {
                    if (onTradeChange) onTradeChange();
                    if (onClose) {
                        onClose();
                    } else {
                        navigate('/trades?type=PURCHASE');
                    }
                }
            });

        } catch (e) {
            console.error(e);
            const errorMessage = e.response?.data?.message || e.message || '작업 실패';
            setModal({
                isOpen: true,
                type: 'warning',
                title: '실패',
                message: errorMessage,
                showCancel: false
            });
        } finally {
            setLoading(false);
        }
    };

    // Refresh Products Handler
    const handleRefreshProducts = async () => {
        try {
            const productsRes = await productAPI.getAll({ is_active: 'true' });
            setProducts(productsRes.data?.data || []);

            setModal({
                isOpen: true,
                type: 'success',
                title: '새로고침 완료',
                message: '시스템 품목 목록이 갱신되었습니다.',
                showCancel: false
            });
        } catch (error) {
            console.error('품목 새로고침 오류:', error);
            setModal({
                isOpen: true,
                type: 'warning',
                title: '실패',
                message: '품목 목록을 가져오는데 실패했습니다.',
                showCancel: false,
                confirmText: '확인',
                onConfirm: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    };

    const handleImport = () => {
        if (!importConfig.supplier_id) {
            setModal({ isOpen: true, type: 'warning', title: '오류', message: '매입처를 선택하세요', showCancel: false });
            return;
        }
        const unmatched = rawData.filter(i => !getMappedProductId(i.product_name, i.weight, i.grade));
        if (unmatched.length > 0) {
            setModal({
                isOpen: true,
                type: 'confirm',
                title: '확인',
                message: `${unmatched.length}건의 미매칭 항목이 있습니다. 계속합니까?`,
                showCancel: true,
                confirmText: '계속',
                onConfirm: () => processImport()
            });
        } else {
            processImport();
        }
    };

    const mappedCount = rawData.filter(i => getMappedProductId(i.product_name, i.weight, i.grade)).length;

    // Pre-calculate group colors
    const groupColorMap = useMemo(() => {
        const map = new Map();
        const colors = ['#ffffff', '#f1f3f5'];
        let idx = 0;
        rawData.forEach(item => {
            if (!map.has(item.arrive_no)) {
                map.set(item.arrive_no, colors[idx % colors.length]);
                idx++;
            }
        });
        return map;
    }, [rawData]);

    return (
        <div className={`auction-import ${isWindow ? 'is-window' : ''}`} style={{ maxWidth: isWindow ? '100%' : '1400px', margin: isWindow ? '0' : '0 auto', position: 'relative', display: 'flex', flexDirection: 'column', height: isWindow ? '100%' : 'auto', maxHeight: isWindow ? '100%' : 'none', boxSizing: 'border-box' }}>
            {loading && (
                <div className="loading-overlay">
                    <div className="loading-content"><div className="spinner"></div><p>{loadingMessage}</p></div>
                </div>
            )}

            <style>{`
                .auction-import.is-window table th,
                .auction-import.is-window table td {
                    padding: 0.5rem 0.5rem !important;
                    font-size: 0.85rem;
                }
                .auction-import.is-window .btn {
                    padding: 0.2rem 0.6rem;
                    font-size: 0.85rem;
                }
                .auction-import.is-window h2.card-title {
                    font-size: 1rem;
                    margin-bottom: 0.5rem;
                }
                .auction-import.is-window .form-group label {
                    font-size: 0.85rem;
                    width: auto !important;
                    min-width: auto !important;
                    margin-right: 0.5rem !important;
                }
                .auction-import.is-window .card {
                    padding: 0.75rem !important;
                    margin-bottom: 0.75rem !important;
                }

                /* Loading Overlay Styles */
                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.85); /* 밝고 깨끗한 배경 */
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10500; /* 최상위 창보다 위에 표시 */
                    backdrop-filter: blur(4px); /* 고오급스러운 블러 효과 */
                }
                .loading-content {
                    text-align: center;
                    animation: fadeIn 0.3s ease-out;
                }
                .spinner {
                    width: 50px;
                    height: 50px;
                    border: 4px solid #f3f4f6;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    margin: 0 auto 1.5rem;
                    animation: spin 1s linear infinite;
                }
                .loading-content p {
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: #2c3e50;
                    margin: 0;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* Layout Tweaks */
                .btn-primary:active {
                    transform: scale(0.98);
                }
            `}</style>

            {!isWindow && (
                <div className="page-header" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <h1 className="page-title" style={{ margin: 0 }}>📥 경매 낙찰 데이터 가져오기</h1>
                </div>
            )}

            {step === 1 && (
                <div className="card">
                    <h2 className="card-title" style={{ margin: 0, border: 'none', padding: 0 }}>낙찰 데이터 크롤링</h2>
                    <div className="form-row" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.5rem' }}>
                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '420px', flex: 'none', margin: 0 }}>
                            <label className="required" style={{ whiteSpace: 'nowrap', fontWeight: '900', minWidth: '80px', margin: 0, fontSize: '0.9rem', color: '#2c3e50' }}>경매 계정</label>
                            <div style={{ flex: 1 }}>
                                <SearchableSelect
                                    options={accounts.map(a => ({ value: a.id, label: `${a.account_name} (${a.username})` }))}
                                    value={crawlData.account_id}
                                    onChange={o => setCrawlData({ ...crawlData, account_id: o ? o.value : '' })}
                                />
                            </div>
                        </div>
                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '240px', flex: 'none', margin: 0 }}>
                            <label className="required" style={{ whiteSpace: 'nowrap', fontWeight: '900', margin: 0, fontSize: '0.9rem', color: '#2c3e50' }}>경매일자</label>
                            <input
                                type="date"
                                value={crawlData.crawl_date}
                                onChange={e => setCrawlData({ ...crawlData, crawl_date: e.target.value })}
                                style={{
                                    fontSize: '0.9rem',
                                    height: '40px',
                                    boxSizing: 'border-box',
                                    textAlign: 'center',
                                    flex: 1,
                                    borderRadius: '4px',
                                    border: '1px solid #ddd',
                                    padding: '0 10px',
                                    margin: 0,
                                    backgroundColor: crawlData.crawl_date !== today ? '#ffe0b2' : 'white',
                                    color: crawlData.crawl_date !== today ? '#e65100' : 'inherit',
                                    fontWeight: crawlData.crawl_date !== today ? 'bold' : 'normal'
                                }}
                            />
                        </div>

                        <button
                            onClick={handleCrawl}
                            className="btn btn-primary"
                            style={{
                                height: '40px',
                                width: 'auto',
                                minWidth: '120px',
                                flex: 'none',
                                padding: '0 24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginLeft: 'auto',
                                margin: 0,
                                fontWeight: '900'
                            }}
                        >
                            🔄 낙찰데이터 가져오기
                        </button>
                    </div>
                    <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem', margin: 0 }}>
                        * 낙찰 데이터를 가져오는데 약 30초~1분 정도 소요될 수 있습니다.
                    </p>
                </div>
            )}

            {step === 2 && (
                <>
                    <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h2 style={{ margin: 0 }}>품목 매칭</h2>
                                <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: '500' }}>
                                    (총 {rawData.length}건 / 매칭 {mappedCount}건)
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setStep(1)} className="btn btn-secondary" style={{ fontSize: '0.9rem', padding: '6px 12px', whiteSpace: 'nowrap' }}>
                                    🔄 처음으로
                                </button>

                                <button
                                    onClick={handleRefreshProducts}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.9rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
                                >
                                    🔄 품목 새로고침
                                </button>
                                {selectedItems.size > 0 && (
                                    <button onClick={handleDeleteSelected} className="btn btn-danger" style={{ fontSize: '0.9rem', padding: '6px 12px', whiteSpace: 'nowrap' }}>
                                        선택 삭제 ({selectedItems.size})
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="table-container" style={{ flex: 1, overflowY: 'auto', maxHeight: 'none', border: '1px solid #eee', borderRadius: '4px' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'center' }}><input type="checkbox" style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#e74c3c' }} onChange={e => handleSelectAll(e.target.checked)} /></th>
                                        <th>입하번호</th>
                                        <th>품목명</th>
                                        <th>출하지</th>
                                        <th>출하주</th>
                                        <th>등급</th>
                                        <th>수량</th>
                                        <th>중량</th>
                                        <th>단가</th>
                                        <th style={{ minWidth: '250px' }}>시스템 품목</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rawData.map(item => {
                                        const mappedId = getMappedProductId(item.product_name, item.weight, item.grade);
                                        return (
                                            <AuctionItemRow
                                                key={item.id}
                                                item={item}
                                                isMapped={!!mappedId}
                                                groupColor={groupColorMap.get(item.arrive_no)}
                                                formattedPrice={Math.floor(item.unit_price || 0).toLocaleString()}
                                                mappedProductId={mappedId}
                                                baseOptions={baseOptions}
                                                onMappingChange={handleProductMapping}
                                                isSelected={selectedItems.has(item.id)}
                                                onSelectionChange={handleSelectionChange}
                                            />
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                    </div>

                    <div className="card" style={{ marginTop: '0.75rem', flex: 'none' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #3498db', paddingBottom: '0.5rem' }}>
                            <h2 className="card-title" style={{ margin: 0, border: 'none', padding: 0 }}>전표 생성 설정</h2>
                        </div>

                        <div className="form-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '320px', flex: 'none', margin: 0 }}>
                                <label className="required" style={{ whiteSpace: 'nowrap', fontWeight: '900', minWidth: '60px', margin: 0 }}>매입처</label>
                                <div style={{ flex: 1 }}>
                                    <SearchableSelect
                                        options={companies.map(c => ({
                                            value: c.id,
                                            label: c.company_name,
                                            data: { subLabel: c.business_name, code: c.code }
                                        }))}
                                        value={importConfig.supplier_id}
                                        onChange={o => setImportConfig({ ...importConfig, supplier_id: o ? o.value : '' })}
                                        menuPortalTarget={document.body}
                                    />
                                </div>
                            </div>

                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '280px', flex: 'none', margin: 0 }}>
                                <label className="required" style={{ whiteSpace: 'nowrap', fontWeight: '900', margin: 0 }}>입고 창고</label>
                                <div style={{ flex: 1 }}>
                                    <SearchableSelect
                                        options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                                        value={importConfig.warehouse_id}
                                        onChange={o => setImportConfig({ ...importConfig, warehouse_id: o ? o.value : '' })}
                                    />
                                </div>
                            </div>

                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '220px', flex: 'none', margin: 0 }}>
                                <label className="required" style={{ whiteSpace: 'nowrap', fontWeight: '900', margin: 0 }}>거래일자</label>
                                <input
                                    type="date"
                                    value={importConfig.trade_date}
                                    onChange={e => setImportConfig({ ...importConfig, trade_date: e.target.value })}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid #ddd',
                                        height: '40px',
                                        boxSizing: 'border-box',
                                        flex: 1,
                                        minWidth: 0,
                                        textAlign: 'center',
                                        backgroundColor: importConfig.trade_date !== today ? '#ffe0b2' : 'white',
                                        color: importConfig.trade_date !== today ? '#e65100' : 'inherit',
                                        fontWeight: importConfig.trade_date !== today ? 'bold' : 'normal',
                                        margin: 0
                                    }}
                                />
                            </div>

                            <button
                                className="btn btn-primary"
                                disabled={rawData.length === 0 || !allMapped}
                                style={{
                                    height: '40px',
                                    width: 'auto',
                                    minWidth: '120px',
                                    flex: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginLeft: 'auto',
                                    fontWeight: 'bold',
                                    padding: '0 20px',
                                    margin: 0,
                                    backgroundColor: (!allMapped && rawData.length > 0) ? '#94a3b8' : undefined,
                                    cursor: (!allMapped && rawData.length > 0) ? 'not-allowed' : 'pointer'
                                }}
                                onClick={processImport}
                                title={!allMapped && rawData.length > 0 ? "모든 품목을 매칭해야 전표 생성이 가능합니다." : ""}
                            >
                                {!allMapped && rawData.length > 0 ? '미매칭 품목 존재' : '매입 전표 생성'}
                            </button>
                        </div>
                    </div>
                </>
            )}

            <ConfirmModal
                isOpen={modal.isOpen}
                onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={modal.onConfirm || (() => setModal(prev => ({ ...prev, isOpen: false })))}
                title={modal.title}
                message={modal.message}
                type={modal.type}
                showCancel={modal.showCancel}
                confirmText={modal.confirmText}
            />
        </div>
    );
}

export default AuctionImportV2;
