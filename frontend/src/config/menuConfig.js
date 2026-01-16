/**
 * Central Menu Configuration
 * 
 * This file serves as the single source of truth for the application's menu structure,
 * group names, icons, and app metadata (titles/icons).
 * 
 * Used by:
 * - Navbar.js: To render the dropdown menus.
 * - RoleManagement.js: To group permissions and labels.
 * - DesktopManager.js: To resolve app titles and icons.
 */

export const MENU_CONFIG = [
    {
        id: 'basicInfo',
        group: '기초 정보',
        icon: '🏗️',
        items: [
            { id: 'COMPANY_LIST', label: '거래처 관리', icon: '🏢' },
            { id: 'PRODUCT_LIST', label: '품목 관리', icon: '📦' },
            { id: 'WAREHOUSES', label: '창고 관리', icon: '🏭' },
            { id: 'PAYMENT_METHODS', label: '결제 방법 관리', icon: '💳' },
            { id: 'EXPENSE_CATEGORIES', label: '지출 관리', icon: '🏷️' },
        ]
    },
    {
        id: 'trades',
        group: '전표 관리',
        icon: '📝',
        items: [
            { id: 'TRADE_LIST', label: '전표 목록', icon: '📝' },
            { id: 'PURCHASE', label: '매입 전표 등록', icon: '📥' },
            { id: 'SALE', label: '매출 전표 등록', icon: '📤' },
        ]
    },
    {
        id: 'auction',
        group: '경매 관리',
        icon: '🔨',
        items: [
            { id: 'AUCTION_IMPORT', label: '낙찰 데이터', icon: '🔨' },
            { id: 'AUCTION_ACCOUNTS', label: '경매 계정', icon: '🆔' },
        ]
    },
    {
        id: 'inventory',
        group: '재고 관리',
        icon: '📊',
        items: [
            { id: 'INVENTORY_LIST', label: '재고 현황', icon: '📊' },
            { id: 'INVENTORY_QUICK', label: '재고 현황 (Quick)', icon: '📊' },
            { id: 'INVENTORY_TRANSFER', label: '재고 이동', icon: '🚚' },
            { id: 'INVENTORY_PRODUCTION', label: '재고 작업', icon: '🏭' },
            { id: 'MATCHING', label: '마감 (매칭)', icon: '🔗' },
            { id: 'INVENTORY_HISTORY', label: '재고 이력', icon: '📜' },
            { id: 'INVENTORY_AUDIT', label: '재고 실사', icon: '🔍' },
        ]
    },
    {
        id: 'payment',
        group: '수금/지급',
        icon: '💰',
        items: [
            { id: 'COMPANY_BALANCES', label: '거래처 잔고', icon: '💰' },
            { id: 'EXPENSES', label: '지출 내역', icon: '💸' },
        ]
    },
    {
        id: 'management',
        group: '경영/정산',
        icon: '💼',
        items: [
            { id: 'SETTLEMENT', label: '정산 리포트', icon: '📈' },
            { id: 'SETTLEMENT_HISTORY', label: '정산 이력 조회', icon: '📜' },
        ]
    },
    {
        id: 'statisticsGroup',
        group: '통계',
        items: [
            { id: 'STATISTICS', label: '통계', icon: '📉' }
        ]
    },
    {
        id: 'settings',
        group: '설정',
        icon: '⚙️',
        items: [
            { id: 'SETTINGS', label: '시스템 설정', icon: '⚙️' },
            { id: 'COMPANY_INFO', label: '본사 정보', icon: 'ℹ️' },
            { id: 'USER_MANAGEMENT', label: '사용자/직원 관리', icon: '👥' },
            { id: 'ROLE_MANAGEMENT', label: '권한 관리', icon: '🔒' },
            { id: 'MESSAGE_TEST', label: '시스템 테스트', icon: '🧪' },
        ]
    }
];

/**
 * Metadata for all resources (flat map)
 */
export const RESOURCE_METADATA = MENU_CONFIG.reduce((acc, group) => {
    group.items.forEach(item => {
        acc[item.id] = { ...item, groupName: group.group };
    });
    return acc;
}, {});

// Add special items not in main menu
RESOURCE_METADATA['DASHBOARD'] = { id: 'DASHBOARD', label: '대시보드', icon: '🏠', groupName: '시스템' };
RESOURCE_METADATA['INVENTORY_PRODUCTION_HISTORY'] = { id: 'INVENTORY_PRODUCTION_HISTORY', label: '재고 작업 이력', icon: '📜', groupName: '재고 관리' };

/**
 * Get display label for a resource
 */
export const getResourceLabel = (resourceId) => RESOURCE_METADATA[resourceId]?.label || resourceId;

/**
 * Get icon for a resource
 */
export const getResourceIcon = (resourceId) => RESOURCE_METADATA[resourceId]?.icon || '📱';
