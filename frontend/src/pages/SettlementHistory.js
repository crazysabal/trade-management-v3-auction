import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, parseISO, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import './SettlementPage.css'; // Share styles or create new

const SettlementHistory = ({ isWindow, onOpenDetail }) => {
    const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (filterMonth) {
            fetchHistory();
        }
    }, [filterMonth]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const date = new Date(filterMonth);
            const start = format(startOfMonth(date), 'yyyy-MM-dd');
            const end = format(endOfMonth(date), 'yyyy-MM-dd');

            const res = await axios.get('/api/settlement/history', {
                params: { startDate: start, endDate: end }
            });
            if (res.data.success) {
                setList(res.data.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(val || 0);

    return (
        <div className="settlement-history-page" style={{ padding: '20px', height: '100%', overflow: 'auto', background: '#fff' }}>
            <div className="sh-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div className="title-group">
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>📅 정산 이력 조회</h2>
                    <p style={{ margin: '5px 0 0', color: '#666' }}>월별 손익 및 정산 기록을 상세 조회합니다.</p>
                </div>
                <div className="filter-group" style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="month"
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '1rem' }}
                    />
                    <button onClick={fetchHistory} className="btn-search" style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        조회
                    </button>
                </div>
            </div>

            <div className="sh-content">
                <table className="standard-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                            <th style={{ padding: '12px' }}>정산 기간</th>
                            <th style={{ padding: '12px' }}>유형</th>
                            <th style={{ padding: '12px', textAlign: 'right' }}>매출액</th>
                            <th style={{ padding: '12px', textAlign: 'right' }}>순이익</th>
                            <th style={{ padding: '12px', textAlign: 'right' }}>현금 유입</th>
                            <th style={{ padding: '12px', textAlign: 'right' }}>현금 유출</th>
                            <th style={{ padding: '12px' }}>마감 일시</th>
                            <th style={{ padding: '12px', textAlign: 'center' }}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="8" style={{ padding: '20px', textAlign: 'center' }}>로딩 중...</td></tr>
                        ) : list.length === 0 ? (
                            <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#888' }}>해당 기간의 이력이 없습니다.</td></tr>
                        ) : (
                            list.map((item, idx) => {
                                const start = parseISO(item.start_date);
                                const end = parseISO(item.end_date);
                                const isDaily = differenceInDays(end, start) === 0;

                                return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'background 0.2s' }} className="hover-row">
                                        <td style={{ padding: '12px' }}>
                                            <div style={{ fontWeight: 500 }}>{format(start, 'yyyy-MM-dd')} ~ {format(end, 'yyyy-MM-dd')}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#666' }}>({differenceInDays(end, start) + 1}일간)</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span className={`tag ${isDaily ? 'daily' : 'period'}`} style={{
                                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem',
                                                background: isDaily ? '#e0f2fe' : '#fef3c7',
                                                color: isDaily ? '#0369a1' : '#d97706'
                                            }}>
                                                {isDaily ? '일일' : '기간'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.revenue)}</td>
                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: item.net_profit >= 0 ? '#16a34a' : '#dc2626' }}>
                                            {formatCurrency(item.net_profit)}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: '#2563eb' }}>+{formatCurrency(item.cash_inflow || 0)}</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: '#dc2626' }}>-{formatCurrency((item.cash_outflow || 0) + (item.cash_expense || 0))}</td>
                                        <td style={{ padding: '12px', color: '#666' }}>{format(parseISO(item.closed_at), 'yyyy-MM-dd HH:mm')}</td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => onOpenDetail && onOpenDetail(item)}
                                                style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                상세보기
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SettlementHistory;
