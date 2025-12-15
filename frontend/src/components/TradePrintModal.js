import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { tradeAPI, companyInfoAPI, paymentAPI } from '../services/api';

/**
 * 전표 인쇄용 모달 컴포넌트
 * A4 가로 이등분 출력 (좌우 동일 내용)
 */
function TradePrintModal({ isOpen, onClose, tradeId }) {
  const [loading, setLoading] = useState(false);
  const [trade, setTrade] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [companySummary, setCompanySummary] = useState(null);
  const [error, setError] = useState(null);
  const printRef = useRef(null);

  // 전표 상세 조회
  useEffect(() => {
    if (isOpen && tradeId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tradeId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 전표 정보와 본사 정보 동시 로드
      const [tradeRes, companyRes] = await Promise.all([
        tradeAPI.getById(tradeId),
        companyInfoAPI.get().catch(() => ({ data: { data: null } }))
      ]);

      const { master, details } = tradeRes.data.data;
      const tradeData = { ...master, details };
      setTrade(tradeData);
      setCompanyInfo(companyRes.data.data);

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
      console.error('전표 조회 오류:', err);
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

  // 공통 CSS (인쇄용 + 미리보기용 동일)
  const commonStyles = `
    .print-half {
      flex: 1;
      padding: 3mm;
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      font-size: 9pt;
      line-height: 1.3;
      color: #000;
      background: #fff;
      overflow: hidden;
    }
    /* 새로운 상단 헤더 */
    .new-header {
      display: flex;
      align-items: stretch;
      margin-bottom: 0;
      gap: 8px;
    }
    .header-left-box {
      min-width: 180px;
    }
    .header-left-box table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
    }
    .header-left-box th, .header-left-box td {
      border: 1px solid #000;
      padding: 5px 8px;
    }
    .header-left-box th {
      background-color: #f0f0f0;
      font-weight: bold;
      text-align: center;
      width: 55px;
      font-size: 9pt;
    }
    .header-left-box td {
      font-size: 10pt;
    }
    .header-left-box td {
      text-align: left;
      font-weight: bold;
    }
    .header-center {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      padding: 0 10px;
    }
    .document-title {
      font-size: 16pt;
      font-weight: bold;
      color: #2563eb;
      letter-spacing: 0;
      margin-bottom: 2px;
      white-space: nowrap;
    }
    .document-subtitle {
      font-size: 8pt;
      color: #666;
    }
    .header-right-box {
      flex: 0 0 auto;
    }
    .header-right-box table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
      border-bottom: none;
    }
    .header-right-box th, .header-right-box td {
      border: 1px solid #000;
      padding: 4px 6px;
      font-size: 8pt;
    }
    .header-right-box th {
      background-color: #f0f0f0;
      font-weight: bold;
      text-align: center;
      width: 35px;
    }
    .header-right-box td {
      text-align: left;
    }
    .header-right-box .company-name-cell {
      text-align: center;
      font-size: 11pt;
      font-weight: bold;
      padding: 5px;
      background-color: #fafafa;
      letter-spacing: 2px;
    }
    .header-right-box .sub-info-cell {
      text-align: center;
      font-size: 8pt;
      padding: 3px;
      background-color: #fafafa;
    }
    .header-right-box .address-cell {
      text-align: center;
      font-size: 7pt;
      padding: 4px 3px;
      line-height: 1.3;
    }
    .header-right-box tr:last-child th,
    .header-right-box tr:last-child td {
      border-bottom: none;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0;
    }
    .items-table th, .items-table td {
      border: 1px solid #000;
      padding: 2px 4px;
      font-size: 10pt;
    }
    .items-table th {
      background-color: #f0f0f0;
      font-weight: bold;
      text-align: center;
      color: #000;
    }
    .items-table td {
      text-align: center;
    }
    .items-table td.text-left {
      text-align: left;
    }
    .items-table td.text-right {
      text-align: right;
    }
    .items-table tfoot td {
      background-color: #f9f9f9;
      font-weight: bold;
    }
    .footer-section {
      display: flex;
      gap: 5px;
      margin-top: 5px;
    }
    .notes-section {
      width: 310px;
      border: 1px solid #000;
      padding: 3px;
      font-size: 10pt;
      min-height: 60px;
      box-sizing: border-box;
    }
    .notes-title {
      font-weight: bold;
      background-color: #f0f0f0;
      padding: 2px 4px;
      margin: -3px -3px 3px -3px;
      border-bottom: 1px solid #000;
    }
    .notes-content {
      padding: 2px;
    }
    .balance-section {
      flex: 1;
      border: 1px solid #000;
    }
    .balance-table-vertical {
      width: 100%;
      border-collapse: collapse;
    }
    .balance-table-vertical th, .balance-table-vertical td {
      border: 1px solid #000;
      padding: 2px 6px;
      font-size: 10pt;
    }
    .balance-table-vertical th {
      background-color: #f0f0f0;
      font-weight: bold;
      text-align: center;
      width: 80px;
      white-space: nowrap;
    }
    .balance-table-vertical td {
      text-align: right;
      font-weight: bold;
      white-space: nowrap;
    }
    .balance-row th, .balance-row td {
      background-color: #fff3cd;
    }
    .balance-amount {
      color: #c00;
    }
    .bottom-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 5px;
      padding: 3px 5px;
      font-size: 9pt;
      color: #333;
      border-top: 1px solid #ccc;
    }
    .account-info {
      font-weight: normal;
    }
    .trade-number-info {
      font-size: 8pt;
      color: #333;
      text-align: center;
    }
    .saved-time {
      font-size: 8pt;
      color: #666;
    }
  `;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    // 주소2가 있으면 상단 여백을 줄이고 높이를 늘림
    const hasAddress2 = !!supplier?.address2;
    const topMargin = hasAddress2 ? '10mm' : '15mm';
    const wrapperHeight = hasAddress2 ? '200mm' : '195mm';

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>거래명세서 - ${trade?.trade_number || ''}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: ${topMargin} 5mm 0 5mm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
              font-size: 9pt;
              line-height: 1.3;
              color: #000;
              background: #fff;
            }
            .print-wrapper {
              display: flex;
              width: 287mm;
              height: ${wrapperHeight};
              gap: 3mm;
              page-break-after: always;
            }
            .print-wrapper:last-child {
              page-break-after: avoid;
            }
            ${commonStyles}
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

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
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일`;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  };

  const formatProductName = (detail) => {
    const parts = [detail.product_name];
    if (detail.product_weight) {
      // 소수점 이하가 0이면 정수로 표시, 아니면 소수점 포함
      const weight = parseFloat(detail.product_weight);
      const weightStr = weight % 1 === 0 ? weight.toFixed(0) : weight.toString().replace(/\.?0+$/, '');
      parts.push(`${weightStr}kg`);
    }
    if (detail.grade) {
      return `${parts.join(' ')} (${detail.grade})`;
    }
    return parts.join(' ');
  };

  const isSale = trade?.trade_type === 'SALE';
  const documentTitle = isSale ? '거래명세서' : '매입명세서';

  // 공급받는자 / 공급자 정보 설정
  const supplier = isSale ? companyInfo : {
    company_name: trade?.company_name,
    business_number: trade?.business_number || '',
    representative: trade?.representative || '',
    address: trade?.company_address || '',
    business_type: trade?.business_type || '',
    business_category: trade?.business_category || ''
  };

  const receiver = isSale ? {
    company_name: trade?.company_name,
    business_number: trade?.business_number || '',
    representative: trade?.representative || '',
    address: trade?.company_address || '',
    business_type: trade?.business_type || '',
    business_category: trade?.business_category || ''
  } : companyInfo;

  // 잔고 계산
  const previousBalance = companySummary?.previous_balance || 0;
  const todayTotal = companySummary?.today_total || 0;
  const previousPlusTodayTotal = previousBalance + todayTotal;
  // ★ final_balance 사용 (날짜 기반 계산된 최종 잔고)
  const finalBalance = companySummary?.final_balance || 0;

  // 페이지당 품목 수
  const ITEMS_PER_PAGE = 20;

  // 품목을 페이지별로 나누기
  const details = trade?.details || [];
  const totalPages = Math.max(1, Math.ceil(details.length / ITEMS_PER_PAGE));

  const getPageItems = (pageNumber) => {
    const start = (pageNumber - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return details.slice(start, end);
  };

  // 보관용 텍스트 결정 함수
  const getSubtitle = (position) => {
    // 매출: 왼쪽=공급받는자, 오른쪽=공급자
    // 매입: 왼쪽=공급자, 오른쪽=공급받는자
    if (isSale) {
      return position === 'left' ? '공급받는자 보관용' : '공급자 보관용';
    } else {
      return position === 'left' ? '공급자 보관용' : '공급받는자 보관용';
    }
  };

  // 한쪽 면 컨텐츠 렌더링 (페이지 지원)
  const renderHalfContent = (position = 'left', pageNumber = 1, isLastPage = true) => {
    const pageItems = getPageItems(pageNumber);
    const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;

    return (
      <div className="print-half">
        {/* 새로운 상단 헤더 */}
        <div className="new-header">
          {/* 왼쪽 박스: 거래처, 발행일, 페이지 */}
          <div className="header-left-box">
            <table>
              <tbody>
                <tr>
                  <th>거래처</th>
                  <td style={{ fontSize: '11pt' }}>{receiver?.company_name || '-'}</td>
                </tr>
                <tr>
                  <th>거래일</th>
                  <td>{trade?.trade_date ? trade.trade_date.split('T')[0].replace(/-/g, '-') : '-'}</td>
                </tr>
                <tr>
                  <th>페이지</th>
                  <td>{pageNumber} / {totalPages}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 중앙: 제목 */}
          <div className="header-center">
            <div className="document-title">{documentTitle}</div>
            <div className="document-subtitle">({getSubtitle(position)})</div>
          </div>

          {/* 오른쪽 박스: 본사(공급자) 정보 - 테이블 버전 */}
          <div className="header-right-box">
            <table>
              <tbody>
                <tr>
                  <td colSpan="2" className="company-name-cell">{supplier?.company_name || '-'}</td>
                </tr>
                <tr>
                  <td colSpan="2" className="address-cell">{supplier?.address || '-'}</td>
                </tr>
                {supplier?.address2 && (
                  <tr>
                    <td colSpan="2" className="address-cell">{supplier.address2}</td>
                  </tr>
                )}
                <tr>
                  <th>전화</th>
                  <td>{supplier?.phone || '-'}</td>
                </tr>
                <tr>
                  <th>팩스</th>
                  <td>{supplier?.fax || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 품목 목록 */}
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: '25px' }}>No</th>
              <th style={{ width: '180px' }}>품목명</th>
              <th style={{ width: '45px' }}>수량</th>
              <th style={{ width: '60px' }}>단가</th>
              <th style={{ width: '75px' }}>금액</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((detail, index) => (
              <tr key={detail.id || index}>
                <td>{startIndex + index + 1}</td>
                <td className="text-left">{formatProductName(detail)}</td>
                <td>{formatNumber(detail.quantity)}</td>
                <td className="text-right">{formatCurrency(detail.unit_price)}</td>
                <td className="text-right">{formatCurrency(detail.supply_amount || (detail.quantity * detail.unit_price))}</td>
                <td className="text-left" style={{ fontSize: '7pt' }}>{detail.notes || ''}</td>
              </tr>
            ))}
            {/* 빈 행 추가 (A4 용지에 맞게 총 20행 유지) */}
            {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - pageItems.length) }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td>&nbsp;</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 하단: 비고 + 잔고 정보 */}
        <div className="footer-section">
          {/* 비고 (좌측) */}
          <div className="notes-section">
            <div className="notes-title">비고</div>
            <div className="notes-content">{isLastPage ? (trade?.notes || '') : ''}</div>
          </div>

          {/* 잔고 정보 (우측, 세로) - 마지막 페이지에만 표시 */}
          <div className="balance-section">
            <table className="balance-table-vertical">
              <tbody>
                <tr>
                  <th>금일합계</th>
                  <td>{isLastPage ? formatCurrency(todayTotal) : ''}</td>
                </tr>
                <tr>
                  <th>전 잔 금</th>
                  <td>{isLastPage ? formatCurrency(previousBalance) : ''}</td>
                </tr>
                <tr>
                  <th>합계금액</th>
                  <td>{isLastPage ? formatCurrency(previousPlusTodayTotal) : ''}</td>
                </tr>
                <tr>
                  <th>
                    {(() => {
                      const cash = companySummary?.cash_payment || 0;
                      const bank = companySummary?.bank_payment || 0;
                      const label = isSale ? '입금' : '출금';
                      if (cash > 0 && bank > 0) return label;
                      if (cash > 0) return `현금${label}`;
                      if (bank > 0) return `통장${label}`;
                      return label;
                    })()}
                  </th>
                  <td>{isLastPage ? formatCurrency(companySummary?.today_payment || 0) : ''}</td>
                </tr>
                <tr className="balance-row">
                  <th>잔 액</th>
                  <td className="balance-amount">{isLastPage ? formatCurrency(finalBalance) : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 하단 정보: 계좌정보 + 전표번호 + 저장 시각 - 모든 페이지에 표시 */}
        <div className="bottom-info">
          <div className="account-info">
            {companyInfo?.bank_name && companyInfo?.account_number ? (
              <>
                {companyInfo.bank_name} {companyInfo.account_number}
                {companyInfo.account_holder ? ` ${companyInfo.account_holder}` : ''}
              </>
            ) : ''}
          </div>
          <div className="trade-number-info">
            {trade?.trade_number || ''}
          </div>
          <div className="saved-time">
            {trade?.updated_at || trade?.created_at ? (
              formatDateTime(trade.updated_at || trade.created_at)
            ) : ''}
          </div>
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="modal-overlay">
      <div
        className="trade-print-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          width: '95%',
          maxWidth: '800px',
          maxHeight: '98vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>
            🖨️ 전표 출력 미리보기 <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 'normal' }}>(A4 가로 이등분)</span>
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handlePrint}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              🖨️ 인쇄
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#64748b',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              닫기
            </button>
          </div>
        </div>

        {/* 미리보기 영역 */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '0.5rem 1rem',
          backgroundColor: '#e2e8f0'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
              불러오는 중...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#dc2626' }}>
              {error}
            </div>
          ) : trade ? (
            <>
              {/* 공통 스타일 적용 */}
              <style>{commonStyles}</style>

              {/* 미리보기용 (모든 페이지 표시) - A4 이등분 실제 크기 (142mm x 200mm) */}
              {Array.from({ length: totalPages }).map((_, pageIndex) => (
                <div key={`preview-${pageIndex}`} style={{ marginBottom: pageIndex < totalPages - 1 ? '20px' : 0 }}>
                  {totalPages > 1 && (
                    <div style={{ textAlign: 'center', marginBottom: '5px', color: '#666', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      📄 {pageIndex + 1} / {totalPages} 페이지
                    </div>
                  )}
                  <div
                    style={{
                      backgroundColor: '#fff',
                      margin: '0 auto',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      width: '142mm',
                      height: '200mm',
                      overflow: 'hidden'
                    }}
                  >
                    {renderHalfContent('left', pageIndex + 1, pageIndex + 1 === totalPages)}
                  </div>
                </div>
              ))}

              {/* 인쇄용 (모든 페이지, 숨김) */}
              <div
                ref={printRef}
                style={{ display: 'none' }}
              >
                {Array.from({ length: totalPages }).map((_, pageIndex) => (
                  <div className="print-wrapper" key={`page-${pageIndex}`}>
                    {renderHalfContent('left', pageIndex + 1, pageIndex + 1 === totalPages)}
                    {renderHalfContent('right', pageIndex + 1, pageIndex + 1 === totalPages)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
              전표 정보가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default TradePrintModal;
