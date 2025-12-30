import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

/**
 * FloatingWindow - 드래그 및 크기 조절 가능한 플로팅 윈도우
 */
const FloatingWindow = ({ title, icon, onClose, initialPosition = { x: 100, y: 100 }, size = { width: 400, height: 500 }, children, zIndex = 9999, onMouseDown, onResizeStop, onDragStop, isActive, contentPadding = '8px', headerPadding = '6px 15px', ...rest }) => {
    const windowRef = useRef(null);

    // 이동 관련 Refs
    const dragStartPos = useRef({ x: 0, y: 0 });
    const windowStartPos = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);

    // 리사이즈 관련 Refs
    const resizeStartPos = useRef({ x: 0, y: 0 });
    const windowStartSize = useRef({ width: 0, height: 0 });
    const isResizing = useRef(false);

    useEffect(() => {
        // 초기 위치 및 크기 설정
        if (windowRef.current) {
            // Width 처리
            let currentWidth = 400; // 기본값
            if (size.width === 'auto') {
                windowRef.current.style.width = 'fit-content';
                windowRef.current.style.minWidth = '400px';
                windowRef.current.style.maxWidth = '90vw';
            } else if (typeof size.width === 'number') {
                windowRef.current.style.width = `${size.width}px`;
                currentWidth = size.width;
            } else {
                windowRef.current.style.width = size.width;
            }

            // Height 처리
            let currentHeight = 500; // 기본값
            if (size.height === 'auto') {
                windowRef.current.style.height = 'fit-content';
            } else if (typeof size.height === 'number') {
                windowRef.current.style.height = `${size.height}px`;
                currentHeight = size.height;
            } else {
                windowRef.current.style.height = size.height;
            }

            // 위치 설정 ('center' 지원)
            if (initialPosition === 'center') {
                // 렌더링 후 크기를 알 수 있도록 setTimeout 사용
                setTimeout(() => {
                    if (windowRef.current) {
                        const rect = windowRef.current.getBoundingClientRect();
                        const winW = window.innerWidth;
                        const winH = window.innerHeight;
                        const x = (winW - rect.width) / 2;
                        const y = (winH - rect.height) / 2;

                        // 초기 위치도 Navbar(50px) 고려
                        const safeY = Math.max(50, y);

                        windowRef.current.style.left = `${Math.max(0, x)}px`;
                        windowRef.current.style.top = `${safeY}px`;
                    }
                }, 0);
            } else {
                // 초기 위치도 상단 경계만 체크
                const safeTop = 50;
                let finalY = initialPosition.y;
                if (finalY < safeTop) finalY = safeTop;

                windowRef.current.style.left = `${initialPosition.x}px`;
                windowRef.current.style.top = `${finalY}px`;
            }
        }
    }, [initialPosition]);

    // --- 드래그 이동 핸들러 ---
    const handleMouseDown = (e) => {
        if (e.button !== 0) return;

        // 버튼 등을 클릭했을 때는 드래그 방지
        if (e.target.closest('button')) return;

        isDragging.current = true;

        const rect = windowRef.current.getBoundingClientRect();
        windowStartPos.current = { x: rect.left, y: rect.top };
        dragStartPos.current = { x: e.clientX, y: e.clientY };

        // 스타일 변경
        windowRef.current.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
        windowRef.current.style.transition = 'none';

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;

        requestAnimationFrame(() => {
            const deltaX = e.clientX - dragStartPos.current.x;
            const deltaY = e.clientY - dragStartPos.current.y;

            let newX = windowStartPos.current.x + deltaX;
            let newY = windowStartPos.current.y + deltaY;

            if (windowRef.current) {
                // 화면 경계 제한
                // 상단(Navbar)만 제한하고, 좌우/하단은 자유롭게 이동 가능하도록 변경 (사용자 요청)
                const safeTop = 50; // Navbar height

                // X축 제한 해제 (자유롭게 이동)
                // newX = Math.max(0, Math.min(newX, safeRight - width));

                // Y축 제한 (상단 Navbar만 침범 금지, 하단은 자유)
                newY = Math.max(safeTop, newY);

                windowRef.current.style.left = `${newX}px`;
                windowRef.current.style.top = `${newY}px`;
            }
        });
    };

    const handleMouseUp = () => {
        if (!isDragging.current) return;

        isDragging.current = false;
        if (windowRef.current) {
            windowRef.current.style.boxShadow = isActive ? '0 8px 30px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.15)';
        }

        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // 위치 저장 콜백 호출
        if (onDragStop && windowRef.current) {
            const rect = windowRef.current.getBoundingClientRect();
            onDragStop({ x: rect.left, y: rect.top });
        }
    };

    const resizeDirection = useRef(null); // 'left', 'right', 'bottom', 'bottom-right', 'bottom-left'
    const windowStartRect = useRef({ x: 0, y: 0, width: 0, height: 0 }); // Store initial rect

    const handleResizeMouseDown = (e, direction) => {
        e.stopPropagation();
        if (e.button !== 0) return;

        isResizing.current = true;
        resizeDirection.current = direction;

        const rect = windowRef.current.getBoundingClientRect();
        windowStartRect.current = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        resizeStartPos.current = { x: e.clientX, y: e.clientY };

        windowRef.current.style.transition = 'none';
        document.body.style.userSelect = 'none';

        // Set cursor based on direction
        let cursorStyle = 'default';
        switch (direction) {
            case 'left':
            case 'right': cursorStyle = 'ew-resize'; break;
            case 'bottom': cursorStyle = 'ns-resize'; break;
            case 'bottom-right': cursorStyle = 'nwse-resize'; break;
            case 'bottom-left': cursorStyle = 'nesw-resize'; break;
            default: cursorStyle = 'default';
        }
        document.body.style.cursor = cursorStyle;

        document.addEventListener('mousemove', handleResizeMouseMove);
        document.addEventListener('mouseup', handleResizeMouseUp);
    };

    const handleResizeMouseMove = (e) => {
        if (!isResizing.current) return;

        requestAnimationFrame(() => {
            const deltaX = e.clientX - resizeStartPos.current.x;
            const deltaY = e.clientY - resizeStartPos.current.y;
            const startRect = windowStartRect.current;
            const direction = resizeDirection.current;

            let newWidth = startRect.width;
            let newHeight = startRect.height;
            let newLeft = startRect.x;
            // let newTop = startRect.y; // Top resizing not implemented yet as per request

            // Helper to constrain width/height
            const MIN_WIDTH = 300;
            const MIN_HEIGHT = 200;

            // Horizontal Resizing
            if (direction.includes('right')) {
                newWidth = Math.max(MIN_WIDTH, startRect.width + deltaX);
            } else if (direction.includes('left')) {
                // For left resize, width increases as we move left (negative deltaX)
                // Width = StartWidth - DeltaX
                // But we must also clamp such that Width >= MIN_WIDTH
                // So effective delta might be different
                const rawWidth = startRect.width - deltaX;
                newWidth = Math.max(MIN_WIDTH, rawWidth);

                // If width was clamped, we must adjust left position appropriately
                // Left = StartLeft + (StartWidth - NewWidth)
                newLeft = startRect.x + (startRect.width - newWidth);
            }

            // Vertical Resizing
            if (direction.includes('bottom')) {
                newHeight = Math.max(MIN_HEIGHT, startRect.height + deltaY);
            }

            if (windowRef.current) {
                windowRef.current.style.width = `${newWidth}px`;
                windowRef.current.style.height = `${newHeight}px`;
                windowRef.current.style.left = `${newLeft}px`;
                // windowRef.current.style.top = `${newTop}px`;
            }
        });
    };

    const handleResizeMouseUp = () => {
        if (!isResizing.current) return;

        isResizing.current = false;
        resizeDirection.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup', handleResizeMouseUp);

        if (onResizeStop && windowRef.current) {
            const rect = windowRef.current.getBoundingClientRect();
            onResizeStop({ width: rect.width, height: rect.height });
        }
    };

    // Maximize/Restore Logic
    const [isMaximized, setIsMaximized] = useState(false);
    const prevRect = useRef(null);

    const toggleMaximize = (e) => {
        if (e) e.stopPropagation();
        if (isMaximized) {
            // Restore
            setIsMaximized(false);
            if (prevRect.current && windowRef.current) {
                windowRef.current.style.transition = 'all 0.2s';
                windowRef.current.style.left = `${prevRect.current.left}px`;
                windowRef.current.style.top = `${prevRect.current.top}px`;
                windowRef.current.style.width = `${prevRect.current.width}px`;
                windowRef.current.style.height = `${prevRect.current.height}px`;

                setTimeout(() => {
                    if (windowRef.current) windowRef.current.style.transition = '';
                }, 200);
            }
        } else {
            // Maximize
            if (windowRef.current) {
                const rect = windowRef.current.getBoundingClientRect();
                prevRect.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };

                setIsMaximized(true);
                windowRef.current.style.transition = 'all 0.2s';
                windowRef.current.style.left = '0';
                windowRef.current.style.top = '50px'; // Below Navbar
                windowRef.current.style.width = '100vw';
                windowRef.current.style.height = 'calc(100vh - 88px)'; // Navbar(50) + Taskbar(38) 제외

                setTimeout(() => {
                    if (windowRef.current) windowRef.current.style.transition = '';
                }, 200);
            }
        }
    };

    // Resizer Component Helper
    const Resizer = ({ direction, style, cursor }) => (
        <div
            onMouseDown={(e) => handleResizeMouseDown(e, direction)}
            style={{
                position: 'absolute',
                zIndex: 10,
                cursor: cursor,
                ...style // width/height/positioning
            }}
        />
    );

    return ReactDOM.createPortal(
        <div
            ref={windowRef}
            onMouseDown={(e) => {
                if (onMouseDown) onMouseDown(e);
            }}
            style={{
                position: 'fixed',
                backgroundColor: 'white',
                boxShadow: isActive ? '0 8px 30px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.15)',
                borderRadius: isMaximized ? '0' : '8px',
                border: isActive ? '2px solid #3498db' : '1px solid #ddd',
                zIndex: zIndex,
                display: rest.isMinimized ? 'none' : 'flex',
                flexDirection: 'column',
                overflow: 'visible', // Changed to visible so resize handles outside/edge work better if needed, but 'hidden' clips corners. 
                // Actually 'hidden' is safer for rounded corners, so we'll keep handles inside.
                transition: 'box-shadow 0.2s, border 0.2s',
            }}
        >
            {/* Header */}
            <div
                onMouseDown={isMaximized ? undefined : handleMouseDown}
                onDoubleClick={toggleMaximize}
                style={{
                    padding: headerPadding,
                    backgroundColor: isActive ? '#2980b9' : '#34495e',
                    color: 'white',
                    cursor: 'grab',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 100,
                    borderTopLeftRadius: isMaximized ? '0' : '6px',
                    borderTopRightRadius: isMaximized ? '0' : '6px'
                }}
            >
                {/* ... Header Content (Same as before) ... */}
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(title);
                    }}
                    style={{ fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    title="클릭하여 화면 명 복사"
                >
                    {icon && <span>{icon}</span>}
                    {title}
                    {rest.isDirty && (
                        <span style={{
                            backgroundColor: '#e74c3c', // Red
                            color: 'white',
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontWeight: 'normal',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            animation: 'pulse 2s infinite'
                        }}>
                            수정중
                        </span>
                    )}
                </div>
                <style>{`
                    @keyframes pulse {
                        0% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.8; transform: scale(0.95); }
                        100% { opacity: 1; transform: scale(1); }
                    }
                `}</style>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {rest.onMinimize && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                rest.onMinimize();
                            }}
                            title="최소화"
                            style={{ background: 'none', border: 'none', color: 'white', fontSize: '1rem', cursor: 'pointer', padding: '0 5px', lineHeight: 1 }}
                        >
                            ─
                        </button>
                    )}
                    <button
                        onClick={toggleMaximize}
                        title={isMaximized ? "이전 크기로 복원" : "최대화"}
                        style={{ background: 'none', border: 'none', color: 'white', fontSize: '1rem', cursor: 'pointer', padding: '0 5px', lineHeight: 1 }}
                    >
                        {isMaximized ? '❐' : '□'}
                    </button>
                    <button onClick={onClose} title="닫기" style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer', padding: '0 5px', lineHeight: 1 }}>
                        &times;
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: contentPadding }}>
                {children}
            </div>

            {/* --- Resize Handles --- */}

            {/* Right Edge */}
            <Resizer
                direction="right"
                cursor="ew-resize"
                style={{ top: 0, right: -4, width: '10px', height: '100%' }}
            />
            {/* Left Edge */}
            <Resizer
                direction="left"
                cursor="ew-resize"
                style={{ top: 0, left: -4, width: '10px', height: '100%' }}
            />
            {/* Bottom Edge */}
            <Resizer
                direction="bottom"
                cursor="ns-resize"
                style={{ bottom: -3, left: 0, width: '100%', height: '6px' }}
            />

            {/* Bottom-Right Corner (Visual Icon) */}
            <div
                onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-right')}
                style={{
                    position: 'absolute', right: 0, bottom: 0, width: '20px', height: '20px',
                    cursor: 'nwse-resize', zIndex: 11, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '2px'
                }}
            >
                <div style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 0 10px 10px', borderColor: 'transparent transparent #95a5a6 transparent' }} />
            </div>

            {/* Bottom-Left Corner */}
            <Resizer
                direction="bottom-left"
                cursor="nesw-resize"
                style={{ bottom: -4, left: -4, width: '16px', height: '16px', zIndex: 11 }}
            />

        </div>,
        document.body
    );
};

export default FloatingWindow;
