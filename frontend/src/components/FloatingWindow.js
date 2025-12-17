import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

/**
 * FloatingWindow - 드래그 및 크기 조절 가능한 플로팅 윈도우
 */
const FloatingWindow = ({ title, onClose, initialPosition = { x: 100, y: 100 }, size = { width: 400, height: 500 }, children }) => {
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

                        windowRef.current.style.left = `${Math.max(0, x)}px`;
                        windowRef.current.style.top = `${Math.max(0, y)}px`;
                        // 초기화 후 보여주기 위해 opacity 등을 쓸 수도 있으나, 일단 위치 설정
                    }
                }, 0);
            } else {
                windowRef.current.style.left = `${initialPosition.x}px`;
                windowRef.current.style.top = `${initialPosition.y}px`;
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

            const newX = windowStartPos.current.x + deltaX;
            const newY = windowStartPos.current.y + deltaY;

            if (windowRef.current) {
                windowRef.current.style.left = `${newX}px`;
                windowRef.current.style.top = `${newY}px`;
            }
        });
    };

    const handleMouseUp = () => {
        if (!isDragging.current) return;

        isDragging.current = false;
        if (windowRef.current) {
            windowRef.current.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }

        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
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
    };

    // Portal을 사용하여 document.body에 렌더링
    return ReactDOM.createPortal(
        <div
            ref={windowRef}
            style={{
                position: 'fixed',
                // left, top, width, height는 ref로 제어
                backgroundColor: 'white',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                borderRadius: '8px',
                border: '1px solid #ddd',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            {/* 헤더 (드래그 핸들) */}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    padding: '10px 15px',
                    backgroundColor: '#34495e',
                    color: 'white',
                    cursor: 'grab',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none',
                    flexShrink: 0 // 헤더 크기 고정
                }}
            >
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{title}</div>
                <button
                    onClick={onClose}
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

            {/* 컨텐츠 영역 */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '15px' }}>
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
