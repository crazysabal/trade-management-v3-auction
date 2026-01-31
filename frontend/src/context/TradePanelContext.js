/**
 * TradePanelContext - TradePanel 상태 관리 Context
 * 
 * Phase 1: 기초 데이터 (companies, products, warehouses, paymentMethods)
 * - 여러 TradePanel 인스턴스에서 공유 가능
 * - 데이터 로딩을 한 번만 수행
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { companyAPI, productAPI, warehousesAPI, settingsAPI } from '../services/api';

// Context 생성
const TradePanelContext = createContext(null);

/**
 * TradePanelProvider - 기초 데이터 제공자
 * App 레벨 또는 필요한 상위 컴포넌트에서 감싸서 사용
 */
export function TradePanelProvider({ children }) {
    // 기초 데이터 상태
    const [baseDataLoaded, setBaseDataLoaded] = useState(false);
    const [companies, setCompanies] = useState({ suppliers: [], customers: [] });
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    /**
     * 기초 데이터 로드 (거래처 유형별로 분리 로드)
     */
    const loadBaseData = useCallback(async () => {
        try {
            const [suppliersRes, customersRes, productsRes, warehousesRes] = await Promise.all([
                companyAPI.getAll({ is_active: 'true', type: 'SUPPLIER' }),
                companyAPI.getAll({ is_active: 'true', type: 'CUSTOMER' }),
                productAPI.getAll({ is_active: 'true' }),
                warehousesAPI.getAll()
            ]);

            setCompanies({
                suppliers: suppliersRes.data.data || [],
                customers: customersRes.data.data || []
            });
            setProducts(productsRes.data.data || []);
            setWarehouses(warehousesRes.data.data || []);

            // 결제 방법 로드
            try {
                const methodsRes = await settingsAPI.getPaymentMethods({ is_active: true });
                if (methodsRes.data.success) {
                    setPaymentMethods(methodsRes.data.data || []);
                }
            } catch (err) {
                console.error('결제 방법 로딩 오류:', err);
            }

            setBaseDataLoaded(true);
        } catch (error) {
            console.error('기초 데이터 로딩 오류:', error);
        }
    }, []);

    /**
     * 데이터 새로고침 (품목/거래처 변경 시)
     */
    const refreshBaseData = useCallback(() => {
        loadBaseData();
    }, [loadBaseData]);

    // 초기 로드
    useEffect(() => {
        loadBaseData();
    }, [loadBaseData]);

    // 전역 데이터 변경 이벤트 수신
    useEffect(() => {
        const handleRefresh = () => refreshBaseData();
        window.addEventListener('PRODUCT_DATA_CHANGED', handleRefresh);
        window.addEventListener('COMPANY_DATA_CHANGED', handleRefresh);
        return () => {
            window.removeEventListener('PRODUCT_DATA_CHANGED', handleRefresh);
            window.removeEventListener('COMPANY_DATA_CHANGED', handleRefresh);
        };
    }, [refreshBaseData]);

    const value = {
        // 상태
        baseDataLoaded,
        companies,
        products,
        warehouses,
        paymentMethods,
        // 액션
        refreshBaseData,
        // 헬퍼: 거래처 유형별 조회
        getCompanies: (isPurchase) => isPurchase ? companies.suppliers : companies.customers,
        // 헬퍼: 기본 창고 조회
        getDefaultWarehouse: () => warehouses.find(w => w.is_default)
    };

    return (
        <TradePanelContext.Provider value={value}>
            {children}
        </TradePanelContext.Provider>
    );
}

/**
 * useTradePanelContext - Context 사용 훅
 */
export function useTradePanelContext() {
    const context = useContext(TradePanelContext);
    if (!context) {
        throw new Error('useTradePanelContext must be used within TradePanelProvider');
    }
    return context;
}

/**
 * useTradePanelContextOptional - Context 선택적 사용 훅
 * Provider 없이도 동작 (fallback으로 null 반환)
 */
export function useTradePanelContextOptional() {
    return useContext(TradePanelContext);
}

export default TradePanelContext;
