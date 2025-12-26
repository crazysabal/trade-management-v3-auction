import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import ConfirmModal from '../../components/ConfirmModal';

const DailyClosingTab = () => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [loading, setLoading] = useState(false);

    // Core Data State
    const [closingData, setClosingData] = useState({
        // Inventory & Cost Data
        prev_inventory_value: 0,
        today_purchase_cost: 0,
        today_inventory_value: 0,
        calculated_cogs: 0,

        // Sales & Profit Data
        today_sales_revenue: 0,
        gross_profit: 0,

        // Cash Data
        system_cash_balance: 0,
        actual_cash_balance: 0,

        // Metadata
        closing_note: '',
        isClosed: false
    });

    // Cash Difference (Calculated on the fly)
    const cashDifference = closingData.actual_cash_balance - closingData.system_cash_balance;

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        onConfirm: null,
        showCancel: false
    });

    const formattedDate = format(selectedDate, 'yyyy-MM-dd');

    useEffect(() => {
        fetchClosingData();
    }, [formattedDate]);

    // --- Modal Helpers ---
    const openModal = ({ type, title, message, onConfirm = null, showCancel = false }) => {
        setModalConfig({ isOpen: true, type, title, message, onConfirm, showCancel });
    };
    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    // --- Data Fetching ---
    const fetchClosingData = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`/api/settlement/closing/${formattedDate}`);
            if (response.data.success) {
                const { data, created } = response.data;

                setClosingData({
                    prev_inventory_value: parseFloat(data.prev_inventory_value || 0),
                    today_purchase_cost: parseFloat(data.today_purchase_cost || 0),
                    today_inventory_value: parseFloat(data.today_inventory_value || 0),
                    calculated_cogs: parseFloat(data.calculated_cogs || 0),

                    today_sales_revenue: parseFloat(data.today_sales_revenue || 0),
                    gross_profit: parseFloat(data.gross_profit || 0),

                    system_cash_balance: parseFloat(data.system_cash_balance || 0),
                    actual_cash_balance: parseFloat(data.actual_cash_balance || 0),

                    closing_note: data.closing_note || '',
                    isClosed: created
                });
            }
        } catch (error) {
            console.error('마감 데이터 조회 실패:', error);
            openModal({ type: 'warning', title: '조회 실패', message: '데이터를 불러오는데 실패했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    // --- Handlers ---
    const handleActualCashChange = (e) => {
        const rawValue = e.target.value.replace(/,/g, '');
        const val = parseInt(rawValue) || 0;
        setClosingData(prev => ({ ...prev, actual_cash_balance: val }));
    };

    const handleNoteChange = (e) => {
        setClosingData(prev => ({ ...prev, closing_note: e.target.value }));
    };

    const handleSave = () => {
        openModal({
            type: 'confirm',
            title: '마감 저장',
            message: `${formattedDate} 일일 장부를 마감하시겠습니까?\n(재고/원가/현금 시재가 모두 저장됩니다)`,
            showCancel: true,
            onConfirm: performSave
        });
    };

    const performSave = async () => {
        try {
            const payload = {
                date: formattedDate,
                closingData: closingData
            };

            const response = await axios.post('/api/settlement/closing', payload);
            if (response.data.success) {
                openModal({ type: 'success', title: '저장 완료', message: '일일 장부가 저장되었습니다.' });
                fetchClosingData();
            }
        } catch (error) {
            console.error('저장 실패:', error);
            openModal({ type: 'warning', title: '저장 실패', message: '저장 중 오류가 발생했습니다.' });
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount || 0);
    };

    // Calculations for Display
    const totalAsset = closingData.prev_inventory_value + closingData.today_purchase_cost;
    const currentCogs = totalAsset - closingData.today_inventory_value;
    const currentProfit = closingData.today_sales_revenue - currentCogs;

    return (
        <div className="daily-closing-tab">
            <div className="closing-header">
                <div className="date-control">
                    <label>📅 마감 일자:</label>
                    <input
                        type="date"
                        value={formattedDate}
                        onChange={(e) => setSelectedDate(new Date(e.target.value))}
                        className="date-input"
                    />
                </div>
                <div className="status-badge">
                    {closingData.isClosed ?
                        <span className="badge-closed">✅ 마감 완료</span> :
                        <span className="badge-open">⚠️ 마감 전 (가집계)</span>
                    }
                </div>
            </div>

            <div className="closing-content legacy-style">
                {/* --- Left Panel: Purchase & Inventory --- */}
                <div className="panel left-panel">
                    <h3>📦 매입 및 재고 정리</h3>
                    <div className="form-group-korean">
                        <div className="form-row">
                            <label>전일 재고 (A)</label>
                            <input type="text" value={formatCurrency(closingData.prev_inventory_value)} disabled />
                        </div>
                        <div className="form-row">
                            <label>(+) 금일 매입 (B)</label>
                            <input type="text" value={formatCurrency(closingData.today_purchase_cost)} disabled />
                        </div>
                        <hr className="divider" />
                        <div className="form-row highlight">
                            <label>총 공급액 (A+B)</label>
                            <input type="text" value={formatCurrency(totalAsset)} disabled style={{ fontWeight: 'bold', backgroundColor: '#f0f9ff' }} />
                        </div>
                        <div className="form-row spacer-top">
                            <label>(-) 금일 재고 (전산)</label>
                            <input type="text" value={formatCurrency(closingData.today_inventory_value)} disabled />
                        </div>
                        <hr className="divider" />
                        <div className="form-row result">
                            <label><strong>= 매출 원가 (추정)</strong></label>
                            <input type="text" className="result-input" value={formatCurrency(currentCogs)} disabled />
                        </div>
                    </div>
                </div>

                {/* --- Right Panel: Sales & Profit --- */}
                <div className="panel right-panel">
                    <h3>💰 매출 및 손익 정리</h3>
                    <div className="form-group-korean">
                        <div className="form-row">
                            <label>금일 매출 합계 (판매가)</label>
                            <input type="text" value={formatCurrency(closingData.today_sales_revenue)} disabled />
                        </div>
                        <div className="form-row">
                            <label>(-) 매출 원가 (좌측)</label>
                            <input type="text" value={formatCurrency(currentCogs)} disabled style={{ color: '#dc2626' }} />
                        </div>
                        <hr className="divider" />
                        <div className="form-row result huge">
                            <label><strong>= 마진 (Sales Profit)</strong></label>
                            <input type="text" className="result-input blue" value={formatCurrency(currentProfit)} disabled />
                        </div>

                        <div className="spacer-block"></div>

                        <h4 style={{ marginTop: '20px', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>💵 현금 시재 확인</h4>
                        <div className="form-row">
                            <label>장부 현금 (System)</label>
                            <input type="text" value={formatCurrency(closingData.system_cash_balance)} disabled />
                        </div>
                        <div className="form-row">
                            <label>실 현금 (Actual)</label>
                            <input
                                type="text"
                                className="input-editable"
                                value={closingData.actual_cash_balance.toLocaleString()}
                                onChange={handleActualCashChange}
                                placeholder="금액 입력"
                            />
                        </div>
                        <div className="form-row result">
                            <label>시재 오차 (Difference)</label>
                            <span className={`diff-value ${cashDifference !== 0 ? 'bad' : 'good'}`}>
                                {formatCurrency(cashDifference)}
                            </span>
                        </div>

                        <div className="form-row note-row">
                            <label>비고</label>
                            <textarea
                                value={closingData.closing_note}
                                onChange={handleNoteChange}
                                placeholder="특이사항 메모"
                            />
                        </div>

                        <button className="btn-save-closing full-width" onClick={handleSave}>
                            {closingData.isClosed ? '마감 수정' : '일일 장부 마감'}
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                onConfirm={modalConfig.onConfirm || closeModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                showCancel={modalConfig.showCancel}
            />
        </div>
    );
};

export default DailyClosingTab;
