import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  reorder: (data) => api.put('/products/reorder', data),
};

// 품목분류 API
export const categoryAPI = {
  getAll: (params) => api.get('/categories', { params }),
  getById: (id) => api.get(`/categories/${id}`),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
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
  getCompanyTodaySummary: (companyId, tradeType, tradeDate) => 
    api.get(`/payments/company-today-summary/${companyId}`, { params: { trade_type: tradeType, trade_date: tradeDate } }),
  
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

export default api;
