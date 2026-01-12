import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { purchaseInventoryAPI } from '../services/api';
import { Link } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal';
import TradeDetailModal from '../components/TradeDetailModal';
import { useAuth } from '../context/AuthContext';

// 금액 포맷 함수 (컴포넌트 외부)
const formatCurrency = (value) => {
  return new Intl.NumberFormat('ko-KR').format(value || 0);
};

const formatNumber = (value) => {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value || 0);
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 다중 필터링 함수 (AND 조건, 금액은 쉼표 유무 모두 지원)
const filterInventory = (items, filterText) => {
  if (!filterText.trim()) return items;

  const keywords = filterText.toLowerCase().trim().split(/\s+/).filter(k => k);
  if (keywords.length === 0) return items;

  return items.filter(item => {
    const priceFormatted = formatCurrency(item.unit_price);
    const priceRaw = String(item.unit_price || 0);
    const searchableText = [
      item.product_name?.toLowerCase() || '',
      item.grade?.toLowerCase() || '',
      item.company_name?.toLowerCase() || '',
      item.sender?.toLowerCase() || '',
      item.shipper_location?.toLowerCase() || '',
      priceFormatted,
      priceRaw
    ].join(' ');

    return keywords.every(keyword => searchableText.includes(keyword));
  });
};

function InventoryList() {
  const [allInventory, setAllInventory] = useState([]);
  const [summary, setSummary] = useState([]);
  const [viewMode, setViewMode] = useState('detail'); // 'detail' | 'summary'
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const getScopedKey = (key) => user?.id ? `u${user.id}_${key}` : key;

  // 개별 필터링 키워드
  const [availableFilter, setAvailableFilter] = useState('');
  const [depletedFilter, setDepletedFilter] = useState('');

  // 좌우 위치 설정 (localStorage에 저장)
  const [layoutOrder, setLayoutOrder] = useState({ left: 'AVAILABLE', right: 'DEPLETED' });

  // Load Layout
  useEffect(() => {
    const saved = localStorage.getItem(getScopedKey('inventoryListLayout'));
    if (saved) {
      try {
        setLayoutOrder(JSON.parse(saved));
      } catch (e) {
        setLayoutOrder({ left: 'AVAILABLE', right: 'DEPLETED' });
      }
    }
  }, [user?.id]);

  // 패널 크기 비율 (0.3 ~ 0.7, 기본 0.5)
  const [splitRatio, setSplitRatio] = useState(0.5);

  // Load Split Ratio
  useEffect(() => {
    const saved = localStorage.getItem(getScopedKey('inventoryListSplitRatio'));
    if (saved) setSplitRatio(parseFloat(saved));
  }, [user?.id]);

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => { }, confirmText: '확인', showCancel: false });

  // 전표 상세 모달 상태
  const [tradeDetailModal, setTradeDetailModal] = useState({
    isOpen: false,
    tradeId: null
  });

  // 상세 보기 모달 상태
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    inventory: null,
    matchings: [],
    loading: false
  });

  // 좌우 위치 변경
  const toggleLayout = () => {
    const newLayout = {
      left: layoutOrder.right,
      right: layoutOrder.left
    };
    setLayoutOrder(newLayout);
    localStorage.setItem(getScopedKey('inventoryListLayout'), JSON.stringify(newLayout));
  };

  // 비율 초기화
  const resetSplitRatio = () => {
    setSplitRatio(0.5);
    localStorage.setItem(getScopedKey('inventoryListSplitRatio'), '0.5');
  };

  // 리사이즈 핸들러
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newRatio = Math.min(Math.max(x / rect.width, 0.3), 0.7);

    setSplitRatio(newRatio);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem(getScopedKey('inventoryListSplitRatio'), splitRatio.toString());
    }
  }, [isDragging, splitRatio, user?.id]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    loadData();
  }, []);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && detailModal.isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setDetailModal(prev => ({ ...prev, isOpen: false }));
      }
    };

    if (detailModal.isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [detailModal.isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      // 전체 재고를 가져옴 (status 필터 없이)
      const [inventoryRes, summaryRes] = await Promise.all([
        purchaseInventoryAPI.getAll({ status: '' }),
        purchaseInventoryAPI.getSummaryByProduct()
      ]);
      setAllInventory(inventoryRes.data.data || []);
      setSummary(summaryRes.data.data || []);
    } catch (error) {
      console.error('재고 데이터 로딩 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '로딩 실패', message: '재고 데이터를 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => { } });
    } finally {
      setLoading(false);
    }
  };

  // 상태별로 분리
  const availableInventory = useMemo(() => {
    return allInventory.filter(item => item.status === 'AVAILABLE' && Number(item.remaining_quantity) > 0);
  }, [allInventory]);

  const depletedInventory = useMemo(() => {
    return allInventory.filter(item => item.status === 'DEPLETED');
  }, [allInventory]);

  // 필터링된 목록
  const filteredAvailable = useMemo(() => {
    return filterInventory(availableInventory, availableFilter);
  }, [availableInventory, availableFilter]);

  const filteredDepleted = useMemo(() => {
    return filterInventory(depletedInventory, depletedFilter);
  }, [depletedInventory, depletedFilter]);

  // 상세 조회
  const handleViewDetail = async (item) => {
    setDetailModal({
      isOpen: true,
      inventory: item,
      matchings: [],
      loading: true
    });

    try {
      const response = await purchaseInventoryAPI.getById(item.id);
      setDetailModal(prev => ({
        ...prev,
        inventory: response.data.data.inventory,
        matchings: response.data.data.matchings,
        loading: false
      }));
    } catch (error) {
      console.error('상세 조회 오류:', error);
      setDetailModal(prev => ({
        ...prev,
        loading: false
      }));
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return <span className="badge badge-success">사용가능</span>;
      case 'DEPLETED':
        return <span className="badge badge-secondary">소진</span>;
      case 'CANCELLED':
        return <span className="badge badge-danger">취소</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  // 전체 통계 계산 (사용가능 재고만)
  const totalStats = {
    totalQuantity: availableInventory.reduce((sum, item) => sum + parseFloat(item.remaining_quantity || 0), 0),
    totalWeight: availableInventory.reduce((sum, item) => sum + parseFloat(item.total_weight || 0) * (parseFloat(item.remaining_quantity || 0) / parseFloat(item.original_quantity || 1)), 0),
    totalValue: availableInventory.reduce((sum, item) => sum + (parseFloat(item.remaining_quantity || 0) * parseFloat(item.unit_price || 0)), 0),
    availableCount: availableInventory.length,
    depletedCount: depletedInventory.length
  };

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  // 테이블 컴포넌트
  const InventoryTable = ({ items, status }) => {
    const isAvailable = status === 'AVAILABLE';
    const headerBgColor = isAvailable ? '#f0fdf4' : '#f8fafc';
    const headerTextColor = isAvailable ? '#16a34a' : '#64748b';
    const headerBorderColor = isAvailable ? '#16a34a' : '#94a3b8';

    return (
      <div style={{ width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr style={{ backgroundColor: headerBgColor, borderBottom: `2px solid ${headerBorderColor}` }}>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>매입일</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>품목</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>등급</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>매입처</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>출하주</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem' }}>수량</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem' }}>단가</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', width: '50px' }}>상세</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '2rem', color: '#888', textAlign: 'center', fontSize: '0.85rem' }}>
                  {isAvailable ? '사용가능한 재고가 없습니다.' : '소진된 재고가 없습니다.'}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const usedQuantity = parseFloat(item.original_quantity) - parseFloat(item.remaining_quantity);
                const originalWeight = parseFloat(item.total_weight || 0);

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}>{formatDate(item.purchase_date)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem', fontWeight: '500' }}>
                      {item.product_name}
                      {originalWeight > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#666', marginLeft: '4px' }}>
                          {formatNumber(originalWeight)}kg
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}>
                      {item.grade ? <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{item.grade}</span> : '-'}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}>{item.company_name || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}>{item.sender || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem', textAlign: 'right' }}>
                      <strong style={{ color: isAvailable ? '#16a34a' : '#94a3b8' }}>
                        {formatNumber(item.remaining_quantity)}
                      </strong>
                      {usedQuantity > 0 && (
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '4px' }}>
                          /{formatNumber(item.original_quantity)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem', textAlign: 'right' }}>
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleViewDetail(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          color: '#3498db',
                          padding: '2px 6px'
                        }}
                        title="상세 보기"
                      >
                        🔍
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // 합계 계산
  const availableTotal = filteredAvailable.reduce((sum, i) => sum + (parseFloat(i.remaining_quantity || 0) * parseFloat(i.unit_price || 0)), 0);
  const depletedTotal = filteredDepleted.reduce((sum, i) => sum + (parseFloat(i.original_quantity || 0) * parseFloat(i.unit_price || 0)), 0);

  // 패널 렌더링 함수
  const renderPanel = (status) => {
    const isAvailable = status === 'AVAILABLE';
    const items = isAvailable ? filteredAvailable : filteredDepleted;
    const allItems = isAvailable ? availableInventory : depletedInventory;
    const filter = isAvailable ? availableFilter : depletedFilter;
    const setFilter = isAvailable ? setAvailableFilter : setDepletedFilter;
    const total = isAvailable ? availableTotal : depletedTotal;
    const color = isAvailable ? '#16a34a' : '#64748b';
    const bgColor = isAvailable ? '#f0fdf4' : '#f8fafc';
    const icon = isAvailable ? '✅' : '📦';
    const label = isAvailable ? '사용가능' : '소진';

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        {/* 패널 헤더 */}
        <div style={{
          padding: '0.6rem 0.75rem',
          backgroundColor: bgColor,
          borderBottom: `2px solid ${color}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem', color: color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {icon} {label} 재고
            <span style={{
              fontSize: '0.75rem',
              backgroundColor: color,
              color: 'white',
              padding: '2px 8px',
              borderRadius: '10px'
            }}>
              {items.length}건
              {filter && ` / ${allItems.length}`}
            </span>
          </h2>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: color }}>
            {formatCurrency(total)}원
          </span>
        </div>

        {/* 필터 입력 */}
        <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #eee', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="🔍 품목, 등급, 매입처, 출하주, 단가..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '0.35rem 0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '0.8rem',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* 테이블 영역 (스크롤) */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <InventoryTable items={items} status={status} />
        </div>
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 60px)',
      backgroundColor: '#f5f6fa'
    }}>
      {/* 헤더 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            📊 재고 현황
          </h1>
          <button
            onClick={toggleLayout}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: '#9b59b6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s'
            }}
            title="좌우 위치 변경"
          >
            🔄 위치 변경
            <span style={{
              fontSize: '0.75rem',
              opacity: 0.9,
              backgroundColor: 'rgba(255,255,255,0.2)',
              padding: '0.15rem 0.4rem',
              borderRadius: '4px'
            }}>
              {layoutOrder.left === 'AVAILABLE' ? '사용가능←→소진' : '소진←→사용가능'}
            </span>
          </button>
          {splitRatio !== 0.5 && (
            <button
              onClick={resetSplitRatio}
              style={{
                padding: '0.4rem 0.8rem',
                backgroundColor: '#7f8c8d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500'
              }}
              title="패널 크기 초기화"
            >
              ↔ 크기 초기화
            </button>
          )}
          <button
            onClick={loadData}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500'
            }}
          >
            🔄 새로고침
          </button>
        </div>

        {/* 통계 요약 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.85rem'
        }}>
          <span style={{ color: '#16a34a', fontWeight: '600' }}>
            ✅ 사용가능: {totalStats.availableCount}건
          </span>
          <span style={{ color: '#64748b' }}>
            📦 소진: {totalStats.depletedCount}건
          </span>
          <span style={{ color: '#3498db', fontWeight: '600' }}>
            💰 재고금액: {formatCurrency(totalStats.totalValue)}원
          </span>
          <Link to="/matching" className="btn btn-success" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            마감 (매칭)
          </Link>
        </div>
      </div>

      {/* 메인 컨텐츠 - 좌우 분할 */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          padding: '0.5rem',
          overflow: 'hidden',
          minHeight: 0,
          gap: 0
        }}
      >
        {/* 왼쪽 패널 */}
        <div style={{
          flex: `0 0 calc(${splitRatio * 100}% - 4px)`,
          display: 'flex',
          minWidth: '300px',
          minHeight: 0
        }}>
          {renderPanel(layoutOrder.left)}
        </div>

        {/* 리사이즈 핸들 */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: '8px',
            backgroundColor: isDragging ? '#9b59b6' : '#e0e0e0',
            cursor: 'col-resize',
            transition: isDragging ? 'none' : 'background-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderRadius: '4px',
            margin: '0 2px'
          }}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = '#9b59b6'; }}
          onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = '#e0e0e0'; }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                width: '3px',
                height: '3px',
                backgroundColor: isDragging ? 'white' : '#999',
                borderRadius: '50%'
              }} />
            ))}
          </div>
        </div>

        {/* 오른쪽 패널 */}
        <div style={{
          flex: 1,
          display: 'flex',
          minWidth: '300px',
          minHeight: 0
        }}>
          {renderPanel(layoutOrder.right)}
        </div>
      </div>

      {/* 상세 보기 모달 */}
      {detailModal.isOpen && createPortal(
        <div className="modal-overlay">
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '85vh',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fff'
            }}>
              <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.1rem', fontWeight: '600' }}>
                🔍 매입 재고 상세
              </h3>
              <button
                onClick={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
            <div style={{
              padding: '1.5rem',
              overflowY: 'auto',
              maxHeight: 'calc(85vh - 130px)',
              backgroundColor: '#fff'
            }}>
              {detailModal.loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  불러오는 중...
                </div>
              ) : detailModal.inventory && (
                <>
                  {/* 기본 정보 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                    padding: '1rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px'
                  }}>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>품목</label>
                      <div style={{ fontWeight: '600' }}>
                        {detailModal.inventory.product_name}
                        {detailModal.inventory.grade && (
                          <span className="badge badge-info" style={{ marginLeft: '8px' }}>
                            {detailModal.inventory.grade}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>매입처</label>
                      <div style={{ fontWeight: '600' }}>{detailModal.inventory.company_name}</div>
                    </div>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>매입일</label>
                      <div>{formatDate(detailModal.inventory.purchase_date)}</div>
                    </div>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>전표번호</label>
                      <div
                        style={{ color: '#3b82f6', cursor: 'pointer' }}
                        onClick={() => {
                          setDetailModal(prev => ({ ...prev, isOpen: false }));
                          setTradeDetailModal({ isOpen: true, tradeId: detailModal.inventory.trade_master_id });
                        }}
                      >
                        {detailModal.inventory.trade_number}
                      </div>
                    </div>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>원래 수량</label>
                      <div>{formatNumber(detailModal.inventory.original_quantity)}개</div>
                    </div>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>남은 수량</label>
                      <div style={{ fontWeight: '600', color: '#22c55e' }}>
                        {formatNumber(detailModal.inventory.remaining_quantity)}개
                      </div>
                    </div>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>매입 단가</label>
                      <div>{formatCurrency(detailModal.inventory.unit_price)}원</div>
                    </div>
                    <div>
                      <label style={{ color: '#64748b', fontSize: '0.875rem' }}>상태</label>
                      <div>{getStatusBadge(detailModal.inventory.status)}</div>
                    </div>
                    {detailModal.inventory.shipper_location && (
                      <div>
                        <label style={{ color: '#64748b', fontSize: '0.875rem' }}>출하지</label>
                        <div>{detailModal.inventory.shipper_location}</div>
                      </div>
                    )}
                    {detailModal.inventory.sender && (
                      <div>
                        <label style={{ color: '#64748b', fontSize: '0.875rem' }}>출하주</label>
                        <div>{detailModal.inventory.sender}</div>
                      </div>
                    )}
                  </div>

                  {/* 매칭 이력 */}
                  <h4 style={{ marginBottom: '1rem', color: '#1e293b' }}>
                    📋 매출 매칭 이력 ({detailModal.matchings.length}건)
                  </h4>
                  {detailModal.matchings.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '2rem',
                      color: '#64748b',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px'
                    }}>
                      아직 매출과 매칭된 이력이 없습니다.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#334155' }}>
                          <th style={{ padding: '10px', color: '#fff', fontWeight: '500', textAlign: 'left', fontSize: '0.9rem' }}>매칭일</th>
                          <th style={{ padding: '10px', color: '#fff', fontWeight: '500', textAlign: 'left', fontSize: '0.9rem' }}>매출전표</th>
                          <th style={{ padding: '10px', color: '#fff', fontWeight: '500', textAlign: 'left', fontSize: '0.9rem' }}>고객</th>
                          <th style={{ padding: '10px', color: '#fff', fontWeight: '500', textAlign: 'right', fontSize: '0.9rem' }}>매칭수량</th>
                          <th style={{ padding: '10px', color: '#fff', fontWeight: '500', textAlign: 'right', fontSize: '0.9rem' }}>매출단가</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailModal.matchings.map((match, index) => (
                          <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '10px' }}>{formatDate(match.matched_at)}</td>
                            <td style={{ padding: '10px' }}>
                              <span
                                onClick={() => {
                                  setDetailModal(prev => ({ ...prev, isOpen: false }));
                                  setTradeDetailModal({ isOpen: true, tradeId: match.sale_trade_master_id });
                                }}
                                style={{
                                  color: '#3b82f6',
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                                title="전표 상세 보기"
                              >
                                {match.sale_trade_number}
                              </span>
                            </td>
                            <td style={{ padding: '10px' }}>{match.customer_name}</td>
                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>
                              -{formatNumber(match.matched_quantity)}개
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(match.sale_unit_price)}원</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e5e7eb',
              textAlign: 'right',
              backgroundColor: '#f8fafc'
            }}>
              <button
                onClick={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
                className="btn btn-secondary"
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmModal isOpen={modal.isOpen} onClose={() => setModal(prev => ({ ...prev, isOpen: false }))} onConfirm={modal.onConfirm} title={modal.title} message={modal.message} type={modal.type} confirmText={modal.confirmText} showCancel={modal.showCancel} />

      <TradeDetailModal
        isOpen={tradeDetailModal.isOpen}
        onClose={() => setTradeDetailModal({ isOpen: false, tradeId: null })}
        tradeId={tradeDetailModal.tradeId}
      />
    </div>
  );
}

export default InventoryList;
