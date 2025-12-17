import React, { useState, useEffect } from 'react';
import { companyInfoAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

function CompanyInfo() {
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { }, confirmText: '확인', showCancel: false });
  const [formData, setFormData] = useState({
    company_name: '',
    business_number: '',
    ceo_name: '',
    company_type: '',
    company_category: '',
    address: '',
    address2: '',
    phone: '',
    fax: '',
    email: '',
    bank_name: '',
    account_number: '',
    account_holder: '',
    logo_url: '',
    stamp_url: '',
    notes: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    try {
      const response = await companyInfoAPI.get();
      if (response.data.data) {
        setFormData(response.data.data);
      }
    } catch (error) {
      console.error('본사 정보 로딩 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.company_name) {
      setModal({ isOpen: true, type: 'warning', title: '입력 오류', message: '회사명은 필수입니다.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
      return;
    }

    setSaving(true);
    try {
      await companyInfoAPI.update(formData);
      setModal({ isOpen: true, type: 'success', title: '저장 완료', message: '본사 정보가 저장되었습니다.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
    } catch (error) {
      console.error('본사 정보 저장 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '저장 실패', message: '저장에 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">로딩 중...</div>;
  }

  return (
    <div className="company-info-page" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div className="page-header">
        <h1 className="page-title">🏢 본사 정보</h1>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
          거래명세서에 표시되는 본사 정보를 관리합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="form-container">
        {/* 기본 정보 */}
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          borderLeft: '4px solid #0284c7'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#0369a1', fontSize: '1rem' }}>
            📋 기본 정보
          </h3>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="required">회사명</label>
            <input
              type="text"
              name="company_name"
              value={formData.company_name || ''}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>대표자명</label>
            <input
              type="text"
              name="ceo_name"
              value={formData.ceo_name || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>사업자번호</label>
            <input
              type="text"
              name="business_number"
              value={formData.business_number || ''}
              onChange={handleChange}
              placeholder="123-45-67890"
            />
          </div>
          <div className="form-group">
            <label>업태</label>
            <input
              type="text"
              name="company_type"
              value={formData.company_type || ''}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>업종</label>
            <input
              type="text"
              name="company_category"
              value={formData.company_category || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>주소 1</label>
            <input
              type="text"
              name="address"
              value={formData.address || ''}
              onChange={handleChange}
              placeholder="예: 대구광역시 북구 매천로18길 34"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>주소 2</label>
            <input
              type="text"
              name="address2"
              value={formData.address2 || ''}
              onChange={handleChange}
              placeholder="예: (매천동, 중앙청과 75번)"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>전화번호</label>
            <input
              type="text"
              name="phone"
              value={formData.phone || ''}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>팩스번호</label>
            <input
              type="text"
              name="fax"
              value={formData.fax || ''}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>이메일</label>
            <input
              type="email"
              name="email"
              value={formData.email || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* 계좌 정보 */}
        <div style={{
          marginTop: '2rem',
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
          borderLeft: '4px solid #16a34a'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#166534', fontSize: '1rem' }}>
            💳 계좌 정보
          </h3>
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

        {/* 이미지 정보 */}
        <div style={{
          marginTop: '2rem',
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#fef3c7',
          borderRadius: '8px',
          borderLeft: '4px solid #f59e0b'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#b45309', fontSize: '1rem' }}>
            🖼️ 이미지 (선택)
          </h3>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>로고 URL</label>
            <input
              type="text"
              name="logo_url"
              value={formData.logo_url || ''}
              onChange={handleChange}
              placeholder="https://example.com/logo.png"
            />
          </div>
          <div className="form-group">
            <label>직인 URL</label>
            <input
              type="text"
              name="stamp_url"
              value={formData.stamp_url || ''}
              onChange={handleChange}
              placeholder="https://example.com/stamp.png"
            />
          </div>
        </div>

        {/* 비고 */}
        <div className="form-row" style={{ marginTop: '1.5rem' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>비고</label>
            <textarea
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              rows="3"
              placeholder="기타 메모"
            />
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '2rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      </form>
      <ConfirmModal isOpen={modal.isOpen} onClose={() => setModal(prev => ({ ...prev, isOpen: false }))} onConfirm={modal.onConfirm} title={modal.title} message={modal.message} type={modal.type} confirmText={modal.confirmText} showCancel={modal.showCancel} />
    </div>
  );
}

export default CompanyInfo;



