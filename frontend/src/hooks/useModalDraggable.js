import { useState, useRef, useEffect } from 'react';

/**
 * 모달 드래그 기능을 위한 커스텀 훅
 * @param {boolean} isOpen 모달 열림 상태 (닫힐 때 위치 초기화용)
 * @param {object} options 추가 옵션 { isCentered: false }
 * @returns {object} { position, handleMouseDown, draggableStyle }
 */
export const useModalDraggable = (isOpen, options = { isCentered: false, useTransform: true }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [hasPositioned, setHasPositioned] = useState(false); // [LATCH-ON] Tracks if we have switched to absolute positioning
    const isDragging = useRef(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const initialPos = useRef({ x: 0, y: 0 });

    const { isCentered, useTransform = true } = options;

    // 모달이 닫히거나 새로 열릴 때 위치 초기화
    useEffect(() => {
        if (!isOpen) {
            setPosition({ x: 0, y: 0 });
            setHasPositioned(false); // Reset latch
        }
    }, [isOpen]);

    const handleMouseDown = (e) => {
        // ... (existing mouseDown guard logic remains same)
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) {
            return;
        }

        const header = e.currentTarget;
        const modal = header.parentElement;
        const modalRect = modal.getBoundingClientRect();

        isDragging.current = true;
        dragStartPos.current = { x: e.clientX, y: e.clientY };

        // [LATCH-ON LOGIC]
        // If not using transform and haven't positioned yet, grab current absolute position from Flexbox layout
        if (!useTransform && !hasPositioned) {
            initialPos.current = { x: modalRect.left, y: modalRect.top };
            setPosition({ x: modalRect.left, y: modalRect.top });
            setHasPositioned(true); // Switch to absolute mode
        } else {
            initialPos.current = position;
        }

        const moveHandler = (moveEvent) => {
            if (!isDragging.current) return;

            const deltaX = moveEvent.clientX - dragStartPos.current.x;
            const deltaY = moveEvent.clientY - dragStartPos.current.y;

            let newX = initialPos.current.x + deltaX;
            let newY = initialPos.current.y + deltaY;

            // Boundary Guard Logic
            const taskbarHeight = 38;
            const navbarHeight = 60;
            const screenHeight = window.innerHeight;
            const bottomLimit = screenHeight - taskbarHeight;

            // Recalculate modalHeight slightly differently if needed, but modalRect.height is safe
            let currentH = modalRect.height;

            if (useTransform) {
                // Re-use legacy logic for transform mode
                let currentTargetTop = modalRect.top + deltaY;
                if (currentTargetTop + currentH > bottomLimit) currentTargetTop = bottomLimit - currentH;
                if (currentTargetTop < navbarHeight) currentTargetTop = navbarHeight;
                newY = initialPos.current.y + (currentTargetTop - modalRect.top);
            } else {
                // Absolute positioning boundary check
                if (newY + currentH > bottomLimit) newY = bottomLimit - currentH;
                if (newY < navbarHeight) newY = navbarHeight;
            }

            setPosition({ x: newX, y: newY });
        };

        const upHandler = () => {
            isDragging.current = false;
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    };

    const style = useTransform
        ? {
            transform: isCentered
                ? `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`
                : `translate(${position.x}px, ${position.y}px)`
        }
        : hasPositioned
            ? {
                position: 'absolute',
                left: `${position.x}px`,
                top: `${position.y}px`,
                margin: 0, // Reset any auto margins
                transform: 'none' // Explicitly disable transform
            }
            : {}; // Return empty style initially (let Flexbox center it)

    return {
        position,
        handleMouseDown,
        draggableStyle: style
    };
};
