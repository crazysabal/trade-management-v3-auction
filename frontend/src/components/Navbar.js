import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import ConfirmModal from './ConfirmModal';
import './Navbar.css';
import { useMenuConfig } from '../context/MenuConfigContext';
import { companyInfoAPI } from '../services/api'; // [NEW] Import API
import MenuEditorModal from './MenuEditorModal'; // [NEW] Failsafe Modal

const Navbar = ({ onLaunchApp }) => {
    const { user } = useAuth();
    const { hasPermission } = usePermission();
    const { activeMenuConfig } = useMenuConfig();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
    const [isMenuEditorOpen, setIsMenuEditorOpen] = useState(false); // [NEW] Global Menu Editor State
    const [companyName, setCompanyName] = useState('홍다 Biz'); // [NEW] Company Name State

    // [NEW] Fetch Company Name on Mount
    React.useEffect(() => {
        const fetchCompanyInfo = async () => {
            try {
                const res = await companyInfoAPI.get();
                if (res.data.success && res.data.data) {
                    const name = res.data.data.company_name;
                    setCompanyName(`홍다 Biz - ${name}`);
                    document.title = `홍다 Biz - ${name}`; // Update Browser Tab Title
                }
            } catch (error) {
                console.error('Failed to fetch company info:', error);
            }
        };
        fetchCompanyInfo();
    }, []);

    // 드롭다운 메뉴 상태 관리
    const [activeDropdown, setActiveDropdown] = useState(null);

    // [RBAC] Filter Menu based on Permissions (Use activeMenuConfig instead of MENU_CONFIG)
    // Filter hidden groups first, then permissions
    const filteredMenu = activeMenuConfig
        .filter(group => !group.isHidden) // [NEW] Hide hidden groups
        .map(group => {
            // Deduplicate items using Set by ID to fix "duplicate key" warning
            const seen = new Set();
            const visibleItems = group.items.filter(item => {
                if (seen.has(item.id)) return false;
                if (hasPermission(item.id, 'READ')) {
                    seen.add(item.id);
                    return true;
                }
                return false;
            });
            return { ...group, items: visibleItems };
        })
        .filter(group => group.items.length > 0);

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
        // 모바일 메뉴를 닫을 때 드롭다운 상태도 초기화
        if (isMobileMenuOpen) {
            setActiveDropdown(null);
        }
    };

    const toggleDropdown = (menuName) => {
        setActiveDropdown(activeDropdown === menuName ? null : menuName);
    };

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
        setActiveDropdown(null);
    };

    // 마우스 호버 핸들러 (데스크탑 전용)
    const handleMouseEnter = (menuName) => {
        if (window.innerWidth > 1200 && !isMobileMenuOpen) {
            setActiveDropdown(menuName);
        }
    };

    const handleMouseLeave = () => {
        if (window.innerWidth > 1200 && !isMobileMenuOpen) {
            setActiveDropdown(null);
        }
    };

    // 앱 실행 래퍼 (실행 후 메뉴 닫기)
    const handleLaunch = (appType) => {
        if (onLaunchApp) {
            onLaunchApp(appType);
        }
        closeMobileMenu();
    };

    const handleLogout = () => {
        // Simple logout mechanism
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    };

    return (
        <nav className="navbar">
            <div className="navbar-container">
                <div className="navbar-logo" onClick={() => handleLaunch('DASHBOARD')}>
                    📊 {companyName}
                </div>

                {/* [MODIFIED] Navbar Actions - Moved style to CSS class */}
                <div className="navbar-actions">
                    {/* [NEW] User Display (Visible on Desktop) */}
                    {user && (
                        <div className="user-profile-desktop">
                            <span>👤 {user.username}</span>
                            <span style={{
                                fontSize: '0.7rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: user.role === 'admin' ? '#ef4444' : '#3b82f6',
                                fontWeight: 'bold'
                            }}>
                                {user.role === 'admin' ? 'ADMIN' : 'USER'}
                            </span>
                        </div>
                    )}

                    {/* [NEW] Global Menu Editor Trigger (Failsafe) */}
                    <button
                        className="btn-menu-edit"
                        onClick={() => setIsMenuEditorOpen(true)}
                        title="메뉴 편집 (숨겨진 메뉴 복구)"
                    >
                        🛠️
                    </button>

                    <button
                        className="btn-logout-desktop"
                        onClick={() => setIsLogoutConfirmOpen(true)}
                    >
                        🔒 로그아웃
                    </button>

                    {/* Logout Confirmation Modal */}
                    <ConfirmModal
                        isOpen={isLogoutConfirmOpen}
                        onClose={() => setIsLogoutConfirmOpen(false)}
                        onConfirm={handleLogout}
                        title="로그아웃"
                        message="정말 로그아웃 하시겠습니까?"
                        type="warning"
                        confirmText="로그아웃"
                        cancelText="취소"
                    />

                    {/* Global Menu Editor Modal */}
                    <MenuEditorModal isOpen={isMenuEditorOpen} onClose={() => setIsMenuEditorOpen(false)} />
                </div>

                <div className={`menu-icon ${isMobileMenuOpen ? 'active' : ''}`} onClick={toggleMobileMenu}>
                    <span className="bar"></span>
                    <span className="bar"></span>
                    <span className="bar"></span>
                </div>

                <ul className={`nav-menu ${isMobileMenuOpen ? 'active' : ''}`}>
                    {filteredMenu.map(menu => {
                        // We should search in activeMenuConfig for the group to see 'potential' items count?
                        // No, let's keep it simple. If 1 item, show as single link? 
                        // Actually, existing code force-checks `originalGroup.items.length > 1`.
                        // Let's replicate this by finding group in activeMenuConfig
                        const groupConfig = activeMenuConfig.find(m => m.id === menu.id);
                        const isDropdown = groupConfig && groupConfig.items.length > 1;

                        return (
                            <li
                                key={menu.id}
                                className={`nav-item ${isDropdown ? 'dropdown' : ''}`}
                                onMouseEnter={() => isDropdown && handleMouseEnter(menu.id)}
                                onMouseLeave={handleMouseLeave}
                            >
                                <span
                                    className={`nav-links ${isDropdown ? 'dropdown-toggle' : ''} ${activeDropdown === menu.id ? 'active' : ''}`}
                                    onClick={() => isDropdown ? toggleDropdown(menu.id) : handleLaunch(menu.items[0].id)}
                                >
                                    {menu.icon} {menu.group}
                                </span>
                                {isDropdown && (
                                    <ul className={`dropdown-menu ${activeDropdown === menu.id ? 'active' : ''}`}>
                                        {menu.items.map(item => (
                                            <li key={item.id}>
                                                <span onClick={() => handleLaunch(item.id)}>{item.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    })}

                    {/* [NEW] Mobile User Info & Logout Section */}
                    {isMobileMenuOpen && user && (
                        <li className="nav-item mobile-user-section">
                            <div className="mobile-user-info">
                                <div className="user-text">
                                    <span className="username">👤 {user.username}</span>
                                    <span className={`role-badge ${user.role === 'admin' ? 'admin' : ''}`}>
                                        {user.role === 'admin' ? 'ADMIN' : 'USER'}
                                    </span>
                                </div>
                                <button className="mobile-logout-btn" onClick={() => setIsLogoutConfirmOpen(true)}>
                                    🔒 로그아웃
                                </button>
                            </div>
                        </li>
                    )}
                </ul>
            </div>
        </nav>
    );
};

export default Navbar;
