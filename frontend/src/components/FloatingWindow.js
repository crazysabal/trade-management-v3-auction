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

    // --- 리사이즈 핸들러 ---
    const handleResizeMouseDown = (e) => {
        e.stopPropagation(); // 드래그 이벤트 전파 방지
        if (e.button !== 0) return;

        isResizing.current = true;

        const rect = windowRef.current.getBoundingClientRect();
        windowStartSize.current = { width: rect.width, height: rect.height };
        resizeStartPos.current = { x: e.clientX, y: e.clientY };

        windowRef.current.style.transition = 'none';

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nwse-resize';

        document.addEventListener('mousemove', handleResizeMouseMove);
        document.addEventListener('mouseup', handleResizeMouseUp);
    };

    const handleResizeMouseMove = (e) => {
        if (!isResizing.current) return;

        requestAnimationFrame(() => {
            const deltaX = e.clientX - resizeStartPos.current.x;
            const deltaY = e.clientY - resizeStartPos.current.y;

            const newWidth = Math.max(300, windowStartSize.current.width + deltaX); // 최소 너비 300
            const newHeight = Math.max(200, windowStartSize.current.height + deltaY); // 최소 높이 200

            if (windowRef.current) {
                windowRef.current.style.width = `${newWidth}px`;
                windowRef.current.style.height = `${newHeight}px`;
            }
        });
    };

    const handleResizeMouseUp = () => {
        if (!isResizing.current) return;

        isResizing.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup', handleResizeMouseUp);

        // 부모에게 최종 크기 전달
        if (onResizeStop && windowRef.current) {
            const rect = windowRef.current.getBoundingClientRect();
            onResizeStop({ width: rect.width, height: rect.height });
        }
    };

    // Portal을 사용하여 document.body에 렌더링
    return ReactDOM.createPortal(
        <div
            ref={windowRef}
            onMouseDown={(e) => {
                if (onMouseDown) onMouseDown(e);
            }}
            style={{
                position: 'fixed',
                // left, top, width, height는 ref로 제어
                backgroundColor: 'white',
                boxShadow: isActive ? '0 8px 30px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.15)',
                borderRadius: '8px',
                border: isActive ? '2px solid #3498db' : '1px solid #ddd',
                zIndex: zIndex,
                display: rest.isMinimized ? 'none' : 'flex', // 최소화 시 숨김
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s, border 0.2s', // 부드러운 전환
            }}
        >
            {/* 헤더 (드래그 핸들) */}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    padding: headerPadding,
                    backgroundColor: isActive ? '#2980b9' : '#34495e', // 활성: 밝은 파랑, 비활성: 짙은 회색
                    color: 'white',
                    cursor: 'grab',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none',
                    flexShrink: 0, // 헤더 크기 고정
                    position: 'relative', // 컨텐츠보다 위에 표시되도록 설정
                    zIndex: 100
                }}
            >
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {icon && <span>{icon}</span>}
                    {title}
                    {/* 수정 상태 뱃지 */}
                    {rest.isDirty && (
                        <span style={{
                            backgroundColor: '#e74c3c',
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
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'white',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                padding: '0 5px',
                                lineHeight: 1
                            }}
                        >
                            ─
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        title="닫기"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            padding: '0 5px',
                            lineHeight: 1
                        }}
                    >
                        &times;
                    </button>
                </div>
            </div>

            {/* 컨텐츠 영역 */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: contentPadding }}>
                {children}
            </div>

            {/* 리사이즈 핸들 (우측 하단) */}
            <div
                onMouseDown={handleResizeMouseDown}
                style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    width: '20px',
                    height: '20px',
                    cursor: 'nwse-resize',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-end',
                    padding: '2px'
                }}
            >
                {/* 삼각형 모양 아이콘 */}
                <div style={{
                    width: 0,
                    height: 0,
                    borderStyle: 'solid',
                    borderWidth: '0 0 10px 10px',
                    borderColor: 'transparent transparent #95a5a6 transparent'
                }} />
            </div>
        </div>,
        document.body // 렌더링 타겟
    );
};

export default FloatingWindow;
