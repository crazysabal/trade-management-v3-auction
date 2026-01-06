import React, { useState, useEffect } from 'react';
import { productAPI, categoryAPI } from '../../services/api';
import SearchableSelect from '../SearchableSelect';
import ConfirmModal from '../ConfirmModal';
import { useModalDraggable } from '../../hooks/useModalDraggable';

const ProductInputModal = ({ isOpen, onClose, onSuccess, initialData = null, isEdit = false, copyFromId = null }) => {
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
                setFormData({
                    ...formData,
                    product_name: p.product_name,
                    category_id: p.category_id,
                    weight: p.weight || '',
                });
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
                if (isMultiGrade && formData.grades) {
                    targetGrades = formData.grades.split(',').map(s => s.trim()).filter(Boolean);
                }

                // Parse weights input
                let targetWeights = [formData.weight];
                if (isMultiWeight && formData.weights) {
                    targetWeights = formData.weights.split(',').map(s => s.trim()).filter(Boolean);
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
                    maxWidth: '600px',
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
                        {/* Mode Info */}
                        {!isEdit && (
                            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: isAddingGrade ? '#fffbeb' : '#f8fafc', borderRadius: '8px', border: isAddingGrade ? '1px solid #fcd34d' : '1px solid #e2e8f0' }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: isAddingGrade ? '#92400e' : '#475569' }}>
                                    {isAddingGrade
                                        ? `📌 "${formData.product_name}" 품목에 새로운 등급을 추가합니다.`
                                        : '💡 품목코드는 자동 생성됩니다.'}
                                </p>
                            </div>
                        )}

                        {/* Existing Product Select (Only New Mode) */}
                        {!isEdit && existingProducts.length > 0 && !isAddingGrade && (
                            <div className="form-group">
                                <label>기존 품목 복사</label>
                                <div style={{ flex: 1 }}>
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
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>* 등급 추가 시 선택</p>
                                </div>
                            </div>
                        )}

                        {/* Main Form */}
                        <div className="form-group">
                            <label>품목명</label>
                            <div style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    name="product_name"
                                    value={formData.product_name || ''}
                                    onChange={handleChange}
                                    style={{ backgroundColor: (isAddingGrade || isEdit) ? '#f1f5f9' : 'white', cursor: (isAddingGrade || isEdit) ? 'not-allowed' : 'text' }}
                                    disabled={isAddingGrade || isEdit}
                                    placeholder="예: 사과"
                                />
                                {isEdit && (
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                                        ⚠️ 품목명 수정은 목록 상단의 ✏️ 아이콘을 이용해주세요.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>분류</label>
                            <div style={{ flex: 1 }}>
                                <SearchableSelect
                                    options={categoryOptions}
                                    value={formData.category_id || ''}
                                    onChange={opt => setFormData({ ...formData, category_id: opt?.value || '' })}
                                    placeholder="분류 선택"
                                    isDisabled={isAddingGrade || isEdit}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>
                                등급
                                {!isEdit && !isMultiGrade && (
                                    <div style={{ fontWeight: 'normal', fontSize: '0.8rem', color: '#3b82f6', cursor: 'pointer', marginTop: '0.25rem' }} onClick={() => setIsMultiGrade(true)}>
                                        + 여러 등급 입력
                                    </div>
                                )}
                            </label>
                            <div style={{ flex: 1 }}>
                                {isMultiGrade && !isEdit ? (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <input
                                            type="text"
                                            name="grades"
                                            value={formData.grades || ''}
                                            onChange={handleChange}
                                            placeholder="예: 특, 상, 중 (쉼표로 구분)"
                                        />
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem', textAlign: 'right' }}>
                                            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setIsMultiGrade(false)}>단일 등급 입력으로 전환</span>
                                        </div>
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        name="grade"
                                        value={formData.grade || ''}
                                        onChange={handleChange}
                                        placeholder="예: 특"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>
                                중량 (kg)
                                {!isEdit && !isMultiWeight && (
                                    <div style={{ fontWeight: 'normal', fontSize: '0.8rem', color: '#3b82f6', cursor: 'pointer', marginTop: '0.25rem' }} onClick={() => setIsMultiWeight(true)}>
                                        + 여러 중량 입력
                                    </div>
                                )}
                            </label>
                            <div style={{ flex: 1 }}>
                                {isMultiWeight && !isEdit ? (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <input
                                            type="text"
                                            name="weights"
                                            value={formData.weights || ''}
                                            onChange={handleChange}
                                            placeholder="예: 5, 10"
                                        />
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem', textAlign: 'right' }}>
                                            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setIsMultiWeight(false)}>단일 중량 입력으로 전환</span>
                                        </div>
                                    </div>
                                ) : (
                                    <input
                                        type="number"
                                        step="0.1"
                                        name="weight"
                                        value={formData.weight || ''}
                                        onChange={handleChange}
                                    />
                                )}

                                {isEdit && sameNameCount > 0 && String(formData.weight || '') !== String(originalWeight || '') && (
                                    <label style={{ fontSize: '0.8rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', cursor: 'pointer', width: 'auto', marginBottom: 0 }}>
                                        <input type="checkbox" checked={updateAllWeights} onChange={e => setUpdateAllWeights(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
                                        <span>같은 이름의 다른 등급({sameNameCount}개)도 중량 변경</span>
                                    </label>
                                )}
                            </div>
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
