import React, { useState, useEffect } from 'react';
import { categoryAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

function CategoryList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    category_name: '',
    parent_id: '',
    sort_order: 0
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addingParentId, setAddingParentId] = useState(null); // null이면 대분류, 값이 있으면 중분류
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: '확인',
    showCancel: false
  });

  // 인라인 입력 스타일
  const inputStyle = {
    padding: '0.5rem 0.75rem',
    border: '1px solid #4a90d9',
    borderRadius: '4px',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    backgroundColor: '#fff'
  };

  const numberInputStyle = {
    ...inputStyle,
    width: '70px',
    textAlign: 'center'
  };

  const textInputStyle = {
    ...inputStyle,
    width: '100%',
    minWidth: '200px'
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const response = await categoryAPI.getAll();
      setCategories(response.data.data);
    } catch (error) {
      console.error('품목분류 목록 로딩 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '로딩 실패',
        message: '품목분류 목록을 불러오는데 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
    } finally {
      setLoading(false);
    }
  };

  // 대분류만 필터링
  const mainCategories = categories.filter(c => c.level === 1 || !c.parent_id);
  
  // 특정 부모의 자식 카테고리
  const getChildren = (parentId) => categories.filter(c => c.parent_id === parentId);

  const handleAdd = (parentId = null) => {
    setIsAdding(true);
    setEditingId(null);
    setAddingParentId(parentId);
    
    const siblings = parentId 
      ? getChildren(parentId)
      : mainCategories;
    
    setFormData({ 
      category_name: '', 
      parent_id: parentId,
      sort_order: Math.max(1, siblings.length + 1) 
    });
  };

  const handleSortOrderChange = (value) => {
    const num = parseInt(value) || 1;
    setFormData({...formData, sort_order: Math.max(1, num)});
  };

  const handleEdit = (category) => {
    setEditingId(category.id);
    setIsAdding(false);
    setFormData({
      category_name: category.category_name,
      parent_id: category.parent_id,
      sort_order: category.sort_order,
      is_active: category.is_active
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setAddingParentId(null);
    setFormData({ category_name: '', parent_id: '', sort_order: 0 });
  };

  const handleSave = async () => {
    if (!formData.category_name.trim()) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: '입력 오류',
        message: '분류명을 입력하세요.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    try {
      if (isAdding) {
        await categoryAPI.create(formData);
        setModal({
          isOpen: true,
          type: 'success',
          title: '등록 완료',
          message: '품목분류가 등록되었습니다.',
          confirmText: '확인',
          showCancel: false,
          onConfirm: () => {}
        });
      } else {
        await categoryAPI.update(editingId, formData);
        setModal({
          isOpen: true,
          type: 'success',
          title: '수정 완료',
          message: '품목분류가 수정되었습니다.',
          confirmText: '확인',
          showCancel: false,
          onConfirm: () => {}
        });
      }
      handleCancel();
      loadCategories();
    } catch (error) {
      console.error('품목분류 저장 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '저장 실패',
        message: error.response?.data?.message || '품목분류 저장에 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => {}
      });
    }
  };

  const handleDelete = (id, name) => {
    setModal({
      isOpen: true,
      type: 'delete',
      title: '분류 삭제',
      message: `'${name}' 분류를 삭제하시겠습니까?`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await categoryAPI.delete(id);
          setModal({
            isOpen: true,
            type: 'success',
            title: '삭제 완료',
            message: '품목분류가 삭제되었습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {}
          });
          loadCategories();
        } catch (error) {
          console.error('품목분류 삭제 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '삭제 실패',
            message: error.response?.data?.message || '품목분류 삭제에 실패했습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => {}
          });
        }
      }
    });
  };

  const handleToggleActive = async (category) => {
    try {
      await categoryAPI.update(category.id, {
        ...category,
        is_active: !category.is_active
      });
      loadCategories();
    } catch (error) {
      console.error('상태 변경 오류:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // 부모 선택 옵션 (대분류만) - 향후 SearchableSelect에서 사용 예정
  // eslint-disable-next-line no-unused-vars
  const parentOptions = mainCategories.map(c => ({
    value: c.id,
    label: c.category_name
  }));

  // 행 렌더링 (대분류/중분류 구분)
  const renderRow = (category, isChild = false) => {
    const children = getChildren(category.id);
    const isEditing = editingId === category.id;
    
    return (
      <React.Fragment key={category.id}>
        <tr style={{
          backgroundColor: isEditing ? '#fff9e6' : (isChild ? '#f8f9fa' : '#fff')
        }}>
          {isEditing ? (
            <>
              <td>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => handleSortOrderChange(e.target.value)}
                  onKeyDown={handleKeyPress}
                  min="1"
                  style={numberInputStyle}
                />
              </td>
              <td>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  {isChild && <span style={{color: '#6c757d', marginLeft: '1rem'}}>└</span>}
                  <input
                    type="text"
                    value={formData.category_name}
                    onChange={(e) => setFormData({...formData, category_name: e.target.value})}
                    onKeyDown={handleKeyPress}
                    autoFocus
                    style={textInputStyle}
                  />
                </div>
              </td>
              <td>
                {isChild ? (
                  <span style={{color: '#6c757d', fontSize: '0.9rem'}}>{category.parent_name}</span>
                ) : '-'}
              </td>
              <td className="text-center">
                <label style={{cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'}}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    style={{width: '18px', height: '18px', cursor: 'pointer'}}
                  />
                  <span>{formData.is_active ? '사용' : '미사용'}</span>
                </label>
              </td>
              <td className="text-center">
                <button onClick={handleSave} className="btn btn-sm btn-success" style={{marginRight: '0.5rem'}}>
                  ✓ 저장
                </button>
                <button onClick={handleCancel} className="btn btn-sm btn-secondary">
                  ✕ 취소
                </button>
              </td>
            </>
          ) : (
            <>
              <td className="text-center">{category.sort_order}</td>
              <td>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  {isChild && <span style={{color: '#6c757d', marginLeft: '1rem'}}>└</span>}
                  <strong style={{color: isChild ? '#495057' : '#212529'}}>
                    {category.category_name}
                  </strong>
                  {!isChild && children.length > 0 && (
                    <span style={{
                      backgroundColor: '#e9ecef',
                      color: '#6c757d',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '0.8rem'
                    }}>
                      {children.length}
                    </span>
                  )}
                </div>
              </td>
              <td>
                {isChild ? (
                  <span style={{color: '#6c757d', fontSize: '0.9rem'}}>{category.parent_name}</span>
                ) : '-'}
              </td>
              <td className="text-center">
                <span 
                  className={`badge ${category.is_active ? 'badge-success' : 'badge-secondary'}`}
                  onClick={() => handleToggleActive(category)}
                  style={{cursor: 'pointer'}}
                  title="클릭하여 상태 변경"
                >
                  {category.is_active ? '사용' : '미사용'}
                </span>
              </td>
              <td className="text-center">
                {!isChild && (
                  <button
                    onClick={() => handleAdd(category.id)}
                    className="btn btn-sm btn-info"
                    style={{marginRight: '0.5rem'}}
                    title="하위 분류 추가"
                  >
                    + 하위
                  </button>
                )}
                <button
                  onClick={() => handleEdit(category)}
                  className="btn btn-sm btn-primary"
                  style={{marginRight: '0.5rem'}}
                >
                  수정
                </button>
                <button
                  onClick={() => handleDelete(category.id, category.category_name)}
                  className="btn btn-sm btn-danger"
                >
                  삭제
                </button>
              </td>
            </>
          )}
        </tr>
        
        {/* 하위 분류 추가 행 */}
        {isAdding && addingParentId === category.id && (
          <tr style={{backgroundColor: '#e8f4fd'}}>
            <td>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => handleSortOrderChange(e.target.value)}
                onKeyDown={handleKeyPress}
                min="1"
                style={numberInputStyle}
              />
            </td>
            <td>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <span style={{color: '#6c757d', marginLeft: '1rem'}}>└</span>
                <input
                  type="text"
                  value={formData.category_name}
                  onChange={(e) => setFormData({...formData, category_name: e.target.value})}
                  onKeyDown={handleKeyPress}
                  placeholder="하위 분류명을 입력하세요"
                  autoFocus
                  style={textInputStyle}
                />
              </div>
            </td>
            <td>
              <span style={{color: '#6c757d', fontSize: '0.9rem'}}>{category.category_name}</span>
            </td>
            <td className="text-center">
              <span className="badge badge-success">사용</span>
            </td>
            <td className="text-center">
              <button onClick={handleSave} className="btn btn-sm btn-success" style={{marginRight: '0.5rem'}}>
                ✓ 저장
              </button>
              <button onClick={handleCancel} className="btn btn-sm btn-secondary">
                ✕ 취소
              </button>
            </td>
          </tr>
        )}
        
        {/* 자식 분류 렌더링 */}
        {children.map(child => renderRow(child, true))}
      </React.Fragment>
    );
  };

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="category-list">
      <div className="page-header">
        <h1 className="page-title">품목분류 관리</h1>
        <button onClick={() => handleAdd(null)} className="btn btn-primary" disabled={isAdding}>
          + 대분류 추가
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{width: '80px'}}>순서</th>
              <th>분류명</th>
              <th style={{width: '120px'}}>상위분류</th>
              <th className="text-center" style={{width: '100px'}}>사용여부</th>
              <th className="text-center" style={{width: '220px'}}>액션</th>
            </tr>
          </thead>
          <tbody>
            {/* 대분류 추가 행 */}
            {isAdding && addingParentId === null && (
              <tr style={{backgroundColor: '#e8f4fd'}}>
                <td>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => handleSortOrderChange(e.target.value)}
                    onKeyDown={handleKeyPress}
                    min="1"
                    style={numberInputStyle}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={formData.category_name}
                    onChange={(e) => setFormData({...formData, category_name: e.target.value})}
                    onKeyDown={handleKeyPress}
                    placeholder="대분류명을 입력하세요"
                    autoFocus
                    style={textInputStyle}
                  />
                </td>
                <td>-</td>
                <td className="text-center">
                  <span className="badge badge-success">사용</span>
                </td>
                <td className="text-center">
                  <button onClick={handleSave} className="btn btn-sm btn-success" style={{marginRight: '0.5rem'}}>
                    ✓ 저장
                  </button>
                  <button onClick={handleCancel} className="btn btn-sm btn-secondary">
                    ✕ 취소
                  </button>
                </td>
              </tr>
            )}
            
            {mainCategories.length === 0 && !isAdding ? (
              <tr>
                <td colSpan="5" className="text-center">등록된 품목분류가 없습니다.</td>
              </tr>
            ) : (
              mainCategories.map(category => renderRow(category, false))
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        marginTop: '1.5rem', 
        padding: '1rem 1.25rem', 
        backgroundColor: '#f0f7ff', 
        borderRadius: '8px',
        border: '1px solid #d0e3f7'
      }}>
        <p style={{margin: 0, color: '#4a6785', fontSize: '0.9rem'}}>
          💡 <strong>TIP:</strong> 대분류(과일, 채소 등) 아래에 세부 분류(감귤류, 사과류 등)를 추가할 수 있습니다.
          품목 등록 시 세부 분류를 선택하면 됩니다.
        </p>
      </div>

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

export default CategoryList;
