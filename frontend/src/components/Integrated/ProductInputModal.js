import React, { useState, useEffect } from 'react';
import { productAPI, categoryAPI } from '../../services/api';
import SearchableSelect from '../SearchableSelect';
import ConfirmModal from '../ConfirmModal';
import { createPortal } from 'react-dom';

// Simple Modal Shell
const ModalShell = ({ isOpen, onClose, title, children }) => {
    // Focus Management
    useEffect(() => {
        if (isOpen) {
            const previousActiveElement = document.activeElement;

            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation(); // Prevent bubbling
                    onClose();
                }
            };

            document.addEventListener('keydown', handleKeyDown);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                // Restore focus on close
                if (previousActiveElement && previousActiveElement.focus) {
                    previousActiveElement.focus();
                }
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={(e) => {
            // Close on backdrop click disabled
            // if (e.target === e.currentTarget) onClose();
            e.stopPropagation();
        }}>
            <div style={{
                backgroundColor: 'white', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{title}</h3>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                </div>
                <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

function ProductInputModal({ isOpen, onClose, onSuccess, initialData = null, isEdit = false, copyFromId = null }) {
    // Logic adapted from ProductForm.js
    const [categories, setCategories] = useState([]);
    const [existingProducts, setExistingProducts] = useState([]);
    const [allProducts, setAllProducts] = useState([]); // 중복 체크용 전체 데이터
    const initialForm = {
        product_code: '',
        product_name: '',
        grade: '',
        grades: '',

        category_id: '',
        weight: '',
        weights: '',
        notes: '',
        is_active: true
    };

    const [formData, setFormData] = useState(initialForm);

    // States
    const [isMultiGrade, setIsMultiGrade] = useState(false);
    const [isAddingGrade, setIsAddingGrade] = useState(false); // Mode for adding simpler grade to existing product
    const [originalProductName, setOriginalProductName] = useState('');
    const [originalWeight, setOriginalWeight] = useState('');
    const [sameNameCount, setSameNameCount] = useState(0);
    // const [updateAllGrades, setUpdateAllGrades] = useState(true); // Removed: Handled by Group Rename Feature
    const [updateAllWeights, setUpdateAllWeights] = useState(true);
    const [isMultiWeight, setIsMultiWeight] = useState(false);

    // Internal Modal (Confirmations)
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        onConfirm: () => { },
    });

    useEffect(() => {
        if (isOpen) {
            loadCategories();
            loadExistingProducts();
            resetForm();

            if (isEdit && initialData) {
                // Load for Edit
                const data = {
                    ...initialData,
                    product_name: initialData.product_name || '',
                    grade: initialData.grade || '',

                    category_id: initialData.category_id || '',
                    weight: initialData.weight !== null ? parseFloat(initialData.weight) : '',
                    notes: initialData.notes || '',
                    weights: '', // Edit mode doesn't support bulk weights currently
                    grades: ''
                };
                setFormData(data);
                setOriginalProductName(data.product_name);
                setOriginalWeight(data.weight);
                checkSameNameProducts(data.product_name, data.id);
            } else if (copyFromId) {
                // Load for Copy (Add Grade)
                loadProductToCopy(copyFromId);
            }
        }
    }, [isOpen, initialData, isEdit, copyFromId]);

    const resetForm = () => {
        setFormData({
            product_code: '',
            product_name: '',
            grade: '',
            grades: '',

            category_id: '',
            weight: '',
            weights: '',
            notes: '',
            is_active: true
        });
        setIsMultiGrade(false);
        setIsMultiWeight(false);
        setIsAddingGrade(false);
        setSameNameCount(0);
    };

    const loadCategories = async () => {
        try {
            const res = await categoryAPI.getAll({ is_active: 'true' });
            setCategories(res.data.data);
        } catch (e) { console.error(e); }
    };

    const loadExistingProducts = async () => {
        try {
            const res = await productAPI.getAll({});
            setAllProducts(res.data.data); // 중복 체크를 위해 원본 저장

            const unique = [];
            const seen = new Set();
            res.data.data.forEach(p => {
                if (!seen.has(p.product_name)) {
                    seen.add(p.product_name);
                    unique.push(p);
                }
            });
            setExistingProducts(unique);
        } catch (e) { console.error(e); }
    };

    const loadProductToCopy = async (id) => {
        try {
            const res = await productAPI.getById(id);
            const p = res.data.data;
            setFormData(prev => ({
                ...prev,
                product_name: p.product_name || '',

                category_id: p.category_id || '',
                weight: p.weight ? parseFloat(p.weight) : '',
                weights: '',
                grades: '',
                notes: ''
            }));
            setIsAddingGrade(true);
        } catch (e) { console.error(e); }
    };

    const checkSameNameProducts = async (name, currentId) => {
        try {
            const res = await productAPI.getAll({});
            const count = res.data.data.filter(p => p.product_name === name && p.id !== currentId).length;
            setSameNameCount(count);
        } catch (e) { }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.product_name) {
            setConfirmModal({
                isOpen: true,
                type: 'warning',
                title: '입력 확인',
                message: '품목명은 필수입니다.',
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                showCancel: false
            });
            return;
        }

        try {
            if (isEdit) {
                // const isNameChanged = formData.product_name !== originalProductName; // Removed
                const isWeightChanged = String(formData.weight || '') !== String(originalWeight || '');
                const submitData = {
                    ...formData,
                    // updateAllGrades: updateAllGrades && sameNameCount > 0 && isNameChanged, // Removed
                    updateAllWeights: updateAllWeights && sameNameCount > 0 && isWeightChanged,
                    originalProductName
                };
                await productAPI.update(initialData.id, submitData);

                setConfirmModal({
                    isOpen: true,
                    type: 'success',
                    title: '수정 완료',
                    message: '품목이 성공적으로 수정되었습니다.',
                    onConfirm: () => {
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        onSuccess();
                        onClose();
                    },
                    showCancel: false
                });
            } else {
                // [중복 체크 및 파싱]
                let targetGrades = isMultiGrade && formData.grades
                    ? formData.grades.split(/[\s,]+/).map(g => g.trim()).filter(g => g)
                    : [formData.grade || '']; // null handling

                let targetWeights = isMultiWeight && formData.weights
                    ? formData.weights.split(/[\s,]+/).map(w => w.trim()).filter(w => w && !isNaN(parseFloat(w))).map(w => parseFloat(w))
                    : [formData.weight ? parseFloat(formData.weight) : null];

                // Check basics
                if (isMultiGrade && targetGrades.length === 0) {
                    setConfirmModal({
                        isOpen: true,
                        type: 'warning',
                        title: '입력 확인',
                        message: '등급을 입력하세요.',
                        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                        showCancel: false
                    });
                    return;
                }
                if (isMultiWeight && targetWeights.length === 0) {
                    setConfirmModal({
                        isOpen: true,
                        type: 'warning',
                        title: '입력 확인',
                        message: '유효한 중량을 입력하세요.',
                        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                        showCancel: false
                    });
                    return;
                }

                // Check Duplicates against allProducts
                for (const g of targetGrades) {
                    for (const w of targetWeights) {
                        const exists = allProducts.some(p =>
                            p.product_name === formData.product_name &&
                            (p.grade || '') === (g || '') &&
                            // Weight comparison needs care (null vs value)
                            (p.weight === null && w === null || parseFloat(p.weight) === w)
                        );
                        if (exists) {
                            setConfirmModal({
                                isOpen: true,
                                type: 'warning',
                                title: '중복 등록 감지',
                                message: `이미 존재하는 품목입니다.\n[${formData.product_name}] 등급:${g || '-'} / 중량:${w || '-'}kg\n\n등록이 취소되었습니다.`,
                                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                                showCancel: false
                            });
                            return;
                        }
                    }
                }

                let submitData = { ...formData };
                if (isMultiGrade) {
                    submitData.grades = targetGrades;
                    delete submitData.grade;
                }

                if (isMultiWeight) {
                    // Check is done above
                }

                let successCount = 0;
                try {
                    // Flatten combinations for client-side sequential calls
                    // This handles Multi-Weight AND Multi-Grade by iterating weights
                    // Note: Backend currently handles 'grades' array in a single call BUT frontend loop here is just for weights?
                    // Re-reading backend logic: Backend takes 'grades' array AND 'weight' (single).
                    // So we only loop weights here. Backend expands grades.

                    // However, we verified duplicates for ALL combinations.

                    for (const w of targetWeights) {
                        const singleData = { ...submitData, weight: w };
                        delete singleData.weights; // remove metadata

                        // If it's single grade, ensure it's set
                        if (!isMultiGrade) {
                            singleData.grade = targetGrades[0] || '';
                            delete singleData.grades;
                        } else {
                            // If multi-grade, 'grades' is already in submitData (from above block)
                            singleData.grades = targetGrades;
                            // backend will iterate grades
                        }

                        // NOTE: If we utilize backend's grade iteration, it's efficient.
                        // But wait. If we have multiple weights, we call create multiple times.
                        await productAPI.create(singleData);
                        successCount++;
                    }

                    setConfirmModal({
                        isOpen: true,
                        type: 'success',
                        title: '등록 완료',
                        message: `${successCount}건의 번들(중량별) 등록이 완료되었습니다.`,
                        onConfirm: () => {
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            onSuccess(); // Refresh list
                            onClose();   // Close main modal
                        },
                        showCancel: false
                    });
                } catch (err) {
                    console.error(err);
                    setConfirmModal({
                        isOpen: true,
                        type: 'warning',
                        title: '등록 중 오류',
                        message: `등록 중 오류가 발생했습니다. (${successCount}/${targetWeights.length} 성공)`,
                        onConfirm: () => {
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            if (successCount > 0) {
                                onSuccess(); // Partial success refresh
                                onClose();
                            }
                        },
                        showCancel: false
                    });
                }
            }
        } catch (error) {
            console.error(error);
            setConfirmModal({
                isOpen: true,
                type: 'warning',
                title: '저장 실패',
                message: error.response?.data?.message || '품목 저장 중 오류가 발생했습니다.',
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                showCancel: false
            });
        }
    };

    // Helpers
    const categoryOptions = (() => {
        const options = [];
        const mains = categories.filter(c => !c.parent_id);
        mains.forEach(m => {
            options.push({ value: m.id, label: `📁 ${m.category_name}`, isMain: true });
            const kids = categories.filter(c => c.parent_id === m.id);
            kids.forEach(k => options.push({ value: k.id, label: `   └ ${k.category_name}`, isMain: false }));
        });
        return options;
    })();

    const inputStyle = {
        padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%', fontSize: '0.9rem', marginBottom: '0.5rem'
    };
    const labelStyle = { display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.2rem', color: '#334155' };

    return (
        <>
            <ModalShell isOpen={isOpen} onClose={onClose} title={isEdit ? '품목 수정' : (isAddingGrade ? '등급 추가' : '신규 품목 등록')}>
                <form onSubmit={handleSubmit}>
                    {/* Mode Info */}
                    {!isEdit && (
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: isAddingGrade ? '#fffbeb' : '#f0f9ff', borderRadius: '8px', border: isAddingGrade ? '1px solid #fcd34d' : '1px solid #bae6fd' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: isAddingGrade ? '#92400e' : '#0369a1' }}>
                                {isAddingGrade
                                    ? `📌 "${formData.product_name}" 품목에 새로운 등급을 추가합니다.`
                                    : '💡 품목코드는 자동 생성됩니다.'}
                            </p>
                        </div>
                    )}

                    {/* Existing Product Select (Only New Mode) */}
                    {!isEdit && existingProducts.length > 0 && !isAddingGrade && (
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={labelStyle}>기존 품목 선택 (등급 추가 시)</label>
                            <SearchableSelect
                                options={existingProducts.map(p => ({ value: p.product_name, label: `${p.product_name} (${p.category_name || '-'})` }))}
                                onChange={(opt) => {
                                    if (opt) {
                                        const p = existingProducts.find(x => x.product_name === opt.value);
                                        if (p) {
                                            setFormData({
                                                ...formData,
                                                product_name: p.product_name,
                                                category_id: p.category_id,
                                                weight: p.weight || '',
                                                weights: '',
                                                grades: ''
                                            });
                                            setIsAddingGrade(true);
                                        }
                                    }
                                }}
                                placeholder="기존 품목 검색..."
                            />
                        </div>
                    )}

                    {/* Main Form */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={labelStyle}>품목명</label>
                            <input
                                type="text"
                                name="product_name"
                                value={formData.product_name || ''}
                                onChange={handleChange}
                                style={{ ...inputStyle, backgroundColor: (isAddingGrade || isEdit) ? '#f1f5f9' : 'white', cursor: (isAddingGrade || isEdit) ? 'not-allowed' : 'text' }}
                                disabled={isAddingGrade || isEdit} // Locked in edit mode too now
                                placeholder="예: 사과"
                            />
                            {isEdit && (
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
                                    💡 품목명 수정은 목록 상단의 ✏️ 아이콘을 이용해주세요.
                                </p>
                            )}
                        </div>
                        <div>
                            <label style={labelStyle}>분류</label>
                            <SearchableSelect
                                options={categoryOptions}
                                value={formData.category_id || ''}
                                onChange={opt => setFormData({ ...formData, category_id: opt?.value || '' })}
                                placeholder="분류 선택"
                                isDisabled={isAddingGrade || isEdit} // Lock category in edit mode
                            />
                        </div>
                    </div>

                    <div style={{ margin: '1rem 0' }}>
                        <label style={labelStyle}>
                            등급
                            {!isEdit && <span style={{ fontWeight: 'normal', fontSize: '0.8rem', marginLeft: '0.5rem', color: '#64748b' }}>
                                ( <input type="checkbox" checked={isMultiGrade} onChange={e => setIsMultiGrade(e.target.checked)} /> 여러 등급 한번에 등록 )
                            </span>}
                        </label>
                        {isMultiGrade && !isEdit ? (
                            <input
                                type="text"
                                name="grades"
                                value={formData.grades || ''}
                                onChange={handleChange}
                                placeholder="예: 특, 상, 중 (쉼표로 구분)"
                                style={inputStyle}
                            />
                        ) : (
                            <input
                                type="text"
                                name="grade"
                                value={formData.grade || ''}
                                onChange={handleChange}
                                placeholder="예: 특"
                                style={inputStyle}
                            />
                        )}
                    </div>


                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <label style={{ ...labelStyle, marginBottom: 0, marginRight: '0.5rem' }}>중량 (kg)</label>
                        {!isEdit && (
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>
                                <input
                                    type="checkbox"
                                    checked={isMultiWeight}
                                    onChange={(e) => setIsMultiWeight(e.target.checked)}
                                    style={{ marginRight: '4px' }}
                                />
                                여러 중량
                            </label>
                        )}
                    </div>

                    {isMultiWeight && !isEdit ? (
                        <div>
                            <input
                                type="text"
                                name="weights"
                                value={formData.weights || ''}
                                onChange={handleChange}
                                placeholder="예: 5, 10"
                                style={inputStyle}
                            />
                        </div>
                    ) : (
                        <input
                            type="number"
                            step="0.1"
                            name="weight"
                            value={formData.weight || ''}
                            onChange={handleChange}
                            style={inputStyle}
                        />
                    )}

                    {isEdit && sameNameCount > 0 && String(formData.weight || '') !== String(originalWeight || '') && (
                        <label style={{ fontSize: '0.8rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={updateAllWeights} onChange={e => setUpdateAllWeights(e.target.checked)} />
                            <span>같은 이름의 다른 등급({sameNameCount}개)도 중량 변경</span>
                        </label>
                    )}


                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: 'white', cursor: 'pointer' }}>취소</button>
                        <button type="submit" style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                            {isEdit ? '수정 저장' : '등록'}
                        </button>
                    </div>
                </form>
            </ModalShell>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                showCancel={confirmModal.showCancel ?? true}
            />
        </>
    );
}

export default ProductInputModal;
