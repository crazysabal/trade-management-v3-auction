import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';

// Context
import { AuthProvider } from './context/AuthContext';
import { MenuConfigProvider } from './context/MenuConfigContext';
import { TradePanelProvider } from './context/TradePanelContext';

// 페이지 컴포넌트
import DesktopManager from './pages/DesktopManager';
import IntegratedProductManagement from './pages/IntegratedProductManagement';
import LoginPage from './pages/LoginPage';

// 컴포넌트
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
      <MenuConfigProvider>
        <TradePanelProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppContent />
          </Router>
        </TradePanelProvider>
      </MenuConfigProvider>
    </AuthProvider>
  );
}

export default App;
