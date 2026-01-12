import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import ConfirmModal from './ConfirmModal';
import './Navbar.css';
import { MENU_CONFIG } from '../config/menuConfig';

const Navbar = ({ onLaunchApp }) => {
    const { user } = useAuth();
    const { hasPermission } = usePermission();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    // [NEW] Logout Confirmation Modal State
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

    // 드롭다운 메뉴 상태 관리
    const [activeDropdown, setActiveDropdown] = useState(null);

    // [RBAC] Filter Menu based on Permissions
    const filteredMenu = MENU_CONFIG.map(group => {
        const visibleItems = group.items.filter(item => hasPermission(item.id, 'READ'));
        return { ...group, items: visibleItems };
    }).filter(group => group.items.length > 0);

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
                    📊 거래명세서 관리
                </div>

                {/* [NEW] Logout Button (Visible on Desktop) */}
                <div className="navbar-actions" style={{ position: 'absolute', right: '2rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* [NEW] User Display */}
                    {user && (
                        <div style={{ color: 'white', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                    <button
                        onClick={() => setIsLogoutConfirmOpen(true)}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.3)',
                            color: 'white',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
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
                </div>

                <div className={`menu-icon ${isMobileMenuOpen ? 'active' : ''}`} onClick={toggleMobileMenu}>
                    <span className="bar"></span>
                    <span className="bar"></span>
                    <span className="bar"></span>
                </div>

                <ul className={`nav-menu ${isMobileMenuOpen ? 'active' : ''}`}>
                    {filteredMenu.map(menu => {
                        // [RBAC Fix] Check original item count to decide if it should be a dropdown
                        const originalGroup = MENU_CONFIG.find(m => m.id === menu.id);
                        const isDropdown = originalGroup && originalGroup.items.length > 1;

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
                </ul>
            </div>
        </nav>
    );
};

export default Navbar;
