import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';
import ConfirmModal from './ConfirmModal';

const Navbar = ({ onLaunchApp }) => {
    const { user } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    // [NEW] Logout Confirmation Modal State
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

    // 드롭다운 메뉴 상태 관리
    const [activeDropdown, setActiveDropdown] = useState(null);

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
                    {/* 
                    <li className="nav-item">
                        <span className="nav-links" onClick={() => handleLaunch('DASHBOARD')}>
                            🏠 대시보드
                        </span>
                    </li> 
                    */}
                    {/* 기초 정보 드롭다운 */}
                    <li
                        className="nav-item dropdown"
                        onMouseEnter={() => handleMouseEnter('basicInfo')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <span
                            className={`nav-links dropdown-toggle ${activeDropdown === 'basicInfo' ? 'active' : ''}`}
                            onClick={() => toggleDropdown('basicInfo')}
                        >
                            🏗️ 기초 정보
                        </span>
                        <ul className={`dropdown-menu ${activeDropdown === 'basicInfo' ? 'active' : ''}`}>
                            <li><span onClick={() => handleLaunch('COMPANY_LIST')}>거래처 관리</span></li>
                            <li><span onClick={() => handleLaunch('PRODUCT_LIST')}>품목 관리</span></li>
                            <li><span onClick={() => handleLaunch('WAREHOUSES')}>창고 관리</span></li>
                            <li><span onClick={() => handleLaunch('EXPENSE_CATEGORIES')}>지출 관리</span></li>
                        </ul>
                    </li>

                    {/* 전표 관리 드롭다운 */}
                    <li
                        className="nav-item dropdown"
                        onMouseEnter={() => handleMouseEnter('trades')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <span
                            className={`nav-links dropdown-toggle ${activeDropdown === 'trades' ? 'active' : ''}`}
                            onClick={() => toggleDropdown('trades')}
                        >
                            📝 전표 관리
                        </span>
                        <ul className={`dropdown-menu ${activeDropdown === 'trades' ? 'active' : ''}`}>
                            <li><span onClick={() => handleLaunch('TRADE_LIST')}>전표 목록</span></li>
                            <li><span onClick={() => handleLaunch('PURCHASE')}>매입 전표 등록</span></li>
                            <li><span onClick={() => handleLaunch('SALE')}>매출 전표 등록</span></li>
                        </ul>
                    </li>

                    {/* 경매 관리 드롭다운 */}
                    <li
                        className="nav-item dropdown"
                        onMouseEnter={() => handleMouseEnter('auction')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <span
                            className={`nav-links dropdown-toggle ${activeDropdown === 'auction' ? 'active' : ''}`}
                            onClick={() => toggleDropdown('auction')}
                        >
                            🔨 경매 관리
                        </span>
                        <ul className={`dropdown-menu ${activeDropdown === 'auction' ? 'active' : ''}`}>
                            <li><span onClick={() => handleLaunch('AUCTION_IMPORT')}>낙찰 데이터</span></li>
                            <li><span onClick={() => handleLaunch('AUCTION_ACCOUNTS')}>경매 계정</span></li>
                        </ul>
                    </li>

                    {/* 재고 관리 드롭다운 */}
                    <li
                        className="nav-item dropdown"
                        onMouseEnter={() => handleMouseEnter('inventory')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <span
                            className={`nav-links dropdown-toggle ${activeDropdown === 'inventory' ? 'active' : ''}`}
                            onClick={() => toggleDropdown('inventory')}
                        >
                            📊 재고 관리
                        </span>
                        <ul className={`dropdown-menu ${activeDropdown === 'inventory' ? 'active' : ''}`}>
                            <li><span onClick={() => handleLaunch('INVENTORY_LIST')}>재고 현황</span></li>
                            <li><span onClick={() => handleLaunch('INVENTORY_QUICK')}>재고 현황 (Quick)</span></li>
                            <li><span onClick={() => handleLaunch('INVENTORY_TRANSFER')}>재고 이동</span></li>
                            <li><span onClick={() => handleLaunch('INVENTORY_PRODUCTION')}>재고 작업</span></li>
                            <li><span onClick={() => handleLaunch('INVENTORY_PRODUCTION_HISTORY')}>재고 작업 이력</span></li>
                            <li><span onClick={() => handleLaunch('MATCHING')}>마감 (매칭)</span></li>
                            <li><span onClick={() => handleLaunch('INVENTORY_HISTORY')}>재고 이력</span></li>
                            <li><span onClick={() => handleLaunch('INVENTORY_AUDIT')}>재고 실사</span></li>


                        </ul>
                    </li>

                    {/* 수금/지급 드롭다운 */}
                    <li
                        className="nav-item dropdown"
                        onMouseEnter={() => handleMouseEnter('payment')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <span
                            className={`nav-links dropdown-toggle ${activeDropdown === 'payment' ? 'active' : ''}`}
                            onClick={() => toggleDropdown('payment')}
                        >
                            💰 수금/지급
                        </span>
                        <ul className={`dropdown-menu ${activeDropdown === 'payment' ? 'active' : ''}`}>
                            <li><span onClick={() => handleLaunch('COMPANY_BALANCES')}>거래처 잔고</span></li>
                            <li><span onClick={() => handleLaunch('EXPENSES')}>지출 내역</span></li>
                        </ul>
                    </li>

                    {/* 경영/정산 드롭다운 */}
                    <li
                        className="nav-item dropdown"
                        onMouseEnter={() => handleMouseEnter('management')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <span
                            className={`nav-links dropdown-toggle ${activeDropdown === 'management' ? 'active' : ''}`}
                            onClick={() => toggleDropdown('management')}
                        >
                            💼 경영/정산
                        </span>
                        <ul className={`dropdown-menu ${activeDropdown === 'management' ? 'active' : ''}`}>
                            <li><span onClick={() => handleLaunch('SETTLEMENT')}>정산 리포트</span></li>
                            <li><span onClick={() => handleLaunch('SETTLEMENT_HISTORY')}>정산 이력 조회</span></li>
                        </ul>
                    </li>

                    <li className="nav-item">
                        <span className="nav-links" onClick={() => handleLaunch('STATISTICS')}>
                            📈 통계
                        </span>
                    </li>


                    {/* 설정 드롭다운 */}
                    <li
                        className="nav-item dropdown"
                        onMouseEnter={() => handleMouseEnter('settings')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <span
                            className={`nav-links dropdown-toggle ${activeDropdown === 'settings' ? 'active' : ''}`}
                            onClick={() => toggleDropdown('settings')}
                        >
                            ⚙️ 설정
                        </span>
                        <ul className={`dropdown-menu ${activeDropdown === 'settings' ? 'active' : ''}`}>
                            <li><span onClick={() => handleLaunch('SETTINGS')}>시스템 설정</span></li>

                            <li><span onClick={() => handleLaunch('COMPANY_INFO')}>본사 정보</span></li>
                            <li><span onClick={() => handleLaunch('USER_MANAGEMENT')}>사용자/직원 관리</span></li>
                            <li><span onClick={() => handleLaunch('MESSAGE_TEST')}>시스템 테스트</span></li>
                        </ul>
                    </li>

                </ul>
            </div>
        </nav>
    );
};

export default Navbar;
