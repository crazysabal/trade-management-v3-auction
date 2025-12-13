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
            // Close on backdrop click (optional, but good UX)
            if (e.target === e.currentTarget) onClose();
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
    const [formData, setFormData] = useState({
        product_code: '',
        product_name: '',
        grade: '',
        grades: '',
        unit: 'Box',
        category_id: '',
        weight: '',
        notes: '',
        is_active: true
    });

    // States
    const [isMultiGrade, setIsMultiGrade] = useState(false);
    const [isAddingGrade, setIsAddingGrade] = useState(false); // Mode for adding simpler grade to existing product
    const [originalProductName, setOriginalProductName] = useState('');
    const [originalWeight, setOriginalWeight] = useState('');
    const [sameNameCount, setSameNameCount] = useState(0);
    const [updateAllGrades, setUpdateAllGrades] = useState(true);
    const [updateAllWeights, setUpdateAllWeights] = useState(true);

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
                const data = { ...initialData };
                if (data.weight) data.weight = parseFloat(data.weight);
                setFormData(data);
                setOriginalProductName(data.product_name);
                setOriginalWeight(data.weight !== null && data.weight !== undefined ? data.weight : '');
                checkSameNameProducts(data.product_name, data.id);
            } else if (copyFromId) {
                // Load for Copy (Add Grade)
                loadProductToCopy(copyFromId);
            }
        }
    }, [isOpen, initialData, isEdit, copyFromId]);

    const resetForm = () => {
        setFormData({
            product_code: '', product_name: '', grade: '', grades: '',
            unit: 'Box', category_id: '', weight: '', notes: '', is_active: true
        });
        setIsMultiGrade(false);
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
                product_name: p.product_name,
                unit: p.unit,
                category_id: p.category_id,
                weight: p.weight ? parseFloat(p.weight) : '',
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

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.product_name) {
            alert('품목명은 필수입니다.'); return;
        }

        try {
            if (isEdit) {
                const isNameChanged = formData.product_name !== originalProductName;
                const isWeightChanged = String(formData.weight || '') !== String(originalWeight || '');
                const submitData = {
                    ...formData,
                    updateAllGrades: updateAllGrades && sameNameCount > 0 && isNameChanged,
                    updateAllWeights: updateAllWeights && sameNameCount > 0 && isWeightChanged,
                    originalProductName
                };
                await productAPI.update(initialData.id, submitData);
            } else {
                let submitData = { ...formData };
                if (isMultiGrade && formData.grades) {
                    const list = formData.grades.split(',').map(g => g.trim()).filter(g => g);
                    if (list.length === 0) { alert('등급을 입력하세요.'); return; }
                    submitData.grades = list;
                    delete submitData.grade;
                }
                await productAPI.create(submitData);
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            alert(error.response?.data?.message || '저장 실패');
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
                                            setFormData({ ...formData, product_name: p.product_name, unit: p.unit, category_id: p.category_id, weight: p.weight || '' });
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
                                value={formData.product_name}
                                onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                                style={{ ...inputStyle, backgroundColor: isAddingGrade ? '#f1f5f9' : 'white' }}
                                disabled={isAddingGrade} // Locked in add grade mode
                                placeholder="예: 사과"
                            />
                            {isEdit && sameNameCount > 0 && formData.product_name !== originalProductName && (
                                <label style={{ fontSize: '0.8rem', color: '#b45309', display: 'block' }}>
                                    <input type="checkbox" checked={updateAllGrades} onChange={e => setUpdateAllGrades(e.target.checked)} />
                                    같은 이름의 다른 등급({sameNameCount}개)도 품목명 변경
                                </label>
                            )}
                        </div>
                        <div>
                            <label style={labelStyle}>분류</label>
                            <SearchableSelect
                                options={categoryOptions}
                                value={formData.category_id}
                                onChange={opt => setFormData({ ...formData, category_id: opt?.value || '' })}
                                placeholder="분류 선택"
                                isDisabled={isAddingGrade}
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
                                value={formData.grades}
                                onChange={e => setFormData({ ...formData, grades: e.target.value })}
                                placeholder="예: 특, 상, 중 (쉼표로 구분)"
                                style={inputStyle}
                            />
                        ) : (
                            <input
                                type="text"
                                value={formData.grade}
                                onChange={e => setFormData({ ...formData, grade: e.target.value })}
                                placeholder="예: 특"
                                style={inputStyle}
                            />
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={labelStyle}>단위</label>
                            <input type="text" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>중량 (kg)</label>
                            <input type="number" step="0.1" value={formData.weight} onChange={e => setFormData({ ...formData, weight: e.target.value })} style={inputStyle} />
                            {isEdit && sameNameCount > 0 && String(formData.weight) !== String(originalWeight) && (
                                <label style={{ fontSize: '0.8rem', color: '#1d4ed8', display: 'block' }}>
                                    <input type="checkbox" checked={updateAllWeights} onChange={e => setUpdateAllWeights(e.target.checked)} />
                                    같은 이름의 다른 등급({sameNameCount}개)도 중량 변경
                                </label>
                            )}
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: 'white', cursor: 'pointer' }}>취소</button>
                        <button type="submit" style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                            {isEdit ? '수정 저장' : '등록'}
                        </button>
                    </div>
                </form>
            </ModalShell>
        </>
    );
}

export default ProductInputModal;
