import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { productAPI, categoryAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';

function ProductList() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    category_id: '',
    is_active: ''  // 전체
  });
  const [expandedGroups, setExpandedGroups] = useState({});
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [currentDragGroup, setCurrentDragGroup] = useState(null);
  const dragNode = useRef(null);
  const pendingReorder = useRef(false);
  const productsRef = useRef(products);
  const draggedIdRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // 그룹 드래그 관련 상태
  const [draggedGroupName, setDraggedGroupName] = useState(null);
  const [dragOverGroupName, setDragOverGroupName] = useState(null);
  const [groupOrder, setGroupOrder] = useState([]);

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

  useEffect(() => {
    loadCategories();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCategories = async () => {
    try {
      const response = await categoryAPI.getAll({ is_active: 'true' });
      setCategories(response.data.data);
    } catch (error) {
      console.error('품목분류 로딩 오류:', error);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await productAPI.getAll(filters);
      const data = response.data.data;
      setProducts(data);
      productsRef.current = data;
    } catch (error) {
      console.error('품목 목록 로딩 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '로딩 실패',
        message: '품목 목록을 불러오는데 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadProducts();
  };

  const handleDelete = (id, name) => {
    setModal({
      isOpen: true,
      type: 'delete',
      title: '품목 삭제',
      message: `'${name}' 품목을 삭제하시겠습니까?`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await productAPI.delete(id);
          setModal({
            isOpen: true,
            type: 'success',
            title: '삭제 완료',
            message: '품목이 삭제되었습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => { }
          });
          loadProducts();
        } catch (error) {
          console.error('품목 삭제 오류:', error);
          setModal({
            isOpen: true,
            type: 'warning',
            title: '삭제 실패',
            message: error.response?.data?.message || '품목 삭제에 실패했습니다.',
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
        message: '삭제할 품목을 선택하세요.',
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
      message: `선택한 ${selectedIds.length}개의 품목을 삭제하시겠습니까?`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          let successCount = 0;
          let failCount = 0;

          for (const id of selectedIds) {
            try {
              await productAPI.delete(id);
              successCount++;
            } catch (error) {
              failCount++;
              console.error(`품목 ID ${id} 삭제 실패:`, error);
            }
          }

          if (failCount > 0) {
            setModal({
              isOpen: true,
              type: 'warning',
              title: '삭제 결과',
              message: `${successCount}개 삭제 성공, ${failCount}개 삭제 실패\n(거래 내역이 있는 품목은 삭제할 수 없습니다)`,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => { }
            });
          } else {
            setModal({
              isOpen: true,
              type: 'success',
              title: '삭제 완료',
              message: `${successCount}개 품목이 삭제되었습니다.`,
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => { }
            });
          }

          setSelectedIds([]);
          setIsSelectMode(false);
          loadProducts();
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
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map(p => p.id));
    }
  };

  const handleToggleActive = async (product) => {
    try {
      await productAPI.update(product.id, {
        ...product,
        is_active: !product.is_active
      });
      // 로컬 상태만 업데이트 (새로고침 없이)
      setProducts(prev => prev.map(p =>
        p.id === product.id ? { ...p, is_active: !p.is_active } : p
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

  // 드래그 시작
  const handleDragStart = (e, product) => {
    setDraggedId(product.id);
    draggedIdRef.current = product.id;
    setCurrentDragGroup(product.product_name);
    dragNode.current = e.target;
    dragNode.current.addEventListener('dragend', handleDragEnd);
    setTimeout(() => {
      e.target.style.opacity = '0.5';
    }, 0);
  };

  // 드래그 중
  const handleDragEnter = (e, product) => {
    // 같은 그룹 내에서만 이동 가능
    if (product.product_name !== currentDragGroup) return;
    if (product.id === draggedId) return;

    setDragOverId(product.id);

    // products 배열에서 직접 순서 변경
    setProducts(prevProducts => {
      const newProducts = [...prevProducts];
      const draggedIndex = newProducts.findIndex(p => p.id === draggedId);
      const targetIndex = newProducts.findIndex(p => p.id === product.id);

      if (draggedIndex === -1 || targetIndex === -1) return prevProducts;

      // 드래그한 항목을 제거하고 타겟 위치에 삽입
      const [draggedProduct] = newProducts.splice(draggedIndex, 1);
      newProducts.splice(targetIndex, 0, draggedProduct);

      // ref도 업데이트
      productsRef.current = newProducts;

      return newProducts;
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
    setCurrentDragGroup(null);
    draggedIdRef.current = null;
    dragNode.current = null;

    // 드래그가 있었으면 자동 저장 (ref에서 최신 배열 사용)
    if (hadDrag && !pendingReorder.current) {
      pendingReorder.current = true;
      try {
        const items = productsRef.current.map((product, index) => ({
          id: product.id,
          sort_order: index + 1
        }));
        await productAPI.reorder({ items });
        // 로컬 상태에서 sort_order 업데이트 (새로고침 없이)
        const updatedProducts = productsRef.current.map((product, index) => ({
          ...product,
          sort_order: index + 1
        }));
        productsRef.current = updatedProducts;
        setProducts(updatedProducts);
      } catch (error) {
        console.error('순번 저장 오류:', error);
      } finally {
        pendingReorder.current = false;
      }
    }
  };

  // 그룹 드래그 시작
  const handleGroupDragStart = (e, groupName) => {
    e.stopPropagation();
    setDraggedGroupName(groupName);
    // 현재 그룹 순서 저장
    const currentGroups = getGroupedData();
    setGroupOrder(currentGroups.map(g => g.name));
    setTimeout(() => {
      e.target.closest('tr').style.opacity = '0.5';
    }, 0);
  };

  // 그룹 드래그 중
  const handleGroupDragEnter = (e, groupName) => {
    e.stopPropagation();
    if (groupName === draggedGroupName) return;

    setDragOverGroupName(groupName);

    // 그룹 순서 변경
    setGroupOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedGroupName);
      const targetIndex = newOrder.indexOf(groupName);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedGroupName);

      return newOrder;
    });
  };

  // 그룹 드래그 종료
  const handleGroupDragEnd = async (e) => {
    if (e.target.closest) {
      const row = e.target.closest('tr');
      if (row) row.style.opacity = '1';
    }

    const hadDrag = draggedGroupName !== null;
    const finalOrder = [...groupOrder];

    setDraggedGroupName(null);
    setDragOverGroupName(null);

    // 그룹 순서 저장
    if (hadDrag && finalOrder.length > 0) {
      try {
        // 각 그룹의 품목들에 새로운 sort_order 부여
        const items = [];
        let sortOrder = 1;

        finalOrder.forEach(groupName => {
          const groupProducts = products.filter(p => p.product_name === groupName);
          // 그룹 내 기존 sort_order 순서 유지
          groupProducts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          groupProducts.forEach(product => {
            items.push({
              id: product.id,
              sort_order: sortOrder++
            });
          });
        });

        await productAPI.reorder({ items });

        // 로컬 상태 업데이트
        const sortOrderMap = {};
        items.forEach(item => {
          sortOrderMap[item.id] = item.sort_order;
        });

        const updatedProducts = products.map(product => ({
          ...product,
          sort_order: sortOrderMap[product.id] || product.sort_order
        }));

        // sort_order 기준으로 정렬
        updatedProducts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        productsRef.current = updatedProducts;
        setProducts(updatedProducts);
        setGroupOrder([]);
      } catch (error) {
        console.error('그룹 순번 저장 오류:', error);
        setGroupOrder([]);
      }
    }
  };

  // 그룹 확장/축소 토글
  const toggleGroup = (productName) => {
    setExpandedGroups(prev => {
      // 현재 상태가 undefined면 기본값은 true(확장)이므로, 클릭하면 false(축소)
      const currentState = prev[productName] !== false;
      return {
        ...prev,
        [productName]: !currentState
      };
    });
  };

  // 전체 확장/축소
  const toggleAllGroups = (expand) => {
    const groupNames = [...new Set(products.map(p => p.product_name))];
    const newState = {};
    groupNames.forEach(name => {
      newState[name] = expand;
    });
    setExpandedGroups(newState);
  };

  // 현재 전체 확장 상태 확인
  const isAllExpanded = () => {
    const groupNames = [...new Set(products.map(p => p.product_name))];
    return groupNames.every(name => expandedGroups[name] !== false);
  };

  // 계층형 카테고리 옵션 생성
  const buildCategoryOptions = () => {
    const options = [{ value: '', label: '전체' }];
    const mainCategories = categories.filter(c => !c.parent_id);

    mainCategories.forEach(main => {
      // 대분류
      options.push({
        value: main.id,
        label: `📁 ${main.category_name}`
      });

      // 하위 분류
      const children = categories.filter(c => c.parent_id === main.id);
      children.forEach(child => {
        options.push({
          value: child.id,
          label: `    └ ${child.category_name}`
        });
      });
    });

    return options;
  };

  const categoryOptions = buildCategoryOptions();

  // 품목명으로 그룹화 (일반 모드: sort_order 정렬, 순번변경 모드: 현재 배열 순서 유지)
  const getGroupedData = () => {
    // 품목명별로 그룹화 (배열 순서 유지)
    const groups = {};
    const groupOrder = []; // 그룹 순서 유지용

    products.forEach((product, originalIndex) => {
      const name = product.product_name || '미분류';
      if (!groups[name]) {
        groups[name] = {
          name,
          items: [],
          category: product.category_name,
          minSortOrder: product.sort_order || 9999
        };
        groupOrder.push(name);
      }
      groups[name].items.push({
        ...product,
        originalIndex
      });
      // 그룹의 최소 sort_order 업데이트
      if ((product.sort_order || 9999) < groups[name].minSortOrder) {
        groups[name].minSortOrder = product.sort_order || 9999;
      }
    });

    // 드래그 중이 아닐 때만 sort_order로 정렬
    if (!draggedId && !draggedGroupName) {
      Object.keys(groups).forEach(name => {
        groups[name].items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      });
    }

    // 그룹 드래그 중이 아닐 때는 minSortOrder 기준으로 정렬
    let sortedGroups;
    if (draggedGroupName && groupOrder.length > 0) {
      // 드래그 중일 때는 groupOrder 순서 유지
      sortedGroups = groupOrder.map(name => groups[name]).filter(Boolean);
    } else {
      // 드래그 중이 아닐 때는 minSortOrder 기준 정렬
      sortedGroups = Object.values(groups).sort((a, b) =>
        (a.minSortOrder || 9999) - (b.minSortOrder || 9999)
      );
    }

    // 그룹 인덱스 추가
    return sortedGroups.map((group, groupIndex) => ({
      ...group,
      groupIndex
    }));
  };

  const groupedData = getGroupedData();

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="product-list">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>📦 품목 관리</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isSelectMode ? (
            <>
              <button
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedIds([]);
                }}
                className="btn btn-secondary"
              >
                ✕ 취소
              </button>
              <button
                onClick={handleMultiDelete}
                className="btn btn-danger"
                disabled={selectedIds.length === 0}
              >
                🗑 선택 삭제 ({selectedIds.length})
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsSelectMode(true)}
                className="btn btn-outline"
                style={{
                  border: '1px solid #ef4444',
                  backgroundColor: 'white',
                  color: '#ef4444'
                }}
              >
                ☑ 선택 삭제
              </button>
              <Link to="/products/new" className="btn btn-primary">
                + 품목 등록
              </Link>
            </>
          )}
        </div>
      </div>

      {isSelectMode && (
        <div style={{
          marginBottom: '1rem',
          padding: '1rem',
          backgroundColor: '#fee2e2',
          borderRadius: '8px',
          border: '1px solid #fca5a5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>
            🗑 <strong>선택 삭제 모드</strong> - 삭제할 품목을 선택하세요.
          </p>
          <button
            onClick={handleSelectAll}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: '#fff',
              border: '1px solid #dc2626',
              borderRadius: '4px',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {selectedIds.length === products.length ? '전체 해제' : '전체 선택'}
          </button>
        </div>
      )}

      <div className="search-filter-container">
        <div className="filter-row">
          <div className="filter-group">
            <label>검색</label>
            <input
              type="text"
              placeholder="품목명 또는 코드"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="filter-group">
            <label>품목분류</label>
            <SearchableSelect
              options={categoryOptions}
              value={filters.category_id}
              onChange={(option) => {
                setFilters({ ...filters, category_id: option ? option.value : '' });
              }}
              placeholder="전체"
              isClearable={false}
            />
          </div>
          <div className="filter-group">
            <label>사용여부</label>
            <select
              value={filters.is_active}
              onChange={(e) => setFilters({ ...filters, is_active: e.target.value })}
            >
              <option value="">전체</option>
              <option value="true">사용</option>
              <option value="false">미사용</option>
            </select>
          </div>
          <div className="filter-group">
            <label>&nbsp;</label>
            <button onClick={handleSearch} className="btn btn-primary">
              검색
            </button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {isSelectMode && <th style={{ width: '40px' }}></th>}
              <th style={{ width: '60px', textAlign: 'center' }}>
                <span
                  onClick={() => toggleAllGroups(!isAllExpanded())}
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: '#e2e8f0',
                    userSelect: 'none'
                  }}
                  title={isAllExpanded() ? '전체 접기' : '전체 펼치기'}
                >
                  {isAllExpanded() ? '▼' : '▶'}
                </span>
              </th>
              <th>품목명</th>
              <th>등급</th>
              <th className="text-right">중량(kg)</th>
              <th>품목분류</th>
              <th className="text-center">사용여부</th>
              {!isSelectMode && <th className="text-center" style={{ minWidth: '180px' }}>액션</th>}
            </tr>
          </thead>
          <tbody>
            {groupedData.length === 0 ? (
              <tr>
                <td colSpan={isSelectMode ? "7" : "8"} className="text-center">등록된 품목이 없습니다.</td>
              </tr>
            ) : (
              groupedData.map((group) => (
                <React.Fragment key={group.name}>
                  {group.items.map((product, indexInGroup) => {
                    const isFirst = indexInGroup === 0;
                    const isExpanded = expandedGroups[group.name] !== false;
                    const showRow = isFirst || isExpanded;

                    if (!showRow) return null;

                    return (
                      <tr
                        key={product.id}
                        draggable={!isSelectMode && !draggedGroupName}
                        onDragStart={!isSelectMode && !draggedGroupName ? (e) => handleDragStart(e, product) : undefined}
                        onDragEnter={!isSelectMode && !draggedGroupName ? (e) => handleDragEnter(e, product) : undefined}
                        onDragOver={(e) => e.preventDefault()}
                        style={{
                          backgroundColor: dragOverGroupName === group.name
                            ? '#fef3c7'
                            : dragOverId === product.id
                              ? '#e0f2fe'
                              : (group.groupIndex % 2 === 0 ? '#ffffff' : '#f8fafc'),
                          borderTop: isFirst ? '2px solid #e2e8f0' : 'none',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        {isSelectMode && (
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(product.id)}
                              onChange={() => handleCheckboxToggle(product.id)}
                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                          </td>
                        )}
                        <td style={{
                          textAlign: 'center',
                          fontSize: '1rem',
                          cursor: isSelectMode ? 'default' : 'grab',
                          width: '60px',
                          minWidth: '60px'
                        }}>
                          {!isSelectMode && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '10px',
                              width: '100%'
                            }}>
                              <span
                                draggable={isFirst}
                                onDragStart={isFirst ? (e) => handleGroupDragStart(e, group.name) : undefined}
                                onDragEnter={isFirst ? (e) => handleGroupDragEnter(e, group.name) : undefined}
                                onDragEnd={isFirst ? handleGroupDragEnd : undefined}
                                onDragOver={isFirst ? (e) => e.preventDefault() : undefined}
                                style={{
                                  cursor: isFirst ? 'grab' : 'default',
                                  color: isFirst ? '#f59e0b' : 'transparent',
                                  width: '16px',
                                  textAlign: 'center',
                                  userSelect: 'none'
                                }}
                                title={isFirst ? "그룹 순서 변경" : ""}
                              >
                                ⋮⋮
                              </span>
                              <span
                                style={{
                                  color: isExpanded ? '#94a3b8' : 'transparent',
                                  width: '16px',
                                  textAlign: 'center'
                                }}
                                title={isExpanded ? "등급 순서 변경" : ""}
                              >
                                ☰
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          {isFirst ? (
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: group.items.length > 1 ? 'pointer' : 'default' }}
                              onClick={group.items.length > 1 ? () => toggleGroup(group.name) : undefined}
                            >
                              {group.items.length > 1 && (
                                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                              )}
                              <strong style={{
                                fontSize: '1.05rem',
                                color: '#1e293b'
                              }}>
                                {product.product_name?.replace(/\([^)]*\)$/, '').trim()}
                              </strong>
                              {group.items.length > 1 && (
                                <span style={{
                                  backgroundColor: '#e0f2fe',
                                  color: '#0369a1',
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500'
                                }}>
                                  {group.items.length}개 등급
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', paddingLeft: '1.5rem' }}>└</span>
                          )}
                        </td>
                        <td>
                          {product.grade ? (
                            <span
                              className="badge badge-info"
                              style={{
                                backgroundColor: '#93c5fd',
                                fontWeight: '500'
                              }}
                            >
                              {product.grade}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="text-right" style={{ color: '#64748b' }}>
                          {product.weight ? `${Number(product.weight) % 1 === 0 ? Math.floor(product.weight) : Math.round(product.weight * 10) / 10}kg` : '-'}
                        </td>
                        <td style={{ color: '#64748b' }}>{product.category_name || '-'}</td>
                        <td className="text-center">
                          <span
                            className={`badge ${product.is_active ? 'badge-success' : 'badge-secondary'}`}
                            onClick={() => handleToggleActive(product)}
                            style={{ cursor: 'pointer' }}
                            title="클릭하여 상태 변경"
                          >
                            {product.is_active ? '사용' : '미사용'}
                          </span>
                        </td>
                        {!isSelectMode && (
                          <td className="text-center" style={{ whiteSpace: 'nowrap' }}>
                            {isFirst && group.items.length >= 1 && (
                              <Link
                                to={`/products/new?copyFrom=${product.id}`}
                                className="btn btn-sm"
                                style={{
                                  marginRight: '0.5rem',
                                  backgroundColor: '#10b981',
                                  color: 'white',
                                  border: 'none'
                                }}
                                title="이 품목에 새 등급 추가"
                              >
                                +등급
                              </Link>
                            )}
                            <Link
                              to={`/products/edit/${product.id}`}
                              className="btn btn-sm btn-primary"
                              style={{ marginRight: '0.5rem' }}
                            >
                              수정
                            </Link>
                            <button
                              onClick={() => handleDelete(product.id, product.product_name)}
                              className="btn btn-sm btn-danger"
                            >
                              삭제
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}

export default ProductList;
