import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';

// 페이지 컴포넌트
import Dashboard from './pages/Dashboard';
import CompanyList from './pages/CompanyList';
import CompanyForm from './pages/CompanyForm';
import ProductList from './pages/ProductList';
import ProductForm from './pages/ProductForm';
import CategoryList from './pages/CategoryList';
import TradeList from './pages/TradeList';
import DualTradeForm from './pages/DualTradeForm';
import TradeView from './pages/TradeView';
import Statistics from './pages/Statistics';
import InventoryList from './pages/InventoryList';
import InventoryTransactions from './pages/InventoryTransactions';
import InventoryAdjust from './pages/InventoryAdjust';
import AuctionAccounts from './pages/AuctionAccounts';
import AuctionImport from './pages/AuctionImport';
import CompanyInfo from './pages/CompanyInfo';
import MatchingPage from './pages/MatchingPage';
import CompanyBalances from './pages/CompanyBalances';
import SaleFromInventory from './pages/SaleFromInventory';
import Settings from './pages/Settings';

function App() {
  // 열린 메뉴 상태 관리
  const [openMenus, setOpenMenus] = useState({});

  const toggleMenu = (menuName) => {
    setOpenMenus(prev => ({
      ...prev,
      [menuName]: !prev[menuName]
    }));
  };

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="App">
        <aside className="sidebar">
          <div className="sidebar-header">
            <Link to="/" className="sidebar-logo">
              📊 거래명세서 관리
            </Link>
          </div>
          <nav className="sidebar-nav">
            <ul className="sidebar-menu">
              <li className="sidebar-item">
                <Link to="/" className="sidebar-link">
                  <span className="sidebar-icon">🏠</span>
                  <span>대시보드</span>
                </Link>
              </li>
              <li className="sidebar-item">
                <Link to="/companies" className="sidebar-link">
                  <span className="sidebar-icon">🏢</span>
                  <span>거래처 관리</span>
                </Link>
              </li>
              <li className={`sidebar-item sidebar-dropdown ${openMenus.product ? 'open' : ''}`}>
                <span className="sidebar-link sidebar-dropdown-toggle" onClick={() => toggleMenu('product')}>
                  <span className="sidebar-icon">📦</span>
                  <span>품목 관리</span>
                  <span className="sidebar-arrow">▼</span>
                </span>
                <ul className="sidebar-submenu">
                  <li><Link to="/products">품목 목록</Link></li>
                  <li><Link to="/categories">품목분류 관리</Link></li>
                </ul>
              </li>
              <li className={`sidebar-item sidebar-dropdown ${openMenus.trades ? 'open' : ''}`}>
                <span className="sidebar-link sidebar-dropdown-toggle" onClick={() => toggleMenu('trades')}>
                  <span className="sidebar-icon">📝</span>
                  <span>전표 관리</span>
                  <span className="sidebar-arrow">▼</span>
                </span>
                <ul className="sidebar-submenu">
                  <li><Link to="/trades">전표 목록</Link></li>
                  <li><Link to="/trades/new">전표 등록</Link></li>
                  <li><Link to="/trades/sale-from-inventory">전표 등록(재고 기반)</Link></li>
                </ul>
              </li>
              <li className={`sidebar-item sidebar-dropdown ${openMenus.auction ? 'open' : ''}`}>
                <span className="sidebar-link sidebar-dropdown-toggle" onClick={() => toggleMenu('auction')}>
                  <span className="sidebar-icon">🔨</span>
                  <span>경매 관리</span>
                  <span className="sidebar-arrow">▼</span>
                </span>
                <ul className="sidebar-submenu">
                  <li><Link to="/auction/import">낙찰 데이터 가져오기</Link></li>
                  <li><Link to="/auction/accounts">경매 계정 관리</Link></li>
                </ul>
              </li>
              <li className={`sidebar-item sidebar-dropdown ${openMenus.inventory ? 'open' : ''}`}>
                <span className="sidebar-link sidebar-dropdown-toggle" onClick={() => toggleMenu('inventory')}>
                  <span className="sidebar-icon">📊</span>
                  <span>재고 관리</span>
                  <span className="sidebar-arrow">▼</span>
                </span>
                <ul className="sidebar-submenu">
                  <li><Link to="/inventory">재고 현황</Link></li>
                  <li><Link to="/matching">마감 (매칭)</Link></li>
                  <li><Link to="/inventory/transactions">재고 수불부</Link></li>
                  <li><Link to="/inventory/adjust">재고 조정</Link></li>
                </ul>
              </li>
              <li className={`sidebar-item sidebar-dropdown ${openMenus.payment ? 'open' : ''}`}>
                <span className="sidebar-link sidebar-dropdown-toggle" onClick={() => toggleMenu('payment')}>
                  <span className="sidebar-icon">💰</span>
                  <span>수금/지급</span>
                  <span className="sidebar-arrow">▼</span>
                </span>
                <ul className="sidebar-submenu">
                  <li><Link to="/payments/balances">거래처 잔고</Link></li>
                </ul>
              </li>
              <li className="sidebar-item">
                <Link to="/statistics" className="sidebar-link">
                  <span className="sidebar-icon">📈</span>
                  <span>통계</span>
                </Link>
              </li>
              <li className={`sidebar-item sidebar-dropdown ${openMenus.settings ? 'open' : ''}`}>
                <span className="sidebar-link sidebar-dropdown-toggle" onClick={() => toggleMenu('settings')}>
                  <span className="sidebar-icon">⚙️</span>
                  <span>설정</span>
                  <span className="sidebar-arrow">▼</span>
                </span>
                <ul className="sidebar-submenu">
                  <li><Link to="/settings">시스템 설정</Link></li>
                  <li><Link to="/settings/company-info">본사 정보</Link></li>
                </ul>
              </li>
            </ul>
          </nav>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/companies" element={<CompanyList />} />
            <Route path="/companies/new" element={<CompanyForm />} />
            <Route path="/companies/edit/:id" element={<CompanyForm />} />
            <Route path="/products" element={<ProductList />} />
            <Route path="/products/new" element={<ProductForm />} />
            <Route path="/products/edit/:id" element={<ProductForm />} />
            <Route path="/categories" element={<CategoryList />} />
            <Route path="/trades" element={<TradeList />} />
            <Route path="/trades/new" element={<DualTradeForm />} />
            <Route path="/trades/edit/:id" element={<DualTradeForm />} />
            <Route path="/trades/view/:id" element={<TradeView />} />
            <Route path="/trades/sale-from-inventory" element={<SaleFromInventory />} />
            <Route path="/inventory" element={<InventoryList />} />
            <Route path="/matching" element={<MatchingPage />} />
            <Route path="/inventory/transactions" element={<InventoryTransactions />} />
            <Route path="/inventory/adjust" element={<InventoryAdjust />} />
            <Route path="/auction/accounts" element={<AuctionAccounts />} />
            <Route path="/auction/import" element={<AuctionImport />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/payments/balances" element={<CompanyBalances />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/company-info" element={<CompanyInfo />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
