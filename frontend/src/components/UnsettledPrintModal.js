import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { useModalDraggable } from '../hooks/useModalDraggable';

const UnsettledPrintModal = ({ isOpen, onClose, data }) => {
    const printRef = useRef(null);
    const [zoomLevel, setZoomLevel] = useState(0.7);
    //     const [separatePages, setSeparatePages] = useState(false); // 업체별 구분 기능 삭제 (사용자 요청)
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen || !data) return null;

    const today = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ko-KR').format(Math.floor(amount || 0));
    };

    const sharedStyles = `
        * { box-sizing: border-box; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 0; padding: 0; color: #000; line-height: 1.4; background-color: #fff; }
        .print-page { 
            width: 210mm; 
            height: 297mm;
            padding: 10mm 10mm; // 좌우 여백 축소 (15mm -> 10mm)
            margin: 0 auto; 
            background: #fff;
            page-break-after: always;
            position: relative;
            display: flex;
            flex-direction: column;
            border: 1px solid transparent;
        }
        .print-page:last-child { page-break-after: auto; }
        .header { text-align: center; margin-bottom: 5mm; position: relative; border-bottom: 1.5pt solid #000 !important; padding-bottom: 2mm; }
        .header h1 { margin: 0; font-size: 19pt; font-weight: normal; border-bottom: none !important; }
        .print-date { position: absolute; right: 0; bottom: 2mm; font-size: 9.5pt; color: #333; }
        .total-summary { position: absolute; left: 0; bottom: 2mm; font-size: 9.5pt; font-weight: normal; color: #000; }
        table { width: 100%; border-collapse: collapse; font-size: 8pt !important; table-layout: auto; border: 1pt solid #000 !important; }
        th, td { border: 0.5pt solid #000 !important; padding: 0.4mm 1.5pt !important; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #000 !important; height: 5.4mm !important; line-height: 1.0 !important; }
        th { background-color: #f2f2f2 !important; font-weight: normal !important; border-bottom: 1pt solid #000 !important; }
        .text-left { text-align: left !important; padding-left: 4.5pt !important; }
        .text-right { text-align: right !important; padding-right: 4.5pt !important; }
        .payment-row { background-color: #f9f9f9 !important; }
        .payment-label { font-weight: normal !important; color: #000 !important; }
        .subtotal-row { background-color: #f2f2f2 !important; font-weight: normal !important; }
        @media print {
            @page { size: A4 portrait; margin: 0; }
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; background-color: #fff !important; }
            .print-page { 
                box-shadow: none !important; 
                margin: 0 !important; 
                border: none !important; 
                page-break-after: always !important;
            }
            .print-page:last-child { page-break-after: auto !important; }
            /* 인라인 스타일로 지정된 footer/header 위치 보호 */
        }
    `;

    const handlePrint = () => {
        const printContent = printRef.current;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>미결제 상세 내역 - ${today}</title>
                <style>${sharedStyles}</style>
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

    const handleCopy = async () => {
        try {
            const previewContainer = printRef.current;
            if (!previewContainer) return;

            const canvas = await html2canvas(previewContainer, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true
            });

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]);
                } catch (err) {
                    console.error('클립보드 복사 실패:', err);
                }
            }, 'image/png');
        } catch (err) {
            console.error('캡처 실패:', err);
        }
    };

    return createPortal(
        <div
            className="premium-modal-overlay"
            style={{ display: 'flex' }}
            onClick={onClose}
        >
            <div
                className="premium-modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'fit-content',
                    minWidth: '600px',
                    maxWidth: '95vw',
                    height: '95vh',
                    ...draggableStyle
                }}
            >
                {/* Header */}
                <div
                    className="premium-modal-header"
                    onMouseDown={handleMouseDown}
                    style={{
                        padding: '1rem 1.5rem',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'grab',
                        textAlign: 'left'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h2 className="premium-modal-title" style={{ fontSize: '1.2rem' }}>🖨️ 인쇄 미리보기 (엑셀형)</h2>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.4rem 0.8rem', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                <button onClick={() => setZoomLevel(p => Math.max(0.4, p - 0.1))} style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'none', cursor: 'pointer' }}>➖</button>
                                <span style={{ padding: '0 0.5rem', fontSize: '0.9rem', minWidth: '3.5rem', textAlign: 'center', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1' }}>
                                    {Math.round(zoomLevel * 100)}%
                                </span>
                                <button onClick={() => setZoomLevel(p => Math.min(1.5, p + 0.1))} style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'none', cursor: 'pointer' }}>➕</button>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button onClick={handleCopy} className="premium-modal-btn premium-btn-secondary" style={{ padding: '0.5rem 1rem', width: 'auto', whiteSpace: 'nowrap' }}>📋 복사</button>
                        <button onClick={handlePrint} className="premium-modal-btn premium-btn-primary" style={{ padding: '0.5rem 1rem', width: 'auto', whiteSpace: 'nowrap' }}>🖨️ 인쇄</button>
                        <button onClick={onClose} className="premium-modal-btn premium-btn-secondary" style={{ padding: '0.5rem 1rem', width: 'auto', whiteSpace: 'nowrap' }}>닫기</button>
                    </div>
                </div>

                {/* Preview Area */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: '2rem',
                    backgroundColor: '#525659',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative'
                }}>
                    <style>{sharedStyles}</style>
                    <div ref={printRef} className="unsettled-preview-root" style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'top center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '20px',
                        paddingBottom: '50px' // 하단 여백 확보
                    }}>
                        {(() => {
                            // A4 297mm = 1122px
                            // 물리적 정합성 100% 달성을 위한 최종 행 수 (사용자 요청: 첫 페이지 46행)
                            const MAX_ROWS_NORMAL = 55; // 일반 페이지 (밀도 극대화)
                            const MAX_ROWS_FIRST = 46; // 첫 페이지 (44 -> 46 상향)
                            const allRows = [];
                            let grandTotal = 0; // 전역 합계 변수 추가

                            // 1. 데이터 평탄화 및 전체 행 생성
                            data.forEach((companyRes) => {
                                const companyName = companyRes.company.company_name;
                                const flattenedDetails = [];
                                companyRes.details.forEach(item => {
                                    if (item.type === 'trade') {
                                        item.details.forEach(detail => {
                                            flattenedDetails.push({
                                                rowType: 'trade-detail',
                                                date: item.master.trade_date,
                                                product_name: detail.product_name,
                                                product_weight: detail.product_weight,
                                                sender_name: detail.sender_name,
                                                grade: detail.grade,
                                                size: detail.size,
                                                quantity: detail.quantity,
                                                unit_price: detail.unit_price,
                                                total_price: detail.total_price,
                                                trade_type: item.master.trade_type,
                                                note: detail.note || '' // 비고 데이터 추출
                                            });
                                        });
                                    } else if (item.type === 'payment') {
                                        flattenedDetails.push({
                                            rowType: 'payment-detail',
                                            date: item.date,
                                            description: item.description,
                                            debit: item.debit,
                                            credit: item.credit,
                                            payment_method: item.payment_method
                                        });
                                    }
                                });

                                flattenedDetails.sort((a, b) => {
                                    const dateA = a.date.substring(0, 10);
                                    const dateB = b.date.substring(0, 10);
                                    if (dateA !== dateB) return dateA.localeCompare(dateB);
                                    const priorityA = a.rowType === 'payment-detail' ? 1 : 0;
                                    const priorityB = b.rowType === 'payment-detail' ? 1 : 0;
                                    return priorityA - priorityB;
                                });

                                flattenedDetails.forEach((item, idx) => {
                                    allRows.push({
                                        type: 'row',
                                        data: item,
                                        isFirstInCompany: idx === 0,
                                        company_name: companyName,
                                        needsPageBreak: false
                                    });
                                });

                                const companyTotal = flattenedDetails.reduce((sum, item) => {
                                    if (item.rowType === 'trade-detail') {
                                        const amt = item.total_price ? parseFloat(item.total_price) : (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0));
                                        return sum + (item.trade_type === 'SALE' ? amt : -amt);
                                    } else {
                                        return sum + (parseFloat(item.debit || 0) - parseFloat(item.credit || 0));
                                    }
                                }, 0);

                                allRows.push({
                                    type: 'total',
                                    company_name: companyName,
                                    total: companyTotal,
                                    needsPageBreak: false // 업체별 분리 기능 삭제
                                });

                                grandTotal += companyTotal; // 업체 소계를 전역 합계에 누적
                            });

                            // 2. 동적 페이지 할당 (Dynamic Chunking)
                            const pages = [];
                            let currentPageRows = [];
                            let pageIndex = 0;

                            // 각 페이지별 제한 행 수 결정 함수
                            const getLimitForPage = (pIdx) => (pIdx === 0 ? MAX_ROWS_FIRST : MAX_ROWS_NORMAL);

                            for (let i = 0; i < allRows.length; i++) {
                                const row = allRows[i];
                                const currentLimit = getLimitForPage(pageIndex);

                                currentPageRows.push(row);

                                // 페이지가 꽉 찼거나, 강제 줄바꿈이 필요한 경우
                                const isFull = currentPageRows.length >= currentLimit;
                                const isForcedBreak = row.needsPageBreak;

                                if (isFull || isForcedBreak) {
                                    pages.push(currentPageRows);
                                    currentPageRows = [];
                                    pageIndex++;
                                }
                            }

                            // 마지막 자투리 페이지 처리
                            if (currentPageRows.length > 0) {
                                pages.push(currentPageRows);
                            }

                            if (pages.length === 0) pages.push([]);

                            return pages.map((pageRows, pageIdx) => (
                                <div key={pageIdx} className="print-page" style={{
                                    backgroundColor: 'white',
                                    padding: '10mm 10mm', // 실시간 반영
                                    width: '210mm',
                                    height: '297mm',
                                    minHeight: '297mm',
                                    maxHeight: '297mm',
                                    boxShadow: '0 0 10mm rgba(0,0,0,0.5)',
                                    position: 'relative',
                                    boxSizing: 'border-box',
                                    marginBottom: '10mm',
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <style>{sharedStyles}</style>
                                    {pageIdx === 0 && (
                                        <div className="header">
                                            <div className="total-summary">전체합계: {formatCurrency(grandTotal)}원</div>
                                            <h1>미결제 상세 내역</h1>
                                            <div className="print-date">출력일자: {today}</div>
                                        </div>
                                    )}

                                    <div className="table-container" style={{
                                        flex: 1,
                                        position: 'relative',
                                        overflow: 'hidden' // 내부 스크롤바 방지
                                    }}>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '1%' }}>거래처</th>
                                                    <th style={{ width: '1%' }}>일자</th>
                                                    <th style={{ width: '1%' }}>품목명</th>
                                                    <th style={{ width: '1%' }}>출하주</th>
                                                    <th style={{ width: '1%' }}>등급</th>
                                                    <th style={{ width: '1%' }}>수량</th>
                                                    <th style={{ width: '1%' }}>단가</th>
                                                    <th style={{ width: '1%' }}>금액</th>
                                                    <th style={{ width: '1%' }}>비고</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pageRows.map((row, idx) => {
                                                    const showCompanyName = row.isFirstInCompany || idx === 0;

                                                    if (row.type === 'row') {
                                                        const d = row.data;
                                                        if (d.rowType === 'trade-detail') {
                                                            const amount = d.total_price ? parseFloat(d.total_price) : (parseFloat(d.quantity || 0) * parseFloat(d.unit_price || 0));
                                                            const sign = d.trade_type === 'SALE' ? 1 : -1;
                                                            return (
                                                                <tr key={idx}>
                                                                    <td>
                                                                        {showCompanyName ? row.company_name : ''}
                                                                    </td>
                                                                    <td>{d.date ? d.date.substring(5, 10) : ''}</td>
                                                                    <td className="text-left">
                                                                        {d.product_name} {Number(d.product_weight || 0) > 0 ? `${Number(d.product_weight).toString()}kg` : ''}
                                                                    </td>
                                                                    <td>{d.sender_name || '-'}</td>
                                                                    <td>{d.grade} {d.size && `(${d.size})`}</td>
                                                                    <td>{parseFloat(d.quantity || 0).toString()}</td>
                                                                    <td className="text-right">{formatCurrency(d.unit_price)}</td>
                                                                    <td className="text-right" style={{ color: d.trade_type === 'SALE' ? '#000' : '#d32f2f' }}>
                                                                        {formatCurrency(amount * sign)}
                                                                    </td>
                                                                    <td className="text-left" style={{ fontSize: '7.5pt' }}>
                                                                        {d.note}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        } else {
                                                            const amount = parseFloat(d.debit || 0) - parseFloat(d.credit || 0);
                                                            const label = parseFloat(d.credit || 0) > 0 ? '입금' : '출금';
                                                            return (
                                                                <tr key={idx} className="payment-row">
                                                                    <td>
                                                                        {showCompanyName ? row.company_name : ''}
                                                                    </td>
                                                                    <td>{d.date ? d.date.substring(5, 10) : ''}</td>
                                                                    <td colSpan="5" className="text-left payment-label">
                                                                        [{label}] {d.description || `(${d.payment_method})`}
                                                                    </td>
                                                                    <td className="text-right" style={{ color: amount < 0 ? '#d32f2f' : '#000' }}>
                                                                        {formatCurrency(amount)}
                                                                    </td>
                                                                    <td className="text-left" style={{ fontSize: '7.5pt', color: '#666' }}>
                                                                        {d.payment_method}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        }
                                                    }
                                                    if (row.type === 'total') {
                                                        return (
                                                            <tr key={idx} className="subtotal-row">
                                                                <td colSpan="7" className="text-right">소계</td>
                                                                <td className="text-right">{formatCurrency(row.total)}</td>
                                                                <td>&nbsp;</td>
                                                            </tr>
                                                        );
                                                    }
                                                    return (
                                                        <tr key={idx}>
                                                            <td colSpan="9">&nbsp;</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div style={{
                                        position: 'absolute',
                                        bottom: '10mm',
                                        left: '10mm',
                                        right: '10mm',
                                        borderTop: '1px solid #000',
                                        paddingTop: '5px',
                                        fontSize: '9pt',
                                        textAlign: 'center',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        flexShrink: 0
                                    }}>
                                        <span>* 위 금액은 정산 기준 내역입니다.</span>
                                        <span>Page {pageIdx + 1} / {pages.length}</span>
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default UnsettledPrintModal;
