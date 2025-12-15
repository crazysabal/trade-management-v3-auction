import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const WarehouseModal = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState({
        name: '',
        type: 'STORAGE',
        is_default: false,
        is_active: true,
        description: '',
        address: ''
    });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    name: initialData.name,
                    type: initialData.type || 'STORAGE',
                    is_default: initialData.is_default === 1,
                    is_active: initialData.is_active === 1,
                    description: initialData.description || '',
                    address: initialData.address || ''
                });
            } else {
                setFormData({
                    name: '',
                    type: 'STORAGE',
                    is_default: false,
                    is_active: true,
                    description: '',
                    address: ''
                });
            }
        }
    }, [isOpen, initialData]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = () => {
        if (!formData.name.trim()) {
            alert('창고명을 입력해주세요.');
            return;
        }
        onSubmit(formData);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
            <div className="modal-container" onClick={e => e.stopPropagation()} style={{
                backgroundColor: 'white', borderRadius: '8px', padding: '2rem', width: '500px', maxWidth: '90%'
            }}>
                <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#2c3e50' }}>
                    {initialData ? '창고 정보 수정' : '새 창고 추가'}
                </h2>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>창고명</label>
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px' }}
                        placeholder="예: 제1창고, 부산 물류센터"
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>주소</label>
                    <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px' }}
                        placeholder="주소 입력"
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>설명</label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows="3"
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px' }}
                        placeholder="창고에 대한 설명..."
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            name="is_default"
                            checked={formData.is_default}
                            onChange={handleChange}
                        />
                        기본 창고로 설정 (입고 시 기본 선택됨)
                    </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button onClick={onClose} style={{
                        padding: '0.6rem 1.2rem', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                    }}>취소</button>
                    <button onClick={handleSubmit} style={{
                        padding: '0.6rem 1.2rem', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                    }}>
                        {initialData ? '저장' : '추가'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default WarehouseModal;
