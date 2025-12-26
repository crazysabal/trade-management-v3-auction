import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { tradeAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

function TradeView() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { }, confirmText: '확인', showCancel: false });

  useEffect(() => {
    loadTrade();
  }, [id]);

  const loadTrade = async () => {
    try {
      setLoading(true);
      const response = await tradeAPI.getById(id);
      setTrade(response.data.data);
    } catch (error) {
      console.error('거래전표 조회 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '조회 실패', message: '거래전표를 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => navigate('/trades') });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value);
  };

  const getTradeTypeName = (type) => {
    return type === 'PURCHASE' ? '매입' : '매출';
  };

  const getStatusName = (status) => {
    const names = {
      DRAFT: '임시저장',
      CONFIRMED: '확정',
      COMPLETED: '완료',
      CANCELLED: '취소'
    };
    return names[status] || status;
  };

  const getPaymentMethodName = (method) => {
    const names = {
      CASH: '현금',
      CARD: '카드',
      TRANSFER: '계좌이체',
      NOTE: '어음'
    };
    return names[method] || method || '-';
  };

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  if (!trade) {
    return <div>거래전표를 찾을 수 없습니다.</div>;
  }

  const { master, details } = trade;

  return (
    <div className="trade-view">
      <div className="page-header no-print" style={{ display: 'flex', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>📄 거래명세서 조회</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to={`/trades/edit/${id}`} className="btn btn-secondary" style={{ marginRight: '0.5rem' }}>
            수정
          </Link>
          <button onClick={handlePrint} className="btn btn-primary">
            인쇄
          </button>
        </div>
      </div>

      <div className="card print-area" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem', borderBottom: '3px solid #2c3e50', paddingBottom: '1rem' }}>
          <h1 style={{ fontSize: '2rem', margin: '0' }}>{getTradeTypeName(master.trade_type)} 거래명세서</h1>
        </div>

        {/* 기본 정보 */}
        <table style={{ width: '100%', marginBottom: '2rem', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd', width: '15%' }}>
                전표번호
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd', width: '35%' }}>
                {master.trade_number}
              </td>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd', width: '15%' }}>
                거래일자
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd', width: '35%' }}>
                {master.trade_date}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                거래처
              </td>
              <td colSpan="3" style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {master.company_name} ({master.company_code})
              </td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                사업자번호
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {master.business_number || '-'}
              </td>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                대표자
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {master.ceo_name || '-'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                업태
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {master.company_type || '-'}
              </td>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                업종
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {master.company_category || '-'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                주소
              </td>
              <td colSpan="3" style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {master.address || '-'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                결제방법
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {getPaymentMethodName(master.payment_method)}
              </td>
              <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                납품일자
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                {master.delivery_date || '-'}
              </td>
            </tr>
            {master.delivery_address && (
              <tr>
                <td style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', fontWeight: 'bold', border: '1px solid #ddd' }}>
                  납품장소
                </td>
                <td colSpan="3" style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                  {master.delivery_address}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 품목 상세 */}
        <h3 style={{ marginBottom: '1rem', color: '#2c3e50' }}>품목 내역</h3>
        <table style={{ width: '100%', marginBottom: '2rem', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', width: '5%' }}>순번</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', width: '25%' }}>품목명</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', width: '15%' }}>규격</th>

              <th style={{ padding: '0.75rem', border: '1px solid #ddd', width: '10%', textAlign: 'right' }}>수량</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', width: '12%', textAlign: 'right' }}>단가</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', width: '13%', textAlign: 'right' }}>공급가액</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', width: '12%', textAlign: 'right' }}>세액</th>
            </tr>
          </thead>
          <tbody>
            {details.map((detail, index) => (
              <tr key={index}>
                <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'center' }}>
                  {detail.seq_no}
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                  {detail.product_name}
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                  {detail.specification || '-'}
                </td>

                <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                  {formatCurrency(detail.quantity)}
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                  {formatCurrency(detail.unit_price)}
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                  {formatCurrency(detail.supply_amount)}
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                  {formatCurrency(detail.tax_amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
              <td colSpan="6" style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                합계
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                {formatCurrency(master.total_amount)}
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                {formatCurrency(master.tax_amount)}
              </td>
            </tr>
            <tr style={{ backgroundColor: '#e9ecef', fontWeight: 'bold', fontSize: '1.1rem' }}>
              <td colSpan="7" style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                총 합계금액
              </td>
              <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right', color: '#e74c3c' }}>
                {formatCurrency(master.total_price)} 원
              </td>
            </tr>
          </tfoot>
        </table>

        {master.notes && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <strong>비고:</strong> {master.notes}
          </div>
        )}

        <div style={{ marginTop: '3rem', textAlign: 'right', fontSize: '0.9rem', color: '#7f8c8d' }}>
          상태: {getStatusName(master.status)} | 작성일: {new Date(master.created_at).toLocaleString('ko-KR')}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-area {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 20px !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
      <ConfirmModal isOpen={modal.isOpen} onClose={() => setModal(prev => ({ ...prev, isOpen: false }))} onConfirm={modal.onConfirm} title={modal.title} message={modal.message} type={modal.type} confirmText={modal.confirmText} showCancel={modal.showCancel} />
    </div>
  );
}

export default TradeView;
