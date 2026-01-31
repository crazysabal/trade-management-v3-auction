import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { tradeAPI } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import TradeDetailModal from '../components/TradeDetailModal';
import TradePrintModal from '../components/TradePrintModal';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/formatUtils';

// 기본 날짜 설정 (해당 달 1일, 당일)
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultDates = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    startDate: formatDate(firstDay),
    endDate: formatDate(today)
  };
};

// 금액 포맷 함수 - imported from formatUtils

// 다중 필터링 함수 (AND 조건, 금액은 쉼표 유무 모두 지원) - 컴포넌트 외부
const filterTrades = (trades, filterText) => {
  if (!filterText.trim()) return trades;

  // 공백으로 키워드 분리 (다중 필터링)
  const keywords = filterText.toLowerCase().trim().split(/\s+/).filter(k => k);
  if (keywords.length === 0) return trades;

  return trades.filter(trade => {
    const tradeDate = trade.trade_date ? trade.trade_date.substring(0, 10) : '';
    const amountFormatted = formatCurrency(trade.total_price); // "1,000,000"
    const amountRaw = String(trade.total_price || 0); // "1000000"
    const searchableText = [
      trade.trade_number?.toLowerCase() || '',
      tradeDate,
      trade.company_name?.toLowerCase() || '',
      amountFormatted,
      amountRaw
    ].join(' ');

    // 모든 키워드가 포함되어야 함 (AND 조건)
    return keywords.every(keyword => searchableText.includes(keyword));
  });
};



function TradeList({ isWindow, refreshKey, onOpenTradeEdit }) {
  const defaultDates = getDefaultDates();
  const [purchaseTrades, setPurchaseTrades] = useState([]);
  const [saleTrades, setSaleTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const getScopedKey = (key) => user?.id ? `u${user.id}_${key}` : key;

  // 기간 필터
  const [dateRange, setDateRange] = useState({
    start_date: defaultDates.startDate,
    end_date: defaultDates.endDate
  });

  // 개별 필터링 키워드
  const [purchaseFilter, setPurchaseFilter] = useState('');
  const [saleFilter, setSaleFilter] = useState('');

  // 활성 퀵 필터 상태
  const [activeQuickFilter, setActiveQuickFilter] = useState(null);

  // 좌우 위치 설정 (localStorage에 저장)
  const [layoutOrder, setLayoutOrder] = useState({ left: 'PURCHASE', right: 'SALE' });

  // Load Layout
  useEffect(() => {
    const saved = localStorage.getItem(getScopedKey('tradeListLayout'));
    if (saved) {
      try {
        setLayoutOrder(JSON.parse(saved));
      } catch (e) {
        setLayoutOrder({ left: 'PURCHASE', right: 'SALE' });
      }
    }
  }, [user?.id]);

  // 패널 크기 비율 (0.3 ~ 0.7, 기본 0.5)
  const [splitRatio, setSplitRatio] = useState(0.5);

  // Load Split Ratio
  useEffect(() => {
    const saved = localStorage.getItem(getScopedKey('tradeListSplitRatio'));
    if (saved) setSplitRatio(parseFloat(saved));
  }, [user?.id]);

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  // 좌우 위치 변경
  const toggleLayout = () => {
    const newLayout = {
      left: layoutOrder.right,
      right: layoutOrder.left
    };
    setLayoutOrder(newLayout);
    localStorage.setItem(getScopedKey('tradeListLayout'), JSON.stringify(newLayout));
  };

  // 비율 초기화
  const resetSplitRatio = () => {
    setSplitRatio(0.5);
    localStorage.setItem(getScopedKey('tradeListSplitRatio'), '0.5');
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
      localStorage.setItem(getScopedKey('tradeListSplitRatio'), splitRatio.toString());
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

  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => { },
    confirmText: '확인',
    showCancel: false
  });
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    tradeId: null
  });
  const [matchingErrorModal, setMatchingErrorModal] = useState({
    isOpen: false,
    title: '',
    matchingData: null
  });
  const [printModal, setPrintModal] = useState({
    isOpen: false,
    tradeId: null
  });

  // MDI 동기화: refreshKey 변경 시 데이터 재로딩
  useEffect(() => {
    loadTrades();
  }, [refreshKey]);

  const loadTrades = async (startDate, endDate) => {
    try {
      setLoading(true);
      const start = startDate || dateRange.start_date;
      const end = endDate || dateRange.end_date;

      // 매입/매출 각각 조회
      const [purchaseRes, saleRes] = await Promise.all([
        tradeAPI.getAll({
          start_date: start,
          end_date: end,
          trade_type: 'PURCHASE'
        }),
        tradeAPI.getAll({
          start_date: start,
          end_date: end,
          trade_type: 'SALE'
        })
      ]);
      setPurchaseTrades(purchaseRes.data.data);
      setSaleTrades(saleRes.data.data);
    } catch (error) {
      console.error('거래전표 목록 로딩 오류:', error);
      setModal({
        isOpen: true,
        type: 'warning',
        title: '로딩 실패',
        message: '거래전표 목록을 불러오는데 실패했습니다.',
        confirmText: '확인',
        showCancel: false,
        onConfirm: () => { }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (field, value) => {
    const newDateRange = { ...dateRange, [field]: value };
    setDateRange(newDateRange);
    setActiveQuickFilter(null);
  };

  const handleSearch = () => {
    setActiveQuickFilter(null);
    loadTrades(dateRange.start_date, dateRange.end_date);
  };

  const handleQuickDate = (type) => {
    const today = new Date();
    let startDate;
    const endDate = formatDate(today);

    switch (type) {
      case 'TODAY':
        startDate = endDate;
        break;
      case 'WEEK': {
        const day = today.getDay(); // 0(일) ~ 6(토)
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // 월요일 계산
        const monday = new Date(today.setDate(diff));
        startDate = formatDate(monday);
        break;
      }
      case 'MONTH':
        startDate = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
        break;
      case 'YEAR':
        startDate = formatDate(new Date(today.getFullYear(), 0, 1));
        break;
      default:
        return;
    }

    const newRange = { start_date: startDate, end_date: endDate };
    setDateRange(newRange);
    setActiveQuickFilter(type);
    loadTrades(startDate, endDate);
  };

  const handleDelete = (id, tradeNumber) => {
    setModal({
      isOpen: true,
      type: 'delete',
      title: '전표 삭제',
      message: `전표번호 '${tradeNumber}'를 삭제하시겠습니까?`,
      confirmText: '삭제',
      showCancel: true,
      onConfirm: async () => {
        try {
          await tradeAPI.delete(id);
          setModal({
            isOpen: true,
            type: 'success',
            title: '삭제 완료',
            message: '거래전표가 삭제되었습니다.',
            confirmText: '확인',
            showCancel: false,
            onConfirm: () => { }
          });
          loadTrades();
        } catch (error) {
          console.error('거래전표 삭제 오류:', error);
          const errorData = error.response?.data;

          // 매칭 에러인 경우 전용 모달 표시
          if (errorData?.errorType === 'MATCHING_EXISTS' && errorData?.matchingData) {
            setMatchingErrorModal({
              isOpen: true,
              title: '삭제 불가',
              matchingData: errorData.matchingData
            });
          } else {
            setModal({
              isOpen: true,
              type: 'warning',
              title: '삭제 실패',
              message: errorData?.message || '거래전표 삭제에 실패했습니다.',
              confirmText: '확인',
              showCancel: false,
              onConfirm: () => { }
            });
          }
        }
      }
    });
  };

  // 필터링된 매입 전표
  const filteredPurchaseTrades = useMemo(() => {
    return filterTrades(purchaseTrades, purchaseFilter);
  }, [purchaseTrades, purchaseFilter]);

  // 필터링된 매출 전표
  const filteredSaleTrades = useMemo(() => {
    return filterTrades(saleTrades, saleFilter);
  }, [saleTrades, saleFilter]);

  // 테이블 렌더링 컴포넌트
  const TradeTable = ({ trades, type }) => {
    const isPurchase = type === 'PURCHASE';
    const emptyMessage = isPurchase ? '등록된 매입전표가 없습니다.' : '등록된 매출전표가 없습니다.';
    const headerBgColor = isPurchase ? '#fdf2f2' : '#f0f7ff';
    const headerTextColor = isPurchase ? '#c0392b' : '#2980b9';
    const headerBorderColor = isPurchase ? '#c0392b' : '#2980b9';

    // 잔고 가져오기 (매입: payable, 매출: receivable)
    const getBalance = (trade) => {
      return isPurchase
        ? parseFloat(trade.payable || 0)
        : parseFloat(trade.receivable || 0);
    };

    // 당일 입출금 금액 가져오기 (매입: 지급액, 매출: 입금액)
    const getPaymentAmount = (trade) => {
      return isPurchase
        ? parseFloat(trade.daily_payment || 0)
        : parseFloat(trade.daily_receipt || 0);
    };

    return (
      <div style={{ width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr style={{ backgroundColor: headerBgColor, borderBottom: `2px solid ${headerBorderColor}` }}>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem 0.5rem', textAlign: 'left', fontSize: '0.9rem' }}>전표번호</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem 0.5rem', textAlign: 'left', fontSize: '0.9rem' }}>거래일자</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem 0.5rem', textAlign: 'left', fontSize: '0.9rem' }}>{isPurchase ? '매입처' : '매출처'}</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem 0.5rem', textAlign: 'right', fontSize: '0.9rem' }}>금액</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem 0.5rem', textAlign: 'right', fontSize: '0.9rem' }}>{isPurchase ? '지급액' : '입금액'}</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem 0.5rem', textAlign: 'right', fontSize: '0.9rem' }}>잔고</th>
              <th style={{ color: headerTextColor, fontWeight: '600', padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.9rem', width: '100px' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '1.5rem', color: '#888', textAlign: 'center', fontSize: '0.9rem' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              trades.map(trade => {
                const balance = getBalance(trade);
                const paymentAmount = getPaymentAmount(trade);
                return (
                  <tr key={trade.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem 0.5rem', fontSize: '0.9rem' }}>
                      <span
                        className="trade-number-link"
                        onClick={() => setDetailModal({ isOpen: true, tradeId: trade.id })}
                        style={{ cursor: 'pointer', color: '#2980b9' }}
                      >
                        {trade.trade_number}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem', fontSize: '0.9rem' }}>{trade.trade_date ? trade.trade_date.substring(0, 10) : '-'}</td>
                    <td style={{ padding: '0.5rem 0.5rem', fontSize: '0.9rem' }}>{trade.company_name}</td>
                    <td style={{ padding: '0.5rem 0.5rem', fontSize: '0.9rem', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(trade.total_price)}
                    </td>
                    <td style={{
                      padding: '0.5rem 0.5rem',
                      fontSize: '0.9rem',
                      textAlign: 'right',
                      fontWeight: '500',
                      color: paymentAmount > 0 ? '#27ae60' : '#888'
                    }}>
                      {formatCurrency(paymentAmount)}
                    </td>
                    <td style={{
                      padding: '0.5rem 0.5rem',
                      fontSize: '0.9rem',
                      textAlign: 'right',
                      fontWeight: '600',
                      color: balance > 0 ? '#c0392b' : '#27ae60'
                    }}>
                      {formatCurrency(balance)}
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setPrintModal({ isOpen: true, tradeId: trade.id })}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          title="출력"
                        >
                          출력
                        </button>
                        {isWindow && onOpenTradeEdit ? (
                          <button
                            onClick={() => onOpenTradeEdit(type, trade.id, true)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            보기
                          </button>
                        ) : (
                          <Link
                            to={`/trades/edit/${trade.id}`}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', backgroundColor: '#95a5a6', color: 'white', textDecoration: 'none', borderRadius: '4px' }}
                          >
                            수정
                          </Link>
                        )}
                      </div>
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

  // 합계 계산 (필터링된 결과 기준)
  const purchaseTotal = filteredPurchaseTrades.reduce((sum, t) => sum + (parseFloat(t.total_price) || 0), 0);
  const saleTotal = filteredSaleTrades.reduce((sum, t) => sum + (parseFloat(t.total_price) || 0), 0);

  if (loading) {
    return <div className="loading">데이터를 불러오는 중...</div>;
  }

  // 패널 렌더링 함수
  const renderPanel = (type) => {
    const isPurchase = type === 'PURCHASE';
    const trades = isPurchase ? filteredPurchaseTrades : filteredSaleTrades;
    const allTrades = isPurchase ? purchaseTrades : saleTrades;
    const filter = isPurchase ? purchaseFilter : saleFilter;
    const setFilter = isPurchase ? setPurchaseFilter : setSaleFilter;
    const total = isPurchase ? purchaseTotal : saleTotal;
    const color = isPurchase ? '#c0392b' : '#2980b9';  // 텍스트 색상
    const bgColor = isPurchase ? '#fdf2f2' : '#f0f7ff';  // 배경 색상
    const icon = isPurchase ? '📦' : '💰';
    const label = isPurchase ? '매입' : '매출';

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
          padding: '0.5rem 0.75rem',
          backgroundColor: bgColor,
          borderBottom: `2px solid ${color}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem', color: color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {icon} {label} 전표
            <span style={{
              fontSize: '0.75rem',
              backgroundColor: color,
              color: 'white',
              padding: '2px 8px',
              borderRadius: '10px'
            }}>
              {trades.length}건
              {filter && ` / ${allTrades.length}`}
            </span>
          </h2>
          <Link
            to={`/trades/new?type=${type}`}
            style={{
              padding: '0.25rem 0.5rem',
              backgroundColor: color,
              color: 'white',
              borderRadius: '4px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              fontWeight: '500'
            }}
          >
            + 등록
          </Link>
        </div>

        {/* 필터 입력 */}
        <div style={{ padding: '0.5rem 0.5rem', borderBottom: '1px solid #eee', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="🔍 전표번호, 거래일자, 거래처, 금액..."
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
          <TradeTable trades={trades} type={type} />
        </div>

        {/* 합계 - 하단 고정 */}
        <div style={{
          padding: '0.5rem 0.75rem',
          backgroundColor: bgColor,
          borderTop: `2px solid ${color}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <span style={{ fontWeight: '500', color: color, fontSize: '0.85rem' }}>
            합계 {filter && `(필터)`}
          </span>
          <span style={{ fontWeight: '700', fontSize: '1rem', color: color }}>
            {formatCurrency(total)}원
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: isWindow ? '100%' : 'calc(100vh - 60px)',
      backgroundColor: '#f5f6fa',
      maxWidth: isWindow ? '100%' : '1400px',
      margin: isWindow ? '0' : '0 auto',
      width: '100%'
    }}>
      {/* 헤더 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* 기간 조회 (왼쪽으로 이동) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'rgba(0,0,0,0.03)',
            padding: '4px 10px',
            borderRadius: '8px'
          }}>
            <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold' }}>기간</span>
            <input
              type="date"
              value={dateRange.start_date}
              onChange={(e) => handleDateChange('start_date', e.target.value)}
              max={dateRange.end_date}
              style={{
                padding: '0.35rem 0.5rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '0.85rem',
                backgroundColor: '#fff'
              }}
            />
            <span style={{ color: '#999' }}>~</span>
            <input
              type="date"
              value={dateRange.end_date}
              onChange={(e) => handleDateChange('end_date', e.target.value)}
              min={dateRange.start_date}
              style={{
                padding: '0.35rem 0.5rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '0.85rem',
                backgroundColor: '#fff'
              }}
            />

            {/* 빠른 기간 필터 버튼 */}
            <div style={{ display: 'flex', gap: '4px', marginLeft: '0.5rem' }}>
              {[
                { label: '오늘', type: 'TODAY' },
                { label: '이번주', type: 'WEEK' },
                { label: '이번달', type: 'MONTH' },
                { label: '올해', type: 'YEAR' }
              ].map(btn => (
                <button
                  key={btn.type}
                  onClick={() => handleQuickDate(btn.type)}
                  style={{
                    padding: '0.35rem 0.6rem',
                    backgroundColor: activeQuickFilter === btn.type ? '#2980b9' : '#fff',
                    border: '1px solid',
                    borderColor: activeQuickFilter === btn.type ? '#2980b9' : '#ddd',
                    borderRadius: '5px',
                    fontSize: '0.8rem',
                    color: activeQuickFilter === btn.type ? 'white' : '#555',
                    cursor: 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    if (activeQuickFilter !== btn.type) {
                      e.target.style.backgroundColor = '#f8f9fa';
                      e.target.style.borderColor = '#bbb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeQuickFilter !== btn.type) {
                      e.target.style.backgroundColor = '#fff';
                      e.target.style.borderColor = '#ddd';
                    }
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSearch}
              style={{
                marginLeft: '0.4rem',
                padding: '0.35rem 1rem',
                backgroundColor: '#2980b9',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              조회
            </button>
          </div>

          {/* 위치/크기 조절 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                ↔ 초기화
              </button>
            )}
          </div>
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

      <TradeDetailModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, tradeId: null })}
        tradeId={detailModal.tradeId}
      />

      <TradePrintModal
        isOpen={printModal.isOpen}
        onClose={() => setPrintModal({ isOpen: false, tradeId: null })}
        tradeId={printModal.tradeId}
      />

      {/* 매칭 에러 모달 */}
      {matchingErrorModal.isOpen && createPortal(
        <div className="modal-overlay">
          <div className="matching-error-modal" onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="matching-error-modal-header">
              <div className="matching-error-modal-header-left">
                <h2>⚠️ {matchingErrorModal.title}</h2>
                {matchingErrorModal.matchingData && (
                  <div className="matching-error-header-summary">
                    <span className="summary-item">
                      <span className="summary-label">매칭 건수</span>
                      <span className="summary-value">{matchingErrorModal.matchingData.totalCount}건</span>
                    </span>
                    <span className="summary-divider">|</span>
                    <span className="summary-item">
                      <span className="summary-label">매칭 수량</span>
                      <span className="summary-value highlight">{formatNumber(matchingErrorModal.matchingData.totalQuantity)}개</span>
                    </span>
                  </div>
                )}
              </div>
              <button
                className="matching-error-modal-close"
                onClick={() => setMatchingErrorModal({ isOpen: false, title: '', matchingData: null })}
              >
                ×
              </button>
            </div>

            {/* 바디 */}
            <div className="matching-error-modal-body">
              <p className="matching-error-message">
                이미 매출과 매칭된 내역이 있어 삭제할 수 없습니다.<br />
                마감 화면에서 매칭을 먼저 취소하세요.
              </p>

              {matchingErrorModal.matchingData && (
                <div className="matching-error-table-container">
                  <table className="matching-error-table">
                    <thead>
                      <tr>
                        <th>품목</th>
                        <th>매출 전표</th>
                        <th>매출일</th>
                        <th>고객사</th>
                        <th className="text-right">매칭 수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingErrorModal.matchingData.items.map((item, index) => (
                        <tr key={index}>
                          <td style={{ fontWeight: '500' }}>{item.productName}</td>
                          <td style={{ color: '#3b82f6' }}>{item.saleTradeNumber}</td>
                          <td>{item.saleDate}</td>
                          <td>{item.customerName}</td>
                          <td className="text-right" style={{ fontWeight: '600', color: '#dc2626' }}>
                            {formatNumber(item.matchedQuantity)}개
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="matching-error-modal-footer">
              <Link to="/matching" className="btn btn-primary">
                마감 화면으로 이동
              </Link>
              <button
                className="btn btn-secondary"
                onClick={() => setMatchingErrorModal({ isOpen: false, title: '', matchingData: null })}
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// 숫자 포맷
const formatNumber = (value) => {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value || 0);
};

export default memo(TradeList);
