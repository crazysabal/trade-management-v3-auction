import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { productAPI, categoryAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';

function ProductForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = !!id;

  const [categories, setCategories] = useState([]);
  const [existingProducts, setExistingProducts] = useState([]);
  const [formData, setFormData] = useState({
    product_code: '',
    product_name: '',
    grade: '',
    grades: '',
    unit: 'Box',
    category_id: '',
    weight: '',
    notes: '',
    is_active: true
  });
  const [isMultiGrade, setIsMultiGrade] = useState(false);
  const [isMultiWeight, setIsMultiWeight] = useState(false);
  const [isAddingGrade, setIsAddingGrade] = useState(false);
  const [originalProductName, setOriginalProductName] = useState('');
  const [originalWeight, setOriginalWeight] = useState('');
  const [sameNameCount, setSameNameCount] = useState(0);
  const [updateAllGrades, setUpdateAllGrades] = useState(true);
  const [updateAllWeights, setUpdateAllWeights] = useState(true);
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => { },
    confirmText: '확인',
    showCancel: false
  });

  useEffect(() => {
    loadCategories();
    loadExistingProducts();
    if (isEdit) {
      loadProduct();
    }
    // URL 파라미터에서 품목 정보 가져오기 (등급 추가 모드)
    const params = new URLSearchParams(location.search);
    const copyFrom = params.get('copyFrom');
    if (copyFrom && !isEdit) {
      loadProductToCopy(copyFrom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location.search]);

  const loadCategories = async () => {
    try {
      const response = await categoryAPI.getAll({ is_active: 'true' });
      setCategories(response.data.data);
    } catch (error) {
      console.error('품목분류 로딩 오류:', error);
    }
  };

  const loadExistingProducts = async () => {
    try {
      const response = await productAPI.getAll({});
      // 중복 제거된 품목명 목록
      const uniqueProducts = [];
      const seenNames = new Set();
      response.data.data.forEach(p => {
        if (!seenNames.has(p.product_name)) {
          seenNames.add(p.product_name);
          uniqueProducts.push(p);
        }
      });
      setExistingProducts(uniqueProducts);
    } catch (error) {
      console.error('기존 품목 로딩 오류:', error);
    }
  };

  const loadProductToCopy = async (productId) => {
    try {
      const response = await productAPI.getById(productId);
      const product = response.data.data;
      setFormData({
        ...formData,
        product_name: product.product_name,
        unit: product.unit,
        category_id: product.category_id,
        weight: product.weight ? Math.round(product.weight * 10) / 10 : '',
        notes: ''
      });
      setIsAddingGrade(true);
    } catch (error) {
      console.error('품목 복사 오류:', error);
    }
  };

  const loadProduct = async () => {
    try {
      const response = await productAPI.getById(id);
      const data = response.data.data;
      // weight를 소수점 첫째자리까지만 표시
      if (data.weight) {
        data.weight = Math.round(data.weight * 10) / 10;
      }
      setFormData(data);
      setOriginalProductName(data.product_name);
      // weight가 없는 경우 빈 문자열로 통일
      setOriginalWeight(data.weight !== null && data.weight !== undefined ? data.weight : '');

      // 같은 품목명의 다른 등급 개수 확인
      const allProducts = await productAPI.getAll({});
      const sameNameProducts = allProducts.data.data.filter(
        p => p.product_name === data.product_name && p.id !== parseInt(id)
      );
      setSameNameCount(sameNameProducts.length);
    } catch (error) {
      console.error('품목 정보 로딩 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '로딩 실패',
        message: '품목 정보를 불러오는데 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => navigate('/products')
      });
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSelectChange = (name, option) => {
    setFormData({
      ...formData,
      [name]: option ? option.value : ''
    });
  };

  // 기존 품목 선택 시 정보 자동 채우기
  const handleExistingProductSelect = (option) => {
    if (option) {
      const product = existingProducts.find(p => p.product_name === option.value);
      if (product) {
        setFormData({
          ...formData,
          product_name: product.product_name,
          unit: product.unit,
          category_id: product.category_id,
          weight: product.weight ? Math.round(product.weight * 10) / 10 : ''
        });
        setIsAddingGrade(true);
      }
    } else {
      setIsAddingGrade(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.product_name) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '입력 오류',
        message: '품목명은 필수입니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    try {
      if (isEdit) {
        // 품목명/중량이 변경되고, 같은 품목명의 다른 등급이 있는 경우
        const isNameChanged = formData.product_name !== originalProductName;
        const isWeightChanged = String(formData.weight || '') !== String(originalWeight || '');

        const submitData = {
          ...formData,
          updateAllGrades: updateAllGrades && sameNameCount > 0 && isNameChanged,
          updateAllWeights: updateAllWeights && sameNameCount > 0 && isWeightChanged,
          originalProductName
        };
        const response = await productAPI.update(id, submitData);
        setModal({
          isOpen: true,
          type: 'success',
          title: '저장 완료',
          message: response.data.message,
          confirmText: '확인',
          showCancel: false,
          onConfirm: () => navigate('/products')
        });
      } else {
        let submitData = { ...formData };

        if (isMultiGrade && formData.grades) {
          const list = formData.grades.split(/[\s,]+/).map(g => g.trim()).filter(g => g);
          if (list.length === 0) {
            setModal({ isOpen: true, type: 'warning', title: '입력 오류', message: '등록할 등급을 입력하세요.', confirmText: '확인', showCancel: false, onConfirm: () => setModal(prev => ({ ...prev, isOpen: false })) });
            return;
          }
          submitData.grades = list;
          delete submitData.grade;
        }

        // [수정] 백엔드 핫리로드 문제 회피 및 PK 충돌 방지를 위해 클라이언트에서 순차 호출
        if (isMultiWeight && formData.weights) {
          const weightList = formData.weights
            .split(/[\s,]+/)
            .map(w => w.trim())
            .filter(w => w && !isNaN(parseFloat(w)))
            .map(w => parseFloat(w));

          if (weightList.length === 0) {
            setModal({ isOpen: true, type: 'warning', title: '입력 오류', message: '유효한 중량을 입력하세요.', confirmText: '확인', showCancel: false, onConfirm: () => setModal(prev => ({ ...prev, isOpen: false })) });
            return;
          }

          let successCount = 0;
          try {
            // 순차 호출
            for (const w of weightList) {
              const singleData = { ...submitData, weight: w };
              delete singleData.weights;
              await productAPI.create(singleData);
              successCount++;
            }

            setModal({
              isOpen: true,
              type: 'success',
              title: '성공',
              message: `${successCount}개의 품목이 성공적으로 등록되었습니다.`,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => {
                setModal(prev => ({ ...prev, isOpen: false }));
                navigate('/products');
              }
            });
          } catch (err) {
            console.error(err);
            setModal({
              isOpen: true,
              type: 'warning',
              title: '일부 오류',
              message: `등록 중 오류가 발생했습니다. (${successCount}/${weightList.length} 성공)`,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => {
                setModal(prev => ({ ...prev, isOpen: false }));
                // 성공한 게 있으면 이동, 아니면 대기? 보통 목록으로 이동
                navigate('/products');
              }
            });
          }
        } else {
          // 단일 등록 (기존)
          const response = await productAPI.create(submitData);
          setModal({
            isOpen: true,
            type: 'success',
            title: '성공',
            message: '품목이 성공적으로 등록되었습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {
              setModal(prev => ({ ...prev, isOpen: false }));
              navigate('/products');
            }
          });
        }
      }
    } catch (error) {
      console.error('품목 저장 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '저장 실패',
        message: error.response?.data?.message || '품목 저장에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    }
  };

  const inputStyle = {
    padding: '0.6rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.95rem',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    width: '100%',
    boxSizing: 'border-box'
  };

  // 계층형 카테고리 옵션 생성
  const buildCategoryOptions = () => {
    const options = [];
    const mainCategories = categories.filter(c => !c.parent_id);

    mainCategories.forEach(main => {
      // 대분류 (선택 불가, 그룹 헤더로만 사용)
      options.push({
        value: main.id,
        label: `📁 ${main.category_name}`,
        isMain: true
      });

      // 하위 분류
      const children = categories.filter(c => c.parent_id === main.id);
      children.forEach(child => {
        options.push({
          value: child.id,
          label: `    └ ${child.category_name}`,
          isMain: false
        });
      });
    });

    return options;
  };

  const categoryOptions = buildCategoryOptions();

  return (
    <div className="product-form">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>📦 {isEdit ? '품목 수정' : '품목 등록'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="form-container">
        {!isEdit && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: isAddingGrade ? '#fef3c7' : '#e8f4fd',
            borderRadius: '8px',
            border: isAddingGrade ? '1px solid #fcd34d' : '1px solid #b8daff'
          }}>
            {isAddingGrade ? (
              <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem' }}>
                📌 <strong>기존 품목에 등급 추가 모드</strong> - "{formData.product_name}" 품목에 새로운 등급을 추가합니다.
              </p>
            ) : (
              <p style={{ margin: 0, color: '#0056b3', fontSize: '0.9rem' }}>
                💡 <strong>품목코드는 자동 생성됩니다.</strong> 등록 시 F001, F002... 형태로 순차적으로 부여됩니다.
              </p>
            )}
          </div>
        )}

        {isEdit && (
          <div className="form-row">
            <div className="form-group">
              <label>품목코드</label>
              <input
                type="text"
                value={formData.product_code || ''}
                disabled
                style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#6b7280' }}
              />
            </div>
          </div>
        )}

        {!isEdit && existingProducts.length > 0 && !isAddingGrade && (
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>기존 품목에 등급 추가</label>
              <SearchableSelect
                options={existingProducts.map(p => ({
                  value: p.product_name,
                  label: `${p.product_name} (${p.category_name || '미분류'})`
                }))}
                value=""
                onChange={handleExistingProductSelect}
                placeholder="기존 품목을 선택하면 해당 품목에 새 등급을 추가합니다..."
                noOptionsMessage="등록된 품목 없음"
                isClearable={true}
              />
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                💡 기존 품목에 등급을 추가하려면 위에서 품목을 선택하세요. 새 품목을 등록하려면 아래에서 직접 입력하세요.
              </p>
            </div>
          </div>
        )}

        {isAddingGrade && !isEdit && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => {
                setIsAddingGrade(false);
                setFormData({ ...formData, product_name: '', unit: 'Box', category_id: '', weight: '' });
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                color: '#475569'
              }}
            >
              ← 새 품목 등록으로 전환
            </button>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="required">품목명</label>
            <input
              type="text"
              name="product_name"
              value={formData.product_name || ''}
              onChange={handleChange}
              placeholder="예: 감귤"
              required
              disabled={isAddingGrade}
              style={{
                ...inputStyle,
                backgroundColor: isAddingGrade ? '#f3f4f6' : 'white',
                color: isAddingGrade ? '#6b7280' : 'inherit'
              }}
            />
            {/* 품목명 일괄 변경 옵션 */}
            {isEdit && sameNameCount > 0 && formData.product_name !== originalProductName && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
                padding: '0.75rem',
                backgroundColor: '#fef3c7',
                borderRadius: '6px',
                border: '1px solid #fcd34d',
                fontSize: '0.9rem',
                color: '#92400e',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={updateAllGrades}
                  onChange={(e) => setUpdateAllGrades(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span>
                  같은 품목명(<strong>{originalProductName}</strong>)의 다른 등급 <strong>{sameNameCount}개</strong>도 함께 변경
                </span>
              </label>
            )}
          </div>
          <div className="form-group">
            <label>품목분류</label>
            <SearchableSelect
              options={categoryOptions}
              value={formData.category_id}
              onChange={(option) => handleSelectChange('category_id', option)}
              placeholder="분류 검색..."
              noOptionsMessage="분류 없음"
              isDisabled={isAddingGrade}
            />
          </div>
        </div>

        {/* 등급 입력 */}
        {!isEdit && (
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ marginRight: '1rem', marginBottom: 0 }}>등급</label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#4a5568'
                }}>
                  <input
                    type="checkbox"
                    checked={isMultiGrade}
                    onChange={(e) => setIsMultiGrade(e.target.checked)}
                    style={{ width: '18px', height: '18px', marginRight: '0.5rem', cursor: 'pointer' }}
                  />
                  여러 등급 한번에 등록
                </label>
              </div>

              {isMultiGrade ? (
                <div>
                  <input
                    type="text"
                    name="grades"
                    value={formData.grades || ''}
                    onChange={handleChange}
                    placeholder="예: 2L, L, M, S (쉼표로 구분)"
                    style={inputStyle}
                  />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                    💡 쉼표로 구분하여 입력하면 각 등급별로 품목이 자동 생성됩니다.<br />
                    예: 품목명 "감귤", 등급 "2L, L, M" → 3개 품목 생성 (각각 등급 2L, L, M)
                  </p>
                </div>
              ) : (
                <input
                  type="text"
                  name="grade"
                  value={formData.grade || ''}
                  onChange={handleChange}
                  placeholder="예: 특, 상, 2L"
                  style={inputStyle}
                />
              )}
            </div>
          </div>
        )}

        {isEdit && (
          <div className="form-row">
            <div className="form-group">
              <label>등급</label>
              <input
                type="text"
                name="grade"
                value={formData.grade || ''}
                onChange={handleChange}
                placeholder="예: 특, 상, 2L"
                style={inputStyle}
              />
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>단위</label>
            <input
              type="text"
              name="unit"
              value={formData.unit || ''}
              onChange={handleChange}
              placeholder="Box, kg"
              style={inputStyle}
            />
          </div>
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ marginRight: '1rem', marginBottom: 0 }}>중량 (kg)</label>
              {!isEdit && (
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#4a5568'
                }}>
                  <input
                    type="checkbox"
                    checked={isMultiWeight}
                    onChange={(e) => setIsMultiWeight(e.target.checked)}
                    style={{ width: '18px', height: '18px', marginRight: '0.5rem', cursor: 'pointer' }}
                  />
                  여러 중량 한번에 등록
                </label>
              )}
            </div>
            {(isMultiWeight && !isEdit) ? (
              <div>
                <input
                  type="text"
                  name="weights"
                  value={formData.weights || ''}
                  onChange={handleChange}
                  placeholder="예: 5, 10, 15 (쉼표로 구분)"
                  style={inputStyle}
                />
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                  💡 쉼표로 구분하여 입력하면 각 중량별로 품목이 자동 생성됩니다.
                </p>
              </div>
            ) : (
              <input
                type="number"
                name="weight"
                value={formData.weight || ''}
                onChange={handleChange}
                placeholder="예: 5, 10, 15"
                step="0.1"
                min="0"
                style={inputStyle}
              />
            )}
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              박스당 중량을 입력하세요
            </p>
            {/* 중량 일괄 변경 옵션 */}
            {isEdit && sameNameCount > 0 && String(formData.weight || '') !== String(originalWeight || '') && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
                padding: '0.75rem',
                backgroundColor: '#dbeafe',
                borderRadius: '6px',
                border: '1px solid #93c5fd',
                fontSize: '0.9rem',
                color: '#1e40af',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={updateAllWeights}
                  onChange={(e) => setUpdateAllWeights(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span>
                  같은 품목명의 다른 등급 <strong>{sameNameCount}개</strong>도 중량 함께 변경
                </span>
              </label>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>비고</label>
            <textarea
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              rows="3"
              placeholder="추가 정보 입력"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        {isEdit && (
          <div className="form-row">
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px', marginRight: '0.5rem', cursor: 'pointer' }}
                />
                사용
              </label>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" onClick={() => navigate('/products')} className="btn btn-secondary">
            취소
          </button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? '수정' : ((isMultiGrade || isMultiWeight) ? '일괄 등록' : '등록')}
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={modal.isOpen}
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        confirmText={modal.confirmText}
        showCancel={modal.showCancel}
      />
    </div>
  );
}

export default ProductForm;
