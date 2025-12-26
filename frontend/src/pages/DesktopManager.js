import React, { useState, useCallback, useEffect } from 'react';
import FloatingWindow from '../components/FloatingWindow';
import Navbar from '../components/Navbar';
import Taskbar from '../components/Taskbar';

// Apps (Components)
import TradePanel from '../components/TradePanel';
import InventoryQuickView from '../components/InventoryQuickView';
import CompanyList from './CompanyList';
import IntegratedProductManagement from './IntegratedProductManagement';
import TradeList from './TradeList';
import InventoryList from './InventoryList';
import InventoryTransferManagement from './InventoryTransferManagement';
import InventoryProductionManagement from './InventoryProductionManagement';
import MatchingPage from './MatchingPage';
import InventoryHistory from './InventoryHistory';
import InventoryCheckPage from './InventoryCheckPage';
import InventoryTransactions from './InventoryTransactions';
import CompanyBalances from './CompanyBalances';
import ExpenseList from './ExpenseList';
import SettlementPage from './SettlementPage';
import Statistics from './Statistics';
import Settings from './Settings';
import WarehouseManagement from './WarehouseManagement';
import ExpenseCategoryManagement from './ExpenseCategoryManagement';
import CompanyInfo from './CompanyInfo';
import MessageTestPage from './MessageTestPage';
import AuctionImportV2 from './AuctionImportV2';
import AuctionAccounts from './AuctionAccounts';

/**
 * DesktopManager
 * 
 * 웹 OS 스타일의 데스크탑 매니저입니다.
 * Navbar를 통해 앱을 실행하면 FloatingWindow로 열립니다.
 * 모바일 환경에서는 자동으로 최대화된 창으로 열립니다.
 */
const DesktopManager = () => {
    // 열린 윈도우 목록
    // { id, type, zIndex, position, title, size, componentProps, isMinimized }
    const [windows, setWindows] = useState([]);
    const [maxZIndex, setMaxZIndex] = useState(100);
    const [activeWindowId, setActiveWindowId] = useState(null); // 현재 활성화된(최상위) 윈도우 ID
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    // 윈도우 모드 설정 (multi: 다중 창 허용, single: 중복 실행 방지)
    const [windowMode, setWindowMode] = useState(() => {
        return localStorage.getItem('window_mode') || 'multi';
    });

    // 화면 크기 감지
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 윈도우 모드 변경 핸들러 (저장 포함)
    const handleSetWindowMode = (mode) => {
        setWindowMode(mode);
        localStorage.setItem('window_mode', mode);
    };

    // 앱 실행 (윈도우 열기)
    const launchApp = useCallback((appType, props = {}) => {
        // 이미 열린 단일 인스턴스 앱 확인 (설정, 통계 등은 하나만)
        const alwaysSingleInstanceApps = [
            'SETTINGS', 'STATISTICS' // 이 앱들은 설정과 무관하게 항상 하나만
        ];

        const existing = windows.find(w => w.type === appType);

        // 1. 항상 단일 인스턴스인 앱
        if (existing && alwaysSingleInstanceApps.includes(appType)) {
            restoreWindow(existing.id); // 최소화된 경우 복원
            bringToFront(existing.id);
            return;
        }

        // 2. 사용자 설정이 'single' 모드이고, 이미 열려있는 경우
        if (windowMode === 'single' && existing) {
            restoreWindow(existing.id); // 최소화된 경우 복원
            bringToFront(existing.id);
            return;
        }

        const newId = Date.now();
        const newZIndex = maxZIndex + 1;
        setMaxZIndex(newZIndex);
        setActiveWindowId(newId);

        // 기본 설정
        let title = 'App';
        let icon = '📱'; // 기본 아이콘
        let size = { width: 1000, height: 700 };
        let position = { x: 50 + (windows.length % 10) * 30, y: 50 + (windows.length % 10) * 30 };

        // 앱별 설정
        switch (appType) {
            case 'PURCHASE': title = '매입 전표 등록'; icon = '📥'; break;
            case 'SALE': title = '매출 전표 등록'; icon = '📤'; break;
            case 'TRADE_LIST': title = '전표 목록'; icon = '📝'; break;
            case 'COMPANY_LIST': title = '거래처 관리'; icon = '🏢'; break;
            case 'PRODUCT_LIST': title = '품목 관리'; icon = '📦'; break;
            case 'INVENTORY_QUICK':
                title = '재고 현황 (Quick)';
                icon = '⚡';
                size = { width: 600, height: 800 };
                break;
            case 'INVENTORY_LIST': title = '재고 현황'; icon = '📊'; break;
            case 'INVENTORY_TRANSFER': title = '재고 이동'; icon = '🚚'; break;
            case 'INVENTORY_PRODUCTION': title = '재고 작업'; icon = '🏭'; break;
            case 'INVENTORY_HISTORY': title = '재고 이력'; icon = '📜'; break;
            case 'INVENTORY_CHECK': title = '재고 실사'; icon = '🔍'; break;
            case 'INVENTORY_TRANSACTIONS': title = '재고 수불부'; icon = '📒'; break;
            case 'MATCHING': title = '마감 (매칭)'; icon = '🔗'; break;
            case 'AUCTION_IMPORT': title = '낙찰 데이터 가져오기'; icon = '🔨'; break;
            case 'AUCTION_ACCOUNTS': title = '경매 계정 관리'; icon = '🆔'; break;
            case 'COMPANY_BALANCES': title = '거래처 잔고'; icon = '💰'; break;
            case 'EXPENSES': title = '지출 내역'; icon = '💸'; break;
            case 'SETTLEMENT': title = '정산 리포트'; icon = '📈'; break;
            case 'STATISTICS': title = '통계'; icon = '📉'; break;
            case 'SETTINGS': title = '시스템 설정'; icon = '⚙️'; size = { width: 800, height: 600 }; break;
            case 'WAREHOUSES': title = '창고 관리'; icon = '🏭'; size = { width: 900, height: 600 }; break;
            case 'EXPENSE_CATEGORIES': title = '지출 항목 관리'; icon = '🏷️'; size = { width: 800, height: 600 }; break;
            case 'COMPANY_INFO': title = '본사 정보'; icon = 'ℹ️'; size = { width: 600, height: 500 }; break;
            case 'MESSAGE_TEST': title = '시스템 테스트'; icon = '🧪'; break;
            default: title = appType; icon = '📱';
        }

        // 모바일이면 전체 화면 강제
        if (isMobile) {
            size = { width: window.innerWidth - 20, height: window.innerHeight - 80 }; // Navbar 고려
            position = { x: 10, y: 70 };
        }

        // 윈도우 크기 및 위치 복원 (저장된 값이 있으면)
        const savedSize = localStorage.getItem(`window_size_${appType}`);
        const savedPosition = localStorage.getItem(`window_position_${appType}`);

        if (!isMobile) {
            if (savedSize) {
                try { size = JSON.parse(savedSize); } catch (e) { }
            }
            if (savedPosition) {
                try { position = JSON.parse(savedPosition); } catch (e) { }
            }
        }

        setWindows(prev => [...prev, {
            id: newId,
            type: appType,
            zIndex: newZIndex,
            position,
            size,
            title,
            icon,
            componentProps: props,
            isMinimized: false
        }]);
    }, [windows, maxZIndex, isMobile, windowMode]);

    const closeWindow = (id) => {
        setWindows(prev => prev.filter(w => w.id !== id));
        if (activeWindowId === id) {
            setActiveWindowId(null);
        }
    };

    const bringToFront = (id) => {
        setWindows(prev => {
            const target = prev.find(w => w.id === id);
            if (!target) return prev;
            // 이미 최상위이고 최소화되지 않았다면 변경 없음
            if (target.zIndex === maxZIndex && !target.isMinimized) {
                setActiveWindowId(id);
                return prev;
            }

            const newZIndex = maxZIndex + 1;
            setMaxZIndex(newZIndex);
            setActiveWindowId(id);

            return prev.map(w => w.id === id ? { ...w, zIndex: newZIndex, isMinimized: false } : w);
        });
    };

    const minimizeWindow = (id) => {
        setWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: true } : w));
        if (activeWindowId === id) {
            setActiveWindowId(null);
        }
    };

    const restoreWindow = (id) => {
        setWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: false } : w));
        bringToFront(id);
    };

    const toggleWindow = (id) => {
        const win = windows.find(w => w.id === id);
        if (!win) return;

        if (win.isMinimized) {
            restoreWindow(id);
        } else if (activeWindowId === id) {
            minimizeWindow(id);
        } else {
            bringToFront(id);
        }
    };

    const closeAll = () => {
        setWindows([]);
        setActiveWindowId(null);
    };

    const resetWindowPosition = (id) => {
        const win = windows.find(w => w.id === id);
        if (!win) return;

        // localStorage 제거
        localStorage.removeItem(`window_position_${win.type}`);
        localStorage.removeItem(`window_size_${win.type}`);

        // 기본 위치 및 크기로 리셋
        // 기본 위치 로직 재현 (약식)
        const defaultPosition = { x: 50 + (windows.length % 10) * 30, y: 50 + (windows.length % 10) * 30 };

        let defaultSize = { width: 1000, height: 700 };
        if (['INVENTORY_QUICK', 'COMPANY_INFO'].includes(win.type)) defaultSize = { width: 600, height: 800 };
        if (['SETTINGS', 'EXPENSE_CATEGORIES'].includes(win.type)) defaultSize = { width: 800, height: 600 };
        if (['WAREHOUSES'].includes(win.type)) defaultSize = { width: 900, height: 600 };

        setWindows(prev => prev.map(w => w.id === id ? {
            ...w,
            position: defaultPosition,
            size: defaultSize
        } : w));

        bringToFront(id);
    };

    // 재고 조정 상태 (Floating Windows 간 동기화)
    const [inventoryAdjustments, setInventoryAdjustments] = useState({});

    // 재고 목록 새로고침 키
    const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

    const handleInventoryUpdate = useCallback((inventoryId, delta) => {
        setInventoryAdjustments(prev => {
            const current = prev[inventoryId] || 0;
            const next = current + delta;
            // 0이면 제거 (메모리 최적화)
            if (next === 0) {
                const { [inventoryId]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [inventoryId]: next };
        });
    }, []);

    // 전표 변경(저장/삭제) 핸들러
    const handleTradeChange = useCallback(() => {
        // 1. 재고 목록 새로고침 트리거
        setInventoryRefreshKey(prev => prev + 1);

        // 2. 임시 차감된 재고 조정값 초기화 (DB에 반영되었으므로 더 이상 임시 차감 불필요)
        // 주의: 여러 창을 동시에 띄워놓고 작업하는 경우 다른 창의 조정값도 날아갈 수 있음.
        // 하지만 현재 워크플로우상 저장이 완료되면 "확정"된 것이므로 초기화하는 것이 맞음.
        setInventoryAdjustments({});
    }, []);

    // 윈도우 Dirty 상태 변경 핸들러
    const handleWindowDirtyChange = useCallback((windowId, isDirty) => {
        // windowId가 'win-123' 형식이므로 숫자 ID만 추출
        const id = parseInt(windowId.replace('win-', ''));
        setWindows(prev => prev.map(w => w.id === id ? { ...w, isDirty } : w));
    }, []);

    // 앱 렌더링 헬퍼
    const renderAppContent = (win) => {
        const { type, componentProps } = win;

        switch (type) {
            case 'PURCHASE': return <TradePanel tradeType="PURCHASE" panelId={`win-${win.id}`} onInventoryUpdate={handleInventoryUpdate} onTradeChange={handleTradeChange} onDirtyChange={(isDirty) => handleWindowDirtyChange(`win-${win.id}`, isDirty)} {...componentProps} />;
            case 'SALE': return <TradePanel tradeType="SALE" panelId={`win-${win.id}`} onInventoryUpdate={handleInventoryUpdate} onTradeChange={handleTradeChange} onDirtyChange={(isDirty) => handleWindowDirtyChange(`win-${win.id}`, isDirty)} {...componentProps} />;
            case 'TRADE_LIST': return <TradeList isWindow={true} onOpenTradeEdit={(type, tradeId) => launchApp(type, { initialTradeId: tradeId })} {...componentProps} />;
            case 'COMPANY_LIST': return <CompanyList isWindow={true} {...componentProps} />;
            case 'PRODUCT_LIST': return <IntegratedProductManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_QUICK': return <InventoryQuickView isWindow={true} inventoryAdjustments={inventoryAdjustments} refreshKey={inventoryRefreshKey} onInventoryLoaded={(items) => {
                // 필요시 로드된 재고 정보를 상위로 전달
            }} {...componentProps} />;
            case 'INVENTORY_LIST': return <InventoryList isWindow={true} {...componentProps} />;
            case 'INVENTORY_TRANSFER': return <InventoryTransferManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_PRODUCTION': return <InventoryProductionManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_HISTORY': return <InventoryHistory isWindow={true} {...componentProps} />;
            case 'INVENTORY_CHECK': return <InventoryCheckPage isWindow={true} {...componentProps} />;
            case 'INVENTORY_TRANSACTIONS': return <InventoryTransactions isWindow={true} {...componentProps} />;
            case 'MATCHING': return <MatchingPage isWindow={true} {...componentProps} />;
            case 'AUCTION_IMPORT': return <AuctionImportV2 isWindow={true} {...componentProps} />;
            case 'AUCTION_ACCOUNTS': return <AuctionAccounts isWindow={true} {...componentProps} />;
            case 'COMPANY_BALANCES': return <CompanyBalances isWindow={true} {...componentProps} />;
            case 'EXPENSES': return <ExpenseList isWindow={true} {...componentProps} />;
            case 'SETTLEMENT': return <SettlementPage isWindow={true} {...componentProps} />;
            case 'STATISTICS': return <Statistics isWindow={true} {...componentProps} />;
            case 'SETTINGS': return <Settings isWindow={true} windowMode={windowMode} setWindowMode={handleSetWindowMode} {...componentProps} />;
            case 'WAREHOUSES': return <WarehouseManagement isWindow={true} {...componentProps} />;
            case 'EXPENSE_CATEGORIES': return <ExpenseCategoryManagement isWindow={true} {...componentProps} />;
            case 'COMPANY_INFO': return <CompanyInfo isWindow={true} {...componentProps} />;
            case 'MESSAGE_TEST': return <MessageTestPage isWindow={true} {...componentProps} />;
            default: return <div>Unknown App: {type}</div>;
        }
    };

    return (
        <div className="desktop-env" style={{ minHeight: '100vh', background: '#f0f2f5', paddingBottom: '48px' }}>
            {/* 상단 런처 (Navbar 대체) */}
            <Navbar onLaunchApp={launchApp} />

            {/* 바탕화면 영역 (아이콘 배치 가능) */}
            <div className="desktop-workspace" style={{ padding: '20px' }}>
                {/* 여기에 바탕화면 바로가기 아이콘 등을 배치할 수 있음 */}
            </div>

            {/* 플로팅 윈도우들 (최소화된 것은 렌더링하지 않음 - style로 숨김) */}
            {windows.map(win => (
                <FloatingWindow
                    key={win.id}
                    title={win.title}
                    isDirty={win.isDirty} // 변경사항 상태 전달
                    icon={win.icon}
                    onClose={() => closeWindow(win.id)}
                    onMinimize={() => minimizeWindow(win.id)}
                    initialPosition={win.position}
                    size={win.size}
                    zIndex={win.zIndex}
                    isMinimized={win.isMinimized}
                    isActive={activeWindowId === win.id}
                    contentPadding={['PURCHASE', 'SALE'].includes(win.type) ? '0' : undefined}
                    headerPadding={['PURCHASE', 'SALE'].includes(win.type) ? '6px 15px' : undefined}
                    onMouseDown={() => bringToFront(win.id)}
                    onResizeStop={(newSize) => {
                        if (!isMobile) {
                            localStorage.setItem(`window_size_${win.type}`, JSON.stringify(newSize));
                        }
                    }}
                    onDragStop={(newPos) => {
                        if (!isMobile) {
                            localStorage.setItem(`window_position_${win.type}`, JSON.stringify(newPos));
                        }
                    }}
                >
                    {renderAppContent(win)}
                </FloatingWindow>
            ))}

            {/* 하단 태스크바 */}
            <Taskbar
                windows={windows}
                activeWindowId={activeWindowId}
                onToggleWindow={toggleWindow}
                onCloseWindow={closeWindow}
                onResetPosition={resetWindowPosition}
                onCloseAll={closeAll}
            />
        </div>
    );
};

export default DesktopManager;
