import React, { useState, useEffect, useRef } from 'react';
import { tradeAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

function Statistics() {
  const [purchaseStats, setPurchaseStats] = useState([]);
  const [saleStats, setSaleStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => {}, confirmText: '확인', showCancel: false });
  
  // 조회 유형: daily, monthly, yearly
  const [viewType, setViewType] = useState('daily');
  
  const [filters, setFilters] = useState({
    start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });

  // 패널 크기 비율 (0.3 ~ 0.7, 기본 0.5)
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('statisticsSplitRatio');
    return saved ? parseFloat(saved) : 0.5;
  });

  // 좌우 레이아웃 순서
  const [layoutOrder, setLayoutOrder] = useState(() => {
    const saved = localStorage.getItem('statisticsLayoutOrder');
    return saved ? JSON.parse(saved) : { left: 'PURCHASE', right: 'SALE' };
  });

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    loadStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 마우스 드래그 핸들러
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - containerRect.left) / containerRect.width;
      
      // 최소/최대 비율 제한
      const clampedRatio = Math.max(0.3, Math.min(0.7, newRatio));
      setSplitRatio(clampedRatio);
      localStorage.setItem('statisticsSplitRatio', clampedRatio.toString());
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // 좌우 위치 변경
  const toggleLayout = () => {
    const newLayout = {
      left: layoutOrder.right,
      right: layoutOrder.left
    };
    setLayoutOrder(newLayout);
    localStorage.setItem('statisticsLayoutOrder', JSON.stringify(newLayout));
  };

  // 패널 크기 초기화
  const resetSplitRatio = () => {
    setSplitRatio(0.5);
    localStorage.setItem('statisticsSplitRatio', '0.5');
  };

  // 조회 유형에 따른 날짜 범위 계산
  const getDateRange = (type) => {
    const today = new Date();
    let start_date, end_date;
    
    switch (type) {
      case 'daily':
        // 최근 1개월
        start_date = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
        end_date = new Date().toISOString().split('T')[0];
        break;
      case 'monthly':
        // 올해 1월 1일부터 오늘까지
        start_date = `${new Date().getFullYear()}-01-01`;
        end_date = new Date().toISOString().split('T')[0];
        break;
      case 'yearly':
        // 최근 5년
        start_date = `${new Date().getFullYear() - 4}-01-01`;
        end_date = new Date().toISOString().split('T')[0];
        break;
      default:
        start_date = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
        end_date = new Date().toISOString().split('T')[0];
    }
    
    return { start_date, end_date };
  };

  // 조회 유형 변경 핸들러
  const handleViewTypeChange = (type) => {
    setViewType(type);
    const dateRange = getDateRange(type);
    setFilters(dateRange);
  };

  const loadStatistics = async () => {
    try {
      setLoading(true);
      
      // 매입/매출 통계 동시 조회
      const [purchaseResponse, saleResponse] = await Promise.all([
        tradeAPI.getStatsByCompany({ ...filters, trade_type: 'PURCHASE' }),
        tradeAPI.getStatsByCompany({ ...filters, trade_type: 'SALE' })
      ]);
      
      setPurchaseStats(purchaseResponse.data.data);
      setSaleStats(saleResponse.data.data);
    } catch (error) {
      console.error('통계 로딩 오류:', error);
      setModal({ isOpen: true, type: 'warning', title: '로딩 실패', message: '통계 데이터를 불러오는데 실패했습니다.', confirmText: '확인', showCancel: false, onConfirm: () => {} });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadStatistics();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
  };

  const getTotalAmount = (stats) => {
    return stats.reduce((sum, stat) => sum + parseFloat(stat.total_price || 0), 0);
  };

  const getTotalCount = (stats) => {
    return stats.reduce((sum, stat) => sum + parseInt(stat.trade_count || 0), 0);
  };

  // 색상 정의 (전표 목록과 동일)
  const colors = {
    purchase: {
      headerBg: '#fdf2f2',
      tableBg: '#fdf2f2',
      text: '#c0392b',
      accent: '#e74c3c'
    },
    sale: {
      headerBg: '#f0f7ff',
      tableBg: '#f0f7ff',
      text: '#2980b9',
      accent: '#3498db'
    }
  };

  // 통계 테이블 컴포넌트
  const StatsTable = ({ stats, type }) => {
    const totalAmount = getTotalAmount(stats);
    const colorScheme = type === 'PURCHASE' ? colors.purchase : colors.sale;
    
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        overflow: 'hidden',
        width: '100%'
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '1rem',
          backgroundColor: colorScheme.headerBg,
          borderBottom: `2px solid ${colorScheme.accent}`,
          flexShrink: 0
        }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: '1.1rem', 
            fontWeight: '700',
            color: colorScheme.text,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {type === 'PURCHASE' ? '📥 매입 통계' : '📤 매출 통계'}
          </h2>
        </div>

        {/* 요약 카드 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.75rem',
          padding: '0.75rem',
          backgroundColor: '#f8f9fa',
          flexShrink: 0
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '0.75rem',
            borderRadius: '8px',
            borderLeft: `4px solid ${colorScheme.accent}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>거래처 수</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#333' }}>{stats.length}</div>
          </div>
          <div style={{
            backgroundColor: '#fff',
            padding: '0.75rem',
            borderRadius: '8px',
            borderLeft: `4px solid ${colorScheme.accent}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>거래 건수</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#333' }}>{getTotalCount(stats)}</div>
          </div>
          <div style={{
            backgroundColor: '#fff',
            padding: '0.75rem',
            borderRadius: '8px',
            borderLeft: `4px solid ${colorScheme.accent}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            gridColumn: '1 / -1'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>총 합계금액</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: colorScheme.text }}>
              {formatCurrency(totalAmount)}
              <span style={{ fontSize: '0.85rem', fontWeight: '500', marginLeft: '0.25rem' }}>원</span>
            </div>
          </div>
        </div>

        {/* 테이블 */}
        <div style={{ 
          flex: 1, 
          overflow: 'auto',
          padding: '0 0.75rem 0.75rem'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff' }}>
              <tr style={{ backgroundColor: colorScheme.tableBg, borderBottom: `2px solid ${colorScheme.accent}` }}>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: '600', width: '40px', color: colorScheme.text }}>순위</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: '600', color: colorScheme.text }}>거래처</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: '600', width: '50px', color: colorScheme.text }}>건수</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: '600', color: colorScheme.text }}>합계금액</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: '600', width: '55px', color: colorScheme.text }}>비중</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                    조회된 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                stats.map((stat, index) => {
                  const percentage = totalAmount > 0 ? (parseFloat(stat.total_price) / totalAmount * 100) : 0;
                  
                  return (
                    <tr 
                      key={stat.id}
                      style={{ 
                        borderBottom: '1px solid #eee',
                        backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa'
                      }}
                    >
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#666' }}>
                        {index < 3 ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            backgroundColor: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32',
                            color: '#fff',
                            fontSize: '0.75rem',
                            fontWeight: '700'
                          }}>
                            {index + 1}
                          </span>
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <div style={{ fontWeight: '500' }}>{stat.company_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#999' }}>{stat.company_code}</div>
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{stat.trade_count}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '600', color: colorScheme.text }}>
                        {formatCurrency(stat.total_price)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.4rem',
                          backgroundColor: `${colorScheme.accent}15`,
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          color: colorScheme.text
                        }}>
                          {percentage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {stats.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: colorScheme.tableBg, fontWeight: '700', borderTop: `2px solid ${colorScheme.accent}` }}>
                  <td colSpan="2" style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: colorScheme.text }}>합계</td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: colorScheme.text }}>{getTotalCount(stats)}</td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: colorScheme.text }}>{formatCurrency(totalAmount)}</td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: colorScheme.text }}>100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  };

  // 왼쪽/오른쪽 패널에 표시할 통계 데이터 결정
  const getLeftStats = () => layoutOrder.left === 'PURCHASE' ? purchaseStats : saleStats;
  const getRightStats = () => layoutOrder.right === 'PURCHASE' ? purchaseStats : saleStats;
  const getLeftType = () => layoutOrder.left;
  const getRightType = () => layoutOrder.right;

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 60px)',
      backgroundColor: '#f5f6fa'
    }}>
      {/* 헤더 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0.75rem 1rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #ddd',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#2c3e50' }}>
            📈 거래처별 통계
          </h1>
          
          {/* 좌우 위치 변경 버튼 */}
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
              {layoutOrder.left === 'PURCHASE' ? '매입←→매출' : '매출←→매입'}
            </span>
          </button>
          
          {/* 크기 초기화 버튼 (변경 시에만 표시) */}
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
          
          {/* 조회 유형 선택 */}
          <div style={{ 
            display: 'flex', 
            gap: '0.25rem',
            backgroundColor: '#f1f3f5',
            padding: '0.25rem',
            borderRadius: '8px',
            marginLeft: '0.5rem'
          }}>
            {[
              { type: 'daily', label: '일자별' },
              { type: 'monthly', label: '월별' },
              { type: 'yearly', label: '연도별' }
            ].map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handleViewTypeChange(type)}
                style={{
                  padding: '0.4rem 0.8rem',
                  backgroundColor: viewType === type ? '#3498db' : 'transparent',
                  color: viewType === type ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: viewType === type ? '600' : '400',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {label}
              </button>
            ))}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#666' }}>기간:</span>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({...filters, start_date: e.target.value})}
              style={{
                padding: '0.4rem 0.6rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.85rem'
              }}
            />
            <span style={{ color: '#999' }}>~</span>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({...filters, end_date: e.target.value})}
              style={{
                padding: '0.4rem 0.6rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.85rem'
              }}
            />
            <button 
              onClick={handleSearch}
              style={{
                padding: '0.4rem 1rem',
                backgroundColor: '#3498db',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              조회
            </button>
          </div>
        </div>

        {/* 전체 요약 */}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#666' }}>총 매입</div>
            <div style={{ fontSize: '1rem', fontWeight: '700', color: colors.purchase.text }}>
              {formatCurrency(getTotalAmount(purchaseStats))}원
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#666' }}>총 매출</div>
            <div style={{ fontSize: '1rem', fontWeight: '700', color: colors.sale.text }}>
              {formatCurrency(getTotalAmount(saleStats))}원
            </div>
          </div>
          <div style={{ 
            textAlign: 'right',
            padding: '0.5rem 1rem',
            backgroundColor: '#f0f0f0',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#666' }}>순이익</div>
            <div style={{ 
              fontSize: '1.1rem', 
              fontWeight: '700', 
              color: getTotalAmount(saleStats) - getTotalAmount(purchaseStats) >= 0 ? '#2980b9' : '#c0392b'
            }}>
              {formatCurrency(getTotalAmount(saleStats) - getTotalAmount(purchaseStats))}원
            </div>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 - 좌우 분할 */}
      <div 
        ref={containerRef}
        style={{ 
          flex: 1, 
          display: 'flex', 
          padding: '0.75rem',
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
          minHeight: 0,
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <StatsTable stats={getLeftStats()} type={getLeftType()} />
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
            gap: '3px',
            opacity: isDragging ? 1 : 0.6
          }}>
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: '#666', borderRadius: '50%' }} />
          </div>
        </div>

        {/* 오른쪽 패널 */}
        <div style={{ 
          flex: 1,
          display: 'flex',
          minWidth: '300px',
          minHeight: 0,
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <StatsTable stats={getRightStats()} type={getRightType()} />
        </div>
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

export default Statistics;
