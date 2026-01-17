import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import DesktopManager from './pages/DesktopManager';
import './App.css';

// 페이지 컴포넌트
import Dashboard from './pages/Dashboard';
import CompanyList from './pages/CompanyList';
import CompanyForm from './pages/CompanyForm';
// import ProductList from './pages/ProductList'; // Removed
import IntegratedProductManagement from './pages/IntegratedProductManagement';
// import CategoryList from './pages/CategoryList'; // Removed
import TradeList from './pages/TradeList';
// import DualTradeForm from './pages/DualTradeForm'; // Removed
import TradeView from './pages/TradeView';

import Statistics from './pages/Statistics';
import InventoryList from './pages/InventoryList';


import AuctionAccounts from './pages/AuctionAccounts';

import AuctionImportV2 from './pages/AuctionImportV2';
import CompanyInfo from './pages/CompanyInfo';
import MatchingPage from './pages/MatchingPage';
import CompanyBalances from './pages/CompanyBalances';

import Settings from './pages/Settings';
import WarehouseManagement from './pages/WarehouseManagement';
import MessageTestPage from './pages/MessageTestPage';
import InventoryTransferManagement from './pages/InventoryTransferManagement';
import InventoryProductionManagement from './pages/InventoryProductionManagement';
import InventoryHistory from './pages/InventoryHistory'; // [New] 재고 이력 조회
import InventoryAuditPage from './pages/InventoryAuditPage'; // [New] 재고 실사

import FloatingTradeLauncher from './pages/FloatingTradeLauncher';
import ExpenseList from './pages/ExpenseList';
import ExpenseCategoryManagement from './pages/ExpenseCategoryManagement';
import SettlementPage from './pages/SettlementPage';

import Navbar from './components/Navbar';

// Auth
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import PrivateRoute from './components/PrivateRoute';

function AppContent() {
  const location = useLocation();
  const isPopup = location.pathname.startsWith('/popup');

  if (isPopup) {
    return (
      <div className="App popup-mode">
        <Routes>
          <Route path="/popup/product-management" element={<IntegratedProductManagement />} />
        </Routes>
      </div>
    )
  }

  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<PrivateRoute />}>
          <Route path="/*" element={<DesktopManager />} />
        </Route>
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
