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

        // 드래그 대상 요소(헤더)와 그 부모(모달 전체) 정보 획득
        const header = e.currentTarget;
        const modal = header.parentElement;
        const modalRect = modal.getBoundingClientRect();
        const headerHeight = header.offsetHeight;

        isDragging.current = true;
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        initialPos.current = position;

        // 드래그 시작 시점의 절대 좌표 및 헤더 높이 저장
        const taskbarHeight = 38;
        const screenHeight = window.innerHeight;
        const screenWidth = window.innerWidth;

        const moveHandler = (moveEvent) => {
            if (!isDragging.current) return;

            const deltaX = moveEvent.clientX - dragStartPos.current.x;
            const deltaY = moveEvent.clientY - dragStartPos.current.y;

            let newX = initialPos.current.x + deltaX;
            let newY = initialPos.current.y + deltaY;

            // [BOUNDARY GUARD] 뷰포트 절대 좌표 기준으로 경계 체크
            const taskbarHeight = 38;
            const navbarHeight = 60; // Standard 9: 60px Navbar
            const screenHeight = window.innerHeight;
            const bottomLimit = screenHeight - taskbarHeight;

            let targetTop = modalRect.top + deltaY;

            // 하단 경계 (모달 전체가 태스크바 위 유지) - 먼저 적용 (상단 우선순위를 위해)
            if (targetTop + modalRect.height > bottomLimit) {
                targetTop = bottomLimit - modalRect.height;
            }

            // 상단 경계 (Navbar 침범 방지) - 최우선 순위
            if (targetTop < navbarHeight) {
                targetTop = navbarHeight;
            }

            // 새로운 Y 좌표 계산 (초기 위치 + 델타)
            newY = initialPos.current.y + (targetTop - modalRect.top);

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

        // 텍스트 선택 방지
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
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
