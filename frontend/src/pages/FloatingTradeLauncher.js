import React, { useState, useCallback, useRef } from 'react';
import FloatingWindow from '../components/FloatingWindow';
import TradePanel from '../components/TradePanel';
import InventoryQuickView from '../components/InventoryQuickView';
import TradePrintModal from '../components/TradePrintModal';
import { useAuth } from '../context/AuthContext';

/**
 * FloatingTradeLauncher
 * 여러 개의 전표 등록 창을 플로팅 윈도우로 띄워 관리하는 페이지
 */
function FloatingTradeLauncher() {
    const { user } = useAuth();
    const getScopedKey = (key) => user?.id ? `u${user.id}_${key}` : key;

    // 열린 윈도우 목록
    // { id, type, zIndex, position, title }
    const [windows, setWindows] = useState([]);

    // Z-Index 관리 (최상위 창을 위해)
    const [maxZIndex, setMaxZIndex] = useState(100);

    // 출력 모달 상태
    const [printModal, setPrintModal] = useState({ isOpen: false, tradeId: null });

    // 재고 수량 조정 상태 (전역 공유)
    // key: inventory_id, value: delta amount
    const [inventoryAdjustments, setInventoryAdjustments] = useState({});

    // 재고 목록 새로고침 키
    const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

    // 윈도우 추가
    const addWindow = (type) => {
        // 이미 열린 창이 있는지 확인 (모든 타입에 대해 싱글톤 적용)
        const existing = windows.find(w => w.type === type);
        if (existing) {
            // 이미 열려있으면 닫기 (토글)
            removeWindow(existing.id);
            return;
        }

        const newId = Date.now();
        const newZIndex = maxZIndex + 1;
        setMaxZIndex(newZIndex);

        // 새 창 위치 계산
        const offset = (windows.length % 10) * 30;

        let title = '';
        let size = { width: 1000, height: 750 };
        // 사이드바(240px)를 가리지 않도록 시작 위치 조정
        let position = { x: 300 + offset, y: 100 + offset };

        if (type === 'PURCHASE') title = '매입 전표 등록';
        else if (type === 'SALE') title = '매출 전표 등록';
        else if (type === 'INVENTORY') {
            title = '📦 재고 현황 조회';
            size = { width: 'auto', height: 750 };
            position = 'center';
        }

        // 저장된 크기가 있으면 불러오기 (INVENTORY의 'auto'는 제외하거나, 사용자가 조절한 경우 덮어씌움)
        const savedSize = localStorage.getItem(getScopedKey(`window_size_${type}`));
        if (savedSize) {
            try {
                size = JSON.parse(savedSize);
            } catch (e) {
                console.error('Failed to parse saved window size', e);
            }
        }

        setWindows(prev => [
            ...prev,
            {
                id: newId,
                type: type,
                zIndex: newZIndex,
                position: position,
                title: title,
                size: size
            }
        ]);
    };

    // 윈도우 닫기
    const removeWindow = (id) => {
        setWindows(prev => prev.filter(w => w.id !== id));
    };

    // 윈도우 포커스
    const bringToFront = (id) => {
        setWindows(prev => {
            const targetWindow = prev.find(w => w.id === id);
            if (!targetWindow) return prev;
            if (targetWindow.zIndex === maxZIndex) return prev;

            const newZIndex = maxZIndex + 1;
            setMaxZIndex(newZIndex);

            return prev.map(w => w.id === id ? { ...w, zIndex: newZIndex } : w);
        });
    };

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

    // 전표 변경(저장/삭제) 핸들러
    const handleTradeChange = useCallback(() => {
        setInventoryRefreshKey(prev => prev + 1);
        setInventoryAdjustments({});
    }, []);

    // 윈도우 컨텐츠 렌더링 헬퍼
    const renderWindowContent = (win) => {
        if (win.type === 'INVENTORY') {
            return (
                <InventoryQuickView
                    inventoryAdjustments={inventoryAdjustments}
                    refreshKey={inventoryRefreshKey}
                />
            );
        }

        return (
            <TradePanel
                key={win.id}
                tradeType={win.type}
                panelId={`floating-${win.id}`}
                onSaveSuccess={(id) => console.log('Saved:', id)}
                onPrint={(tradeId) => setPrintModal({ isOpen: true, tradeId })}
                onDirtyChange={() => { }}
                onInventoryUpdate={handleInventoryUpdate}
                onTradeChange={handleTradeChange}
                cardColor="#ffffff"
            />
        );
    };

    return (
        <div style={{
            // padding: '1rem', // Removed to match TradeList (padding comes from main-content)
            height: 'calc(100vh - 60px)', // Adjusted height
            boxSizing: 'border-box',
            backgroundColor: '#f5f6fa',
            maxWidth: '1400px',
            margin: '0 auto',
            width: '100%',
            position: 'relative' // For absolute positioning of windows relative to this if needed, though windows use Portal
        }}>
            {/* 헤더 */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1 className="page-title" style={{ margin: 0 }}>🖥️ 멀티 전표 작업대 (플로팅)</h1>
                    <span style={{ color: '#666', fontSize: '0.9rem', paddingTop: '4px' }}>
                        | 매입/매출 전표와 재고 현황을 자유롭게 띄워놓고 작업할 수 있습니다.
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className="btn btn-primary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => addWindow('PURCHASE')}
                    >
                        <span style={{ fontSize: '1.1rem' }}>📥</span>
                        매입 전표
                    </button>
                    <button
                        className="btn btn-success"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => addWindow('SALE')}
                    >
                        <span style={{ fontSize: '1.1rem' }}>📤</span>
                        매출 전표
                    </button>
                    <div style={{ width: '1px', backgroundColor: '#ccc', margin: '0 0.5rem' }}></div>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => addWindow('INVENTORY')}
                    >
                        <span style={{ fontSize: '1.1rem' }}>📦</span>
                        재고 현황
                    </button>
                </div>
            </div>

            <div style={{ color: '#999', fontStyle: 'italic', fontSize: '0.9rem', paddingLeft: '0.5rem' }}>
                * 버튼을 누르면 새로운 작업 창이 생성됩니다.<br />
                * 창을 클릭하면 맨 앞으로 나옵니다.
            </div>

            {/* 플로팅 윈도우들 */}
            {windows.map(win => (
                <FloatingWindow
                    key={win.id}
                    title={win.title}
                    onClose={() => removeWindow(win.id)}
                    initialPosition={win.position}
                    size={win.size || { width: 1000, height: 750 }}
                    zIndex={win.zIndex}
                    onMouseDown={() => bringToFront(win.id)}
                    onResizeStop={(newSize) => {
                        // 크기 변경 시 로컬 스토리지에 저장
                        localStorage.setItem(getScopedKey(`window_size_${win.type}`), JSON.stringify(newSize));
                    }}
                >
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        {renderWindowContent(win)}
                    </div>
                </FloatingWindow>
            ))}

            {/* 출력 모달 (공유) */}
            {printModal.isOpen && (
                <TradePrintModal
                    isOpen={printModal.isOpen}
                    onClose={() => setPrintModal({ isOpen: false, tradeId: null })}
                    tradeId={printModal.tradeId}
                />
            )}
        </div>
    );
}

export default FloatingTradeLauncher;
