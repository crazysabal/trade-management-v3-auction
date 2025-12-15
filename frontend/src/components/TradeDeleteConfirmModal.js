import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * 전표 삭제 확인 모달 컴포넌트
 * 
 * "삭제합니다" 입력을 통한 강력한 삭제 확인 절차를 제공합니다.
 * 
 * @param {boolean} isOpen - 모달 표시 여부
 * @param {function} onClose - 닫기 콜백
 * @param {function} onConfirm - 삭제 확인 콜백
 * @param {string} title - 모달 제목 (기본값: "전표 삭제 확인")
 * @param {string[]} warnings - 주의사항 목록 (배열)
 * @param {string} confirmPhrase - 확인 문구 (기본값: "삭제합니다")
 * @param {React.ReactNode} additionalContent - 추가 컨텐츠 (선택)
 */
function TradeDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = '전표 삭제 확인',
  warnings = [
    '삭제된 전표는 <strong>복구할 수 없습니다</strong>',
    '연결된 <strong>입출금 내역</strong>이 함께 삭제됩니다',
    '<strong>거래처 잔고</strong>가 자동으로 조정됩니다'
  ],
  confirmPhrase = '삭제합니다',
  additionalContent = null,
  // 추가된 Props: 전표 정보 표시용
  tradeDate = null,
  tradePartnerName = null,
  tradeType = null // 'SALE' | 'PURCHASE'
}) {
  const [confirmText, setConfirmText] = useState('');

  // 모달이 열릴 때마다 입력 초기화
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
    }
  }, [isOpen]);

  // ESC 키로 닫기 (전역 리스너)
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        // 기존 handleClose 호출
        setConfirmText('');
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const isConfirmed = confirmText === confirmPhrase;

  const handleConfirm = () => {
    if (isConfirmed) {
      onConfirm();
      setConfirmText('');
    }
  };

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isConfirmed) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
    // onClick={handleClose}  <-- 배경 클릭 닫기 비활성화
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '450px',
          width: '90%',
          overflow: 'hidden',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{
          padding: '1rem 1.5rem',
          backgroundColor: '#c0392b',
          color: 'white'
        }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🗑️ {title}
          </h3>
        </div>

        {/* 내용 */}
        <div style={{ padding: '1.5rem' }}>
          {/* 전표 정보 요약 (신규 추가) */}
          {(tradeDate || tradePartnerName || tradeType) && (
            <div style={{
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: 'white',
                border: tradeType === 'SALE' ? '2px solid #3498db' : (tradeType === 'PURCHASE' ? '2px solid #e74c3c' : '2px solid #95a5a6'),
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                {/* 구분 뱃지 */}
                {tradeType && (
                  <span style={{
                    backgroundColor: tradeType === 'SALE' ? '#3498db' : '#e74c3c',
                    color: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    marginBottom: '0.75rem',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    {tradeType === 'SALE' ? '매출 전표' : '매입 전표'}
                  </span>
                )}

                {/* 거래처명 (가장 크게) */}
                {tradePartnerName && (
                  <div style={{
                    fontSize: '1.4rem',
                    fontWeight: '700',
                    color: '#2c3e50',
                    marginBottom: '0.5rem',
                    wordBreak: 'keep-all'
                  }}>
                    {tradePartnerName}
                  </div>
                )}

                {/* 날짜 */}
                {tradeDate && (
                  <div style={{
                    fontSize: '1rem',
                    color: '#7f8c8d',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}>
                    📅 {tradeDate}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 주의사항 */}
          <div style={{
            backgroundColor: '#fef9e7',
            border: '1px solid #f1c40f',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <div style={{
              fontWeight: '600',
              color: '#b7950b',
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              ⚠️ 주의사항
            </div>
            <ul style={{
              margin: 0,
              paddingLeft: '1.2rem',
              color: '#7d6608',
              fontSize: '0.9rem',
              lineHeight: '1.6'
            }}>
              {warnings.map((warning, index) => (
                <li key={index} dangerouslySetInnerHTML={{ __html: warning }} />
              ))}
            </ul>
          </div>

          {/* 추가 컨텐츠 */}
          {additionalContent && (
            <div style={{ marginBottom: '1rem' }}>
              {additionalContent}
            </div>
          )}

          {/* 확인 문구 입력 안내 */}
          <p style={{ margin: '0 0 0.75rem 0', color: '#555', fontSize: '0.95rem' }}>
            삭제를 진행하려면 아래에 <strong style={{ color: '#c0392b' }}>"{confirmPhrase}"</strong>를 입력하세요:
          </p>

          {/* 확인 문구 입력 */}
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmPhrase}
            autoFocus
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              border: isConfirmed ? '2px solid #27ae60' : '2px solid #ddd',
              borderRadius: '6px',
              textAlign: 'center',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box'
            }}
            onKeyDown={handleKeyDown}
          />

          {/* 입력 상태 피드백 */}
          {confirmText && !isConfirmed && (
            <p style={{
              margin: '0.5rem 0 0 0',
              color: '#e74c3c',
              fontSize: '0.85rem',
              textAlign: 'center'
            }}>
              정확히 "{confirmPhrase}"를 입력해주세요
            </p>
          )}

          {isConfirmed && (
            <p style={{
              margin: '0.5rem 0 0 0',
              color: '#27ae60',
              fontSize: '0.85rem',
              textAlign: 'center'
            }}>
              ✓ 확인되었습니다. 삭제 버튼을 클릭하세요.
            </p>
          )}
        </div>

        {/* 버튼 */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #eee',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          backgroundColor: '#f8f9fa'
        }}>
          <button
            onClick={handleClose}
            style={{
              padding: '0.6rem 1.5rem',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmed}
            style={{
              padding: '0.6rem 1.5rem',
              backgroundColor: isConfirmed ? '#c0392b' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isConfirmed ? 'pointer' : 'not-allowed',
              fontWeight: '600',
              transition: 'background-color 0.2s'
            }}
          >
            🗑️ 삭제
          </button>
        </div>
      </div>
    </div >,
    document.body
  );
}

export default TradeDeleteConfirmModal;




