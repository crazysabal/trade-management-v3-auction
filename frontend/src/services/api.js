import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터: 토큰 자동 추가
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터: 401 처리
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // 토큰 만료 또는 인증 실패 시 로그아웃 처리
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 거래처 API
export const companyAPI = {
  getAll: (params) => api.get('/companies', { params }),
  getById: (id) => api.get(`/companies/${id}`),
  create: (data) => api.post('/companies', data),
  update: (id, data) => api.put(`/companies/${id}`, data),
  delete: (id) => api.delete(`/companies/${id}`),
  reorder: (data) => api.put('/companies/reorder', data),
  uploadPreview: (formData) => api.post('/companies/upload-preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  bulkImport: (data) => api.post('/companies/bulk-import', data),
};

// 품목 API
export const productAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  getNextCode: () => api.get('/products/next-code'),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  deleteGroup: (productName) => api.delete('/products/group', { params: { product_name: productName } }),
  reorder: (data) => api.put('/products/reorder', data),
};

// 설정 API
export const settingsAPI = {
  getPaymentMethods: (params) => api.get('/settings/payment-methods', { params }),
  addPaymentMethod: (data) => api.post('/settings/payment-methods', data),
  updatePaymentMethod: (id, data) => api.put(`/settings/payment-methods/${id}`, data),
  reorderPaymentMethods: (items) => api.put('/settings/payment-methods/reorder', { items }),
};

// 품목분류 API
export const categoryAPI = {
  getAll: (params) => api.get('/categories', { params }),
  getById: (id) => api.get(`/categories/${id}`),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
  reorder: (data) => api.put('/categories/reorder', data),
};


// 거래전표 API
export const tradeAPI = {
  getAll: (params) => api.get('/trades', { params }),
  getById: (id) => api.get(`/trades/${id}`),
  create: (data) => api.post('/trades', data),
  update: (id, data) => api.put(`/trades/${id}`, data),
  delete: (id) => api.delete(`/trades/${id}`),
  getStatsByCompany: (params) => api.get('/trades/stats/by-company', { params }),
  createSaleFromInventory: (data) => api.post('/trades/sale-from-inventory', data),
  checkDuplicate: (params) => api.get('/trades/check-duplicate', { params }),
};

// 재고 관리 API (기존 - 품목별 합산)
export const inventoryAPI = {
  getAll: (params) => api.get('/inventory', { params }),
  getByProductId: (productId) => api.get(`/inventory/product/${productId}`),
  getTransactions: (params) => api.get('/inventory/transactions', { params }),
  adjust: (data) => api.post('/inventory/adjust', data),
  getStats: () => api.get('/inventory/stats'),
};

// 매입 건별 재고 API (신규)
export const purchaseInventoryAPI = {
  getAll: (params) => api.get('/purchase-inventory', { params }),
  getById: (id) => api.get(`/purchase-inventory/${id}`),
  getSummaryByProduct: () => api.get('/purchase-inventory/summary/by-product'),
  getAvailable: (productId) => api.get(`/purchase-inventory/available/${productId}`),
  getTransactions: (params) => api.get('/purchase-inventory/transactions', { params }),
  reorder: (orderedIds) => api.put('/purchase-inventory/reorder', { orderedIds }),
};

// 매출-매입 매칭 API (신규)
export const matchingAPI = {
  getPendingSales: (params) => api.get('/matching/pending-sales', { params }),
  getAllSales: (params) => api.get('/matching/all-sales', { params }),  // 전체 매출 전표 (매칭 완료 포함)
  getStatus: () => api.get('/matching/status'),
  match: (data) => api.post('/matching', data),
  autoMatch: (data) => api.post('/matching/auto', data),
  matchTrade: (data) => api.post('/matching/trade', data),  // 전표 단위 수동 매칭
  getTradeInventory: (tradeId) => api.get(`/matching/trade/${tradeId}/inventory`),  // 전표 품목별 재고 조회
  cancel: (id) => api.delete(`/matching/${id}`),
};

// 경매 크롤링 API
export const auctionAPI = {
  // 계정 관리
  getAccounts: () => api.get('/auction/accounts'),
  saveAccount: (data) => api.post('/auction/accounts', data),
  updateAccount: (id, data) => api.put(`/auction/accounts/${id}`, data),

  // 크롤링 실행
  crawl: (data) => api.post('/auction/crawl', data),

  // 원본 데이터 조회
  getRawData: (params) => api.get('/auction/raw-data', { params }),

  // 원본 데이터 삭제
  deleteRawData: (id) => api.delete(`/auction/raw-data/${id}`),
  deleteRawDataBulk: (ids) => api.delete('/auction/raw-data', { data: { ids } }),

  // 품목 매칭
  getMappings: () => api.get('/auction/mappings'),
  saveMapping: (data) => api.post('/auction/mappings', data),
};

// 본사 정보 API
export const companyInfoAPI = {
  get: () => api.get('/company-info'),
  update: (data) => api.put('/company-info', data),
};

// 입금/출금 및 잔고 관리 API
export const paymentAPI = {
  // 잔고 조회
  getBalances: (params) => api.get('/payments/balances', { params }),
  getBalanceDetail: (companyId) => api.get(`/payments/balances/${companyId}`),

  // 입금/출금 내역
  getTransactions: (params) => api.get('/payments/transactions', { params }),
  createTransaction: (data) => api.post('/payments/transactions', data),
  createTransactionWithAllocation: (data) => api.post('/payments/transactions-with-allocation', data),
  deleteTransaction: (id) => api.delete(`/payments/transactions/${id}`),

  // 미결제 전표 조회
  getUnpaidTrades: (companyId, tradeType) => api.get(`/payments/unpaid-trades/${companyId}`, { params: { trade_type: tradeType } }),

  // 거래처 원장
  getLedger: (companyId, params) => api.get(`/payments/ledger/${companyId}`, { params }),

  // 거래처 오늘 거래 현황 (전표 등록 화면용)
  getCompanyTodaySummary: (companyId, tradeType, tradeDate, excludeTradeId) =>
    api.get(`/payments/company-today-summary/${companyId}`, { params: { trade_type: tradeType, trade_date: tradeDate, exclude_trade_id: excludeTradeId } }),

  // 전표와 연결된 입출금 조회
  getByTrade: (tradeId) => api.get(`/payments/by-trade/${tradeId}`),

  // 입출금 수정
  updateTransaction: (id, data) => api.put(`/payments/transaction/${id}`, data),

  // 입출금 삭제 (잔고 복원 포함)
  deleteLinkedTransaction: (id) => api.delete(`/payments/transaction/${id}`),

  // 잔고 재계산 (정합성 복구용)
  recalculateBalance: (companyId) => api.post(`/payments/recalculate-balance/${companyId}`),
  recalculateAllBalances: () => api.post('/payments/recalculate-all-balances'),
};

// 창고 관리 API
export const warehousesAPI = {
  getAll: (params) => api.get('/warehouses', { params }),
  create: (data) => api.post('/warehouses', data),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  reorder: (orderedIds) => api.put('/warehouses/reorder', { orderedIds }),
  delete: (id) => api.delete(`/warehouses/${id}`),
};

// 재고 이동 API
export const inventoryTransferAPI = {
  transfer: (data) => api.post('/inventory/transfer', data),
};


export const inventoryAdjustmentAPI = {
  create: (data) => api.post('/inventory-adjustment', data),
};

export const inventoryProductionAPI = {
  create: (data) => api.post('/inventory-production', data),
  cancel: (id) => api.delete(`/inventory-production/${id}`),
  getRecent: () => api.get('/inventory-production/recent'), // @deprecated
  getHistory: (params) => api.get('/inventory-production', { params }), // 전체 이력 조회
  getDetail: (id) => api.get(`/inventory-production/${id}`), // 상세 조회 (재료 포함)
};

// 지출 관리 API
export const expenseAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  getById: (id) => api.get(`/expenses/${id}`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// 지출 항목 API
export const expenseCategoryAPI = {
  getAll: (params) => api.get('/expense-categories', { params }),
  getById: (id) => api.get(`/expense-categories/${id}`),
  create: (data) => api.post('/expense-categories', data),
  update: (id, data) => api.put(`/expense-categories/${id}`, data),
  delete: (id) => api.delete(`/expense-categories/${id}`),
  reorder: (data) => api.put('/expense-categories/reorder', data),
};

// 재고 실사 API
export const inventoryAuditAPI = {
  getAll: (params) => api.get('/inventory-audit', { params }),
  getById: (id) => api.get(`/inventory-audit/${id}`),
  start: (data) => api.post('/inventory-audit/start', data),
  updateItems: (id, items) => api.put(`/inventory-audit/${id}/items`, { items }),
  finalize: (id) => api.post(`/inventory-audit/${id}/finalize`),
  revert: (id) => api.post(`/inventory-audit/${id}/revert`),
  cancel: (id) => api.post(`/inventory-audit/${id}/cancel`),
  delete: (id) => api.delete(`/inventory-audit/${id}`),
};

export default api;
