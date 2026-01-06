import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { inventoryProductionAPI } from '../services/api';
import { useModalDraggable } from '../hooks/useModalDraggable';

/**
 * 재고 작업 상세 보기 모달 컴포넌트
 * (생산/소분 등 작업 내역의 원재료 및 산출물 상세 표시)
 */
function ProductionDetailModal({ isOpen, onClose, jobId }) {
    const [loading, setLoading] = useState(false);
    const [jobData, setJobData] = useState(null);
    const [error, setError] = useState(null);
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    // 작업 상세 정보 로드
    useEffect(() => {
        if (isOpen && jobId) {
            loadJobDetail();
        }
    }, [isOpen, jobId]);

    const loadJobDetail = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await inventoryProductionAPI.getJobDetail(jobId);
            setJobData(response.data.data);
        } catch (err) {
            console.error('작업 상세 조회 오류:', err);
            setError('작업 정보를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // ESC 키로 닫기
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('ko-KR').format(value || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return dateString.split('T')[0];
    };

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div
                className="styled-modal"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '800px',
                    maxWidth: '95vw',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    ...draggableStyle
                }}
            >
                {/* 헤더 */}
                <div
                    className="modal-header"
                    onMouseDown={handleMouseDown}
                    style={{ cursor: 'grab' }}
                >
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', pointerEvents: 'none' }}>
                        🛠️ 작업 상세 내역
                    </h2>
                    <button className="close-btn" onClick={onClose} style={{ pointerEvents: 'auto' }}>&times;</button>
                </div>

                {/* 바디 */}
                <div className="modal-body" style={{ overflowY: 'auto', padding: '1.5rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>불러오는 중...</div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#dc2626' }}>{error}</div>
                    ) : jobData ? (
                        <>
                            {/* 작업 기본 정보 */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '1rem',
                                marginBottom: '2rem',
                                padding: '1rem',
                                backgroundColor: '#f8fafc',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>작업일자</div>
                                    <div style={{ fontWeight: '600' }}>{formatDate(jobData.job_date)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>작업유형</div>
                                    <div style={{ fontWeight: '600' }}>
                                        {jobData.job_type === 'REPACK' ? '소분/재포장' : jobData.job_type}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>총 비용</div>
                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>
                                        {formatCurrency(jobData.total_cost)}원
                                    </div>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>비고</div>
                                    <div style={{ color: '#475569' }}>{jobData.notes || '-'}</div>
                                </div>
                            </div>

                            {/* 소모 원재료 */}
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    📉 소모 원재료
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.75rem', textAlign: 'left' }}>품목</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'center' }}>출하주</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right' }}>수량</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right' }}>평균단가</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right' }}>금액</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobData.ingredients?.map((item, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '0.75rem' }}>
                                                    {item.product_name} {item.product_weight}kg {item.grade}
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.sender}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.quantity}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.unit_cost)}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                                                    {formatCurrency(item.quantity * item.unit_cost)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* 생산 산출물 */}
                            <div>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    📈 생산 산출물
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.75rem', textAlign: 'left' }}>품목</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right' }}>생산수량</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right' }}>산출단가</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right' }}>총액</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'center' }}>보관창고</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobData.outputs?.map((item, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '0.75rem' }}>
                                                    {item.product_name} {item.product_weight}kg {item.grade}
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#2563eb' }}>
                                                    {item.quantity}
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.unit_cost)}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                                                    {formatCurrency(item.quantity * item.unit_cost)}
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.warehouse_name}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>정보가 없습니다.</div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '1rem 1.5rem', backgroundColor: '#f8fafc' }}>
                    <button className="modal-btn modal-btn-cancel" onClick={onClose}>닫기</button>
                    {/* 필요 시 작업 취소 버튼 등을 여기에 추가 가능 */}
                </div>
            </div>
        </div>,
        document.body
    );
}

export default ProductionDetailModal;
