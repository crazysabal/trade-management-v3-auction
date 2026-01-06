import { useState, useRef, useEffect } from 'react';

/**
 * 모달 드래그 기능을 위한 커스텀 훅
 * @param {boolean} isOpen 모달 열림 상태 (닫힐 때 위치 초기화용)
 * @param {object} options 추가 옵션 { isCentered: false }
 * @returns {object} { position, handleMouseDown, draggableStyle }
 */
export const useModalDraggable = (isOpen, options = { isCentered: false }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const initialPos = useRef({ x: 0, y: 0 });

    const { isCentered } = options;

    // 모달이 닫히거나 새로 열릴 때 위치 초기화
    useEffect(() => {
        if (!isOpen) {
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen]);

    const handleMouseDown = (e) => {
        // 버튼, 입력창 등을 클릭했을 때는 드래그 방지
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) {
            return;
        }

        isDragging.current = true;
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        initialPos.current = position;

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // 텍스트 선택 방지
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;

        const deltaX = e.clientX - dragStartPos.current.x;
        const deltaY = e.clientY - dragStartPos.current.y;

        setPosition({
            x: initialPos.current.x + deltaX,
            y: initialPos.current.y + deltaY
        });
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };

    return {
        position,
        handleMouseDown,
        draggableStyle: {
            transform: isCentered
                ? `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`
                : `translate(${position.x}px, ${position.y}px)`
        }
    };
};
