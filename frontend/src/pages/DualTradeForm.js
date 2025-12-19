import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { openProductPopup } from '../utils/popup';
import FloatingWindow from '../components/FloatingWindow';
import InventoryQuickView from '../components/InventoryQuickView';
import TradePanel from '../components/TradePanel';
import TradePrintModal from '../components/TradePrintModal';
import { tradeAPI } from '../services/api';

/**
 * DualTradeForm - 좌우 분할 전표 등록/수정 화면
 * 한 화면에서 매입/매출 전표를 동시에 관리
 */
function DualTradeForm() {
  const navigate = useNavigate();
  const { id: urlTradeId } = useParams(); // URL에서 전표 ID 추출

  // 좌우 위치 설정 (localStorage에 저장)
  const [layoutOrder, setLayoutOrder] = useState(() => {
    const saved = localStorage.getItem('dualTradeLayout');
    return saved ? JSON.parse(saved) : { left: 'PURCHASE', right: 'SALE' };
  });

  // 패널 크기 비율 (0.3 ~ 0.7, 기본 0.5)
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('dualTradeSplitRatio');
    return saved ? parseFloat(saved) : 0.5;
  });

  // 카드 배경색
  const [cardColor, setCardColor] = useState(() => {
    const saved = localStorage.getItem('dualTradeCardColor');
    return saved || '#ffffff';
  });

  // 색상 선택기 표시 여부
  const [showColorPicker, setShowColorPicker] = useState(false);

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  // 출력 모달
  const [printModal, setPrintModal] = useState({ isOpen: false, tradeId: null });

  // 패널별 변경사항 상태 추적
  const [panelDirtyState, setPanelDirtyState] = useState({ left: false, right: false });

  // 확인 모달
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null });

  // [플로팅] 재고 현황 윈도우 표시 여부
  const [showInventoryWindow, setShowInventoryWindow] = useState(false);

  // URL로 전달된 전표 정보
  const [initialTrade, setInitialTrade] = useState({ id: null, type: null });

  // URL에서 전표 ID가 있으면 전표 정보 조회
  useEffect(() => {
    const loadTradeInfo = async () => {
      if (urlTradeId) {
        try {
          const response = await tradeAPI.getById(urlTradeId);
          const tradeType = response.data.data.master.trade_type;
          setInitialTrade({ id: parseInt(urlTradeId), type: tradeType });
        } catch (error) {
          console.error('전표 정보 조회 오류:', error);
        }
      }
    };
    loadTradeInfo();
  }, [urlTradeId]);

  // 변경사항 상태 변경 핸들러
  const handleDirtyChange = useCallback((panelId, isDirty) => {
    setPanelDirtyState(prev => ({ ...prev, [panelId]: isDirty }));
  }, []);

  // 변경사항 여부 체크
  const hasUnsavedChanges = panelDirtyState.left || panelDirtyState.right;

  // 브라우저 뒤로가기/새로고침 경고 (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // 브라우저 기본 경고 메시지 표시
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // 네비게이션 차단 모달 상태
  const [navBlockModal, setNavBlockModal] = useState({ isOpen: false, targetPath: null });

  // 안전한 네비게이션 (변경사항 확인 후 이동)
  const safeNavigate = useCallback((path) => {
    if (hasUnsavedChanges) {
      setNavBlockModal({ isOpen: true, targetPath: path });
    } else {
      navigate(path);
    }
  }, [hasUnsavedChanges, navigate]);

  // 위치 변경
  const toggleLayout = () => {
    const hasAnyChanges = panelDirtyState.left || panelDirtyState.right;

    if (hasAnyChanges) {
      setConfirmModal({
        isOpen: true,
        onConfirm: () => {
          const newOrder = {
            left: layoutOrder.right,
            right: layoutOrder.left
          };
          setLayoutOrder(newOrder);
          localStorage.setItem('dualTradeLayout', JSON.stringify(newOrder));
          setConfirmModal({ isOpen: false, onConfirm: null });
        }
      });
    } else {
      const newOrder = {
        left: layoutOrder.right,
        right: layoutOrder.left
      };
      setLayoutOrder(newOrder);
      localStorage.setItem('dualTradeLayout', JSON.stringify(newOrder));
    }
  };

  // 드래그 시작
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // 드래그 중
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let newRatio = x / rect.width;

    // 최소/최대 비율 제한 (30% ~ 70%)
    newRatio = Math.max(0.3, Math.min(0.7, newRatio));
    setSplitRatio(newRatio);
  }, [isDragging]);

  // 드래그 종료
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem('dualTradeSplitRatio', splitRatio.toString());
    }
  }, [isDragging, splitRatio]);

  // 마우스 이벤트 리스너 등록
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 비율 초기화
  const resetSplitRatio = () => {
    setSplitRatio(0.5);
    localStorage.setItem('dualTradeSplitRatio', '0.5');
  };

  // 카드 색상 변경
  const handleCardColorChange = (color) => {
    setCardColor(color);
    localStorage.setItem('dualTradeCardColor', color);
    setShowColorPicker(false);
  };

  // 프리셋 색상 목록
  const colorPresets = [
    { name: '흰색', color: '#ffffff' },
    { name: '연한 회색', color: '#f5f5f5' },
    { name: '아이보리', color: '#faf8f5' },
    { name: '크림', color: '#fffef5' },
    { name: '연한 베이지', color: '#f5f0e8' },
    { name: '연한 민트', color: '#f0f8f5' },
    { name: '연한 하늘', color: '#f0f5fa' },
    { name: '연한 라벤더', color: '#f5f0f8' },
  ];

  // 저장 성공 콜백
  const handleSaveSuccess = (tradeId, tradeType) => {
    console.log(`${tradeType} 전표 저장 완료:`, tradeId);
  };

  // 출력 콜백
  const handlePrint = (tradeId) => {
    setPrintModal({ isOpen: true, tradeId });
  };

  // 재고 수량 조정 상태 (id -> delta)
  const [inventoryAdjustments, setInventoryAdjustments] = useState({});

  // 재고 수량 업데이트 핸들러 (누적)
  const handleInventoryUpdate = useCallback((id, delta) => {
    setInventoryAdjustments(prev => {
      const newAdjustments = { ...prev };
      const currentDelta = newAdjustments[id] || 0;
      const newDelta = currentDelta + delta;

      if (newDelta === 0) {
        delete newAdjustments[id];
      } else {
        newAdjustments[id] = newDelta;
      }
      return newAdjustments;
    });
  }, []);

  // 재고 목록 새로고침 키 (저장/삭제 시 증가)
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

  // 전표 변경(저장/삭제) 핸들러
  const handleTradeChange = useCallback(() => {
    // 1. 재고 목록 새로고침 트리거
    setInventoryRefreshKey(prev => prev + 1);
    // 2. 임시 차감 상태 초기화 (DB에 반영되었으므로)
    setInventoryAdjustments({});
  }, [inventoryRefreshKey]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 60px)',
      backgroundColor: '#f5f6fa'
    }}>
      {/* 헤더 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div className="page-header-actions-left" style={{ display: 'flex', alignItems: 'center' }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            📋 전표 등록
          </h1>
          <button
            onClick={toggleLayout}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: '#9b59b6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s'
            }}
            title="좌우 위치 변경"
          >
            🔄 위치 변경
            <span style={{
              fontSize: '0.75rem',
              opacity: 0.9,
              backgroundColor: 'rgba(255,255,255,0.2)',
              padding: '0.15rem 0.4rem',
              borderRadius: '4px'
            }}>
              {layoutOrder.left === 'PURCHASE' ? '매입←→매출' : '매출←→매입'}
            </span>
          </button>
          {splitRatio !== 0.5 && (
            <button
              onClick={resetSplitRatio}
              style={{
                padding: '0.4rem 0.8rem',
                backgroundColor: '#7f8c8d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500'
              }}
              title="패널 크기 초기화"
            >
              ↔ 크기 초기화
            </button>
          )}

          {/* 카드 색상 선택 */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.6rem',
                backgroundColor: '#ecf0f1',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: '#666'
              }}
              title="카드 배경색 선택"
            >
              <span
                style={{
                  width: '18px',
                  height: '18px',
                  backgroundColor: cardColor,
                  border: '1px solid #ccc',
                  borderRadius: '3px'
                }}
              />
              <span>배경색</span>
              <span style={{ fontSize: '0.7rem' }}>▼</span>
            </button>

            {showColorPicker && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '0.25rem',
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '0.75rem',
                zIndex: 1000,
                minWidth: '200px'
              }}>
                <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#333' }}>
                  프리셋 색상
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {colorPresets.map(preset => (
                    <button
                      key={preset.color}
                      onClick={() => handleCardColorChange(preset.color)}
                      style={{
                        width: '36px',
                        height: '36px',
                        backgroundColor: preset.color,
                        border: cardColor === preset.color ? '3px solid #3498db' : '1px solid #ccc',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      title={preset.name}
                    />
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                    <span>직접 선택:</span>
                    <input
                      type="color"
                      value={cardColor}
                      onChange={(e) => handleCardColorChange(e.target.value)}
                      style={{
                        width: '40px',
                        height: '28px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{cardColor}</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowInventoryWindow(!showInventoryWindow)}
            className="btn btn-secondary"
            style={{
              fontSize: '0.9rem',
              padding: '6px 12px',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: showInventoryWindow ? '#3498db' : undefined,
              color: showInventoryWindow ? 'white' : undefined,
              border: showInventoryWindow ? '1px solid #2980b9' : undefined
            }}
          >
            📦 재고 조회(플로팅)
          </button>
          <button
            onClick={openProductPopup}
            className="btn btn-secondary"
            style={{
              fontSize: '0.9rem',
              padding: '6px 12px',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            🛠️ 품목 관리 (팝업)
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 - 좌우 분할 */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          padding: '0.5rem',
          overflow: 'hidden',
          minHeight: 0,
          gap: 0
        }}
      >
        {/* 왼쪽 패널 */}
        <div style={{
          flex: `0 0 calc(${splitRatio * 100}% - 4px)`,
          display: 'flex',
          minWidth: '300px',
          minHeight: 0,
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <TradePanel
            key={`left-${layoutOrder.left}-${initialTrade.id || 'new'}`}
            tradeType={layoutOrder.left}
            panelId="left"
            initialTradeId={initialTrade.type === layoutOrder.left ? initialTrade.id : null}
            onSaveSuccess={(id) => handleSaveSuccess(id, layoutOrder.left)}
            onPrint={handlePrint}
            onDirtyChange={handleDirtyChange}
            onInventoryUpdate={handleInventoryUpdate}
            onTradeChange={handleTradeChange}
            cardColor={cardColor}
          />
        </div>

        {/* 리사이즈 핸들 */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: '8px',
            backgroundColor: isDragging ? '#9b59b6' : '#e0e0e0',
            cursor: 'col-resize',
            transition: isDragging ? 'none' : 'background-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderRadius: '4px',
            margin: '0 2px'
          }}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = '#9b59b6'; }}
          onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = '#e0e0e0'; }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            opacity: isDragging ? 1 : 0.6
          }}>
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
          </div>
        </div>

        {/* 오른쪽 패널 */}
        <div style={{
          flex: 1,
          display: 'flex',
          minWidth: '300px',
          minHeight: 0,
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <TradePanel
            key={`right-${layoutOrder.right}-${initialTrade.id || 'new'}`}
            tradeType={layoutOrder.right}
            panelId="right"
            initialTradeId={initialTrade.type === layoutOrder.right ? initialTrade.id : null}
            onSaveSuccess={(id) => handleSaveSuccess(id, layoutOrder.right)}
            onPrint={handlePrint}
            onDirtyChange={handleDirtyChange}
            onInventoryUpdate={handleInventoryUpdate}
            onTradeChange={handleTradeChange}
            cardColor={cardColor}
          />
        </div>
      </div>

      {/* 하단 안내 */}
      <div style={{
        padding: '0.25rem 1rem',
        backgroundColor: '#f8f9fa',
        borderTop: '1px solid #eee',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: '#888',
        flexShrink: 0
      }}>
        💡 각 패널에서 독립적으로 전표를 등록/수정할 수 있습니다. 가운데 구분선을 드래그하여 패널 크기를 조절할 수 있습니다.
      </div>

      {/* 출력 모달 */}
      {printModal.isOpen && (
        <TradePrintModal
          isOpen={printModal.isOpen}
          onClose={() => setPrintModal({ isOpen: false, tradeId: null })}
          tradeId={printModal.tradeId}
        />
      )}

      {/* [플로팅] 재고 조회 윈도우 */}
      {showInventoryWindow && (
        <FloatingWindow
          title="📦 재고 현황 조회"
          onClose={() => setShowInventoryWindow(false)}
          initialPosition="center"
          size={{ width: 'auto', height: 600 }}
        >
          <InventoryQuickView
            inventoryAdjustments={inventoryAdjustments}
            refreshKey={inventoryRefreshKey}
          />
        </FloatingWindow>
      )}

      {/* 위치 변경 확인 모달 */}
      {confirmModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#e74c3c' }}>⚠️ 저장하지 않은 변경사항</h3>
            <p style={{ marginBottom: '1.5rem', lineHeight: '1.6', color: '#555' }}>
              저장하지 않은 변경사항이 있습니다.<br />
              위치를 변경하면 현재 입력 내용이 사라집니다.<br /><br />
              정말 위치를 변경하시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmModal({ isOpen: false, onConfirm: null })}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#95a5a6',
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
                onClick={confirmModal.onConfirm}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                위치 변경
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 네비게이션 차단 모달 */}
      {navBlockModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#e74c3c' }}>⚠️ 저장하지 않은 변경사항</h3>
            <p style={{ marginBottom: '1.5rem', lineHeight: '1.6', color: '#555' }}>
              저장하지 않은 변경사항이 있습니다.<br />
              이 페이지를 떠나면 현재 입력 내용이 사라집니다.<br /><br />
              정말 이 페이지를 떠나시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setNavBlockModal({ isOpen: false, targetPath: null });
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                머무르기
              </button>
              <button
                onClick={() => {
                  const target = navBlockModal.targetPath;
                  setNavBlockModal({ isOpen: false, targetPath: null });
                  if (target === -1) {
                    navigate(-1);
                  } else if (target) {
                    navigate(target);
                  }
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                페이지 떠나기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DualTradeForm;
