import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  maxWidth
}) {
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
    <div className="modal-overlay" style={{ zIndex: 100002 }}>

      <div
        className="modal-container"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 아이콘 */}
        <div
          className="modal-icon"
          style={{ backgroundColor: config.iconBg }}
        >
          <span style={{ fontSize: '2rem' }}>{config.icon}</span>
        </div>

        {/* 제목 */}
        <h2 className="modal-title">{title}</h2>

        {/* 메시지 또는 자식 컴포넌트 */}
        {children ? (
          <div className="modal-custom-content">{children}</div>
        ) : (
          <p className="modal-message" style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all', lineHeight: '1.6' }}>{message}</p>
        )}

        {/* 버튼 */}
        {(showConfirm || showCancel) && (
          <div className="modal-buttons">
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
                onClick={() => {
                  onConfirm();
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

