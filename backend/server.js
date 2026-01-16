const express = require('express'); // Force restart for revert feature - 2026-01-03 11:05
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS 설정
// 미들웨어
app.use(cors({
}));
app.use(express.json());
app.get('/', (req, res) => {
  res.send('Backend Server is Running');
});
app.use(express.urlencoded({ extended: true }));

// 라우터
const authRouter = require('./routes/auth'); // Moved and assigned to variable
const rolesRouter = require('./routes/roles'); // RBAC Route
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
const inventoryAuditRouter = require('./routes/inventoryAudit');

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
app.use('/api/inventory-audit', inventoryAuditRouter);
app.use('/api/auth', require('./routes/auth')); // 인증 라우터 추가
app.use('/api/users', require('./routes/users')); // 사용자 관리 라우터 추가
app.use('/api/roles', rolesRouter); // RBAC 역할 관리 라우터 추가

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

// [Update] 서버 시작 시 자동 마이그레이션 실행
const migrationRunner = require('./utils/MigrationRunner');

async function startServer() {
  try {
    await migrationRunner.run();

    app.listen(PORT, () => {
      console.log('---------------------------------');
      console.log(`Server running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
      console.log('---------------------------------');
    });
  } catch (error) {
    console.error('❌ 서버 시작 실패 (마이그레이션 오류):', error.message);
    process.exit(1);
  }
}

startServer();
