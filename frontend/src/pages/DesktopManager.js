import React, { useState, useCallback, useEffect } from 'react';
import FloatingWindow from '../components/FloatingWindow';
import Navbar from '../components/Navbar';
import Taskbar from '../components/Taskbar';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission'; // RBAC Hook
import { useConfirmModal } from '../components/ConfirmModal'; // Added import

// Apps (Components)
import TradePanel from '../components/TradePanel';
import TradePrintModal from '../components/TradePrintModal';
import InventoryQuickView from '../components/InventoryQuickView';
import CompanyList from './CompanyList';
import IntegratedProductManagement from './IntegratedProductManagement';
import TradeList from './TradeList';
import InventoryList from './InventoryList';
import InventoryTransferManagement from './InventoryTransferManagement';
import InventoryProductionManagement from './InventoryProductionManagement';
import MatchingPage from './MatchingPage';
import InventoryHistory from './InventoryHistory';
import InventoryAuditPage from './InventoryAuditPage';


import CompanyBalances from './CompanyBalances';
import ExpenseList from './ExpenseList';
import SettlementPage from './SettlementPage';
import SettlementHistory from './SettlementHistory'; // [New]
import Statistics from './Statistics';
import Settings from './Settings';
import WarehouseManagement from './WarehouseManagement';
import ExpenseCategoryManagement from './ExpenseCategoryManagement';
import CompanyInfo from './CompanyInfo';
import MessageTestPage from './MessageTestPage';
import AuctionImportV2 from './AuctionImportV2';
import AuctionAccounts from './AuctionAccounts';
import UserManagement from './UserManagement';
import PaymentMethodManagement from './PaymentMethodManagement';
import { RESOURCE_METADATA } from '../config/menuConfig';
import RoleManagement from './RoleManagement'; // RBAC Page

/**
 * DesktopManager
 * 
 * 웹 OS 스타일의 데스크탑 매니저입니다.
 * Navbar를 통해 앱을 실행하면 FloatingWindow로 열립니다.
 * 모바일 환경에서는 자동으로 최대화된 창으로 열립니다.
 */
const DesktopManager = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermission(); // RBAC Hook
    const getScopedKey = useCallback((key) => user?.id ? `u${user.id}_${key}` : key, [user?.id]);

    // ... (rest of code)


    // 열린 윈도우 목록
    // { id, type, zIndex, position, title, icon, size, componentProps, isMinimized }
    // 열린 윈도우 목록
    // { id, type, zIndex, position, title, icon, size, componentProps, isMinimized }
    // [FIX] 초기값을 null로 설정하여 "로딩 중" 상태를 구분 (빈 배열 []과 구분)
    const [windows, setWindows] = useState(null);

    // Load Windows
    useEffect(() => {
        const saved = localStorage.getItem(getScopedKey('desktop_windows'));
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setWindows(parsed.map(w => ({ ...w, isDirty: false })));
            } catch (e) {
                console.error('Failed to restore windows:', e);
                setWindows([]);
            }
        } else {
            setWindows([]);
        }
    }, [getScopedKey]);

    const [maxZIndex, setMaxZIndex] = useState(100);
    useEffect(() => {
        if (windows && windows.length > 0) {
            setMaxZIndex(Math.max(...windows.map(w => w.zIndex), 100));
        }
    }, [windows]);

    const [activeWindowId, setActiveWindowId] = useState(null);
    useEffect(() => {
        const saved = localStorage.getItem(getScopedKey('active_window_id'));
        setActiveWindowId(saved ? parseInt(saved) : null);
    }, [getScopedKey]);

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    // 출력 모달 상태
    const [printModal, setPrintModal] = useState({ isOpen: false, tradeId: null });
    const handlePrint = (tradeId) => setPrintModal({ isOpen: true, tradeId });

    // 윈도우 모드 설정 (multi: 다중 창 허용, single: 중복 실행 방지)
    const [windowMode, setWindowMode] = useState('multi');
    useEffect(() => {
        const saved = localStorage.getItem(getScopedKey('window_mode'));
        setWindowMode(saved || 'multi');
    }, [getScopedKey]);

    // 화면 크기 감지
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 윈도우 모드 변경 핸들러 (저장 포함)
    const handleSetWindowMode = (mode) => {
        setWindowMode(mode);
        localStorage.setItem(getScopedKey('window_mode'), mode);
    };

    // 윈도우 상태 변경 시 localStorage 저장
    useEffect(() => {
        // [FIX] 로딩 전(null)에는 저장하지 않음 (빈 배열로 덮어쓰기 방지)
        if (windows === null) return;

        // 불필요한 속성(isDirty 등) 제외하고 저장하거나, 초기화하여 저장
        const dataToSave = windows.map(({ isDirty, ...rest }) => rest);
        localStorage.setItem(getScopedKey('desktop_windows'), JSON.stringify(dataToSave));
    }, [windows, getScopedKey]);

    useEffect(() => {
        if (activeWindowId) {
            localStorage.setItem(getScopedKey('active_window_id'), activeWindowId.toString());
        } else {
            localStorage.removeItem(getScopedKey('active_window_id'));
        }
    }, [activeWindowId, getScopedKey]);

    // 앱 실행 (윈도우 열기)
    const launchApp = useCallback((appType, props = {}) => {
        // [RBAC] Permission Guard
        // [NEW] DASHBOARD is basically home, skip READ check or handle as no-op later
        if (appType === 'DASHBOARD') {
            closeAll();
            return;
        }

        // Check if user has READ permission for this appType
        if (!hasPermission(appType, 'READ')) {
            openModal({
                type: 'warning',
                title: '접근 제한',
                message: '해당 메뉴에 대한 접근 권한이 없습니다. 관리자에게 문의하세요.',
                showCancel: false
            });
            return;
        }

        // 이미 열린 단일 인스턴스 앱 확인 (설정, 통계 등은 하나만)
        const alwaysSingleInstanceApps = [
            'SETTINGS', 'STATISTICS', 'ROLE_MANAGEMENT' // Added ROLE_MANAGEMENT to single instance
        ];

        const existing = windows?.find(w => w.type === appType);

        // 1. 항상 단일 인스턴스인 앱
        if (existing && alwaysSingleInstanceApps.includes(appType)) {
            // 기존 윈도우의 props 업데이트
            setWindows(prev => prev.map(w => w.id === existing.id ? { ...w, componentProps: { ...w.componentProps, ...props, timestamp: Date.now() }, isMinimized: false } : w));
            // restoreWindow(existing.id); // 위에서 isMinimized 처리함
            bringToFront(existing.id);
            return;
        }

        // 2. 사용자 설정이 'single' 모드이고, 이미 열려있는 경우
        if (windowMode === 'single' && existing) {
            // 기존 윈도우의 props 업데이트
            setWindows(prev => prev.map(w => w.id === existing.id ? { ...w, componentProps: { ...w.componentProps, ...props, timestamp: Date.now() }, isMinimized: false } : w));
            // restoreWindow(existing.id); // 위에서 isMinimized 처리함
            bringToFront(existing.id);
            return;
        }

        const newId = Date.now();
        const newZIndex = maxZIndex + 1;
        setMaxZIndex(newZIndex);
        setActiveWindowId(newId);

        // 기본 설정 (from Source of Truth)
        const meta = RESOURCE_METADATA[appType] || {};
        let title = meta.label || appType;
        let icon = meta.icon || '📱';
        let size = { width: 1000, height: 700 };
        let position = { x: 50 + ((windows?.length || 0) % 10) * 30, y: 50 + ((windows?.length || 0) % 10) * 30 };

        // 크기 예외 처리 (config로 옮길 수도 있지만 일단 유지)
        if (appType === 'ROLE_MANAGEMENT' || appType === 'USER_MANAGEMENT') size = { width: 1000, height: 750 };
        if (appType === 'SETTLEMENT_HISTORY' || appType === 'WAREHOUSES') size = { width: 900, height: 600 };
        if (appType === 'SETTINGS' || appType === 'EXPENSE_CATEGORIES' || appType === 'PAYMENT_METHODS') size = { width: 800, height: 630 };
        if (appType === 'COMPANY_INFO') size = { width: 600, height: 500 };

        // [DEBUG] Append App Type for User Identification
        title = `${title} [${appType}]`;

        // 모바일이면 전체 화면 강제
        if (isMobile) {
            size = { width: window.innerWidth - 20, height: window.innerHeight - 80 }; // Navbar 고려
            position = { x: 10, y: 70 };
        }

        // 윈도우 크기 및 위치 복원 (저장된 값이 있으면)
        const savedSize = localStorage.getItem(getScopedKey(`window_size_${appType}`));
        const savedPosition = localStorage.getItem(getScopedKey(`window_position_${appType}`));

        if (!isMobile) {
            if (savedSize) {
                try { size = JSON.parse(savedSize); } catch (e) { }
            }
            if (savedPosition) {
                try { position = JSON.parse(savedPosition); } catch (e) { }
            }
        }

        const newWindow = {
            id: newId,
            type: appType,
            zIndex: newZIndex,
            position,
            size,
            title,
            icon,
            componentProps: props,
            isMinimized: false
        };

        setWindows(prev => {
            // [NEW] Mobile Single Window Policy: Close others
            if (isMobile) {
                return [newWindow];
            }
            return [...prev, newWindow];
        });
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
        localStorage.removeItem(getScopedKey(`window_position_${win.type}`));
        localStorage.removeItem(getScopedKey(`window_size_${win.type}`));

        // 기본 위치 및 크기로 리셋
        // 기본 위치 로직 재현 (약식)
        const defaultPosition = { x: 50 + ((windows?.length || 0) % 10) * 30, y: 50 + ((windows?.length || 0) % 10) * 30 };

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

    // 전표 목록 및 재고 목록 새로고침 키
    const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
    const [tradeRefreshKey, setTradeRefreshKey] = useState(0);

    const { openModal, ConfirmModalComponent } = useConfirmModal(); // Init hook

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

        // 2. 전표 목록 새로고침 트리거 (MDI 연동)
        setTradeRefreshKey(prev => prev + 1);

        // 3. 임시 차감된 재고 조정값 초기화
        setInventoryAdjustments({});
    }, []);

    // 윈도우 Dirty 상태 변경 핸들러
    const handleWindowDirtyChange = useCallback((windowId, isDirty) => {
        // windowId가 'win-123' 형식이므로 숫자 ID만 추출
        const id = parseInt(windowId.replace('win-', ''));
        setWindows(prev => prev.map(w => w.id === id ? { ...w, isDirty } : w));
    }, []);

    // [NEW] 윈도우의 Props(상태 저장용)를 외부에서 업데이트하는 핸들러
    const updateActiveWindowProps = useCallback((windowId, newProps) => {
        const id = parseInt(windowId.replace('win-', ''));
        setWindows(prev => prev ? prev.map(w => w.id === id ? {
            ...w,
            componentProps: { ...w.componentProps, ...newProps }
        } : w) : prev);
    }, []);

    // 앱 렌더링 헬퍼
    const renderAppContent = (win) => {
        const { type, componentProps } = win;

        switch (type) {
            case 'PURCHASE': return <TradePanel tradeType="PURCHASE" panelId={`win-${win.id}`} onClose={() => closeWindow(win.id)} onPrint={handlePrint} onInventoryUpdate={handleInventoryUpdate} onTradeChange={handleTradeChange} onDirtyChange={(isDirty) => handleWindowDirtyChange(`win-${win.id}`, isDirty)} updateProps={(props) => updateActiveWindowProps(`win-${win.id}`, props)} {...componentProps} />;
            case 'SALE': return <TradePanel tradeType="SALE" panelId={`win-${win.id}`} onClose={() => closeWindow(win.id)} onPrint={handlePrint} onInventoryUpdate={handleInventoryUpdate} onTradeChange={handleTradeChange} onDirtyChange={(isDirty) => handleWindowDirtyChange(`win-${win.id}`, isDirty)} updateProps={(props) => updateActiveWindowProps(`win-${win.id}`, props)} {...componentProps} />;
            case 'TRADE_LIST': return <TradeList isWindow={true} refreshKey={tradeRefreshKey} onOpenTradeEdit={(type, tradeId, viewMode = false) => launchApp(type, { initialTradeId: tradeId, initialViewMode: viewMode })} {...componentProps} />;
            case 'COMPANY_LIST': return <CompanyList isWindow={true} {...componentProps} />;
            case 'PRODUCT_LIST': return <IntegratedProductManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_QUICK': return <InventoryQuickView isWindow={true} inventoryAdjustments={inventoryAdjustments} refreshKey={inventoryRefreshKey} onInventoryLoaded={(items) => {
                // 필요시 로드된 재고 정보를 상위로 전달
            }} {...componentProps} />;
            case 'INVENTORY_LIST': return <InventoryList isWindow={true} {...componentProps} />;
            case 'INVENTORY_TRANSFER': return <InventoryTransferManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_PRODUCTION': return <InventoryProductionManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_HISTORY': return <InventoryHistory isWindow={true} {...componentProps} />;
            case 'INVENTORY_AUDIT': return <InventoryAuditPage isWindow={true} {...componentProps} />;

            case 'MATCHING': return <MatchingPage isWindow={true} refreshKey={tradeRefreshKey} onTradeChange={handleTradeChange} {...componentProps} />;
            case 'AUCTION_IMPORT': return <AuctionImportV2 isWindow={true} onTradeChange={handleTradeChange} {...componentProps} />;
            case 'AUCTION_ACCOUNTS': return <AuctionAccounts isWindow={true} {...componentProps} />;
            case 'COMPANY_BALANCES': return <CompanyBalances isWindow={true} {...componentProps} />;
            case 'EXPENSES': return <ExpenseList isWindow={true} {...componentProps} />;
            case 'SETTLEMENT': return <SettlementPage isWindow={true} {...componentProps} />;
            case 'SETTLEMENT_HISTORY': return <SettlementHistory isWindow={true} onOpenDetail={(item) => launchApp('SETTLEMENT', { initialHistory: item })} {...componentProps} />;
            case 'STATISTICS': return <Statistics isWindow={true} {...componentProps} />;
            case 'SETTINGS': return <Settings isWindow={true} windowMode={windowMode} setWindowMode={handleSetWindowMode} {...componentProps} />;
            case 'WAREHOUSES': return <WarehouseManagement isWindow={true} {...componentProps} />;
            case 'EXPENSE_CATEGORIES': return <ExpenseCategoryManagement isWindow={true} {...componentProps} />;
            case 'COMPANY_INFO': return <CompanyInfo isWindow={true} {...componentProps} />;
            case 'MESSAGE_TEST': return <MessageTestPage isWindow={true} {...componentProps} />;
            case 'USER_MANAGEMENT': return <UserManagement isWindow={true} {...componentProps} />;
            case 'ROLE_MANAGEMENT': return <RoleManagement isWindow={true} {...componentProps} />;
            case 'PAYMENT_METHODS': return <PaymentMethodManagement isWindow={true} {...componentProps} />;
            default: return <div>Unknown App: {type}</div>;
        }
    };

    return (
        <div className="desktop-env" style={{ minHeight: '100vh', background: '#f0f2f5', paddingBottom: isMobile ? '0' : '38px' }}>
            {/* 상단 런처 (Navbar 대체) */}
            <Navbar onLaunchApp={launchApp} />

            {/* 바탕화면 영역 (아이콘 배치 가능) */}
            <div className="desktop-workspace" style={{ padding: '20px' }}>
                {/* 여기에 바탕화면 바로가기 아이콘 등을 배치할 수 있음 */}
            </div>

            {/* 플로팅 윈도우들 (최소화된 것은 렌더링하지 않음 - style로 숨김) */}
            {windows && windows.map(win => (
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
                    contentPadding="0"

                    onMouseDown={() => bringToFront(win.id)}
                    onResizeStop={(newSize) => {
                        if (!isMobile) {
                            localStorage.setItem(getScopedKey(`window_size_${win.type}`), JSON.stringify(newSize));
                            setWindows(prev => prev.map(w => w.id === win.id ? { ...w, size: newSize } : w));
                        }
                    }}
                    onDragStop={(newPos) => {
                        if (!isMobile) {
                            localStorage.setItem(getScopedKey(`window_position_${win.type}`), JSON.stringify(newPos));
                            setWindows(prev => prev.map(w => w.id === win.id ? { ...w, position: newPos } : w));
                        }
                    }}
                >
                    {renderAppContent(win)}
                </FloatingWindow>
            ))}

            {/* 하단 태스크바 (모바일에서는 숨김) */}
            {!isMobile && (
                <Taskbar
                    windows={windows}
                    activeWindowId={activeWindowId}
                    onToggleWindow={toggleWindow}
                    onCloseWindow={closeWindow}
                    onResetPosition={resetWindowPosition}
                    onCloseAll={closeAll}
                />
            )}

            {/* 출력 모달 (전역) */}
            {printModal.isOpen && (
                <TradePrintModal
                    isOpen={printModal.isOpen}
                    onClose={() => setPrintModal({ isOpen: false, tradeId: null })}
                    tradeId={printModal.tradeId}
                />
            )}
            {ConfirmModalComponent}
        </div>
    );
};

export default DesktopManager;
