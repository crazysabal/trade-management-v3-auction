import React, { useState, useEffect } from 'react';
import { auctionAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

function AuctionAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    account_name: '',
    site_url: 'http://tgjungang.co.kr',
    username: '',
    password: ''
  });
  const [modal, setModal] = useState({
    isOpen: false, type: 'info', title: '', message: '',
    onConfirm: () => {}, confirmText: '확인', showCancel: false
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const response = await auctionAPI.getAccounts();
      setAccounts(response.data.data);
    } catch (error) {
      console.error('계정 조회 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '로딩 실패', message: '계정 목록을 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => {} });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (formData.id) {
        await auctionAPI.updateAccount(formData.id, formData);
        setModal({ isOpen: true, type: 'success', title: '수정 완료', message: '계정이 수정되었습니다.', confirmText: '확인', showCancel: false, onConfirm: () => {} });
      } else {
        await auctionAPI.saveAccount(formData);
        setModal({ isOpen: true, type: 'success', title: '저장 완료', message: '계정이 저장되었습니다.', confirmText: '확인', showCancel: false, onConfirm: () => {} });
      }
      
      setShowForm(false);
      resetForm();
      loadAccounts();
    } catch (error) {
      console.error('계정 저장 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '저장 실패', message: '계정 저장에 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => {} });
    }
  };

  const handleEdit = (account) => {
    setFormData({
      id: account.id,
      account_name: account.account_name,
      site_url: account.site_url,
      username: account.username,
      password: '' // 보안상 비밀번호는 비움
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      id: null,
      account_name: '',
      site_url: 'http://tgjungang.co.kr',
      username: '',
      password: ''
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    resetForm();
  };

  const handleToggleActive = async (account) => {
    try {
      await auctionAPI.updateAccount(account.id, {
        ...account,
        is_active: !account.is_active
      });
      loadAccounts();
    } catch (error) {
      console.error('상태 변경 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '변경 실패', message: '상태 변경에 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => {} });
    }
  };

  return (
    <div className="auction-accounts">
      <div className="page-header">
        <h1 className="page-title">경매 사이트 계정 관리</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            + 계정 추가
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{marginBottom: '2rem'}}>
          <h2 className="card-title">{formData.id ? '계정 수정' : '계정 추가'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="required">계정명</label>
                <input
                  type="text"
                  value={formData.account_name}
                  onChange={(e) => setFormData({...formData, account_name: e.target.value})}
                  placeholder="예: 대구중앙청과 계정"
                  required
                />
              </div>
              <div className="form-group">
                <label className="required">사이트 URL</label>
                <input
                  type="text"
                  value={formData.site_url}
                  onChange={(e) => setFormData({...formData, site_url: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">아이디</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label className="required">비밀번호</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder={formData.id ? '(변경하지 않으려면 비워두세요)' : ''}
                  required={!formData.id}
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" onClick={handleCancel} className="btn btn-secondary">
                취소
              </button>
              <button type="submit" className="btn btn-primary">
                {formData.id ? '수정' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">저장된 계정</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>계정명</th>
                <th>사이트</th>
                <th>아이디</th>
                <th>최근 사용</th>
                <th className="text-center">상태</th>
                <th className="text-center">액션</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center">등록된 계정이 없습니다.</td>
                </tr>
              ) : (
                accounts.map(account => (
                  <tr key={account.id}>
                    <td><strong>{account.account_name}</strong></td>
                    <td><small>{account.site_url}</small></td>
                    <td>{account.username}</td>
                    <td>
                      {account.last_used 
                        ? new Date(account.last_used).toLocaleString('ko-KR')
                        : '-'}
                    </td>
                    <td className="text-center">
                      <span 
                        className={`badge ${account.is_active ? 'badge-success' : 'badge-secondary'}`}
                        onClick={() => handleToggleActive(account)}
                        style={{cursor: 'pointer'}}
                        title="클릭하여 상태 변경"
                      >
                        {account.is_active ? '사용중' : '중지'}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => handleEdit(account)}
                        className="btn btn-sm btn-primary"
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmModal isOpen={modal.isOpen} onClose={() => setModal(prev => ({ ...prev, isOpen: false }))} onConfirm={modal.onConfirm} title={modal.title} message={modal.message} type={modal.type} confirmText={modal.confirmText} showCancel={modal.showCancel} />
    </div>
  );
}

export default AuctionAccounts;
