import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { tradeAPI, paymentAPI } from '../services/api';

/**
 * 전표 상세 보기 모달 컴포넌트
 * React Portal을 사용하여 DOM 최상위(body)에 렌더링
 * 
 * @param {boolean} isOpen - 모달 표시 여부
 * @param {function} onClose - 모달 닫기
 * @param {number} tradeId - 전표 ID (trade_masters.id)
 */
function TradeDetailModal({ isOpen, onClose, tradeId }) {
  const [loading, setLoading] = useState(false);
  const [trade, setTrade] = useState(null);
  const [error, setError] = useState(null);
  const [companySummary, setCompanySummary] = useState(null);

  // 전표 상세 조회
  useEffect(() => {
    if (isOpen && tradeId) {
      loadTradeDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tradeId]);

  const loadTradeDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tradeAPI.getById(tradeId);
      // API 응답: { master: {...}, details: [...] }
      const { master, details } = response.data.data;
      const tradeData = { ...master, details };
      setTrade(tradeData);

      // 거래처 잔고 정보 로드
      if (master.company_id && master.trade_type && master.trade_date) {
        try {
          const summaryRes = await paymentAPI.getCompanyTodaySummary(
            master.company_id,
            master.trade_type,
            master.trade_date.split('T')[0]
          );
          setCompanySummary(summaryRes.data.data);
        } catch (summaryErr) {
          console.error('잔고 정보 조회 오류:', summaryErr);
          setCompanySummary(null);
        }
      }
    } catch (err) {
      console.error('전표 상세 조회 오류:', err);
      setError('전표 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ESC 키로 닫기
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

  // 모달 열릴 때 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return dateString.split('T')[0];
  };

  const getTradeTypeBadge = (type) => {
    if (type === 'SALE') {
      return <span className="badge badge-success">매출</span>;
    } else {
      return <span className="badge badge-info">매입</span>;
    }
  };

  const formatWeight = (weight) => {
    const num = parseFloat(weight);
    if (isNaN(num)) return weight;
    // 소수점 이하가 0이면 정수로, 있으면 소수점까지 표시
    return num % 1 === 0 ? num.toFixed(0) : num.toString();
  };

  const formatProductName = (detail) => {
    const parts = [detail.product_name];
    if (detail.product_weight) {
      parts.push(`${formatWeight(detail.product_weight)}kg`);
    }
    if (detail.grade) {
      return `${parts.join(' ')} (${detail.grade})`;
    }
    return parts.join(' ');
  };

  const isPurchase = trade?.trade_type === 'PURCHASE';

  return createPortal(
    <div className="modal-overlay">
      <div
        className="trade-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="trade-detail-modal-header">
          <div className="trade-detail-modal-header-left">
            <h2 style={{ display: 'flex', alignItems: 'center' }}>
              <span>📋 전표 상세</span>
              {trade && (
                <span style={{ marginLeft: '10px', fontSize: '0.6em' }}>
                  {getTradeTypeBadge(trade.trade_type)}
                </span>
              )}
            </h2>
            {trade && (
              <div className="trade-detail-header-summary">
                <span className="summary-item">
                  <span className="summary-label">거래일</span>
                  <span className="summary-value">{formatDate(trade.trade_date)}</span>
                </span>
                <span className="summary-divider">|</span>
                <span className="summary-item">
                  <span className="summary-label">거래처</span>
                  <span className="summary-value highlight">{trade.company_name || '-'}</span>
                </span>
                <span className="summary-divider">|</span>
                <span className="summary-item">
                  <span className="summary-label">합계</span>
                  <span className="summary-value" style={{ color: '#1f2937', fontWeight: '600' }}>
                    {formatCurrency(trade.total_price)}원
                  </span>
                </span>
              </div>
            )}
          </div>
          <button
            className="trade-detail-modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* 바디 */}
        <div className="trade-detail-modal-body">
          {loading ? (
            <div className="trade-detail-modal-loading">
              불러오는 중...
            </div>
          ) : error ? (
            <div className="trade-detail-modal-error">
              {error}
            </div>
          ) : trade ? (
            <>
              {/* 기본 정보 */}
              <div className="trade-detail-info-grid">
                <div className="trade-detail-info-item">
                  <label>전표번호</label>
                  <div className="trade-detail-info-value highlight">
                    {trade.trade_number}
                  </div>
                </div>

                <div className="trade-detail-info-item">
                  <label>결제방법</label>
                  <div className="trade-detail-info-value">
                    {trade.payment_method === 'CASH' ? '현금' :
                      trade.payment_method === 'CARD' ? '카드' :
                        trade.payment_method === 'TRANSFER' ? '계좌이체' :
                          trade.payment_method === 'CREDIT' ? '외상' : trade.payment_method || '-'}
                  </div>
                </div>
                {trade.notes && (
                  <div className="trade-detail-info-item full-width">
                    <label>비고</label>
                    <div className="trade-detail-info-value">
                      {trade.notes}
                    </div>
                  </div>
                )}
              </div>

              {/* 거래처 잔고 정보 */}
              {companySummary && (
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '1rem',
                  padding: '1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', backgroundColor: '#f0f7ff', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>금일 합계</div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: isPurchase ? '#c62828' : '#1565c0' }}>
                      {formatCurrency(companySummary.today_total)}원
                    </div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>전잔고</div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#334155' }}>
                      {formatCurrency(companySummary.previous_balance)}원
                    </div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>
                      {isPurchase ? '출금' : '입금'}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#27ae60' }}>
                      {formatCurrency(companySummary.today_payment)}원
                    </div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', backgroundColor: '#fef3c7', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>잔고</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#b45309' }}>
                      {formatCurrency(companySummary.final_balance)}원
                    </div>
                  </div>
                </div>
              )}

              {/* 품목 목록 */}
              <h4 className="trade-detail-section-title">
                📦 품목 목록 ({trade.details?.length || 0}건)
              </h4>
              <div className="trade-detail-table-container">
                <table className="trade-detail-table">
                  <thead>
                    <tr>
                      <th className="text-center" style={{ width: '50px', textAlign: 'center' }}>No</th>
                      <th className="text-center" style={{ textAlign: 'center' }}>품목</th>
                      <th className="text-center" style={{ textAlign: 'center' }}>수량</th>
                      <th className="text-center" style={{ textAlign: 'center' }}>단가</th>
                      <th className="text-center" style={{ textAlign: 'center' }}>금액</th>
                      {isPurchase && <th className="text-center" style={{ textAlign: 'center' }}>출하주</th>}
                      <th className="text-center" style={{ textAlign: 'center' }}>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trade.details && trade.details.length > 0 ? (
                      trade.details.map((detail, index) => (
                        <tr key={detail.id || index}>
                          <td className="text-center">{detail.seq_no || index + 1}</td>
                          <td style={{ fontWeight: '500' }}>
                            {formatProductName(detail)}
                          </td>
                          <td className="text-right">{formatNumber(detail.quantity)}</td>
                          <td className="text-right">{formatCurrency(detail.unit_price)}</td>
                          <td className="text-right" style={{ fontWeight: '600', color: '#1565c0' }}>
                            {formatCurrency(detail.supply_amount || (detail.quantity * detail.unit_price))}
                          </td>
                          {isPurchase && (
                            <td style={{ color: '#666', fontSize: '0.9rem' }}>{detail.sender || '-'}</td>
                          )}
                          <td style={{ color: '#666', fontSize: '0.9rem' }}>{detail.notes || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={isPurchase ? 7 : 6} className="text-center" style={{ color: '#94a3b8', padding: '2rem' }}>
                          품목 정보가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {trade.details && trade.details.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan="2" className="text-right" style={{ fontWeight: '600' }}>합계</td>
                        <td className="text-right" style={{ fontWeight: '600' }}>
                          {formatNumber(trade.details.reduce((sum, d) => sum + parseFloat(d.quantity || 0), 0))}
                        </td>
                        <td></td>
                        <td className="text-right" style={{ fontWeight: '600', color: '#1565c0' }}>
                          {formatCurrency(trade.details.reduce((sum, d) => sum + parseFloat(d.supply_amount || d.quantity * d.unit_price || 0), 0))}
                        </td>
                        {isPurchase && <td></td>}
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          ) : (
            <div className="trade-detail-modal-empty">
              전표 정보가 없습니다.
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="trade-detail-modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default TradeDetailModal;
