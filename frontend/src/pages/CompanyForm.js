import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { companyAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import './CompanyForm.css';

function CompanyForm({ id: propId, onSuccess, onCancel, isModal: propIsModal }) {
  const navigate = useNavigate();
  const { id: paramId } = useParams();

  // propId가 있으면 모달 모드(또는 부모 제어), 없으면 라우트 파라미터 사용
  const id = propId || paramId;
  const isEdit = !!id;
  const isModalMode = propIsModal || !!propId || !!onCancel; // Explicit prop OR has ID OR has onCancel callback

  const [formData, setFormData] = useState({
    company_code: '',
    company_code: '',
    company_name: '',
    business_name: '', // [NEW] 사업자명
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

  const aliasInputRef = React.useRef(null);

  useEffect(() => {
    // 모달이 열릴 때 (마운트 될 때) 포커스
    const timer = setTimeout(() => {
      if (aliasInputRef.current) {
        aliasInputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

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
        onConfirm: () => handleCancel()
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

  // 취소 처리
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/companies');
    }
  };

  // 성공 처리
  const handleSuccess = (data) => {
    if (onSuccess) {
      onSuccess(data);
    } else {
      navigate('/companies');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.company_name) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '입력 오류',
        message: '거래처 명(별칭)은 필수입니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    // 사업자명이 비어있으면 거래처명(별칭)으로 자동 채움 (선택 사항)
    const finalData = {
      ...formData,
      business_name: formData.business_name || formData.company_name
    };

    try {
      if (isEdit) {
        await companyAPI.update(id, finalData);
        setModal({
          isOpen: true,
          type: 'success',
          title: '수정 완료',
          message: '거래처가 수정되었습니다.',
          confirmText: '확인',
          showCancel: false,
          onConfirm: () => handleSuccess({ ...formData, id })
        });
      } else {
        await companyAPI.create(finalData);
        setModal({
          isOpen: true,
          type: 'success',
          title: '등록 완료',
          message: '거래처가 등록되었습니다.',
          confirmText: '확인',
          showCancel: false,
          onConfirm: () => handleSuccess()
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



  return (
    <div className={`company-form ${isModalMode ? 'modal-mode' : ''}`} style={{ width: '100%', height: isModalMode ? '100%' : 'auto', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className={isModalMode ? "modal-header" : "page-header"} style={isModalMode ? { flexShrink: 0 } : { marginBottom: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <h1 className="page-title" style={{ fontSize: isModalMode ? '1.25rem' : '1.5rem', margin: 0 }}>🏢 {isEdit ? '거래처 수정' : '거래처 등록'}</h1>
        {isModalMode && <button className="close-btn" onClick={onCancel}>×</button>}
      </div>

      <form onSubmit={handleSubmit} className="form-container" style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: isModalMode ? 'none' : undefined, padding: 0 }}>
        <div className={isModalMode ? "modal-body" : "form-content"} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* 신규 등록시 안내 메시지 제거됨 */}

          {/* ===== 기본 정보 섹션 ===== */}
          <div className="section-header section-header-basic">
            <h3 className="section-title">📋 기본 정보</h3>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="required">거래처 명(별칭)</label>
              <input
                type="text"
                name="company_name"
                ref={aliasInputRef}
                value={formData.company_name || ''}
                onChange={handleChange}
                placeholder="자주 사용하는 거래처 명"
                required
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

          {/* ===== 사업자 정보 섹션 ===== */}
          <div className="section-header section-header-business">
            <h3 className="section-title">📋 사업자 정보</h3>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>사업자 명 (법인명)</label>
              <input
                type="text"
                name="business_name"
                value={formData.business_name || ''}
                onChange={handleChange}
                placeholder="사업자등록증 상호 (선택)"
              />
            </div>
            <div className="form-group">
              <label>전자계산서</label>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0' }}>
                <label className={`badge-toggle ${formData.e_tax_invoice ? 'checked' : ''}`} style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    name="e_tax_invoice"
                    checked={formData.e_tax_invoice || false}
                    onChange={handleChange}
                  />
                  {formData.e_tax_invoice ? '발행' : '미발행'}
                </label>
              </div>
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
            <div className="form-group full-span">
              <label>주소</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="상세 주소"
              />
            </div>
          </div>

          {/* ===== 연락처 정보 섹션 ===== */}
          <div className="section-header section-header-contact">
            <h3 className="section-title">📞 연락처 정보</h3>
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
          <div className="section-header section-header-account">
            <h3 className="section-title">💳 계좌 정보</h3>
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
          <div className="section-header section-header-etc">
            <h3 className="section-title">📝 기타 정보</h3>
          </div>

          {isEdit && (
            <div className="form-row">
              <div className="form-group">
                <label>사용여부</label>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <label className={`badge-toggle ${formData.is_active ? 'checked' : ''}`} style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                    />
                    {formData.is_active ? '사용' : '미사용'}
                  </label>
                </div>
              </div>
              <div className="form-group"></div> {/* Placeholder for 2 columns */}
            </div>
          )}

          <div className="form-row">
            <div className="form-group full-span align-top">
              <label>비고</label>
              <textarea
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                rows="3"
                placeholder="기타 메모"
                style={{ width: '100%', minHeight: '6rem' }}
              />
            </div>
          </div>

        </div> {/* End of modal-body/form-content */}

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button
            type="button"
            onClick={onCancel} // Use onCancel for consistency
            className="modal-btn modal-btn-cancel"
          >
            취소
          </button>
          <button
            type="submit"
            className="modal-btn modal-btn-primary"
          >
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
