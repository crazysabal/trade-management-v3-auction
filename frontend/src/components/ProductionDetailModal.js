import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { inventoryProductionAPI } from '../services/api';
import { formatCurrency as formatCurrencyBase, formatNumber as formatNumberBase, formatDate } from '../utils/formatUtils'; // [Refactor] 공통 유틸리티 사용
import { useModalDraggable } from '../hooks/useModalDraggable';
import { useConfirmModal } from './ConfirmModal';

/**
 * 재고 작업 상세 보기 모달 컴포넌트
 * (생산/소분 등 작업 내역의 원재료 및 산출물 상세 표시)
 */
function ProductionDetailModal({ isOpen, onClose, jobId, highlightId }) {
    const [loading, setLoading] = useState(false);
    const [jobData, setJobData] = useState(null);
    const [error, setError] = useState(null);
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);
    const { openModal, ConfirmModalComponent } = useConfirmModal();
    const highlightedRowRef = useRef(null);

    // 작업 상세 정보 로드
    useEffect(() => {
        if (isOpen && jobId) {
            setJobData(null); // Clear previous data
            loadJobDetail();
        }
    }, [isOpen, jobId]);

    const loadJobDetail = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await inventoryProductionAPI.getDetail(jobId);
            const rawData = response.data.data;

            // 데이터 정규화 (백엔드 필드 명칭과 모달 기대 필드 조율)
            const normalized = {
                ...rawData,
                job_date: rawData.created_at,
                job_type: '생산 작업',
                // 재료비 합계 + 추가 비용
                total_cost: (rawData.ingredients || []).reduce((sum, ing) => sum + (Number(ing.unit_price) * Number(ing.used_quantity)), 0) + Number(rawData.additional_cost || 0),
                notes: rawData.memo,
                outputs: [{
                    id: rawData.output_inventory_id,
                    product_name: rawData.output_product_name,
                    product_weight: rawData.output_product_weight,
                    grade: rawData.output_product_grade,
                    quantity: rawData.output_quantity,
                    unit_cost: rawData.unit_cost,
                    weight_unit: rawData.output_product_weight_unit || rawData.output_inventory_weight_unit,
                    warehouse_name: rawData.output_warehouse_name
                }]
            };

            setJobData(normalized);
        } catch (err) {
            console.error('작업 상세 조회 오류:', err);
            setError('작업 정보를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 작업 취소 실행
    const handleCancel = async () => {
        openModal({
            type: 'confirm',
            title: '작업 취소 확인',
            message: '이 작업을 취소하시겠습니까?\n취소 시 생산된 재고는 삭제되고 투입된 원재료가 복구됩니다.',
            onConfirm: async () => {
                try {
                    setLoading(true);
                    // [BUG FIX] inventoryProductionAPI.delete -> cancel
                    const response = await inventoryProductionAPI.cancel(jobId);
                    if (response.data.success) {
                        // 첫 번째 모달이 닫힌 후 다음 모달을 띄우기 위해 약간의 지연 시간을 둠
                        setTimeout(() => {
                            openModal({
                                type: 'success',
                                title: '취소 완료',
                                message: '작업이 성공적으로 취소되었습니다.',
                                showCancel: false,
                                onConfirm: () => {
                                    onClose();
                                }
                            });
                        }, 100);
                    } else {
                        setTimeout(() => {
                            openModal({
                                type: 'error',
                                title: '취소 실패',
                                message: '취소 실패: ' + response.data.message,
                                showCancel: false
                            });
                        }, 100);
                    }
                } catch (err) {
                    console.error('작업 취소 오류:', err);
                    setTimeout(() => {
                        openModal({
                            type: 'error',
                            title: '오류 발생',
                            message: '작업 취소 중 오류가 발생했습니다: ' + (err.response?.data?.message || err.message),
                            showCancel: false
                        });
                    }, 100);
                } finally {
                    setLoading(false);
                }
            }
        });
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

    // 강조 항목으로 스크롤
    useEffect(() => {
        if (isOpen && jobData && highlightId) {
            const timer = setTimeout(() => {
                if (highlightedRowRef.current) {
                    highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isOpen, jobData, highlightId]);

    if (!isOpen) return null;

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('ko-KR').format(value || 0) + '원';
    };

    const formatNumber = (val) => {
        if (val === undefined || val === null || val === '') return '';
        const num = parseFloat(val);
        if (isNaN(num)) return val;
        // 최대 소수점 2자리, 불필요한 0 제거
        return parseFloat(num.toFixed(2)).toLocaleString('ko-KR');
    };

    const formatQuantity = (val) => {
        if (val === undefined || val === null || val === '') return '0개';
        const num = parseFloat(val);
        if (isNaN(num)) return '0개';
        return parseFloat(num.toFixed(2)).toLocaleString('ko-KR') + '개';
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return dateString.split('T')[0];
    };

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 10500 }}>
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
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '1rem 1.5rem',
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: '#fff'
                    }}
                >
                    <div
                        onMouseDown={handleMouseDown}
                        style={{
                            cursor: 'grab',
                            fontSize: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '8px'
                        }}
                    >
                        🛠️
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', flex: 1 }}>
                        작업 상세 내역
                    </h2>
                    <button className="close-btn" onClick={onClose} style={{ fontSize: '1.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>&times;</button>
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
                                        {formatCurrency(jobData.total_cost)}
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
                                        <tr style={{ backgroundColor: '#34495e', color: '#ffffff' }}>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>품목</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>출하주</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>수량</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>평균단가</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>금액</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobData.ingredients?.map((item, idx) => {
                                            const isHighlighted = highlightId && String(item.id) === String(highlightId);
                                            return (
                                                <tr
                                                    key={idx}
                                                    ref={isHighlighted ? highlightedRowRef : null}
                                                    className={isHighlighted ? 'highlighted-row' : ''}
                                                    style={{ borderBottom: '1px solid #e2e8f0' }}
                                                >
                                                    <td style={{ padding: '0.75rem', fontWeight: isHighlighted ? '700' : 'normal' }}>
                                                        {item.product_name} {formatNumber(item.weight || item.product_weight)}{item.product_weight_unit || item.weight_unit || 'kg'} {item.grade}
                                                        {isHighlighted && <span style={{ marginLeft: '8px', color: '#f08c00', fontSize: '0.8rem' }}>👈 선택됨</span>}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.sender || '-'}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatQuantity(item.used_quantity)}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                                                        {formatCurrency(item.used_quantity * item.unit_price)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
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
                                        <tr style={{ backgroundColor: '#34495e', color: '#ffffff' }}>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>품목</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>생산수량</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>산출단가</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>총액</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>보관창고</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobData.outputs?.map((item, idx) => {
                                            const isHighlighted = highlightId && String(item.id) === String(highlightId);
                                            return (
                                                <tr
                                                    key={idx}
                                                    ref={isHighlighted ? highlightedRowRef : null}
                                                    className={isHighlighted ? 'highlighted-row' : ''}
                                                    style={{ borderBottom: '1px solid #e2e8f0' }}
                                                >
                                                    <td style={{ padding: '0.75rem', fontWeight: isHighlighted ? '700' : 'normal' }}>
                                                        {item.product_name} {formatNumber(item.product_weight || item.weight)}{item.weight_unit || item.product_weight_unit || 'kg'} {item.grade}
                                                        {isHighlighted && <span style={{ marginLeft: '8px', color: '#f08c00', fontSize: '0.8rem' }}>👈 선택됨</span>}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#2563eb' }}>
                                                        {formatQuantity(item.quantity)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.unit_cost)}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                                                        {formatCurrency(item.quantity * item.unit_cost)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.warehouse_name}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>정보가 없습니다.</div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '1rem 1.5rem', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <button
                            className="modal-btn"
                            onClick={handleCancel}
                            disabled={loading}
                            style={{
                                backgroundColor: '#fee2e2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                padding: '0.4rem 0.8rem',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            🚫 작업 취소 (삭제 및 복원)
                        </button>
                    </div>
                    <button className="modal-btn modal-btn-primary" onClick={onClose}>닫기</button>
                </div>
            </div>
            {ConfirmModalComponent}
        </div>,
        document.body
    );
}

export default ProductionDetailModal;
