import { useState, useEffect, useRef } from 'react';

/**
 * useDraggable Hook
 * 
 * 모달 등의 요소를 드래그할 수 있게 해주는 커스텀 훅입니다.
 * 외부 라이브러리(react-draggable) 없이 순수 React/DOM 이벤트로 구현되었습니다.
 * 
 * @returns {object} { position, handleMouseDown, modalRef }
 * - position: { x, y } 현재 이동한 거리 (transform: translate에 사용)
 * - handleMouseDown: 드래그 시작 핸들러 (헤더 등에 연결)
 * - modalRef: 드래그 대상 요소의 Ref (필요한 경우 사용)
 */
const useDraggable = () => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const modalRef = useRef(null);
    const isDragging = useRef(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const elementStartPos = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        // 좌클릭만 허용
        if (e.button !== 0) return;

        isDragging.current = true;
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        elementStartPos.current = { ...position };

        // 드래그 중 텍스트 선택 방지
        document.body.style.userSelect = 'none';

        // 이벤트 리스너 등록 (window에 등록하여 범위 벗어나도 드래그 유지)
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;

        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;

        setPosition({
            x: elementStartPos.current.x + dx,
            y: elementStartPos.current.y + dy
        });
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.body.style.userSelect = '';

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    // 컴포넌트 언마운트 시 클린업
    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return {
        position,
        setPosition,
        handleMouseDown,
        modalRef
    };
};

export default useDraggable;
