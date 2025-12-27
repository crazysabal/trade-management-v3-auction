import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { companyAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import CompanyForm from './CompanyForm';
import './CompanyList.css';

// 테이블 행 컴포넌트 - React.memo로 최적화
const CompanyRow = memo(function CompanyRow({
  company,
  index,
  isSelectMode,
  isSelected,
  isDragOver,
  onDragStart,
  onDragEnter,
  onCheckboxToggle,
  onToggleCompanyType,
  onToggleETaxInvoice,
  onToggleActive,
  onDelete,
  onEdit,
  getTypeBadge
}) {
  return (
    <tr
      draggable={true}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      className={`${isDragOver ? 'drag-over' : ''} ${!company.is_active ? 'inactive-row' : ''}`}
      style={{
        backgroundColor: !company.is_active ? '#f3f4f6' : (index % 2 === 0 ? '#ffffff' : '#f8fafc'),
        borderTop: index > 0 ? '2px solid #e2e8f0' : 'none'
      }}
    >
      <td className="text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onCheckboxToggle}
          style={{ width: '16px', height: '16px', accentColor: '#e74c3c', cursor: 'pointer' }}
        />
      </td>
      <td className="drag-handle">☰</td>

      <td className={`ellipsis ${company.alias ? '' : 'text-muted'}`} title={company.alias}>{company.alias || '-'}</td>
      <td className="ellipsis" title={company.company_name}>{company.company_name}</td>
      <td>{company.business_number}</td>
      <td className="ellipsis" title={company.ceo_name}>{company.ceo_name}</td>
      <td
        className="text-center clickable"
        onClick={onToggleCompanyType}
        title="클릭하여 구분 변경 (매출처 → 매입처 → 매입/매출)"
      >
        {getTypeBadge(company.company_type_flag)}
      </td>
      <td className="text-center">
        <label className="toggle-switch" title="클릭하여 전자계산서 발행 설정">
          <input
            type="checkbox"
            checked={company.e_tax_invoice || false}
            onChange={onToggleETaxInvoice}
          />
          <span className={`toggle-slider ${company.e_tax_invoice ? 'active' : ''}`}>
            <span className="toggle-knob"></span>
          </span>
        </label>
      </td>
      <td className="text-center">
        <span
          className={`badge clickable ${company.is_active ? 'badge-success' : 'badge-secondary'}`}
          onClick={onToggleActive}
          title="클릭하여 상태 변경"
        >
          {company.is_active ? '사용' : '미사용'}
        </span>
      </td>
      {!isSelectMode && (
        <td className="text-center" style={{ whiteSpace: 'nowrap' }}>
          <button
            onClick={() => onEdit(company)}
            className="btn btn-sm btn-primary"
            style={{ marginRight: '0.5rem' }}
          >
            수정
          </button>
          <button
            onClick={onDelete}
            className="btn btn-sm btn-danger"
          >
            삭제
          </button>
        </td>
      )}
    </tr>
  );
});

// 다중 필터링 함수 (AND 조건) - 컴포넌트 외부
// 다중 필터링 함수 (AND 조건) - 컴포넌트 외부
const filterCompanies = (companies, filterText) => {
  if (!filterText.trim()) return companies;

  const keywords = filterText.toLowerCase().trim().split(/\s+/).filter(k => k);
  return companies.filter(company => {
    const typeText = company.company_type_flag === 'CUSTOMER' ? '매출처' :
      company.company_type_flag === 'SUPPLIER' ? '매입처' : '매입/매출';
    const activeText = company.is_active ? '사용' : '미사용';

    const searchableText = [
      company.company_name?.toLowerCase() || '',
      company.company_code?.toLowerCase() || '',
      company.alias?.toLowerCase() || '',
      company.ceo_name?.toLowerCase() || '',
      company.business_number || '',
      typeText,
      activeText,
      company.phone || '',
      company.email || ''
    ].join(' ');

    // 모든 키워드가 포함되어야 함
    return keywords.every(keyword => searchableText.includes(keyword));
  });
};

function CompanyList({ isWindow }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: ''
  });
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragNode = useRef(null);
  const pendingReorder = useRef(false);
  const companiesRef = useRef(companies);
  const draggedIdRef = useRef(null);

  // 다중 선택 삭제 관련 상태
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // 엑셀 업로드 관련 상태
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const fileInputRef = useRef(null);

  // 확인 모달 상태
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    onConfirm: () => { },
    confirmText: '확인',
    showCancel: true
  });

  // 거래처 등록/수정 모달 상태
  const [editModal, setEditModal] = useState({
    isOpen: false,
    companyId: null // null이면 등록, 값이 있으면 수정
  });

  // 모달 ESC 닫기 처리
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editModal.isOpen) {
          e.preventDefault();
          e.stopPropagation();
          setEditModal({ isOpen: false, companyId: null });
        }
      }
    };

    if (editModal.isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editModal.isOpen]);

  // 전체 데이터 원본 (클라이언트 필터링용)
  const [originalCompanies, setOriginalCompanies] = useState([]);

  // 필터 변경 시 클라이언트 사이드 필터링 (즉시 반응 & 버벅임 제거)
  useEffect(() => {
    if (originalCompanies.length === 0) return;

    // 필터링 로직 개선 (단일 함수 사용)
    const result = filterCompanies(originalCompanies, filters.search);
    setCompanies(result);
  }, [filters, originalCompanies]);

  // 최초 마운트 시 한 번만 전체 데이터 로드
  useEffect(() => {
    loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 의존성 배열 비움 (최초 1회만 실행)

  const loadCompanies = async () => {
    try {
      setLoading(true);
      // 필터 없이 전체 데이터를 가져옴 (is_active 파라미터도 빼거나 전체를 의미하게 보냄)
      // 백엔드가 필터 없이 요청하면 전체를 준다고 가정 (보통 그렇습니다)
      const response = await companyAPI.getAll({});
      const data = response.data.data;

      setOriginalCompanies(data);
      setCompanies(data); // 초기엔 전체 표시
      companiesRef.current = data;
    } catch (error) {
      console.error('거래처 목록 로딩 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '로딩 실패',
        message: '거래처 목록을 불러오는데 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (company) => {
    setEditModal({
      isOpen: true,
      companyId: company.id
    });
  };

  const handleCreate = () => {
    setEditModal({
      isOpen: true,
      companyId: null
    });
  };

  const closeEditModal = () => {
    setEditModal({
      isOpen: false,
      companyId: null
    });
  };

  const handleEditSuccess = (updatedCompany) => {
    closeEditModal();
    if (updatedCompany && updatedCompany.id) {
      // 수정인 경우 로컬 상태만 업데이트 (스크롤 유지)
      setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? { ...c, ...updatedCompany } : c));
      setOriginalCompanies(prev => prev.map(c => c.id === updatedCompany.id ? { ...c, ...updatedCompany } : c));
      companiesRef.current = companiesRef.current.map(c => c.id === updatedCompany.id ? { ...c, ...updatedCompany } : c);
    } else {
      // 신규 등록인 경우 목록 갱신
      loadCompanies();
    }
  };

  const handleDelete = (id, name) => {
    setModal({
      isOpen: true,
      type: 'delete',
      title: '거래처 삭제',
      message: `'${name}' 거래처를 삭제하시겠습니까?`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await companyAPI.delete(id);
          setModal({
            isOpen: true,
            type: 'success',
            title: '삭제 완료',
            message: '거래처가 삭제되었습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => { }
          });
          loadCompanies();
        } catch (error) {
          console.error('거래처 삭제 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '삭제 실패',
            message: error.response?.data?.message || '거래처 삭제에 실패했습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => { }
          });
        }
      }
    });
  };

  // 다중 선택 삭제
  const handleMultiDelete = () => {
    if (selectedIds.length === 0) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '선택 필요',
        message: '삭제할 거래처를 선택하세요.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    setModal({
      isOpen: true,
      type: 'delete',
      title: '일괄 삭제',
      message: `선택한 ${selectedIds.length}개의 거래처를 삭제하시겠습니까?`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          let successCount = 0;
          let failCount = 0;

          for (const id of selectedIds) {
            try {
              await companyAPI.delete(id);
              successCount++;
            } catch (error) {
              failCount++;
              console.error(`거래처 ID ${id} 삭제 실패:`, error);
            }
          }

          if (failCount > 0) {
            setModal({
              isOpen: true,
              type: 'warning',
              title: '삭제 결과',
              message: `${successCount}개 삭제 성공, ${failCount}개 삭제 실패\n(거래 내역이 있는 거래처는 삭제할 수 없습니다)`,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => { }
            });
          } else {
            setModal({
              isOpen: true,
              type: 'success',
              title: '삭제 완료',
              message: `${successCount}개 거래처가 삭제되었습니다.`,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => { }
            });
          }

          setSelectedIds([]);
          setIsSelectMode(false);
          loadCompanies();
        } catch (error) {
          console.error('다중 삭제 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '오류 발생',
            message: '삭제 중 오류가 발생했습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => { }
          });
        }
      }
    });
  };

  // 체크박스 토글
  const handleCheckboxToggle = (id) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedIds.length === companies.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(companies.map(c => c.id));
    }
  };

  const getTypeBadge = useCallback((type) => {
    const badges = {
      CUSTOMER: <span className="badge badge-info">매출처</span>,
      SUPPLIER: <span className="badge badge-warning">매입처</span>,
      BOTH: <span className="badge badge-success">매입/매출</span>
    };
    return badges[type] || type;
  }, []);

  // 거래처 구분 변경 (클릭시 순환: 매출처 → 매입처 → 매입/매출 → 매출처)
  const handleToggleCompanyType = async (company) => {
    const typeOrder = ['CUSTOMER', 'SUPPLIER', 'BOTH'];
    const currentIndex = typeOrder.indexOf(company.company_type_flag);
    const nextIndex = (currentIndex + 1) % typeOrder.length;
    const nextType = typeOrder[nextIndex];

    try {
      await companyAPI.update(company.id, {
        ...company,
        company_type_flag: nextType
      });
      // 로컬 상태만 업데이트 (새로고침 없이)
      setCompanies(prev => prev.map(c =>
        c.id === company.id ? { ...c, company_type_flag: nextType } : c
      ));
    } catch (error) {
      console.error('거래처 구분 변경 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '변경 실패',
        message: '거래처 구분 변경에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    }
  };

  const handleToggleActive = async (company) => {
    try {
      await companyAPI.update(company.id, {
        ...company,
        is_active: !company.is_active
      });
      // 로컬 상태만 업데이트 (새로고침 없이)
      setCompanies(prev => prev.map(c =>
        c.id === company.id ? { ...c, is_active: !c.is_active } : c
      ));
    } catch (error) {
      console.error('상태 변경 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '변경 실패',
        message: '상태 변경에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    }
  };

  // 전자계산서 발행 여부 토글
  const handleToggleETaxInvoice = async (company) => {
    try {
      await companyAPI.update(company.id, {
        ...company,
        e_tax_invoice: !company.e_tax_invoice
      });
      // 로컬 상태만 업데이트 (새로고침 없이)
      setCompanies(prev => prev.map(c =>
        c.id === company.id ? { ...c, e_tax_invoice: !c.e_tax_invoice } : c
      ));
    } catch (error) {
      console.error('전자계산서 설정 변경 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '변경 실패',
        message: '전자계산서 설정 변경에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    }
  };

  // 드래그 시작
  const handleDragStart = (e, company) => {
    setDraggedId(company.id);
    draggedIdRef.current = company.id;
    dragNode.current = e.target;
    dragNode.current.addEventListener('dragend', handleDragEnd);
    setTimeout(() => {
      e.target.style.opacity = '0.5';
    }, 0);
  };

  // 드래그 중
  const handleDragEnter = (e, company) => {
    if (company.id === draggedId) return;

    setDragOverId(company.id);

    setCompanies(prevCompanies => {
      const newCompanies = [...prevCompanies];
      const draggedIndex = newCompanies.findIndex(c => c.id === draggedId);
      const targetIndex = newCompanies.findIndex(c => c.id === company.id);

      if (draggedIndex === -1 || targetIndex === -1) return prevCompanies;

      const [draggedCompany] = newCompanies.splice(draggedIndex, 1);
      newCompanies.splice(targetIndex, 0, draggedCompany);

      // ref도 업데이트
      companiesRef.current = newCompanies;

      return newCompanies;
    });
  };

  // 드래그 종료 - 자동 저장
  const handleDragEnd = async () => {
    if (dragNode.current) {
      dragNode.current.removeEventListener('dragend', handleDragEnd);
      dragNode.current.style.opacity = '1';
    }

    const hadDrag = draggedIdRef.current !== null;
    setDraggedId(null);
    setDragOverId(null);
    draggedIdRef.current = null;
    dragNode.current = null;

    // 드래그가 있었으면 자동 저장 (ref에서 최신 배열 사용)
    if (hadDrag && !pendingReorder.current) {
      pendingReorder.current = true;
      try {
        const items = companiesRef.current.map((company, index) => ({
          id: company.id,
          sort_order: index + 1
        }));
        await companyAPI.reorder({ items });
      } catch (error) {
        console.error('순번 저장 오류:', error);
      } finally {
        pendingReorder.current = false;
      }
    }
  };

  // 엑셀 파일 선택
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadFile(file);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await companyAPI.uploadPreview(formData);

      // 별칭이 없으면 사업자 명으로 자동 채움, 전자계산서 발행(true) 자동 설정
      const companies = response.data.data.companies.map(c => ({
        ...c,
        alias: c.alias || c.company_name,
        e_tax_invoice: true
      }));

      setPreviewData({ ...response.data.data, companies });
      setSelectedRows(companies.map((_, index) => index));
    } catch (error) {
      console.error('파일 업로드 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '파일 오류',
        message: error.response?.data?.message || '파일 처리 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
      setPreviewData(null);
    } finally {
      setUploading(false);
    }
  };

  // 일괄 등록
  const handleBulkImport = () => {
    if (!previewData || selectedRows.length === 0) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '선택 필요',
        message: '등록할 데이터를 선택하세요.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    setModal({
      isOpen: true,
      type: 'confirm',
      title: '일괄 등록',
      message: `선택한 ${selectedRows.length}개의 거래처를 등록하시겠습니까?`,
      confirmText: '등록',
      showCancel: true,
      onConfirm: async () => {
        setUploading(true);
        try {
          const selectedCompanies = selectedRows.map(index => previewData.companies[index]);
          const response = await companyAPI.bulkImport({ companies: selectedCompanies });

          const failedCount = response.data.data.failed.length;
          const successCount = response.data.data.success;

          if (failedCount > 0) {
            console.log('실패 목록:', response.data.data.failed);
            setModal({
              isOpen: true,
              type: 'warning',
              title: '등록 결과',
              message: `${successCount}개 성공, ${failedCount}개 실패`,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => { }
            });
          } else {
            setModal({
              isOpen: true,
              type: 'success',
              title: '등록 완료',
              message: response.data.message,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => { }
            });
          }

          setShowUploadModal(false);
          setPreviewData(null);
          setUploadFile(null);
          setSelectedRows([]);
          loadCompanies();
        } catch (error) {
          console.error('일괄 등록 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '등록 실패',
            message: error.response?.data?.message || '일괄 등록 중 오류가 발생했습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => { }
          });
        } finally {
          setUploading(false);
        }
      }
    });
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setShowUploadModal(false);
    setPreviewData(null);
    setUploadFile(null);
    setSelectedRows([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 행 선택 토글
  const handleRowSelect = (index) => {
    setSelectedRows(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  // 전체 선택/해제
  const handleSelectAllRows = () => {
    if (previewData) {
      if (selectedRows.length === previewData.companies.length) {
        setSelectedRows([]);
      } else {
        setSelectedRows(previewData.companies.map((_, index) => index));
      }
    }
  };

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }





  return (
    <div className={`company-list-wrapper ${isWindow ? 'is-window' : ''}`}>
      {!isWindow && (
        <div className="page-header">
          <h1 className="page-title company-title">🏢 거래처 관리</h1>
        </div>
      )}



      <div className="search-filter-container">
        <div className="filter-row" style={{ gap: '8px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ whiteSpace: 'nowrap', margin: 0 }}>검색</label>
            <input
              type="text"
              placeholder="🔍 거래처 명, 사업자 명, 대표자, 사업자번호, 구분... (띄어쓰기로 다중 검색)"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              style={{
                flex: 1,
                padding: '0 0.75rem',
                height: '38px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.9rem'
              }}
            />
          </div>

          <button
            onClick={() => {
              setFilters({ ...filters, search: '' });
              loadCompanies();
            }}
            className="btn btn-secondary"
            disabled={!filters.search}
            style={{
              padding: '0 0.5rem',
              height: '38px',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
              width: '80px',
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            초기화
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* 선택 삭제 버튼 (선택된 항목이 있을 때만 표시) */}
            {selectedIds.length > 0 && (
              <button
                onClick={handleMultiDelete}
                className="btn btn-danger"
                style={{
                  padding: '0 0.75rem',
                  height: '38px',
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                🗑 선택 삭제 ({selectedIds.length})
              </button>
            )}
            <button
              onClick={() => setShowUploadModal(true)}
              className="btn btn-outline"
              style={{
                border: '1px solid #10b981',
                backgroundColor: 'white',
                color: '#10b981',
                whiteSpace: 'nowrap',
                padding: '0 0.75rem',
                height: '38px',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              📥 엑셀 불러오기
            </button>
            <button
              onClick={handleCreate}
              className="btn btn-primary"
              style={{
                whiteSpace: 'nowrap',
                padding: '0 0.75rem',
                height: '38px',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '80px',
                flex: 'none'
              }}
            >
              + 등록
            </button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={companies.length > 0 && selectedIds.length === companies.length}
                  style={{ width: '16px', height: '16px', accentColor: '#e74c3c', cursor: 'pointer' }}
                />
              </th>
              <th style={{ width: '40px' }}></th>
              <th>거래처 명</th>
              <th>사업자 명</th>
              <th>사업자번호</th>
              <th>대표자</th>
              <th>구분</th>
              <th className="text-center">전자계산서</th>
              <th className="text-center">사용여부</th>
              {!isSelectMode && <th className="text-center" style={{ minWidth: '120px' }}>액션</th>}
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center">등록된 거래처가 없습니다.</td>
              </tr>
            ) : (
              companies.map((company, index) => (
                <CompanyRow
                  key={company.id}
                  company={company}
                  index={index}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.includes(company.id)}
                  isDragOver={dragOverId === company.id}
                  onDragStart={(e) => handleDragStart(e, company)}
                  onDragEnter={(e) => handleDragEnter(e, company)}
                  onCheckboxToggle={() => handleCheckboxToggle(company.id)}
                  onToggleCompanyType={() => handleToggleCompanyType(company)}
                  onToggleETaxInvoice={() => handleToggleETaxInvoice(company)}
                  onToggleActive={() => handleToggleActive(company)}
                  onDelete={() => handleDelete(company.id, company.company_name)}
                  onEdit={handleEdit}
                  getTypeBadge={getTypeBadge}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 엑셀 업로드 모달 - Portal로 body에 렌더링 */}
      {
        showUploadModal && createPortal(
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '1200px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* 모달 헤더 */}
              <div style={{
                padding: '1.5rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
                  📥 엑셀 파일로 거래처 일괄 등록
                </h2>
                <button
                  onClick={handleCloseModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>

              {/* 모달 본문 */}
              <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                {/* 파일 업로드 영역 */}
                <div style={{
                  border: '2px dashed #d1d5db',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  backgroundColor: '#f9fafb'
                }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <div style={{ marginBottom: '1rem' }}>
                    <span style={{ fontSize: '3rem' }}>📁</span>
                  </div>
                  <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                    {uploadFile ? uploadFile.name : '엑셀 파일을 선택하세요 (.xlsx, .xls)'}
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-primary"
                    disabled={uploading}
                  >
                    {uploading ? '처리 중...' : '파일 선택'}
                  </button>
                </div>

                {/* 엑셀 컬럼 안내 */}
                <div style={{
                  backgroundColor: '#e8f4fd',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <p style={{ margin: 0, color: '#0056b3', fontSize: '0.9rem' }}>
                    💡 <strong>엑셀 파일 형식 안내</strong><br />
                    첫 번째 행은 헤더로 인식됩니다. 다음 컬럼명을 사용하세요:<br />
                    <code style={{ backgroundColor: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>
                      사업자 명, 거래처 명, 사업자번호, 대표자, 업태, 종목, 주소, 전화번호, 팩스, 이메일, 담당자, 담당자연락처, 구분, 비고, 은행명, 계좌번호, 예금주
                    </code><br />
                    <small>※ 구분: 매출처, 매입처, 매입/매출 중 하나</small>
                  </p>
                </div>

                {/* 미리보기 테이블 */}
                {previewData && (
                  <>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem'
                    }}>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>
                        미리보기 (총 {previewData.totalCount}건, 선택 {selectedRows.length}건)
                      </h3>
                      <button
                        onClick={handleSelectAllRows}
                        style={{
                          padding: '0.4rem 0.8rem',
                          backgroundColor: '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        {selectedRows.length === previewData.companies.length ? '전체 해제' : '전체 선택'}
                      </button>
                    </div>
                    <div style={{
                      maxHeight: '500px',
                      overflow: 'auto',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#1e3a5f', position: 'sticky', top: 0 }}>
                            <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', width: '40px', color: '#ffffff' }}>
                              <input
                                type="checkbox"
                                checked={selectedRows.length === previewData.companies.length}
                                onChange={handleSelectAllRows}
                                style={{ width: '16px', height: '16px' }}
                              />
                            </th>
                            <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#ffffff' }}>행</th>
                            <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#ffffff' }}>거래처명</th>
                            <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#ffffff' }}>사업자번호</th>
                            <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#ffffff' }}>대표자</th>
                            <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#ffffff' }}>전화번호</th>
                            <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#ffffff' }}>구분</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.companies.map((company, index) => (
                            <tr
                              key={index}
                              style={{
                                backgroundColor: selectedRows.includes(index) ? '#eff6ff' : 'white'
                              }}
                            >
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedRows.includes(index)}
                                  onChange={() => handleRowSelect(index)}
                                  style={{ width: '16px', height: '16px' }}
                                />
                              </td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                                {company._rowNum}
                              </td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', fontWeight: '500' }}>
                                {company.company_name || '-'}
                              </td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                                {company.business_number || '-'}
                              </td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                                {company.ceo_name || '-'}
                              </td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                                {company.phone || '-'}
                              </td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                                <span style={{
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  backgroundColor: company.company_type_flag === 'CUSTOMER' ? '#dbeafe' :
                                    company.company_type_flag === 'SUPPLIER' ? '#fef3c7' : '#d1fae5',
                                  color: company.company_type_flag === 'CUSTOMER' ? '#1e40af' :
                                    company.company_type_flag === 'SUPPLIER' ? '#92400e' : '#065f46'
                                }}>
                                  {company.company_type_flag === 'CUSTOMER' ? '매출처' :
                                    company.company_type_flag === 'SUPPLIER' ? '매입처' : '매입/매출'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* 모달 푸터 */}
              <div style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem'
              }}>
                <button onClick={handleCloseModal} className="btn btn-secondary">
                  취소
                </button>
                <button
                  onClick={handleBulkImport}
                  className="btn btn-success"
                  disabled={!previewData || selectedRows.length === 0 || uploading}
                >
                  {uploading ? '등록 중...' : `✓ ${selectedRows.length}건 일괄 등록`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* 거래처 등록/수정 모달 */}
      <ConfirmModal
        isOpen={editModal.isOpen}
        onClose={closeEditModal}
        title={editModal.companyId ? "거래처 수정" : "거래처 등록"}
        showConfirm={false}
        showCancel={false}
        maxWidth="1000px"
        hideHeader={true} // 모달 헤더 숨김 (내부 폼 타이틀 사용)
        padding="1rem" // 패딩 축소
      >
        {editModal.isOpen && (
          <CompanyForm
            id={editModal.companyId}
            onSuccess={handleEditSuccess}
            onCancel={closeEditModal}
          />
        )}
      </ConfirmModal>

      {/* 확인 모달 */}
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

    </div >
  );
}

export default CompanyList;
