import React, { useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import TradeDeleteConfirmModal from '../components/TradeDeleteConfirmModal';
import WarehouseModal from '../components/WarehouseModal';
import ExpenseFormModal from '../components/ExpenseFormModal';
import StockTransferModal from '../components/StockTransferModal';
import CompanyForm from './CompanyForm';
import ProductInputModal from '../components/Integrated/ProductInputModal';
import PaymentModal from '../components/PaymentModal';
import TradeDetailModal from '../components/TradeDetailModal';
import UserFormModal from '../components/UserFormModal';
import CategoryInputModal from '../components/Integrated/CategoryInputModal';
import InventoryAdjustmentModal from '../components/InventoryAdjustmentModal';
import InventoryPrintModal from '../components/InventoryPrintModal';
import TradePrintModal from '../components/TradePrintModal';
import ProductionDetailModal from '../components/ProductionDetailModal';

function MessageTestPage() {
    const [modal, setModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        showCancel: false,
        onConfirm: () => { }
    });

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [stockTransferModalOpen, setStockTransferModalOpen] = useState(false);
    const [companyModalOpen, setCompanyModalOpen] = useState(false);

    // Additional Modals
    const [productModalOpen, setProductModalOpen] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [tradeDetailModalOpen, setTradeDetailModalOpen] = useState(false);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
    const [inventoryPrintModalOpen, setInventoryPrintModalOpen] = useState(false);
    const [tradePrintModalOpen, setTradePrintModalOpen] = useState(false);
    const [productionDetailModalOpen, setProductionDetailModalOpen] = useState(false);

    const closeModal = () => {
        setModal(prev => ({ ...prev, isOpen: false }));
    };

    const showModal = (type, title, message, showCancel = false) => {
        setModal({
            isOpen: true,
            type,
            title,
            message,
            showCancel,
            onConfirm: () => console.log('Confirmed!'),
            onClose: closeModal
        });
    };

    const styles = {
        container: {
            padding: '2rem',
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        },
        header: {
            marginBottom: '2rem',
            borderBottom: '1px solid #eee',
            paddingBottom: '1rem'
        },
        section: {
            marginBottom: '2rem',
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
        },
        card: {
            padding: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#f8f9fa'
        },
        button: {
            marginTop: '1rem',
            padding: '0.6rem 1.2rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500',
            width: '100%',
            color: 'white',
            transition: 'opacity 0.2s'
        },
        infoBox: {
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: '#0369a1'
        }
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1>💬 공통 메시지 확인창 테스트</h1>
                <p>시스템에서 사용하는 모든 종류의 알림/확인 모달 미리보기</p>
            </header>

            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#555' }}>1. 기본 메시지 (Common Messages)</h2>
            <div style={styles.section}>
                {/* Success */}
                <div style={styles.card}>
                    <h3>Success (성공)</h3>
                    <p>작업 완료 알림</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#16a34a' }}
                        onClick={() => showModal('success', '저장 완료', '데이터가 성공적으로 저장되었습니다.')}
                    >
                        Show Success
                    </button>
                </div>

                {/* Info */}
                <div style={styles.card}>
                    <h3>Info (정보)</h3>
                    <p>일반적인 정보 알림</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#0284c7' }}
                        onClick={() => showModal('info', '안내', '새로운 버전이 업데이트되었습니다.')}
                    >
                        Show Info
                    </button>
                </div>

                {/* Warning */}
                <div style={styles.card}>
                    <h3>Warning (경고)</h3>
                    <p>주의가 필요한 알림</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#d97706' }}
                        onClick={() => showModal('warning', '입력 오류', '필수 항목을 모두 입력해주세요.')}
                    >
                        Show Warning
                    </button>
                </div>

                {/* Confirm */}
                <div style={styles.card}>
                    <h3>Confirm (확인)</h3>
                    <p>사용자 확인 필요</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#2563eb' }}
                        onClick={() => showModal('confirm', '로그아웃', '정말 로그아웃 하시겠습니까?', true)}
                    >
                        Show Confirm
                    </button>
                </div>

                {/* Delete */}
                <div style={styles.card}>
                    <h3>Delete (삭제)</h3>
                    <p>삭제 등 위험 작업 확인</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#dc2626' }}
                        onClick={() => showModal('delete', '삭제 확인', '이 항목을 영구적으로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.', true)}
                    >
                        Show Delete
                    </button>
                </div>
            </div>

            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#555', marginTop: '3rem' }}>2. 특수 확인창 (Specialized Confirmations)</h2>
            <div style={styles.section}>
                {/* Trade Delete Confirm */}
                <div style={styles.card}>
                    <h3>전표 삭제 확인</h3>
                    <p>강력한 삭제 확인 (입력 요구)</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#c0392b' }}
                        onClick={() => setDeleteModalOpen(true)}
                    >
                        Show Trade Delete
                    </button>
                </div>
            </div>

            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#555', marginTop: '3rem' }}>3. 기능성 모달 (Functional Modals)</h2>
            <div style={styles.section}>
                {/* Warehouse */}
                <div style={styles.card}>
                    <h3>창고 관리 모달</h3>
                    <p>창고 추가/수정 폼</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#8e44ad' }}
                        onClick={() => setWarehouseModalOpen(true)}
                    >
                        Open Warehouse
                    </button>
                </div>

                {/* Expense */}
                <div style={styles.card}>
                    <h3>지출 내역 모달</h3>
                    <p>지출 등록 폼</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#27ae60' }}
                        onClick={() => setExpenseModalOpen(true)}
                    >
                        Open Expense
                    </button>
                </div>

                {/* Stock Transfer */}
                <div style={styles.card}>
                    <h3>재고 이동 모달</h3>
                    <p>재고 이동 (Mock Data)</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#e67e22' }}
                        onClick={() => setStockTransferModalOpen(true)}
                    >
                        Open Transfer
                    </button>
                </div>

                {/* Company Form */}
                <div style={styles.card}>
                    <h3>거래처 폼 (Wrapped)</h3>
                    <p>ConfirmModal 내부에 렌더링</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#2980b9' }}
                        onClick={() => setCompanyModalOpen(true)}
                    >
                        Open Company (New)
                    </button>
                </div>


                {/* Product Input */}
                <div style={styles.card}>
                    <h3>품목 등록 모달</h3>
                    <p>통합 품목 관리 (Integrated)</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#8e44ad' }}
                        onClick={() => setProductModalOpen(true)}
                    >
                        Open Product
                    </button>
                </div>

                {/* Payment Modal */}
                <div style={styles.card}>
                    <h3>입/출금 모달</h3>
                    <p>결제 및 미수금 관리 UI</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#2c3e50' }}
                        onClick={() => setPaymentModalOpen(true)}
                    >
                        Open Payment
                    </button>
                </div>

                {/* Trade Detail Modal */}
                <div style={styles.card}>
                    <h3>전표 상세 모달</h3>
                    <p>전표 ID 조회 (Mock ID: 1)</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#34495e' }}
                        onClick={() => setTradeDetailModalOpen(true)}
                    >
                        Open Detail
                    </button>
                </div>

                {/* User Form Modal */}
                <div style={styles.card}>
                    <h3>사용자 추가 모달</h3>
                    <p>사용자/직원 등록 폼</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#1abc9c' }}
                        onClick={() => setUserModalOpen(true)}
                    >
                        Open User Form
                    </button>
                </div>

                {/* Category Input */}
                <div style={styles.card}>
                    <h3>분류 관리 모달</h3>
                    <p>카테고리 추가/수정</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#9b59b6' }}
                        onClick={() => setCategoryModalOpen(true)}
                    >
                        Open Category
                    </button>
                </div>

                {/* Inventory Adjustment */}
                <div style={styles.card}>
                    <h3>재고 조정/폐기</h3>
                    <p>재고 수량 조정 (Loss/Disposal)</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#e74c3c' }}
                        onClick={() => setAdjustmentModalOpen(true)}
                    >
                        Open Adjustment
                    </button>
                </div>
            </div>

            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#555', marginTop: '3rem' }}>4. 인쇄 및 상세 (Print & Details)</h2>
            <div style={styles.section}>
                {/* Trade Print */}
                <div style={styles.card}>
                    <h3>전표 인쇄 미리보기</h3>
                    <p>거래명세서 출력</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#34495e' }}
                        onClick={() => setTradePrintModalOpen(true)}
                    >
                        Open Trade Print
                    </button>
                </div>

                {/* Inventory Print */}
                <div style={styles.card}>
                    <h3>재고 목록 인쇄</h3>
                    <p>재고 현황 출력 (Mock Data)</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#34495e' }}
                        onClick={() => setInventoryPrintModalOpen(true)}
                    >
                        Open Inv. Print
                    </button>
                </div>

                {/* Production Detail */}
                <div style={styles.card}>
                    <h3>생산 상세 조회</h3>
                    <p>생산/소분 기록 상세</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#34495e' }}
                        onClick={() => setProductionDetailModalOpen(true)}
                    >
                        Open Prod. Detail
                    </button>
                </div>
            </div>

            <div style={styles.infoBox}>
                <strong>💡 참고:</strong>
                <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                    일부 모달(전표 상세, 입출금)은 실제 데이터 ID가 없어 빈 화면이나 오류, 또는 기본 UI만 표시될 수 있습니다.
                </p>
            </div>

            <ConfirmModal
                isOpen={modal.isOpen}
                onClose={closeModal}
                onConfirm={modal.onConfirm}
                title={modal.title}
                message={modal.message}
                type={modal.type}
                showCancel={modal.showCancel}
            />

            <TradeDeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={() => {
                    console.log("Deleted!");
                    setDeleteModalOpen(false);
                    showModal('success', '삭제 완료', '항목이 삭제되었습니다.');
                }}
                title="전표 삭제 확인"
                tradeDate="2024-03-25"
                tradeType="SALE"
                tradePartnerName="(주)행복유통"
            />

            {/* Warehouse Modal Test */}
            <WarehouseModal
                isOpen={warehouseModalOpen}
                onClose={() => setWarehouseModalOpen(false)}
                onSubmit={(data) => {
                    console.log('Warehouse Data:', data);
                    setWarehouseModalOpen(false);
                    showModal('success', '저장 완료', `창고 '${data.name}' 저장됨`);
                }}
            />

            {/* Expense Modal Test */}
            <ExpenseFormModal
                isOpen={expenseModalOpen}
                onClose={() => setExpenseModalOpen(false)}
                onSuccess={() => {
                    showModal('success', '저장 완료', '지출 내역이 저장되었습니다.');
                }}
            />

            {/* Stock Transfer Modal Test (Mock Data) */}
            <StockTransferModal
                isOpen={stockTransferModalOpen}
                onClose={() => setStockTransferModalOpen(false)}
                inventory={{
                    id: 999,
                    product_name: '테스트 상품 A',
                    warehouse_name: '제1창고',
                    remaining_quantity: 100
                }}
                onSuccess={() => {
                    showModal('success', '이동 완료', '재고가 이동되었습니다.');
                }}
            />

            {/* Company Form Modal Test */}
            <ConfirmModal
                isOpen={companyModalOpen}
                onClose={() => setCompanyModalOpen(false)}
                title="거래처 등록 (Test)"
                showConfirm={false}
                showCancel={false}
                width="90%"
                maxWidth="1000px"
                hideHeader={true}
                padding="0"
                fullContent={true}
            >
                {companyModalOpen && (
                    <CompanyForm
                        onSuccess={() => {
                            setCompanyModalOpen(false);
                            showModal('success', '등록 완료', '거래처가 등록되었습니다.');
                        }}
                        onCancel={() => setCompanyModalOpen(false)}
                        isModal={true}
                    />
                )}
            </ConfirmModal>
            {/* Product Modal Test */}
            <ProductInputModal
                isOpen={productModalOpen}
                onClose={() => setProductModalOpen(false)}
                onSuccess={() => {
                    showModal('success', '저장 완료', '품목이 저장되었습니다.');
                }}
            />

            {/* Payment Modal Test (No ID, UI check only) */}
            <PaymentModal
                isOpen={paymentModalOpen}
                onClose={() => setPaymentModalOpen(false)}
                onConfirm={(data) => {
                    setPaymentModalOpen(false);
                    showModal('success', '결제 처리', `금액: ${data.displayAmount || data.amount}원, 방법: ${data.payment_method}`);
                }}
                companyName="테스트 거래처"
                tradeDate="2024-03-25"
                companySummary={{
                    previous_balance: 100000,
                    today_total: 50000,
                    today_payment: 0,
                    final_balance: 150000
                }}
            />

            {/* Trade Detail Modal Test (Mock ID 1 - will likely fail gracefully if not found) */}
            <TradeDetailModal
                isOpen={tradeDetailModalOpen}
                onClose={() => setTradeDetailModalOpen(false)}
                tradeId={1}
            />


            {/* User Form Modal Test */}
            <UserFormModal
                isOpen={userModalOpen}
                onClose={() => setUserModalOpen(false)}
                onSuccess={() => {
                    showModal('success', '등록 완료', '테스트 사용자가 등록되었습니다.');
                }}
            />

            {/* Category Input Modal */}
            <CategoryInputModal
                isOpen={categoryModalOpen}
                onClose={() => setCategoryModalOpen(false)}
                parentId={null}
                onSuccess={() => showModal('success', '저장 완료', '카테고리가 저장되었습니다.')}
            />

            {/* Inventory Adjustment Modal */}
            <InventoryAdjustmentModal
                isOpen={adjustmentModalOpen}
                onClose={() => setAdjustmentModalOpen(false)}
                inventory={{
                    id: 999,
                    product_name: '테스트 사과',
                    grade: '특',
                    remaining_quantity: 50,
                    warehouse_name: '제 1창고'
                }}
                onConfirm={async (data) => {
                    console.log('Adjustment Data:', data);
                    showModal('success', '조정 완료', `유형: ${data.adjustment_type}, 수량: ${data.quantity_change}`);
                }}
            />

            {/* Trade Print Modal */}
            <TradePrintModal
                isOpen={tradePrintModalOpen}
                onClose={() => setTradePrintModalOpen(false)}
                tradeId={1}
            />

            {/* Inventory Print Modal */}
            <InventoryPrintModal
                isOpen={inventoryPrintModalOpen}
                onClose={() => setInventoryPrintModalOpen(false)}
                inventory={[
                    { id: 1, product_name: '사과', product_weight: 10, grade: '특', remaining_quantity: 100, warehouse_id: 1, sender: '김농부' },
                    { id: 2, product_name: '배', product_weight: 15, grade: '상', remaining_quantity: 50, warehouse_id: 1, sender: '이과수' },
                    { id: 3, product_name: '포도', product_weight: 5, grade: '특', remaining_quantity: 200, warehouse_id: 2, sender: '박포도' },
                ]}
                warehouses={[
                    { id: 1, name: '제 1창고' },
                    { id: 2, name: '제 2창고' }
                ]}
            />

            {/* Production Detail Modal */}
            <ProductionDetailModal
                isOpen={productionDetailModalOpen}
                onClose={() => setProductionDetailModalOpen(false)}
                productionId={1}
            />
        </div >
    );
}

export default MessageTestPage;
