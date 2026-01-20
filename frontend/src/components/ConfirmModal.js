import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalDraggable } from '../hooks/useModalDraggable';

/**
 * 커스텀 확인/알림 모달 컴포넌트
 * React Portal을 사용하여 DOM 최상위(body)에 렌더링
 * 
 * @param {boolean} isOpen - 모달 표시 여부
 * @param {function} onClose - 모달 닫기 (취소 버튼)
 * @param {function} onConfirm - 확인 버튼 클릭 시
 * @param {string} title - 모달 제목
 * @param {string} message - 모달 메시지
 * @param {string} type - 모달 타입: 'confirm', 'delete', 'success', 'warning', 'info'
 * @param {string} confirmText - 확인 버튼 텍스트 (기본: '확인')
 * @param {string} cancelText - 취소 버튼 텍스트 (기본: '취소')
 * @param {boolean} showCancel - 취소 버튼 표시 여부 (기본: true)
 */
function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'confirm',
  confirmText = '확인',
  cancelText = '취소',
  showCancel = true,
  showConfirm = true,
  children,
  maxWidth,
  hideHeader = false, // 헤더 숨김 옵션 추가
  padding, // 커스텀 패딩 옵션 추가
  icon, // 커스텀 아이콘 옵션 추가
  fullContent = false, // 전체 영역 사용 옵션 (wrapper 제거)
  width // 커스텀 너비 옵션 추가
}) {
  const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen, { isCentered: !fullContent });

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

  if (!isOpen) return null;

  // 타입별 설정
  const typeConfig = {
    confirm: {
      icon: '❓',
      iconBg: '#dbeafe',
      iconColor: '#2563eb',
      confirmBtnClass: 'modal-btn-primary'
    },
    delete: {
      icon: '🗑️',
      iconBg: '#fee2e2',
      iconColor: '#dc2626',
      confirmBtnClass: 'modal-btn-danger'
    },
    success: {
      icon: '✅',
      iconBg: '#dcfce7',
      iconColor: '#16a34a',
      confirmBtnClass: 'modal-btn-success'
    },
    warning: {
      icon: '⚠️',
      iconBg: '#fef3c7',
      iconColor: '#d97706',
      confirmBtnClass: 'modal-btn-warning'
    },
    info: {
      icon: 'ℹ️',
      iconBg: '#e0f2fe',
      iconColor: '#0284c7',
      confirmBtnClass: 'modal-btn-primary'
    }
  };

  const config = typeConfig[type] || typeConfig.confirm;

  // Portal을 사용하여 body에 직접 렌더링 (부모 CSS 영향 받지 않음)
  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 11000 }}>

      <div
        className={fullContent ? "styled-modal" : "modal-container"}
        style={{
          ...(width ? { width } : {}),
          ...(maxWidth ? { maxWidth } : {}),
          ...(typeof padding !== 'undefined' ? { padding } : {}),
          ...(fullContent ? { position: 'relative', top: 'auto', left: 'auto', transform: 'none' } : {}),
          ...draggableStyle
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 (아이콘 + 제목) - hideHeader가 false일 때만 표시 */}
        {!hideHeader && (
          <div
            onMouseDown={handleMouseDown}
            className="draggable-header"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            {/* 아이콘 */}
            <div
              className="modal-icon drag-pointer-none"
              style={{ backgroundColor: config.iconBg }}
            >
              <span style={{ fontSize: '2rem' }}>{icon || config.icon}</span>
            </div>

            {/* 제목 */}
            <h2 className="modal-title drag-pointer-none">{title}</h2>
          </div>
        )}

        {/* If header hidden, maybe allow drag from top area? 
            For now, only draggable if header shown to keep it simple and consistent.
        */}

        {/* 메시지 또는 자식 컴포넌트 */}
        {children ? (
          fullContent ? children : <div className="modal-custom-content">{children}</div>
        ) : (
          <p className="modal-message" style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all', lineHeight: '1.6' }}>{message}</p>
        )}

        {/* 버튼 */}
        {(showConfirm || showCancel) && (
          <div className="modal-buttons justify-center">
            {showCancel && (
              <button
                className="modal-btn modal-btn-cancel"
                onClick={onClose}
              >
                {cancelText}
              </button>
            )}
            {showConfirm && (
              <button
                className={`modal-btn ${config.confirmBtnClass}`}
                onClick={async () => {
                  await onConfirm();
                  onClose();
                }}
                autoFocus
              >
                {confirmText}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body  // body에 직접 렌더링
  );
}

export default ConfirmModal;

/**
 * 모달 사용을 위한 커스텀 훅
 * 페이지에서 모달 상태와 내용을 쉽게 관리하도록 도움
 */
export const useConfirmModal = () => {
  const [modalState, setModalState] = React.useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'confirm',
    onConfirm: () => { },
    onClose: () => { },
    showCancel: true
  });

  const openModal = ({ type = 'confirm', title, message, onConfirm, onClose, showCancel = true }) => {
    setModalState({
      isOpen: true,
      title,
      message,
      type,
      onConfirm: onConfirm || (() => { }),
      onClose: onClose || (() => { }),
      showCancel
    });
  };

  const closeModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  // JSX 컴포넌트를 반환하여 페이지에서 쉽게 렌더링하도록 함
  const ConfirmModalComponent = (
    <ConfirmModal
      {...modalState}
      onClose={() => {
        if (modalState.onClose) modalState.onClose();
        closeModal();
      }}
    />
  );

  return {
    openModal,
    closeModal,
    ConfirmModalComponent
  };
};

