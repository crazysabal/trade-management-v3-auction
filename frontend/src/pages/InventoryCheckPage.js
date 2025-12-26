import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useConfirmModal } from '../components/ConfirmModal';
import InventoryGroupedList from './InventoryGroupedList';

const InventoryCheckPage = () => {
    const { openModal, ConfirmModalComponent } = useConfirmModal();
    const [rowData, setRowData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 포맷팅 함수들 (Hoisting 문제 해결을 위해 상단 배치)
    const getInitialQty = (val) => {
        if (!val) return '0';
        const num = parseFloat(val);
        return String(num); // 10.00 -> "10", 10.50 -> "10.5"
    };

    const formatProduct = (row) => {
        let text = row.product_name;
        if (row.weight) text += ` ${parseFloat(row.weight)}kg`;
        if (row.grade) text += ` (${row.grade})`;
        return text;
    };

    const formatQty = (value) => {
        if (!value) return '0';
        const num = parseFloat(value);
        return num % 1 === 0 ? num.toLocaleString() : num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    // 데이터 조회
    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/settlement/audit/list');
            if (response.data.success) {
                const data = response.data.data.map(item => ({
                    ...item,
                    actual_quantity: item.system_quantity,
                    input_quantity: getInitialQty(item.system_quantity)
                }));
                setRowData(data);
            }
        } catch (error) {
            console.error('재고 실사 리스트 로딩 실패:', error);
            openModal({ type: 'warning', title: '로딩 실패', message: '데이터를 불러오지 못했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // 총계 계산
    const summary = useMemo(() => {
        let totalCount = 0;
        let totalSystemValue = 0;
        let totalActualValue = 0;
        let totalDiffValue = 0;

        rowData.forEach(row => {
            const systemQty = parseFloat(row.system_quantity || 0);
            const actualQty = parseFloat(row.input_quantity || 0);
            const price = parseFloat(row.unit_price || 0);

            totalCount++;
            totalSystemValue += systemQty * price;
            totalActualValue += actualQty * price;
        });

        totalDiffValue = totalActualValue - totalSystemValue;

        return { totalCount, totalSystemValue, totalActualValue, totalDiffValue };
    }, [rowData]);

    // 입력 핸들러
    const handleInputChange = (id, value) => {
        setRowData(prev => prev.map(item =>
            item.id === id ? { ...item, input_quantity: value } : item
        ));
    };

    // 저장 핸들러
    const handleSave = () => {
        const changes = rowData.filter(row => {
            return String(row.input_quantity) !== String(row.system_quantity);
        }).map(row => ({
            id: row.id,
            system_quantity: row.system_quantity,
            actual_quantity: row.input_quantity,
            reason: '정기 재고 실사'
        }));

        if (changes.length === 0) {
            openModal({ type: 'info', title: '변경 없음', message: '조정된 재고가 없습니다.' });
            return;
        }

        openModal({
            type: 'confirm',
            title: '재고 실사 반영',
            message: `총 ${changes.length}건의 재고 차이가 발견되었습니다.\n\n이를 반영하시겠습니까?\n(반영 후에는 전산 재고가 수정됩니다)`,
            onConfirm: async () => {
                setSaving(true);
                try {
                    const res = await axios.post('/api/settlement/audit', { audits: changes });
                    if (res.data.success) {
                        openModal({ type: 'success', title: '반영 완료', message: '재고 실사가 성공적으로 반영되었습니다.' });
                        fetchData();
                    }
                } catch (error) {
                    console.error('실사 반영 실패:', error);
                    openModal({ type: 'warning', title: '반영 실패', message: '저장 중 오류가 발생했습니다.' });
                } finally {
                    setSaving(false);
                }
            }
        });
    };

    return (
        <div style={{ padding: '1.5rem 2rem', backgroundColor: '#f5f6fa', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* 페이지 헤더 */}
                <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h1 className="page-title" style={{ margin: 0 }}>📋 재고 실사 (Inventory Audit)</h1>
                    </div>
                    <div className="actions" style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn btn-secondary" onClick={fetchData}>
                            🔄 새로고침
                        </button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? '저장 중...' : '💾 실사 결과 반영'}
                        </button>
                    </div>
                </div>

                {/* 통계 카드 섹션 */}
                <div className="stats-grid dashboard-stats-grid" style={{ marginBottom: '20px' }}>
                    <div className="stat-card" style={{ borderLeftColor: '#6c757d' }}>
                        <h3>총 품목 수</h3>
                        <div className="stat-value">{summary.totalCount.toLocaleString()} <span style={{ fontSize: '1rem' }}>건</span></div>
                    </div>
                    <div className="stat-card" style={{ borderLeftColor: '#3498db' }}>
                        <h3>전산 재고 가치</h3>
                        <div className="stat-value">{Math.round(summary.totalSystemValue).toLocaleString()} <span style={{ fontSize: '1rem' }}>원</span></div>
                    </div>
                    <div className="stat-card" style={{ borderLeftColor: '#f1c40f' }}>
                        <h3>실사 재고 가치</h3>
                        <div className="stat-value" style={{ color: '#d35400' }}>{Math.round(summary.totalActualValue).toLocaleString()} <span style={{ fontSize: '1rem' }}>원</span></div>
                    </div>
                    <div className="stat-card" style={{ borderLeftColor: summary.totalDiffValue < 0 ? '#e74c3c' : '#2ecc71' }}>
                        <h3>평가 손익 (차액)</h3>
                        <div className="stat-value" style={{ color: summary.totalDiffValue < 0 ? '#e74c3c' : '#2ecc71' }}>
                            {Math.round(summary.totalDiffValue).toLocaleString()} <span style={{ fontSize: '1rem' }}>원</span>
                        </div>
                    </div>
                </div>

                {/* 테이블 컨테이너 영역 교체 - Grouped List Component 사용 */}
                <div style={{ flex: 1 }}>
                    <InventoryGroupedList
                        rowData={rowData}
                        loading={loading}
                        handleInputChange={handleInputChange}
                        formatProduct={formatProduct}
                        formatQty={formatQty}
                    />
                </div>

                <style>{`
                    /* 기본 폰트 적용 (Input 포함) */
                    input, button, select, textarea {
                        font-family: inherit;
                    }

                    @media (max-width: 768px) {
                        /* 헤더 조정 */
                        .page-header { 
                            flex-direction: column; 
                            align-items: stretch; 
                            gap: 15px; 
                            margin-bottom: 20px !important;
                        }
                        .page-header h1 { 
                            font-size: 1.5rem; 
                            text-align: center; 
                        }
                        .page-header .actions { 
                            display: flex; 
                            gap: 10px; 
                        }
                        .page-header .actions button { 
                            flex: 1; 
                            padding: 12px; 
                            font-size: 1rem;
                        }

                        /* 통계 카드 조정 */
                        .dashboard-stats-grid { 
                            grid-template-columns: 1fr 1fr !important; 
                            gap: 10px !important; 
                        }
                        .stat-card { 
                            padding: 12px !important; 
                        }
                        .stat-card h3 { 
                            font-size: 0.8rem; 
                            margin-bottom: 5px; 
                        }
                        .stat-card .stat-value { 
                            font-size: 1.1rem; 
                        }

                        /* 컨테이너 패딩 제거 (모바일 풀 위드스 느낌) */
                        .inventory-check-page {
                            padding: 1rem !important;
                        }
                    }
                `}</style>
            </div>
            {ConfirmModalComponent}
        </div>
    );
};

export default InventoryCheckPage;
