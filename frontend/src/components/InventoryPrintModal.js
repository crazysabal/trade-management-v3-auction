import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { useModalDraggable } from '../hooks/useModalDraggable';
import { useAuth } from '../context/AuthContext';

const InventoryPrintModal = ({ isOpen, onClose, inventory, warehouses }) => {
    const printRef = useRef(null);
    const { user } = useAuth();

    // Helper to get scoped key
    const getScopedKey = (key) => user?.id ? `u${user.id}_${key}` : key;

    const [zoomLevel, setZoomLevel] = useState(0.8);
    const [layoutMode, setLayoutMode] = useState('double');
    const [showRemarks, setShowRemarks] = useState(true);
    const [showDate, setShowDate] = useState(false);
    const [useSmartRatio, setUseSmartRatio] = useState(false);

    // Load Settings on Mount or User Change
    useEffect(() => {
        const load = (key, fallback, parser = v => v) => {
            const val = localStorage.getItem(getScopedKey(key));
            return val !== null ? parser(val) : fallback;
        };

        setZoomLevel(load('inv_zoomLevel', 0.8, parseFloat));
        setLayoutMode(load('inv_layoutMode', 'double'));
        setShowRemarks(load('inv_showRemarks', 'true') !== 'false');
        setShowDate(load('inv_showDate', 'false') === 'true');
        setUseSmartRatio(load('inv_useSmartRatio', 'false') === 'true');
    }, [user?.id]);

    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen);

    // Save Settings
    useEffect(() => {
        const save = (key, val) => localStorage.setItem(getScopedKey(key), val);

        save('inv_layoutMode', layoutMode);
        save('inv_showRemarks', showRemarks);
        save('inv_showDate', showDate);
        save('inv_useSmartRatio', useSmartRatio);
        save('inv_zoomLevel', zoomLevel);
    }, [layoutMode, showRemarks, showDate, useSmartRatio, zoomLevel, user?.id]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const today = new Date().toLocaleDateString();

    const handlePrint = () => {
        const printContent = printRef.current;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>재고 목록 - ${today}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: 'Malgun Gothic', sans-serif; margin: 0; padding: 0; color: #000; line-height: 1.4; }
                    .warehouse-section { margin-bottom: 30px; page-break-inside: avoid; }
                    .warehouse-title { font-size: 1.2rem; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; font-size: 8pt; }
                    th, td { border: 1px solid #ddd; padding: 2px 4px; text-align: center; }
                    th { background-color: #f2f2f2; }
                    .text-left { text-align: left; }
                    .text-right { text-align: right; }
                    @media print {
                        @page { size: A4 portrait; margin: 0; }
                        .no-print { display: none; }
                        body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
                        .print-page { 
                            page-break-after: always !important; 
                            box-shadow: none !important;
                            border-radius: 0 !important;
                            margin: 0 auto !important;
                        }
                        .print-page:last-child { page-break-after: auto !important; }
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

    // 클립보드 복사 핸들러 (이미지)
    const handleCopy = async () => {
        try {
            const previewContainer = document.querySelector('.preview-container-for-copy');
            if (!previewContainer) {
                alert('미리보기 영역을 찾을 수 없습니다.');
                return;
            }

            const canvas = await html2canvas(previewContainer, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                onclone: (clonedDoc) => {
                    const clonedContainer = clonedDoc.querySelector('.preview-container-for-copy');
                    if (clonedContainer) {
                        clonedContainer.style.zoom = '1';
                        clonedContainer.style.transform = 'none';
                        clonedContainer.style.width = 'fit-content';
                        clonedContainer.style.height = 'auto';
                        clonedContainer.style.padding = '20px';
                        clonedContainer.style.margin = '0';
                        clonedContainer.style.boxShadow = 'none';
                        clonedContainer.style.borderRadius = '0';
                    }
                }
            });

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('이미지 생성에 실패했습니다.');
                    return;
                }
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]);
                    // alert('재고 목록 이미지가 클립보드에 복사되었습니다.'); 
                } catch (clipboardErr) {
                    console.error('클립보드 쓰기 실패:', clipboardErr);
                    alert('클립보드 복사에 실패했습니다.');
                }
            }, 'image/png');

        } catch (err) {
            console.error('캡처 실패:', err);
            alert('이미지 캡처에 실패했습니다.');
        }
    };

    return createPortal(
        <div
            className="modal-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                paddingTop: '60px',
                paddingBottom: '50px',
                zIndex: 9999
            }}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
            <div
                className="inventory-print-modal"
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    width: 'fit-content',
                    minWidth: '600px',
                    maxWidth: '95vw',
                    maxHeight: 'calc(100vh - 110px)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                    ...draggableStyle
                }}
            >
                {/* Header */}
                <div
                    onMouseDown={handleMouseDown}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '1rem 1.5rem',
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        flexWrap: 'wrap', // Allow wrapping if screen is too narrow
                        gap: '10px',
                        cursor: 'grab'
                    }}
                >
                    {/* Left Group: Title + Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', pointerEvents: 'none' }}>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>
                            🖨️ 재고 목록
                        </h2>

                        {/* Layout Selection */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid #cbd5e1', paddingLeft: '15px', pointerEvents: 'auto' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="layoutMode"
                                    value="single"
                                    checked={layoutMode === 'single'}
                                    onChange={(e) => setLayoutMode(e.target.value)}
                                    style={{ marginRight: '5px' }}
                                />
                                1열
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="layoutMode"
                                    value="double"
                                    checked={layoutMode === 'double'}
                                    onChange={(e) => setLayoutMode(e.target.value)}
                                    style={{ marginRight: '5px' }}
                                />
                                2열
                            </label>
                        </div>

                        {/* Options */}
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', borderLeft: '1px solid #cbd5e1', paddingLeft: '15px', pointerEvents: 'auto' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="checkbox"
                                    checked={showRemarks}
                                    onChange={(e) => setShowRemarks(e.target.checked)}
                                    style={{ marginRight: '5px' }}
                                />
                                비고
                            </label>

                            {/* Date Toggle (Only for Single Mode) */}
                            {layoutMode === 'single' && (
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={showDate}
                                        onChange={(e) => setShowDate(e.target.checked)}
                                        style={{ marginRight: '5px' }}
                                    />
                                    날짜
                                </label>
                            )}

                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="checkbox"
                                    checked={useSmartRatio}
                                    onChange={(e) => setUseSmartRatio(e.target.checked)}
                                    style={{ marginRight: '5px' }}
                                />
                                자동비율
                            </label>
                        </div>
                    </div>

                    {/* Right Group: Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', pointerEvents: 'auto' }}>
                        {/* Zoom Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #cbd5e1', marginRight: '1rem' }}>
                            <button
                                onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.1))}
                                style={{
                                    padding: '0.4rem 0.6rem',
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    color: '#475569',
                                    fontSize: '1rem'
                                }}
                                title="축소 (-)"
                            >
                                ➖
                            </button>
                            <span style={{
                                padding: '0 0.5rem',
                                fontSize: '0.9rem',
                                minWidth: '3.5rem',
                                textAlign: 'center',
                                borderLeft: '1px solid #cbd5e1',
                                borderRight: '1px solid #cbd5e1',
                                lineHeight: '2rem'
                            }}>
                                {Math.round(zoomLevel * 100)}%
                            </span>
                            <button
                                onClick={() => setZoomLevel(prev => Math.min(2.0, prev + 0.1))}
                                style={{
                                    padding: '0.4rem 0.6rem',
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    color: '#475569',
                                    fontSize: '1rem'
                                }}
                                title="확대 (+)"
                            >
                                ➕
                            </button>
                        </div>
                        <button
                            onClick={() => setZoomLevel(1)}
                            style={{
                                padding: '0.4rem 0.6rem',
                                border: 'none',
                                background: 'none',
                                color: '#fff',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                            title="이미지 복사"
                        >
                            📋 복사
                        </button>
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

                {/* Preview Area */}
                <div style={{
                    flex: 1, // Restore flex-grow
                    // width: 'fit-content', // REMOVED to align with header
                    minWidth: '100%',
                    minHeight: 0,
                    overflow: 'auto',
                    padding: '2rem',
                    backgroundColor: '#e2e8f0', // Slightly darker bg for contrast
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <div ref={printRef} className="preview-container-for-copy" style={{
                        margin: '0 auto',
                        width: 'fit-content',
                        zoom: zoomLevel,
                        transformOrigin: 'top center',
                        marginBottom: '2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        alignItems: 'center',
                        fontFamily: "'Malgun Gothic', sans-serif",
                        color: '#000',
                        lineHeight: '1.4'
                    }}>
                        {(() => {
                            const isDouble = layoutMode === 'double';
                            const ROWS_PER_COLUMN = isDouble ? 40 : 36;
                            const ROWS_PER_PAGE = isDouble ? ROWS_PER_COLUMN * 2 : ROWS_PER_COLUMN;
                            const allRows = [];

                            // 1. Flatten Data
                            warehouses.forEach(wh => {
                                const whItems = inventory.filter(item => String(item.warehouse_id) === String(wh.id));
                                if (whItems.length > 0) {
                                    // Warehouse Header Row
                                    allRows.push({ type: 'warehouse', name: wh.name, count: whItems.length });
                                    whItems.forEach(item => {
                                        allRows.push({
                                            type: 'item',
                                            data: item
                                        });
                                    });
                                }
                            });

                            // 2. Pagination (Orphan Header Prevention)
                            const pages = [];
                            let currentPage = [];
                            for (let i = 0; i < allRows.length; i++) {
                                const row = allRows[i];
                                currentPage.push(row);

                                if (currentPage.length === ROWS_PER_PAGE) {
                                    // If the last item is a header, move it to the next page
                                    if (row.type === 'warehouse') {
                                        currentPage.pop(); // Remove header from this page
                                        pages.push(currentPage); // Push current page (will have 1 empty slot)
                                        currentPage = [row]; // Start next page with this header
                                    } else {
                                        pages.push(currentPage);
                                        currentPage = [];
                                    }
                                }
                            }
                            if (currentPage.length > 0) pages.push(currentPage);

                            // 3. Render Pages
                            return pages.map((pageRows, pageIndex) => {
                                // Helper: Process suppression for a specific list of rows (Column/Page)
                                const enrichWithSuppression = (rows) => {
                                    let prevItemData = null;
                                    return rows.map(row => {
                                        if (row.type !== 'item') {
                                            prevItemData = null; // Reset on header/empty
                                            return row;
                                        }

                                        const item = row.data;
                                        let hideName = false;
                                        let hideWeight = false;
                                        let hideSender = false;

                                        if (prevItemData) {
                                            // 1. Same Name?
                                            if (String(item.product_name) === String(prevItemData.product_name)) {
                                                hideName = true;
                                                // 2. Same Name AND Same Weight?
                                                const currWeight = Number(item.product_weight) || 0;
                                                const prevWeight = Number(prevItemData.product_weight) || 0;
                                                if (currWeight === prevWeight) {
                                                    hideWeight = true;
                                                    // 3. Same Name AND Same Weight AND Same Sender?
                                                    const currSender = String(item.sender || '-');
                                                    const prevSender = String(prevItemData.sender || '-');
                                                    if (currSender === prevSender) {
                                                        hideSender = true;
                                                    }
                                                }
                                            }
                                        }

                                        prevItemData = item;
                                        return { ...row, hideName, hideWeight, hideSender };
                                    });
                                };

                                // Split rows FIRST
                                const rawLeft = isDouble ? pageRows.slice(0, ROWS_PER_COLUMN) : pageRows;
                                const rawRight = isDouble ? pageRows.slice(ROWS_PER_COLUMN, ROWS_PER_PAGE) : [];

                                // Apply suppression per column (Reset context at start of column)
                                const leftRows = enrichWithSuppression(rawLeft);
                                const rightRows = enrichWithSuppression(rawRight);

                                // Helper to render a table column
                                const renderTableColumn = (rows) => {
                                    const emptyCount = ROWS_PER_COLUMN - rows.length;
                                    const filled = [...rows, ...Array(Math.max(0, emptyCount)).fill({ type: 'empty' })];

                                    // Smart Ratio Calculation
                                    let smartWidths = null;
                                    if (useSmartRatio && allRows.length > 0) {
                                        const getWeight = (str) => {
                                            if (!str) return 0;
                                            const s = String(str);
                                            let len = 0;
                                            for (let i = 0; i < s.length; i++) {
                                                len += (s.charCodeAt(i) > 127) ? 2 : 1;
                                            }
                                            return len;
                                        }

                                        // Initial minimums (weighted chars) - approximate headers or min display
                                        let maxLens = {
                                            name: 10, date: 5, weight: 4, sender: 6, grade: 4, qty: 3, price: 6
                                        };

                                        allRows.forEach(row => {
                                            if (row.type === 'item') {
                                                const d = row.data;
                                                maxLens.name = Math.max(maxLens.name, getWeight(d.product_name));
                                                if (showDate) {
                                                    const dateStr = d.created_at ? new Date(d.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\./g, '-').replace(/\s/g, '').slice(0, -1) : '-';
                                                    maxLens.date = Math.max(maxLens.date, getWeight(dateStr));
                                                }
                                                maxLens.weight = Math.max(maxLens.weight, getWeight(d.product_weight) + (d.weight_unit || d.product_weight_unit || 'kg').length);
                                                maxLens.sender = Math.max(maxLens.sender, getWeight(d.sender));
                                                maxLens.grade = Math.max(maxLens.grade, getWeight(d.grade));
                                                maxLens.qty = Math.max(maxLens.qty, getWeight(d.remaining_quantity)); // commas?
                                                maxLens.price = Math.max(maxLens.price, getWeight(d.unit_price)); // commas?
                                            }
                                        });

                                        // Calculate Totals based on ACTIVE columns
                                        let totalWeight = maxLens.name + maxLens.weight + maxLens.sender + maxLens.grade + maxLens.qty + maxLens.price;
                                        if (!isDouble && showDate) totalWeight += maxLens.date;

                                        // Available Width %
                                        // If Single + Remarks: Fixed Rem is 30%. Available 70%.
                                        // If Single + Date + Remarks: Fixed Rem 26%? Or 30%? Let's keep Remarks fixed.
                                        // If Double + Remarks: Fixed Rem 20%. Available 80%.
                                        // If Remarks OFF: Available 100%.

                                        let fixedRemPct = 0;
                                        if (showRemarks) {
                                            if (layoutMode === 'single') fixedRemPct = showDate ? 26 : 30;
                                            else fixedRemPct = 20;
                                        }

                                        const availPct = 100 - fixedRemPct;

                                        // Compute %
                                        smartWidths = {
                                            name: (maxLens.name / totalWeight) * availPct,
                                            date: (!isDouble && showDate) ? (maxLens.date / totalWeight) * availPct : 0,
                                            weight: (maxLens.weight / totalWeight) * availPct,
                                            sender: (maxLens.sender / totalWeight) * availPct,
                                            grade: (maxLens.grade / totalWeight) * availPct,
                                            qty: (maxLens.qty / totalWeight) * availPct,
                                            price: (maxLens.price / totalWeight) * availPct,
                                            remarks: fixedRemPct
                                        }
                                    }


                                    // Column Widths logic
                                    let colGroup;

                                    if (useSmartRatio && smartWidths) {
                                        const sw = smartWidths;
                                        const Cols = [];
                                        Cols.push(<col key="n" style={{ width: `${sw.name}%` }} />);
                                        if (!isDouble && showDate) Cols.push(<col key="d" style={{ width: `${sw.date}%` }} />);
                                        Cols.push(<col key="w" style={{ width: `${sw.weight}%` }} />);
                                        Cols.push(<col key="s" style={{ width: `${sw.sender}%` }} />);
                                        Cols.push(<col key="g" style={{ width: `${sw.grade}%` }} />);
                                        Cols.push(<col key="q" style={{ width: `${sw.qty}%` }} />);
                                        Cols.push(<col key="p" style={{ width: `${sw.price}%` }} />);
                                        if (showRemarks) Cols.push(<col key="r" style={{ width: `${sw.remarks}%` }} />);

                                        colGroup = <colgroup>{Cols}</colgroup>;

                                    } else if (layoutMode === 'single' && showDate) {
                                        // ... existing manual logic ...
                                        // Name(20), Date(12), W(8), S(8), G(8), Q(8), P(10), Rem(26) (Total 100)
                                        // if Remarks is OFF, then redistribute Rem to Name/Others.
                                        // But user implied "Toggle Remarks" too.
                                        // If Remarks is OFF and Date is ON: Name(30), Date(15), W(10), S(10), G(10), Q(10), P(15) ?

                                        if (showRemarks) {
                                            colGroup = (
                                                <colgroup>
                                                    <col style={{ width: '20%' }} />
                                                    <col style={{ width: '12%' }} />
                                                    <col style={{ width: '8%' }} />
                                                    <col style={{ width: '8%' }} />
                                                    <col style={{ width: '8%' }} />
                                                    <col style={{ width: '8%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '26%' }} />
                                                </colgroup>
                                            );
                                        } else {
                                            // Single + Date + No Remarks
                                            colGroup = (
                                                <colgroup>
                                                    <col style={{ width: '25%' }} />
                                                    <col style={{ width: '15%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '15%' }} />
                                                    <col style={{ width: '15%' }} />
                                                </colgroup>
                                            );
                                        }

                                    } else if (showRemarks) {
                                        // ... existing showRemarks logic ...
                                        if (isDouble) {
                                            colGroup = (
                                                <colgroup>
                                                    <col style={{ width: '25%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '15%' }} />
                                                    <col style={{ width: '20%' }} />
                                                </colgroup>
                                            );
                                        } else {
                                            // Single With Remarks (Wide 30%)
                                            colGroup = (
                                                <colgroup>
                                                    <col style={{ width: '20%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '30%' }} />
                                                </colgroup>
                                            );
                                        }
                                    } else {
                                        colGroup = (
                                            <colgroup>
                                                <col style={{ width: '30%' }} />
                                                <col style={{ width: '15%' }} />
                                                <col style={{ width: '15%' }} />
                                                <col style={{ width: '10%' }} />
                                                <col style={{ width: '15%' }} />
                                                <col style={{ width: '15%' }} />
                                            </colgroup>
                                        );
                                    }

                                    const fontSize = isDouble ? '8pt' : '10pt';
                                    const rowHeight = isDouble ? '24px' : '28px'; // Taller rows for single column

                                    return (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize, tableLayout: 'fixed' }}>
                                            {colGroup}
                                            <tbody>
                                                {filled.map((row, idx) => {
                                                    const rowStyle = { height: rowHeight, borderBottom: '1px solid #ddd', verticalAlign: 'middle' };
                                                    // Calculate spanCount
                                                    let spanCount = 6;
                                                    if (showRemarks) spanCount++;
                                                    if (!isDouble && showDate) spanCount++;

                                                    if (row.type === 'warehouse') {
                                                        return (
                                                            <tr key={`wh-${idx}`} style={{ ...rowStyle, backgroundColor: '#f9fafb', borderBottom: '1px solid #888' }}>
                                                                <td colSpan={spanCount} style={{ textAlign: 'left', fontWeight: 'bold', padding: '0 5px', border: 'none' }}>
                                                                    ■ {row.name} (총 {row.count}건)
                                                                </td>
                                                            </tr>
                                                        );
                                                    }
                                                    if (row.type === 'item') {
                                                        const item = row.data;
                                                        // Format Date (MM-DD)
                                                        const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\./g, '-').replace(/\s/g, '').slice(0, -1) : '-';
                                                        // or just simple string slice if it's strictly YYYY-MM-DD

                                                        return (
                                                            <tr key={`item-${item.id}`} style={rowStyle}>
                                                                <td className="text-left" style={{ padding: '0 5px', border: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {row.hideName ? '' : item.product_name}
                                                                </td>
                                                                {/* Date Column Condition */}
                                                                {!isDouble && showDate && (
                                                                    <td style={{ textAlign: 'center', padding: '0', border: 'none', fontSize: '0.9em' }}>
                                                                        {dateStr}
                                                                    </td>
                                                                )}
                                                                <td style={{ textAlign: 'center', padding: '0', border: 'none' }}>
                                                                    {row.hideWeight ? '' : (Number(item.product_weight) > 0 ? Number(item.product_weight) + (item.weight_unit || item.product_weight_unit || 'kg') : '-')}
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '0', border: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {row.hideSender ? '' : (item.sender || '-')}
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '0', border: 'none' }}>{item.grade || '-'}</td>
                                                                <td className="text-right" style={{ textAlign: 'right', padding: '0 5px', border: 'none' }}>
                                                                    {Number(item.remaining_quantity).toLocaleString()}
                                                                </td>
                                                                <td className="text-right" style={{ textAlign: 'right', padding: '0 5px', border: 'none' }}>
                                                                    {item.unit_price ? Number(item.unit_price).toLocaleString() : '-'}
                                                                </td>
                                                                {showRemarks && <td style={{ border: 'none' }}></td>}
                                                            </tr>
                                                        );
                                                    }
                                                    // Empty row
                                                    return (
                                                        <tr key={`empty-${idx}`} style={rowStyle}>
                                                            <td colSpan={spanCount} style={{ border: 'none', height: rowHeight, verticalAlign: 'middle', padding: '0 5px' }}>&nbsp;</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    );
                                };

                                return (
                                    <div key={pageIndex} className="print-page" style={{
                                        backgroundColor: 'white',
                                        padding: '10mm 5mm', // Reduced horizontal margins
                                        width: '210mm', // A4 Portrait width
                                        height: '297mm', // A4 Portrait height
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                                        boxSizing: 'border-box',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        position: 'relative'
                                    }}>
                                        <div style={{ textAlign: 'center', marginBottom: '10px', height: '30px' }}>
                                            <h1 style={{ margin: 0, fontSize: '14pt', fontWeight: 'bold' }}>재고 목록 ({today})</h1>
                                            <div style={{ position: 'absolute', right: '5mm', top: '10mm', fontSize: '8pt' }}>
                                                Page {pageIndex + 1} / {pages.length}
                                            </div>
                                        </div>

                                        {isDouble ? (
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
                                                <div style={{ flex: 1 }}>
                                                    {renderTableColumn(leftRows)}
                                                </div>
                                                {/* Vertical Separator */}
                                                <div style={{ width: '1px', backgroundColor: '#ccc', margin: '0 2mm' }}></div>
                                                <div style={{ flex: 1 }}>
                                                    {renderTableColumn(rightRows)}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                {renderTableColumn(leftRows)}
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default InventoryPrintModal;
