import React, { useState, useEffect } from 'react';
import { productAPI, categoryAPI } from '../../services/api';
import SearchableSelect from '../SearchableSelect';
import ConfirmModal from '../ConfirmModal';
import { useModalDraggable } from '../../hooks/useModalDraggable';
import SegmentedControl from '../SegmentedControl';

const ProductInputModal = ({ isOpen, onClose, onSuccess, initialData = null, isEdit = false, copyFromId = null }) => {
    // Logic adapted from ProductForm.js
    const [categories, setCategories] = useState([]);
    const [existingProducts, setExistingProducts] = useState([]);
    const [allProducts, setAllProducts] = useState([]); // 중복 체크용 전체 데이터
    const initialForm = {
        product_code: '',
        product_name: '',
        grade: '',
        grades: [], // Array for tags

        category_id: '',
        weight: '',
        weight_unit: 'kg',
        weights: [], // Array for tags
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

    // Temp inputs for tags
    const [gradeInput, setGradeInput] = useState('');
    const [weightInput, setWeightInput] = useState('');

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
                    weight_unit: initialData.weight_unit || 'kg',
                    notes: initialData.notes || '',
                    weights: [],
                    grades: []
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

    // ESC handling
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    const resetForm = () => {
        setFormData({
            product_code: '',
            product_name: '',
            grade: '',
            grades: [],

            category_id: '',
            weight: '',
            weights: [],
            notes: '',
            is_active: true
        });
        setGradeInput('');
        setWeightInput('');
        setIsMultiGrade(false);
        setIsMultiWeight(false);
        setIsAddingGrade(false);
        setSameNameCount(0);
    };

    const loadCategories = async () => {
        try {
            const res = await categoryAPI.getAll({ is_active: 'true' });
            if (res.data) setCategories(res.data.data || res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadExistingProducts = async () => {
        try {
            // Load distinct product names/weights for auto-completion or checking
            const res = await productAPI.getAll({ limit: 1000, is_active: 'true' });
            const products = res.data.data || res.data.products || [];
            if (products) {
                setAllProducts(products);
                // Unique by name for selection
                const unique = [];
                const seen = new Set();
                products.forEach(p => {
                    if (!seen.has(p.product_name)) {
                        seen.add(p.product_name);
                        unique.push(p);
                    }
                });
                setExistingProducts(unique);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const loadProductToCopy = async (id) => {
        try {
            const res = await productAPI.getById(id);
            if (res.data) {
                const p = res.data.data || res.data;
                setFormData(prev => ({
                    ...prev,
                    product_name: p.product_name,
                    category_id: p.category_id,
                    weight: p.weight !== null ? parseFloat(p.weight) : '',
                    weight_unit: p.weight_unit || 'kg',
                    grade: '',         // 등급 초기화
                    grades: [],
                    product_code: '',  // 품목코드 초기화
                    notes: ''          // 비고 초기화
                }));
                setIsAddingGrade(true);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const checkSameNameProducts = (name, currentId) => {
        if (!allProducts.length) return;
        const count = allProducts.filter(p => p.product_name === name && p.id !== currentId).length;
        setSameNameCount(count);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        if (name === 'product_name' && isEdit) {
            // Re-check count (simple logic)
            // checkSameNameProducts(value, initialData.id);
        }
    };

    // --- Tag System Logic ---
    const handleTagKeyDown = (e, field) => {
        const input = field === 'grades' ? gradeInput : weightInput;
        const setInput = field === 'grades' ? setGradeInput : setWeightInput;

        if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault();
            const val = input.trim();
            if (!formData[field].includes(val)) {
                setFormData(prev => ({
                    ...prev,
                    [field]: [...prev[field], val]
                }));
            }
            setInput('');
        } else if (e.key === 'Backspace' && !input && formData[field].length > 0) {
            // Remove last tag
            const newList = [...formData[field]];
            newList.pop();
            setFormData(prev => ({ ...prev, [field]: newList }));
        }
    };

    const handleTagPaste = (e, field) => {
        e.preventDefault();
        const paste = e.clipboardData.getData('text');
        const items = paste.split(/[,|\n\t]/).map(s => s.trim()).filter(Boolean);

        setFormData(prev => {
            const current = prev[field];
            const uniqueNew = items.filter(it => !current.includes(it));
            return {
                ...prev,
                [field]: [...current, ...uniqueNew]
            };
        });
    };

    const removeTag = (index, field) => {
        setFormData(prev => {
            const newList = [...prev[field]];
            newList.splice(index, 1);
            return { ...prev, [field]: newList };
        });
    };

    const toggleMultiInput = (field, enable) => {
        if (field === 'grades') {
            if (enable && !isMultiGrade) {
                // Single -> Multi: move single value to list
                if (formData.grade && !formData.grades.includes(formData.grade)) {
                    setFormData(prev => ({ ...prev, grades: [...prev.grades, prev.grade] }));
                }
                setIsMultiGrade(true);
            } else if (!enable && isMultiGrade) {
                // Multi -> Single: pick first tag if available
                if (formData.grades.length > 0 && !formData.grade) {
                    setFormData(prev => ({ ...prev, grade: prev.grades[0] }));
                }
                setIsMultiGrade(false);
            }
        } else if (field === 'weights') {
            if (enable && !isMultiWeight) {
                // Single -> Multi
                if (formData.weight && !formData.weights.includes(String(formData.weight))) {
                    setFormData(prev => ({ ...prev, weights: [...prev.weights, String(prev.weight)] }));
                }
                setIsMultiWeight(true);
            } else if (!enable && isMultiWeight) {
                // Multi -> Single
                if (formData.weights.length > 0 && !formData.weight) {
                    setFormData(prev => ({ ...prev, weight: parseFloat(formData.weights[0]) }));
                }
                setIsMultiWeight(false);
            }
        }
    };

    // Local SegmentedControl was removed in favor of global one

    const Tag = ({ text, onRemove }) => (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#f1f5f9',
            color: '#334155',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.85rem',
            gap: '6px',
            border: '1px solid #e2e8f0',
            fontWeight: '600'
        }}>
            {text}
            <span
                onClick={onRemove}
                style={{ cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, color: '#94a3b8' }}
                onMouseEnter={e => e.target.style.color = '#ef4444'}
                onMouseLeave={e => e.target.style.color = '#94a3b8'}
            >
                &times;
            </span>
        </span>
    );

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!formData.product_name || !formData.category_id) {
            alert('필수 입력 항목을 확인해주세요.');
            return;
        }

        try {
            if (isEdit) {
                // Update
                const updatePayload = { ...formData };
                delete updatePayload.grades;
                delete updatePayload.weights;

                // Propagate weight changes check
                if (updateAllWeights && String(formData.weight) !== String(originalWeight)) {
                    updatePayload.updateSameNameWeights = true;
                }

                await productAPI.update(initialData.id, updatePayload);
                onSuccess();
                onClose();
            } else {
                // Create Logic (Multi-Grade / Multi-Weight Support)
                // Parse grades input
                let targetGrades = [formData.grade];
                if (isMultiGrade) {
                    targetGrades = formData.grades;
                    // If user left something in input but didn't press enter
                    if (gradeInput.trim() && !targetGrades.includes(gradeInput.trim())) {
                        targetGrades = [...targetGrades, gradeInput.trim()];
                    }
                }

                // Parse weights input
                let targetWeights = [formData.weight];
                if (isMultiWeight) {
                    targetWeights = formData.weights;
                    if (weightInput.trim() && !targetWeights.includes(weightInput.trim())) {
                        targetWeights = [...targetWeights, weightInput.trim()];
                    }
                }

                if (targetGrades.length === 0 || (isMultiGrade && targetGrades.length === 1 && !targetGrades[0])) {
                    alert('등급을 최소 하나 이상 입력해주세요.');
                    return;
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

    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div
                className="styled-modal"
                style={{
                    maxWidth: '800px',
                    ...draggableStyle
                }}
                onClick={e => e.stopPropagation()}
            >
                <div
                    className="modal-header draggable-header"
                    onMouseDown={handleMouseDown}
                >
                    <h3 className="drag-pointer-none">
                        📦 {isEdit ? '품목 수정' : (isAddingGrade ? '등급 추가' : '신규 품목 등록')}
                    </h3>
                    <button className="close-btn drag-pointer-auto" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <form id="product-form" onSubmit={handleSubmit}>
                        {/* Mode Info (Only for adding grade) */}
                        {!isEdit && isAddingGrade && (
                            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#92400e' }}>
                                    📌 "{formData.product_name}${formData.weight ? ` (${parseFloat(formData.weight)}${formData.weight_unit || 'kg'})` : ''}" 품목에 새로운 등급을 추가합니다.
                                </p>
                            </div>
                        )}


                        {/* Main Form */}
                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', gap: '12px' }}>
                            <label style={{ width: '100px', flexShrink: 0, fontWeight: '600', color: '#475569' }}>품목명</label>
                            <div style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    name="product_name"
                                    value={formData.product_name || ''}
                                    onChange={handleChange}
                                    style={{ width: '100%', height: '40px', backgroundColor: (isAddingGrade || isEdit) ? '#f1f5f9' : 'white', cursor: (isAddingGrade || isEdit) ? 'not-allowed' : 'text' }}
                                    disabled={isAddingGrade || isEdit}
                                    placeholder="예: 사과"
                                />
                                {isEdit && (
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                                        ⚠️ 품목명 수정은 목록 상단의 ✏️ 아이콘을 이용해주세요.
                                    </p>
                                )}
                            </div>
                            {/* Symmetry spacer */}
                            {!isEdit && <div style={{ width: '110px', flexShrink: 0 }} />}
                        </div>

                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', gap: '12px' }}>
                            <label style={{ width: '100px', flexShrink: 0, fontWeight: '600', color: '#475569' }}>분류</label>
                            <div style={{ flex: 1 }}>
                                <SearchableSelect
                                    options={categoryOptions}
                                    value={formData.category_id || ''}
                                    onChange={opt => setFormData({ ...formData, category_id: opt?.value || '' })}
                                    placeholder="분류 선택"
                                    isDisabled={isAddingGrade || isEdit}
                                />
                            </div>
                            {/* Symmetry spacer */}
                            {!isEdit && <div style={{ width: '110px', flexShrink: 0 }} />}
                        </div>

                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', gap: '12px' }}>
                            <label style={{ width: '100px', flexShrink: 0, fontWeight: '600', color: '#475569' }}>등급</label>
                            <div style={{ flex: 1 }}>
                                {isMultiGrade && !isEdit ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '6px',
                                            padding: '8px',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '8px',
                                            backgroundColor: 'white',
                                            minHeight: '42px',
                                            alignItems: 'center'
                                        }}>
                                            {Array.isArray(formData.grades) && formData.grades.map((g, idx) => (
                                                <Tag key={idx} text={g} onRemove={() => removeTag(idx, 'grades')} />
                                            ))}
                                            <input
                                                type="text"
                                                value={gradeInput}
                                                onChange={(e) => setGradeInput(e.target.value)}
                                                onKeyDown={(e) => handleTagKeyDown(e, 'grades')}
                                                onPaste={(e) => handleTagPaste(e, 'grades')}
                                                placeholder={formData.grades.length === 0 ? "예: 특, 상, 중 (엔터/쉼표)" : ""}
                                                style={{ border: 'none', padding: '4px', outline: 'none', flex: 1, minWidth: '120px', margin: 0, height: 'auto' }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        name="grade"
                                        value={formData.grade || ''}
                                        onChange={handleChange}
                                        placeholder="예: 특"
                                        style={{ width: '100%', height: '40px' }}
                                    />
                                )}
                            </div>
                            {!isEdit && (
                                <div style={{ width: '110px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                                    <SegmentedControl
                                        value={isMultiGrade}
                                        onChange={val => toggleMultiInput('grades', val)}
                                        options={[
                                            { label: '단일', value: false },
                                            { label: '다중', value: true }
                                        ]}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', gap: '12px' }}>
                            <label style={{ width: '100px', flexShrink: 0, fontWeight: '600', color: '#475569' }}>중량</label>
                            <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    {isMultiWeight && !isEdit ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: '6px',
                                                padding: '8px',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '8px',
                                                backgroundColor: 'white',
                                                minHeight: '42px',
                                                alignItems: 'center'
                                            }}>
                                                {Array.isArray(formData.weights) && formData.weights.map((w, idx) => (
                                                    <Tag key={idx} text={`${w}${formData.weight_unit || 'kg'}`} onRemove={() => removeTag(idx, 'weights')} />
                                                ))}
                                                <input
                                                    type="text"
                                                    value={weightInput}
                                                    onChange={(e) => setWeightInput(e.target.value)}
                                                    onKeyDown={(e) => handleTagKeyDown(e, 'weights')}
                                                    onPaste={(e) => handleTagPaste(e, 'weights')}
                                                    placeholder={formData.weights.length === 0 ? `예: 5, 10 (단위: ${formData.weight_unit || 'kg'})` : ""}
                                                    style={{ border: 'none', padding: '4px', outline: 'none', flex: 1, minWidth: '120px', margin: 0, height: 'auto' }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <input
                                            type="number"
                                            step="0.1"
                                            name="weight"
                                            value={formData.weight || ''}
                                            onChange={handleChange}
                                            style={{ width: '100%', height: '40px' }}
                                        />
                                    )}
                                </div>
                                <div style={{ flex: 'none' }}>
                                    <SegmentedControl
                                        options={[
                                            { label: 'kg', value: 'kg' },
                                            { label: 'g', value: 'g' }
                                        ]}
                                        value={formData.weight_unit || 'kg'}
                                        onChange={(val) => setFormData(prev => ({ ...prev, weight_unit: val }))}
                                    />
                                </div>
                                {!isEdit && (
                                    <div style={{ width: '110px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                                        <SegmentedControl
                                            value={isMultiWeight}
                                            onChange={val => toggleMultiInput('weights', val)}
                                            options={[
                                                { label: '단일', value: false },
                                                { label: '다중', value: true }
                                            ]}
                                        />
                                    </div>
                                )}
                            </div>

                            {isEdit && sameNameCount > 0 && String(formData.weight || '') !== String(originalWeight || '') && (
                                <div style={{ paddingLeft: '112px', marginTop: '0.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', width: 'auto', marginBottom: 0 }}>
                                        <input type="checkbox" checked={updateAllWeights} onChange={e => setUpdateAllWeights(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
                                        <span>같은 이름의 다른 등급({sameNameCount}개)도 중량 변경</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                <div className="modal-footer">
                    <button className="modal-btn modal-btn-cancel" onClick={onClose}>취소</button>
                    <button className="modal-btn modal-btn-primary" type="submit" form="product-form">
                        {isEdit ? '수정 저장' : '등록'}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                showCancel={confirmModal.showCancel ?? true}
            />
        </div>
    );
};

export default ProductInputModal;
