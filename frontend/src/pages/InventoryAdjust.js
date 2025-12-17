import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryAPI, productAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';

function InventoryAdjust() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formData, setFormData] = useState({
    product_id: '',
    adjust_quantity: 0,
    adjust_type: 'ADD',
    notes: '',
    created_by: 'admin'
  });
  const [modal, setModal] = useState({
    isOpen: false, type: 'info', title: '', message: '',
    onConfirm: () => { }, confirmText: '확인', showCancel: false
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await productAPI.getAll({ is_active: 'true' });
      setProducts(response.data.data);
    } catch (error) {
      console.error('품목 로딩 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '로딩 실패', message: '품목 목록을 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
    }
  };

  const loadProductInventory = async (productId) => {
    try {
      const response = await inventoryAPI.getByProductId(productId);
      setSelectedProduct(response.data.data);
    } catch (error) {
      console.error('재고 정보 로딩 오류:', error);
      setSelectedProduct(null);
    }
  };

  const handleProductChange = (option) => {
    const productId = option ? option.value : '';
    setFormData({ ...formData, product_id: productId });

    if (productId) {
      loadProductInventory(productId);
    } else {
      setSelectedProduct(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.product_id) {
      setModal({ isOpen: true, type: 'warning', title: '입력 오류', message: '품목을 선택하세요.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
      return;
    }

    if (!formData.adjust_quantity || parseFloat(formData.adjust_quantity) === 0) {
      setModal({ isOpen: true, type: 'warning', title: '입력 오류', message: '조정 수량을 입력하세요.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
      return;
    }

    setModal({
      isOpen: true,
      type: 'confirm',
      title: '재고 조정',
      message: `재고를 ${formData.adjust_type === 'ADD' ? '증가' : '감소'}시키시겠습니까?`,
      confirmText: '조정',
      showCancel: true,
      onConfirm: async () => {
        try {
          await inventoryAPI.adjust(formData);
          setModal({ isOpen: true, type: 'success', title: '조정 완료', message: '재고가 조정되었습니다.', confirmText: '확인', showCancel: false, onConfirm: () => navigate('/inventory') });
        } catch (error) {
          console.error('재고 조정 오류:', error);
          setModal({ isOpen: true, type: 'warning', title: '조정 실패', message: error.response?.data?.message || '재고 조정에 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
        }
      }
    });
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value || 0);
  };

  const calculateAfterQuantity = () => {
    if (!selectedProduct) return 0;

    const current = parseFloat(selectedProduct.quantity || 0);
    const adjust = parseFloat(formData.adjust_quantity || 0);

    if (formData.adjust_type === 'ADD') {
      return current + adjust;
    } else {
      return current - adjust;
    }
  };

  // 품목 옵션 변환
  const productOptions = products.map(product => ({
    value: product.id,
    label: `${product.product_name} ${product.grade ? `(${product.grade})` : ''} ${product.category_name ? `- ${product.category_name}` : ''}`
  }));

  return (
    <div className="inventory-adjust">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>⚖️ 재고 조정</h1>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: '#fff3cd', borderLeft: '4px solid #ffc107' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#856404' }}>⚠️ 주의사항</h3>
        <ul style={{ margin: '0', paddingLeft: '1.5rem', color: '#856404' }}>
          <li>재고 조정은 분실, 폐기, 실사 차이 등의 경우에만 사용하세요.</li>
          <li>일반적인 입출고는 매입/매출 전표를 통해 자동으로 반영됩니다.</li>
          <li>재고 감소 시 현재 재고보다 많은 수량을 입력할 수 없습니다.</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-row">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="required">품목 선택</label>
            <SearchableSelect
              options={productOptions}
              value={formData.product_id}
              onChange={handleProductChange}
              placeholder="품목을 검색하세요..."
              noOptionsMessage="품목 없음"
            />
          </div>
        </div>

        {selectedProduct && (
          <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: '#e7f3ff' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>현재 재고 정보</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div>
                <strong style={{ color: '#7f8c8d' }}>품목코드</strong>
                <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>{selectedProduct.product_code}</div>
              </div>
              <div>
                <strong style={{ color: '#7f8c8d' }}>현재 재고</strong>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3498db', marginTop: '0.25rem' }}>
                  {formatNumber(selectedProduct.quantity)} Box
                </div>
              </div>
              <div>
                <strong style={{ color: '#7f8c8d' }}>현재 중량</strong>
                <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>
                  {formatNumber(selectedProduct.weight)} kg
                </div>
              </div>
              <div>
                <strong style={{ color: '#7f8c8d' }}>Box당 중량</strong>
                <div style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>
                  {formatNumber(selectedProduct.box_weight)} kg
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="required">조정 구분</label>
            <select
              value={formData.adjust_type}
              onChange={(e) => setFormData({ ...formData, adjust_type: e.target.value })}
              required
            >
              <option value="ADD">재고 증가</option>
              <option value="SUBTRACT">재고 감소</option>
            </select>
          </div>
          <div className="form-group">
            <label className="required">조정 수량 (Box)</label>
            <input
              type="number"
              value={formData.adjust_quantity}
              onChange={(e) => setFormData({ ...formData, adjust_quantity: e.target.value })}
              min="0"
              step="0.01"
              required
            />
          </div>
          {selectedProduct && (
            <div className="form-group">
              <label>조정 후 재고</label>
              <div style={{
                padding: '0.6rem',
                backgroundColor: '#f8f9fa',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                color: calculateAfterQuantity() < 0 ? '#e74c3c' : '#27ae60'
              }}>
                {formatNumber(calculateAfterQuantity())} Box
              </div>
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="required">조정 사유</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows="4"
              placeholder="재고 조정 사유를 상세히 입력하세요 (예: 폐기, 분실, 실사차이 등)"
              required
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" onClick={() => navigate('/inventory')} className="btn btn-secondary">
            취소
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!selectedProduct || calculateAfterQuantity() < 0}
          >
            재고 조정
          </button>
        </div>
      </form>
      <ConfirmModal isOpen={modal.isOpen} onClose={() => setModal(prev => ({ ...prev, isOpen: false }))} onConfirm={modal.onConfirm} title={modal.title} message={modal.message} type={modal.type} confirmText={modal.confirmText} showCancel={modal.showCancel} />
    </div>
  );
}

export default InventoryAdjust;
