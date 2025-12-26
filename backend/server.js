const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS 설정
// 미들웨어
app.use(cors({
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우터
const companiesRouter = require('./routes/companies');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const tradesRouter = require('./routes/trades');
const inventoryRouter = require('./routes/inventory');
const auctionRouter = require('./routes/auction');
const companyInfoRouter = require('./routes/companyInfo');
const purchaseInventoryRouter = require('./routes/purchaseInventory');
const matchingRouter = require('./routes/matching');
const paymentsRouter = require('./routes/payments');
const settingsRouter = require('./routes/settings');
const warehousesRouter = require('./routes/warehouses');
const inventoryTransferRouter = require('./routes/inventoryTransfer');
const inventoryAdjustmentRouter = require('./routes/inventoryAdjustment');
const inventoryProductionRouter = require('./routes/inventoryProduction'); // 신규 추가
const expenseRouter = require('./routes/expenses');
const expenseCategoryRouter = require('./routes/expenseCategories');
const settlementRouter = require('./routes/settlement');

app.use('/api/companies', companiesRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/auction', auctionRouter);
app.use('/api/company-info', companyInfoRouter);
app.use('/api/purchase-inventory', purchaseInventoryRouter);
app.use('/api/matching', matchingRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/warehouses', warehousesRouter);
app.use('/api/inventory/transfer', inventoryTransferRouter);
app.use('/api/inventory-production', inventoryProductionRouter);
app.use('/api/inventory-adjustment', inventoryAdjustmentRouter); // Fix missing mount
app.use('/api/expenses', expenseRouter);
app.use('/api/expense-categories', expenseCategoryRouter);
app.use('/api/settlement', settlementRouter);

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: '서버가 정상 작동중입니다.' });
});

// 에러 핸들링
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: '서버 내부 오류가 발생했습니다.'
  });
});

// 404 핸들링
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '요청하신 리소스를 찾을 수 없습니다.'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('---------------------------------');
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log('---------------------------------');
});
