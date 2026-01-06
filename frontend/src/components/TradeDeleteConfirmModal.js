import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalDraggable } from '../hooks/useModalDraggable';

/**
 * 전표 삭제 확인 모달 컴포넌트 (Premium Redesign)
 */
const TradeDeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  tradeNumber,
  companyName,
  tradeDate,
  tradeType
}) => {
  const [confirmText, setConfirmText] = useState('');
  // 윈도우 스타일이므로 isCentered: false (App.css의 flex 기반 센터링 활용)
  const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen, { isCentered: false });

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
    }
  }, [isOpen]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const CONFIRM_PHRASE = '삭제확인';
  const isSale = tradeType === 'SALE';

  const handleConfirm = (e) => {
    e.preventDefault();
    if (confirmText === CONFIRM_PHRASE) {
      onConfirm();
    }
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        className="styled-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '600px',
          maxWidth: '600px',
          ...draggableStyle,
          border: '1px solid #feb2b2', // 위험 작업임을 암시하는 붉은 외곽선
          boxShadow: '0 25px 50px -12px rgba(220, 38, 38, 0.15)' // 미세한 붉은 그림자
        }}
      >
        {/* 상단 윈도우 바 (Premium Danger Header) */}
        <div
          className="modal-header draggable-header"
          onMouseDown={handleMouseDown}
          style={{
            backgroundColor: '#fef2f2', // 매우 연한 레드 배경
            borderBottom: '1px solid #fee2e2'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <h3 className="drag-pointer-none" style={{ color: '#991b1b', margin: 0 }}>전표 삭제 확인</h3>
          </div>
          <button className="close-btn drag-pointer-auto" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '2rem' }}>

          {/* 상단 강력 경고 슬롯 */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem',
            backgroundColor: '#fff5f5',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '2px solid #feb2b2',
            marginBottom: '2rem'
          }}>
            <span style={{ fontSize: '1.5rem', lineHeight: '1' }}>🚫</span>
            <div>
              <div style={{ color: '#c53030', fontWeight: '800', fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                주의! 삭제된 데이터는 복구할 수 없습니다.
              </div>
              <div style={{ color: '#742a2a', fontSize: '0.9rem', lineHeight: '1.6' }}>
                해당 전표(<b>{tradeNumber}</b>)와 연결된 모든 품목, 재고 변동 내역, 미수금/미지급금 정산 데이터가 <b>영구적으로 파기</b>됩니다. 이 작업은 취소할 수 없습니다.
              </div>
            </div>
          </div>

          {/* 중앙 데이터 분석 그리드 (2-Column) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '1.25rem',
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>전표번호</span>
              <span style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>{tradeNumber}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>구분</span>
              <span style={{
                fontSize: '1rem',
                fontWeight: '800',
                color: isSale ? '#2563eb' : '#dc2626',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                {isSale ? '🔵 매출' : '🔴 매입'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>거래처명</span>
              <span style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>{companyName || '-'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>거래 일자</span>
              <span style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b' }}>{tradeDate?.split('T')[0]}</span>
            </div>
          </div>

          {/* 하단 확인 구문 입력부 */}
          <form onSubmit={handleConfirm} style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#475569', fontWeight: '600' }}>
              삭제를 확정하려면 <span style={{ color: '#dc2626', textDecoration: 'underline' }}>"{CONFIRM_PHRASE}"</span>을(를) 입력하세요.
            </div>
            <input
              type="text"
              className="form-input"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoFocus
              style={{
                width: '300px', // 중앙에 적절한 너비로 배치
                height: '52px',
                fontSize: '1.4rem',
                fontWeight: '900',
                textAlign: 'center',
                borderRadius: '12px',
                border: confirmText === CONFIRM_PHRASE ? '3px solid #059669' : '2px solid #e2e8f0',
                backgroundColor: confirmText === CONFIRM_PHRASE ? '#ecfdf5' : '#fff',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                boxShadow: confirmText === CONFIRM_PHRASE ? '0 0 0 4px rgba(16, 185, 129, 0.1)' : 'none'
              }}
            />
          </form>
        </div>

        {/* 하단 액션 영역 */}
        <div className="modal-buttons justify-center" style={{
          padding: '1.5rem 2rem',
          backgroundColor: '#f1f5f9',
          borderTop: '1px solid #e2e8f0',
          gap: '1rem'
        }}>
          <button
            className="modal-btn modal-btn-cancel"
            onClick={onClose}
            style={{
              flex: 1,
              height: '50px',
              fontSize: '1rem',
              fontWeight: '600',
              backgroundColor: '#fff',
              border: '1px solid #cbd5e1'
            }}
          >
            작업 취소
          </button>
          <button
            className="modal-btn"
            onClick={handleConfirm}
            disabled={confirmText !== CONFIRM_PHRASE}
            style={{
              flex: 1,
              height: '50px',
              backgroundColor: confirmText === CONFIRM_PHRASE ? '#dc2626' : '#cbd5e1',
              color: 'white',
              cursor: confirmText === CONFIRM_PHRASE ? 'pointer' : 'not-allowed',
              opacity: confirmText === CONFIRM_PHRASE ? 1 : 0.6,
              fontWeight: '800',
              fontSize: '1.05rem',
              transition: 'all 0.2s',
              boxShadow: confirmText === CONFIRM_PHRASE ? '0 4px 12px rgba(220, 38, 38, 0.3)' : 'none'
            }}
          >
            ⚠️ 영구 삭제 실행
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TradeDeleteConfirmModal;
