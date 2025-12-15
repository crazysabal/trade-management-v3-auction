import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { companyAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

function CompanyForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    company_code: '',
    company_name: '',
    alias: '',
    business_number: '',
    ceo_name: '',
    company_type: '',
    company_category: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    contact_person: '',
    contact_phone: '',
    company_type_flag: 'BOTH',
    notes: '',
    is_active: true,
    bank_name: '',
    account_number: '',
    account_holder: '',
    e_tax_invoice: false
  });
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
    if (isEdit) {
      loadCompany();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadCompany = async () => {
    try {
      const response = await companyAPI.getById(id);
      setFormData(response.data.data);
    } catch (error) {
      console.error('거래처 정보 로딩 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '로딩 실패',
        message: '거래처 정보를 불러오는데 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => navigate('/companies')
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.company_name) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '입력 오류',
        message: '거래처명은 필수입니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    try {
      if (isEdit) {
        await companyAPI.update(id, formData);
        setModal({
          isOpen: true,
          type: 'success',
          title: '수정 완료',
          message: '거래처가 수정되었습니다.',
          confirmText: '확인',
          showCancel: false,
          onConfirm: () => navigate('/companies')
        });
      } else {
        await companyAPI.create(formData);
        setModal({
          isOpen: true,
          type: 'success',
          title: '등록 완료',
          message: '거래처가 등록되었습니다.',
          confirmText: '확인',
          showCancel: false,
          onConfirm: () => navigate('/companies')
        });
      }
    } catch (error) {
      console.error('거래처 저장 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '저장 실패',
        message: error.response?.data?.message || '거래처 저장에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    }
  };

  // 섹션 헤더 스타일
  const sectionHeaderStyle = (bgColor, borderColor, textColor) => ({
    marginBottom: '1.5rem',
    padding: '1rem',
    backgroundColor: bgColor,
    borderRadius: '8px',
    borderLeft: `4px solid ${borderColor}`
  });

  const sectionTitleStyle = (color) => ({
    margin: '0',
    color: color,
    fontSize: '1rem',
    fontWeight: '600'
  });

  return (
    <div className="company-form" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">🏢 {isEdit ? '거래처 수정' : '거래처 등록'}</h1>
        {!isEdit && (
          <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
            새로운 거래처 정보를 등록합니다.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="form-container">
        {/* 신규 등록시 안내 메시지 */}
        {!isEdit && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            border: '1px solid #fcd34d'
          }}>
            <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem' }}>
              💡 <strong>거래처코드는 자동 생성됩니다.</strong> 등록 시 C001, C002... 형태로 순차적으로 부여됩니다.
            </p>
          </div>
        )}

        {/* ===== 기본 정보 섹션 ===== */}
        <div style={sectionHeaderStyle('#f0f9ff', '#0284c7', '#0369a1')}>
          <h3 style={sectionTitleStyle('#0369a1')}>📋 기본 정보</h3>
        </div>

        {/* 수정시 거래처코드 표시 */}
        {isEdit && (
          <div className="form-row">
            <div className="form-group">
              <label>거래처코드</label>
              <input
                type="text"
                value={formData.company_code || ''}
                disabled
                style={{ backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}
              />
            </div>
            <div className="form-group">
              <label>사용여부</label>
              <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', cursor: 'pointer', marginTop: '0.5rem' }}>
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

        <div className="form-row">
          <div className="form-group">
            <label className="required">거래처명</label>
            <input
              type="text"
              name="company_name"
              value={formData.company_name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>별칭</label>
            <input
              type="text"
              name="alias"
              value={formData.alias || ''}
              onChange={handleChange}
              placeholder="약칭, 별명 등"
            />
          </div>
          <div className="form-group">
            <label className="required">거래처 구분</label>
            <select
              name="company_type_flag"
              value={formData.company_type_flag}
              onChange={handleChange}
              required
            >
              <option value="CUSTOMER">매출처</option>
              <option value="SUPPLIER">매입처</option>
              <option value="BOTH">매입/매출</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>사업자번호</label>
            <input
              type="text"
              name="business_number"
              value={formData.business_number}
              onChange={handleChange}
              placeholder="123-45-67890"
            />
          </div>
          <div className="form-group">
            <label>대표자명</label>
            <input
              type="text"
              name="ceo_name"
              value={formData.ceo_name}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>업태</label>
            <input
              type="text"
              name="company_type"
              value={formData.company_type}
              onChange={handleChange}
              placeholder="도매업, 소매업 등"
            />
          </div>
          <div className="form-group">
            <label>업종</label>
            <input
              type="text"
              name="company_category"
              value={formData.company_category}
              onChange={handleChange}
              placeholder="농산물, 청과물 등"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>주소</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* ===== 연락처 정보 섹션 ===== */}
        <div style={{ ...sectionHeaderStyle('#faf5ff', '#9333ea', '#7e22ce'), marginTop: '2rem' }}>
          <h3 style={sectionTitleStyle('#7e22ce')}>📞 연락처 정보</h3>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>전화번호</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="02-1234-5678"
            />
          </div>
          <div className="form-group">
            <label>팩스번호</label>
            <input
              type="text"
              name="fax"
              value={formData.fax}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>이메일</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>담당자</label>
            <input
              type="text"
              name="contact_person"
              value={formData.contact_person}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>담당자 연락처</label>
            <input
              type="text"
              name="contact_phone"
              value={formData.contact_phone}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* ===== 계좌 정보 섹션 ===== */}
        <div style={{ ...sectionHeaderStyle('#f0fdf4', '#16a34a', '#166534'), marginTop: '2rem' }}>
          <h3 style={sectionTitleStyle('#166534')}>💳 계좌 정보</h3>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>은행명</label>
            <input
              type="text"
              name="bank_name"
              value={formData.bank_name || ''}
              onChange={handleChange}
              placeholder="예: 농협, 국민은행"
            />
          </div>
          <div className="form-group">
            <label>계좌번호</label>
            <input
              type="text"
              name="account_number"
              value={formData.account_number || ''}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>예금주</label>
            <input
              type="text"
              name="account_holder"
              value={formData.account_holder || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* ===== 기타 정보 섹션 ===== */}
        <div style={{ ...sectionHeaderStyle('#fef3c7', '#f59e0b', '#b45309'), marginTop: '2rem' }}>
          <h3 style={sectionTitleStyle('#b45309')}>📝 기타 정보</h3>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>전자계산서 발행</label>
            <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', cursor: 'pointer', marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                name="e_tax_invoice"
                checked={formData.e_tax_invoice || false}
                onChange={handleChange}
                style={{ width: '18px', height: '18px', marginRight: '0.5rem', cursor: 'pointer' }}
              />
              발행 대상
            </label>
          </div>
          <div className="form-group" style={{ gridColumn: '2 / -1' }}>
            <label>비고</label>
            <textarea
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              rows="2"
              placeholder="기타 메모"
            />
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '2rem' }}>
          <button type="button" onClick={() => navigate('/companies')} className="btn btn-secondary">
            취소
          </button>
          <button type="submit" className="btn btn-primary">
            💾 {isEdit ? '수정' : '등록'}
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

export default CompanyForm;
