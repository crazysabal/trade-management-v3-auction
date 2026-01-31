import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { matchingAPI, companyAPI, warehousesAPI, tradeAPI } from '../services/api';
import SearchableSelect from './SearchableSelect';
import ConfirmModal from './ConfirmModal';
import { useModalDraggable } from '../hooks/useModalDraggable';

function QuickPurchaseModal({
    isOpen,
    onClose,
    product,
    onSaveSuccess
}) {
    const [companies, setCompanies] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        trade_date: new Date().toISOString().split('T')[0],
        company_id: '',
        warehouse_id: '',
        quantity: '',
        unit_price: '',
        sender_name: '',
        shipper_location: '',
        notes: ''
    });

    const [modal, setModal] = useState({
        isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { }
    });

    const { draggableStyle, handleMouseDown } = useModalDraggable(isOpen, { isCentered: true });

    // Refs for focus management
    const dateRef = useRef(null);
    const companyRef = useRef(null);
    const warehouseRef = useRef(null);
    const qtyInputRef = useRef(null);
    const priceInputRef = useRef(null);
    const senderRef = useRef(null);
    const locationRef = useRef(null);
    const notesRef = useRef(null);
    const submitRef = useRef(null);

    // Helpers for comma formatting
    const formatWithCommas = (val) => {
        if (!val && val !== 0) return '';
        const num = String(val).replace(/[^0-9.-]/g, '');
        if (isNaN(num) || num === '') return val;
        const parts = num.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    };

    const removeCommas = (val) => {
        if (!val) return '';
        return String(val).replace(/,/g, '');
    };

    useEffect(() => {
        if (isOpen) {
            loadBaseData();
            // 초기 상태 리셋
            setForm(prev => ({
                ...prev,
                trade_date: new Date().toISOString().split('T')[0],
                quantity: '',
                unit_price: '',
                sender_name: '',
                shipper_location: '',
                notes: ''
            }));

            // Focus on first field
            setTimeout(() => {
                dateRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    // Enter key navigation
    const handleKeyDown = (e, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextRef?.current?.focus();
        }
    };

    // ESC handling
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                // ConfirmModal이나 다른 검색 모달이 열려있지 않을 때만 동작
                if (modal.isOpen) return;

                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown, true); // Use capture to intercept before other listeners
        }
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, onClose, modal.isOpen]);

    const loadBaseData = async () => {
        try {
            setLoading(true);
            const [compRes, whRes] = await Promise.all([
                companyAPI.getAll({ type: 'SUPPLIER', is_active: 'true' }),
                warehousesAPI.getAll()
            ]);
            setCompanies(compRes.data.data || []);
            const whs = whRes.data.data || [];
            setWarehouses(whs);

            // 기본 창고 설정
            const defaultWh = whs.find(w => w.is_default);
            if (defaultWh) {
                setForm(prev => ({ ...prev, warehouse_id: defaultWh.id }));
            }
        } catch (error) {
            console.error('기초 데이터 로딩 오류:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        // Parse commas before validation and saving
        const qty = parseFloat(removeCommas(form.quantity));
        const price = parseFloat(removeCommas(form.unit_price));

        if (!form.company_id || !form.warehouse_id || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
            setModal({
                isOpen: true, type: 'warning', title: '입력 확인',
                message: '매입처, 창고, 수량, 단가는 필수 입력 항목입니다. (수량은 0보다 커야 합니다)'
            });
            return;
        }

        try {
            setSaving(true);
            const amount = qty * price;

            // 1. 중복 체크
            const dupRes = await tradeAPI.checkDuplicate({
                company_id: form.company_id,
                trade_date: form.trade_date,
                trade_type: 'PURCHASE'
            });

            if (dupRes.data.isDuplicate) {
                // ... (existing logic for update)
                const existingId = dupRes.data.existingTradeId;
                const fullRes = await tradeAPI.getById(existingId);
                const existingData = fullRes.data.data;

                const newTotalAmount = (parseFloat(existingData.master.total_amount) || 0) + amount;
                const newTotalPrice = (parseFloat(existingData.master.total_price) || 0) + amount;

                const updateData = {
                    master: {
                        ...existingData.master,
                        total_amount: newTotalAmount,
                        total_price: newTotalPrice,
                        notes: existingData.master.notes ? `${existingData.master.notes}\n[추가] ${form.notes}` : form.notes
                    },
                    details: [
                        ...existingData.details,
                        {
                            product_id: product.id,
                            quantity: qty,
                            unit_price: price,
                            supply_amount: amount,
                            sender_name: form.sender_name,
                            shipper_location: form.shipper_location,
                            notes: form.notes
                        }
                    ]
                };

                await tradeAPI.update(existingId, updateData);
            } else {
                // ... (existing logic for create)
                const saveData = {
                    master: {
                        trade_type: 'PURCHASE',
                        trade_date: form.trade_date,
                        company_id: form.company_id,
                        warehouse_id: form.warehouse_id,
                        total_amount: amount,
                        total_price: amount,
                        notes: form.notes,
                        status: 'CONFIRMED'
                    },
                    details: [{
                        product_id: product.id,
                        quantity: qty,
                        unit_price: price,
                        supply_amount: amount,
                        sender_name: form.sender_name,
                        shipper_location: form.shipper_location,
                        notes: form.notes
                    }]
                };

                await tradeAPI.create(saveData);
            }

            if (onSaveSuccess) onSaveSuccess();
            onClose();
        } catch (error) {
            console.error('저장 오류:', error);
            setModal({
                isOpen: true, type: 'warning', title: '저장 실패',
                message: error.response?.data?.message || '매입 등록 중 오류가 발생했습니다.'
            });
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 10500 }}>
            <div
                className="styled-modal"
                style={{
                    ...draggableStyle,
                    width: '480px',
                    maxWidth: '95vw',
                    position: 'fixed',
                    top: '50%',
                    left: '50%'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header draggable-header" onMouseDown={handleMouseDown}>
                    <h3>📦 간편 매입 등록</h3>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body quick-purchase-body" style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1.2rem', padding: '1rem', backgroundColor: '#f0f7ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: '0.8rem', color: '#0369a1', marginBottom: '4px', fontWeight: '500' }}>매칭 대상 품목</div>
                        <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#0c4a6e' }}>
                            {product?.name} {product?.weight && parseFloat(product.weight) > 0 ? `${parseFloat(product.weight)}${product.weight_unit || 'kg'}` : ''}
                        </div>
                    </div>

                    <style>{`
                        .quick-purchase-body .form-group {
                            display: flex !important;
                            flex-direction: row !important;
                            align-items: center !important;
                            margin-bottom: 0.8rem !important;
                        }
                        .quick-purchase-body .form-group label {
                            width: 100px !important;
                            min-width: 100px !important;
                            margin-right: 0.8rem !important;
                            text-align: right !important;
                            font-size: 0.9rem !important;
                        }

                    `}</style>

                    <div className="form-group">
                        <label>매입일</label>
                        <input
                            ref={dateRef}
                            type="date"
                            value={form.trade_date}
                            onChange={(e) => setForm({ ...form, trade_date: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, companyRef)}
                            className="form-control"
                        />
                    </div>

                    <div className="form-group">
                        <label>매입처</label>
                        <SearchableSelect
                            ref={companyRef}
                            options={companies.map(c => ({ value: c.id, label: c.company_name, subLabel: c.ceo_name }))}
                            value={form.company_id}
                            onChange={(opt) => {
                                setForm({ ...form, company_id: opt ? opt.value : '' });
                            }}
                            onEnterSelect={() => {
                                // 엔터로 항목 선택 시 다음 필드로 이동
                                setTimeout(() => warehouseRef.current?.focus(), 50);
                            }}
                            placeholder="매입처 선택..."
                        />
                    </div>

                    <div className="form-group">
                        <label>입고 창고</label>
                        <select
                            ref={warehouseRef}
                            value={form.warehouse_id}
                            onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, qtyInputRef)}
                            className="form-control"
                        >
                            <option value="">창고 선택...</option>
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>매입 수량</label>
                        <input
                            ref={qtyInputRef}
                            type="text"
                            value={formatWithCommas(form.quantity)}
                            onChange={(e) => setForm({ ...form, quantity: removeCommas(e.target.value) })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const qty = parseFloat(removeCommas(form.quantity)) || 0;
                                    if (qty <= 0) return; // 0 또는 빈 값이면 다음으로 이동 안 함
                                    priceInputRef.current?.focus();
                                }
                            }}
                            className="form-control text-right"
                            placeholder="0"
                        />
                    </div>
                    <div className="form-group">
                        <label>매입 단가</label>
                        <input
                            ref={priceInputRef}
                            type="text"
                            value={formatWithCommas(form.unit_price)}
                            onChange={(e) => setForm({ ...form, unit_price: removeCommas(e.target.value) })}
                            onKeyDown={(e) => handleKeyDown(e, senderRef)}
                            className="form-control text-right"
                            placeholder="0"
                        />
                    </div>

                    <div className="form-group">
                        <label>출하주</label>
                        <input
                            ref={senderRef}
                            type="text"
                            value={form.sender_name}
                            onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, locationRef)}
                            className="form-control"
                            placeholder="보낸 사람"
                        />
                    </div>
                    <div className="form-group">
                        <label>출하지</label>
                        <input
                            ref={locationRef}
                            type="text"
                            value={form.shipper_location}
                            onChange={(e) => setForm({ ...form, shipper_location: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, notesRef)}
                            className="form-control"
                            placeholder="지역명"
                        />
                    </div>


                    <div className="form-group">
                        <label>비고</label>
                        <textarea
                            ref={notesRef}
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    submitRef.current?.focus();
                                }
                            }}
                            className="form-control"
                            rows="2"
                            placeholder="특이사항 입력"
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>취소</button>
                    <button
                        ref={submitRef}
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || loading}
                        style={{ minWidth: '100px' }}
                    >
                        {saving ? '저장 중...' : '매입 등록'}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={modal.isOpen}
                onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
                type={modal.type}
                title={modal.title}
                message={modal.message}
                onConfirm={modal.onConfirm}
            />
        </div>,
        document.body
    );
}

export default QuickPurchaseModal;

