import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import BackupSystem from './BackupSystem';
import WarehouseManagement from './WarehouseManagement';
import ExpenseCategoryManagement from './ExpenseCategoryManagement';
import CompanyInfo from './CompanyInfo';
import MessageTestPage from './MessageTestPage';
import AuctionImportV2 from './AuctionImportV2';
import AuctionStatement from './AuctionStatement';
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
    const { openModal, ConfirmModalComponent } = useConfirmModal(); // [FIX] Move to top to avoid TDZ in launchApp
    const getScopedKey = useCallback((key) => user?.id ? `u${user.id}_${key}` : key, [user?.id]);

    // [Performance] Debounce 타이머 참조 (localStorage 저장 최적화)
    const saveTimersRef = useRef({});

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

    // 윈도우 상태 변경 시 localStorage 저장 (Debounced)
    useEffect(() => {
        // [FIX] 로딩 전(null)에는 저장하지 않음 (빈 배열로 덮어쓰기 방지)
        if (windows === null) return;

        // [Performance] 드래그 등 잦은 상태 변화로 인한 무거운 직렬화 작업(JSON.stringify) 최적화
        const timerKey = 'global_desktop_save';
        clearTimeout(saveTimersRef.current[timerKey]);

        saveTimersRef.current[timerKey] = setTimeout(() => {
            // 불필요한 속성(isDirty 등) 제외하고 저장하거나, 초기화하여 저장
            const dataToSave = windows.map(({ isDirty, ...rest }) => rest);
            localStorage.setItem(getScopedKey('desktop_windows'), JSON.stringify(dataToSave));
            // console.log('💾 Desktop state saved to localStorage');
        }, 1000); // 전체 저장은 1초 주기로 넉넉하게

        return () => clearTimeout(saveTimersRef.current[timerKey]);
    }, [windows, getScopedKey]);

    useEffect(() => {
        if (activeWindowId) {
            localStorage.setItem(getScopedKey('active_window_id'), activeWindowId.toString());
        } else {
            localStorage.removeItem(getScopedKey('active_window_id'));
        }
    }, [activeWindowId, getScopedKey]);

    const closeWindow = useCallback((id) => {
        setWindows(prev => prev ? prev.filter(w => w.id !== id) : prev);
        if (activeWindowId === id) {
            setActiveWindowId(null);
        }
        // [NEW] 윈도우 닫을 때 해당 세션의 재고 조정 내역도 삭제
        setWindowInventoryAdjustments(prev => {
            const { [`win-${id}`]: _, ...rest } = prev;
            return rest;
        });
    }, [activeWindowId]);

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
        // [NEW] 모든 재고 조정 내역도 초기화
        setWindowInventoryAdjustments({});
    };

    const resetWindowPosition = (id) => {
        const win = windows.find(w => w.id === id);
        if (!win) return;

        localStorage.removeItem(getScopedKey(`window_position_${win.type}`));
        localStorage.removeItem(getScopedKey(`window_size_${win.type}`));

        const defaultPosition = { x: 50 + ((windows?.length || 0) % 10) * 30, y: 50 + ((windows?.length || 0) % 10) * 30 };
        let defaultSize = { width: 1000, height: 820 };
        if (['INVENTORY_QUICK', 'COMPANY_INFO'].includes(win.type)) {
            defaultSize = { width: 'auto', height: 820 };
        }
        if (['SETTINGS', 'EXPENSE_CATEGORIES'].includes(win.type)) defaultSize = { width: 800, height: 600 };
        if (['WAREHOUSES', 'STATISTICS'].includes(win.type)) defaultSize = { width: 900, height: 600 };

        setWindows(prev => prev.map(w => w.id === id ? {
            ...w,
            position: defaultPosition,
            size: defaultSize
        } : w));
        bringToFront(id);
    };

    // 앱 실행 (윈도우 열기)
    const launchApp = useCallback((appType, props = {}, launcherId = null) => {
        // [RBAC] Permission Guard
        if (appType === 'DASHBOARD') {
            closeAll();
            return;
        }

        if (!hasPermission(appType, 'READ')) {
            openModal({
                type: 'warning',
                title: '접근 제한',
                message: '해당 메뉴에 대한 접근 권한이 없습니다. 관리자에게 문의하세요.',
                showCancel: false
            });
            return;
        }

        const alwaysSingleInstanceApps = ['SETTINGS', 'STATISTICS', 'ROLE_MANAGEMENT', 'BACKUP_SYSTEM'];
        const existing = windows?.find(w => w.type === appType);

        const calculatePosition = (targetAppType, lId) => {
            let pos = { x: 50 + ((windows?.length || 0) % 10) * 30, y: 50 + ((windows?.length || 0) % 10) * 30 };
            if (!lId || isMobile) return pos;
            const launcher = windows?.find(w => `win-${w.id}` === lId || w.id === lId);
            if (launcher) {
                const spacing = 2;
                const launcherWidth = typeof launcher.size.width === 'number' ? launcher.size.width : 800;
                let newX = launcher.position.x + launcherWidth + spacing;
                let newY = launcher.position.y;
                const winWidth = window.innerWidth;
                const targetWidth = (targetAppType === 'INVENTORY_QUICK' || targetAppType === 'COMPANY_INFO') ? 900 : 1000;
                if (newX + targetWidth > winWidth - 20) {
                    newX = Math.max(0, winWidth - targetWidth - 30);
                }
                pos = { x: newX, y: newY };
            }
            return pos;
        };

        if (existing && (alwaysSingleInstanceApps.includes(appType) || windowMode === 'single')) {
            const nextPos = launcherId ? calculatePosition(appType, launcherId) : existing.position;

            // [Sidecar Height Sync for Existing Window]
            // 이미 창이 열려있더라도 다시 호출 시 호출 창의 높이에 맞춤 (Trade Panel <-> Inventory Quick View)
            let nextSize = existing.size;
            if (launcherId && !isMobile && appType === 'INVENTORY_QUICK') {
                const launcher = windows?.find(w => `win-${w.id}` === launcherId || w.id === launcherId);
                if (launcher && launcher.size && typeof launcher.size.height === 'number') {
                    nextSize = { ...existing.size, height: launcher.size.height };
                }
            }

            setWindows(prev => prev.map(w => w.id === existing.id ? {
                ...w,
                position: nextPos,
                size: nextSize,
                componentProps: { ...w.componentProps, ...props, timestamp: Date.now() },
                isMinimized: false
            } : w));
            bringToFront(existing.id);
            return;
        }

        const newId = Date.now();
        const newZIndex = maxZIndex + 1;
        setMaxZIndex(newZIndex);
        setActiveWindowId(newId);

        const meta = RESOURCE_METADATA[appType] || {};
        let title = meta.label || appType;
        let icon = meta.icon || '📱';
        let size = { width: 1000, height: 820 };

        if (appType === 'ROLE_MANAGEMENT' || appType === 'USER_MANAGEMENT') size = { width: 1000, height: 750 };
        if (appType === 'SETTLEMENT_HISTORY' || appType === 'WAREHOUSES') size = { width: 900, height: 600 };
        if (appType === 'SETTINGS' || appType === 'EXPENSE_CATEGORIES' || appType === 'PAYMENT_METHODS') size = { width: 800, height: 630 };
        if (appType === 'BACKUP_SYSTEM') size = { width: 800, height: 750 };
        if (appType === 'SALE' || appType === 'PURCHASE') size = { width: 1000, height: 820 };
        if (appType === 'AUCTION_IMPORT') size = { width: 'auto', height: 820 };
        if (appType === 'AUCTION_STATEMENT') size = { width: 1200, height: 850 };
        if (appType === 'COMPANY_INFO') size = { width: 'auto', height: 500 };
        if (appType === 'INVENTORY_QUICK') {
            size = { width: 'auto', height: 820 }; // Default
            // [Sidecar Height Sync] 호출 창(Trade Panel)이 있으면 그 높이에 맞춤
            if (launcherId && !isMobile) {
                const launcher = windows?.find(w => `win-${w.id}` === launcherId || w.id === launcherId);
                if (launcher && typeof launcher.size.height === 'number') {
                    size.height = launcher.size.height;
                }
            }
        }

        let position = calculatePosition(appType, launcherId);
        title = `${title} [${appType}]`;

        if (isMobile) {
            size = { width: window.innerWidth - 20, height: window.innerHeight - 80 };
            position = { x: 10, y: 70 };
        }

        if (!launcherId && !isMobile) {
            const savedSize = localStorage.getItem(getScopedKey(`window_size_${appType}`));
            const savedPosition = localStorage.getItem(getScopedKey(`window_position_${appType}`));
            if (savedSize) { try { size = JSON.parse(savedSize); } catch (e) { } }
            if (savedPosition) { try { position = JSON.parse(savedPosition); } catch (e) { } }
        }

        const newWindow = { id: newId, type: appType, zIndex: newZIndex, position, size, title, icon, componentProps: props, isMinimized: false };
        setWindows(prev => isMobile ? [newWindow] : [...prev, newWindow]);
    }, [windows, maxZIndex, isMobile, windowMode, bringToFront, hasPermission, openModal, getScopedKey, closeAll]);

    // [NEW] 세션(윈도우)별 재고 조정 상태 관리
    // { windowId: { inventoryId: delta } }
    const [windowInventoryAdjustments, setWindowInventoryAdjustments] = useState({});

    // 전표 목록 및 재고 목록 새로고침 키
    const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
    const [tradeRefreshKey, setTradeRefreshKey] = useState(0);

    // [NEW] 모든 윈도우의 조정 내역을 합쳐서 하나의 맵으로 변환 (InventoryQuickView에 전달용)
    const mergedInventoryAdjustments = React.useMemo(() => {
        const merged = {};
        Object.values(windowInventoryAdjustments).forEach(adjustments => {
            Object.entries(adjustments).forEach(([id, delta]) => {
                merged[id] = (merged[id] || 0) + delta;
            });
        });
        return merged;
    }, [windowInventoryAdjustments]);

    // [Refactored] 윈도우별 재고 조정 내역 수신 (Declarative Sync)
    const handleInventoryUpdate = useCallback((windowId, adjustmentsMap) => {
        setWindowInventoryAdjustments(prev => ({
            ...prev,
            [windowId]: adjustmentsMap
        }));
    }, []);

    // 전표 변경(저장/삭제) 핸들러
    const handleTradeChange = useCallback((panelId = null) => {
        // 1. 재고 목록 새로고침 트리거
        setInventoryRefreshKey(prev => prev + 1);

        // 2. 전표 목록 새로고침 트리거 (MDI 연동)
        setTradeRefreshKey(prev => prev + 1);

        // [FIX] 특정 패널(전표) 저장 성공 시, 해당 패널의 세션 조정 내역을 즉시 비움 (Double Deduction 방지)
        if (panelId) {
            setWindowInventoryAdjustments(prev => {
                const { [panelId]: _, ...rest } = prev;
                return rest;
            });
        }
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

    // [NEW] 데이터 복구 성공 시 처리 (Soft Refresh)
    const handleRestoreSuccess = useCallback(() => {
        // 1. 모든 창 닫기 (데이터 정합성 보장)
        closeAll();

        // 2. 전역 상태 및 새로고침 키 초기화
        setInventoryRefreshKey(prev => prev + 1);
        setTradeRefreshKey(prev => prev + 1);
        setWindowInventoryAdjustments({});

        // 3. 성공 알림 표시
        openModal({
            type: 'success',
            title: '데이터 복구 성공',
            message: '데이터가 성공적으로 복구되었습니다.\n이제 새 창을 열어 복구된 데이터를 확인하실 수 있습니다.',
            confirmText: '확인',
            showCancel: false
        });
    }, [closeAll, openModal]);

    // [Performance] TradeList용 안정된 콜백
    const handleOpenTradeEdit = useCallback((type, tradeId, viewMode = false) => {
        launchApp(type, { initialTradeId: tradeId, initialViewMode: viewMode });
    }, [launchApp]);

    // 앱 렌더링 헬퍼 (각 컴포넌트는 자체 React.memo로 보호됨)
    const renderAppContent = (win) => {
        const { type, componentProps } = win;

        switch (type) {
            case 'PURCHASE': return <TradePanel tradeType="PURCHASE" panelId={`win-${win.id}`} onClose={closeWindow} onPrint={handlePrint} onInventoryUpdate={handleInventoryUpdate} onTradeChange={handleTradeChange} onDirtyChange={handleWindowDirtyChange} updateProps={updateActiveWindowProps} onLaunchApp={launchApp} {...componentProps} />;
            case 'SALE': return <TradePanel tradeType="SALE" panelId={`win-${win.id}`} onClose={closeWindow} onPrint={handlePrint} onInventoryUpdate={handleInventoryUpdate} onTradeChange={handleTradeChange} onDirtyChange={handleWindowDirtyChange} updateProps={updateActiveWindowProps} onLaunchApp={launchApp} {...componentProps} />;
            case 'TRADE_LIST': return <TradeList isWindow={true} refreshKey={tradeRefreshKey} onOpenTradeEdit={handleOpenTradeEdit} {...componentProps} />;
            case 'COMPANY_LIST': return <CompanyList isWindow={true} {...componentProps} />;
            case 'PRODUCT_LIST': return <IntegratedProductManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_QUICK': return <InventoryQuickView isWindow={true} inventoryAdjustments={mergedInventoryAdjustments} refreshKey={inventoryRefreshKey} {...componentProps} />;
            case 'INVENTORY_LIST': return <InventoryList isWindow={true} {...componentProps} />;
            case 'INVENTORY_TRANSFER': return <InventoryTransferManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_PRODUCTION': return <InventoryProductionManagement isWindow={true} {...componentProps} />;
            case 'INVENTORY_HISTORY': return <InventoryHistory isWindow={true} {...componentProps} />;
            case 'INVENTORY_AUDIT': return <InventoryAuditPage isWindow={true} {...componentProps} />;

            case 'MATCHING': return <MatchingPage isWindow={true} refreshKey={tradeRefreshKey} onTradeChange={handleTradeChange} onLaunchApp={launchApp} {...componentProps} />;
            case 'AUCTION_IMPORT': return <AuctionImportV2 isWindow={true} panelId={win.id} onTradeChange={handleTradeChange} onClose={closeWindow} {...componentProps} />;
            case 'AUCTION_STATEMENT': return <AuctionStatement isWindow={true} {...componentProps} />;
            case 'AUCTION_ACCOUNTS': return <AuctionAccounts isWindow={true} {...componentProps} />;
            case 'COMPANY_BALANCES': return <CompanyBalances isWindow={true} {...componentProps} />;
            case 'EXPENSES': return <ExpenseList isWindow={true} {...componentProps} />;
            case 'SETTLEMENT': return <SettlementPage isWindow={true} {...componentProps} />;
            case 'SETTLEMENT_HISTORY': return <SettlementHistory isWindow={true} onOpenDetail={(item) => launchApp('SETTLEMENT', { initialHistory: item })} {...componentProps} />;
            case 'STATISTICS': return <Statistics isWindow={true} {...componentProps} />;
            case 'SETTINGS': return <Settings isWindow={true} windowMode={windowMode} setWindowMode={handleSetWindowMode} {...componentProps} />;
            case 'BACKUP_SYSTEM': return <BackupSystem isWindow={true} onRestoreSuccess={handleRestoreSuccess} {...componentProps} />;
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
                            // 상태는 즉시 업데이트 (UI 반영)
                            setWindows(prev => prev.map(w => w.id === win.id ? { ...w, size: newSize } : w));
                            // localStorage 저장은 debounce (300ms)
                            const timerKey = `size_${win.id}`;
                            clearTimeout(saveTimersRef.current[timerKey]);
                            saveTimersRef.current[timerKey] = setTimeout(() => {
                                localStorage.setItem(getScopedKey(`window_size_${win.type}`), JSON.stringify(newSize));
                            }, 300);
                        }
                    }}
                    onDragStop={(newPos) => {
                        if (!isMobile) {
                            // 상태는 즉시 업데이트 (UI 반영)
                            setWindows(prev => prev.map(w => w.id === win.id ? { ...w, position: newPos } : w));
                            // localStorage 저장은 debounce (300ms)
                            const timerKey = `pos_${win.id}`;
                            clearTimeout(saveTimersRef.current[timerKey]);
                            saveTimersRef.current[timerKey] = setTimeout(() => {
                                localStorage.setItem(getScopedKey(`window_position_${win.type}`), JSON.stringify(newPos));
                            }, 300);
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
