import React, { useState, useEffect, useCallback } from 'react';
import { inventoryAuditAPI, warehousesAPI } from '../../services/api';
import { formatLocalDate } from '../../utils/dateUtils'; // [FIX] Import date utility
import ConfirmModal, { useConfirmModal } from '../ConfirmModal';

const AuditHistory = ({ onStart, onSelect, limit }) => {
    const { openModal, ConfirmModalComponent } = useConfirmModal();
    const [audits, setAudits] = useState([]);
    const [filteredAudits, setFilteredAudits] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Filter State
    const [filters, setFilters] = useState(() => {
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        return {
            search: '',
            startDate: formatLocalDate(oneMonthAgo),
            endDate: formatLocalDate(today)
        };
    });

    // 신규 실사 폼 상태
    const [showStartForm, setShowStartForm] = useState(false);
    const [newAudit, setNewAudit] = useState({
        warehouse_id: '',
        audit_date: formatLocalDate(new Date()),
        notes: ''
    });

    useEffect(() => {
        fetchInitialData();
    }, [limit]);

    // Filtering Logic
    const applyFilters = useCallback(() => {
        if (audits.length === 0) {
            setFilteredAudits([]);
            return;
        }

        const lowerSearch = filters.search.toLowerCase().trim();
        const searchKeywords = lowerSearch.split(/\s+/).filter(k => k);

        const filtered = audits.filter(audit => {
            // 1. Date Filter
            if (filters.startDate && audit.audit_date < filters.startDate) return false;
            if (filters.endDate && audit.audit_date > filters.endDate) return false;

            // 2. Search Filter (Multi-keyword AND condition)
            if (searchKeywords.length > 0) {
                const targetText = `${audit.warehouse_name} ${audit.notes || ''} ${audit.status === 'IN_PROGRESS' ? '진행 중' : audit.status === 'COMPLETED' ? '완료' : '취소됨'}`.toLowerCase();
                const matchesAllKeywords = searchKeywords.every(k => targetText.includes(k));
                if (!matchesAllKeywords) return false;
            }

            return true;
        });
        setFilteredAudits(filtered);
    }, [audits, filters]);

    // Initial Filter Application (only when audits load)
    useEffect(() => {
        applyFilters();
    }, [audits]);

    const fetchInitialData = async () => {
        setIsLoading(true);
        try {
            const auditParams = limit ? { limit } : {};
            const [auditRes, warehouseRes] = await Promise.allSettled([
                inventoryAuditAPI.getAll(auditParams),
                warehousesAPI.getAll({ active_only: 1 })
            ]);

            if (auditRes.status === 'fulfilled') {
                const data = auditRes.value.data.data || [];
                setAudits(data);
                // setFilteredAudits will be triggered by useEffect([audits])
            }
            if (warehouseRes.status === 'fulfilled') {
                const whList = warehouseRes.value.data.data || [];
                setWarehouses(whList);

                const defaultWh = whList.find(w => w.is_default);
                if (defaultWh) {
                    setNewAudit(prev => ({ ...prev, warehouse_id: defaultWh.id }));
                } else if (whList.length > 0) {
                    setNewAudit(prev => ({ ...prev, warehouse_id: whList[0].id }));
                }
            }
        } catch (error) {
            console.error('데이터 로딩 오류:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = () => {
        fetchInitialData();
    };

    const handleStartSubmit = async (e) => {
        e.preventDefault();
        await onStart(newAudit.warehouse_id, newAudit.audit_date, newAudit.notes);
        setShowStartForm(false);
    };

    const handleDelete = (audit) => {
        openModal({
            type: 'delete',
            title: '실사 이력 삭제',
            message: `[${audit.audit_date}] ${audit.warehouse_name} 실사 이력을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
            confirmText: '삭제',
            onConfirm: async () => {
                try {
                    const res = await inventoryAuditAPI.delete(audit.id);
                    if (res.data.success) {
                        openModal({
                            type: 'success',
                            title: '삭제 완료',
                            message: '실사 이력이 삭제되었습니다.',
                            showCancel: false
                        });
                        fetchInitialData();
                    }
                } catch (error) {
                    console.error('실사 삭제 오류:', error);
                    openModal({
                        type: 'warning',
                        title: '삭제 실패',
                        message: error.response?.data?.message || '삭제 중 오류가 발생했습니다.'
                    });
                }
            }
        });
    };

    const handleReset = () => {
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);

        setFilters({
            search: '',
            startDate: formatLocalDate(oneMonthAgo),
            endDate: formatLocalDate(today)
        });
        // Reset does not fetch immediately, user can click Search.
        // Or should reset trigger fetch? "Reset" usually clears filters. 
        // Let's keep it simple: Reset filters -> User clicks Search (which fetches).
    };

    // Enter key handler triggers Fetch
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    if (isLoading) return <div className="audit-loading">로딩 중...</div>;

    return (
        <div className="audit-history fade-in">
            {/* Stats Cards */}
            <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                gap: isMobile ? '0.5rem' : '0'
            }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="audit-stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', marginBottom: 0, flex: isMobile ? 1 : 'unset' }}>
                        <div className="stat-label" style={{ marginBottom: 0 }}>진행 중</div>
                        <div className="stat-value" style={{ fontSize: '1.1rem' }}>{audits.filter(a => a.status === 'IN_PROGRESS').length} <span className="stat-unit" style={{ fontSize: '0.9rem' }}>건</span></div>
                    </div>
                    <div className="audit-stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderLeftColor: '#38a169', marginBottom: 0, flex: isMobile ? 1 : 'unset' }}>
                        <div className="stat-label" style={{ marginBottom: 0 }}>완료(30일)</div>
                        <div className="stat-value" style={{ fontSize: '1.1rem' }}>{audits.filter(a => a.status === 'COMPLETED').length} <span className="stat-unit" style={{ fontSize: '0.9rem' }}>건</span></div>
                    </div>
                </div>

                <div className="page-header-actions" style={{ marginTop: isMobile ? '0.5rem' : 0 }}>
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowStartForm(true)}
                        style={{ width: isMobile ? '100%' : 'auto' }}
                    >
                        ➕ 새 실사 시작
                    </button>
                </div>
            </div>

            {/* Search Filters */}
            <div className="search-filter-container" style={{ padding: isMobile ? '1rem' : '10px 1rem', marginBottom: '0.5rem' }}>
                <div className="filter-row" style={{
                    gap: '8px',
                    alignItems: 'center',
                    flexDirection: isMobile ? 'column' : 'row',
                    display: 'flex'
                }}>
                    {/* Date Range */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
                        {!isMobile && <label style={{ whiteSpace: 'nowrap', margin: 0 }}>기간</label>}
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            onKeyDown={handleKeyDown}
                            style={{
                                padding: '0 0.5rem',
                                height: '38px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                flex: isMobile ? 1 : 'unset',
                                width: isMobile ? '100%' : 'auto'
                            }}
                        />
                        <span>~</span>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            onKeyDown={handleKeyDown}
                            style={{
                                padding: '0 0.5rem',
                                height: '38px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                flex: isMobile ? 1 : 'unset',
                                width: isMobile ? '100%' : 'auto'
                            }}
                        />
                    </div>

                    {!isMobile && <div style={{ width: '1px', height: '20px', backgroundColor: '#ddd', margin: '0 4px' }}></div>}

                    {/* Search Input */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
                        {!isMobile && <label style={{ whiteSpace: 'nowrap', margin: 0 }}>검색</label>}
                        <input
                            type="text"
                            placeholder={isMobile ? "🔍 창고명, 메모, 상태 검색..." : "🔍 창고명, 메모, 상태 검색..."}
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            onKeyDown={handleKeyDown}
                            style={{
                                flex: 1,
                                padding: '0 0.75rem',
                                height: '38px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                width: '100%'
                            }}
                        />
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
                        <button
                            onClick={handleSearch}
                            className="btn btn-primary"
                            style={{
                                padding: '0 1rem',
                                height: '38px',
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                                flex: isMobile ? 1 : 'unset',
                                width: isMobile ? '50%' : 'auto'
                            }}
                        >
                            조회 (새로고침)
                        </button>
                        <button
                            onClick={handleReset}
                            className="btn btn-secondary"
                            style={{
                                padding: '0 1rem',
                                height: '38px',
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                                flex: isMobile ? 1 : 'unset',
                                width: isMobile ? '50%' : 'auto'
                            }}
                        >
                            초기화
                        </button>
                    </div>
                </div>
            </div>

            {/* 새 실사 시작 모달 */}
            {showStartForm && (
                <ConfirmModal
                    isOpen={showStartForm}
                    onClose={() => setShowStartForm(false)}
                    onConfirm={handleStartSubmit}
                    title="새 재고 실사 시작"
                    message=""
                    type="confirm"
                    icon="📋"
                    confirmText="실사 시작"
                    showConfirm={false}
                    showCancel={false}
                    maxWidth="500px"
                >
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label">실사 창고</label>
                        <select
                            className="form-control"
                            value={newAudit.warehouse_id}
                            onChange={e => setNewAudit({ ...newAudit, warehouse_id: e.target.value })}
                            required
                            autoFocus
                        >
                            <option value="">창고 선택</option>
                            {warehouses.length > 0 ? (
                                warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))
                            ) : (
                                <option disabled>불러오는 중...</option>
                            )}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label">실사 날짜</label>
                        <input
                            type="date"
                            className="form-control"
                            value={newAudit.audit_date}
                            onChange={e => setNewAudit({ ...newAudit, audit_date: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="form-label">메모 (선택)</label>
                        <input
                            type="text"
                            className="form-control"
                            placeholder="예: 2024년 상반기 정기 실사"
                            value={newAudit.notes}
                            onChange={e => setNewAudit({ ...newAudit, notes: e.target.value })}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2rem' }}>
                        <button
                            onClick={() => setShowStartForm(false)}
                            className="btn btn-secondary"
                            style={{
                                minWidth: '60px',
                                flex: 'none',
                                width: 'auto' // Explicitly prevent stretching
                            }}
                        >
                            취소
                        </button>
                        <button
                            onClick={handleStartSubmit}
                            className="btn btn-success"
                            disabled={!newAudit.warehouse_id}
                            style={{
                                minWidth: '80px',
                                flex: 'none',
                                width: 'auto' // Explicitly prevent stretching
                            }}
                        >
                            실사 시작
                        </button>
                    </div>
                </ConfirmModal>
            )
            }

            <div className="audit-history-list" style={{ marginTop: '0.5rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

                <div className="white-ribbon" style={{ padding: 0, overflow: 'hidden', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <table className="audit-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                                    <th style={{ backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.5rem 0.5rem', textAlign: 'left', fontSize: '0.85rem', fontWeight: 600 }}>창고명</th>
                                    <th style={{ backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>실사 날짜</th>
                                    <th style={{ backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>상태</th>
                                    <th style={{ backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.5rem 0.5rem', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>품목수</th>
                                    <th style={{ backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.5rem 0.5rem', textAlign: 'left', fontSize: '0.85rem', fontWeight: 600 }}>메모</th>
                                    <th style={{ backgroundColor: '#34495e', color: 'white', borderBottom: '1px solid #2c3e50', padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>액션</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAudits.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#a0aec0' }}>
                                            실사 이력이 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAudits.map((audit, index) => (
                                        <tr
                                            key={audit.id}
                                            style={{
                                                borderBottom: '1px solid #edf2f7',
                                                backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc'
                                            }}
                                        >
                                            <td style={{ padding: '0.5rem 0.5rem', fontWeight: 600, color: '#2d3748', fontSize: '0.85rem' }}>{audit.warehouse_name}</td>
                                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'center', color: '#4a5568', fontSize: '0.85rem' }}>{audit.audit_date}</td>
                                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'center' }}>
                                                <span className={`session-status status-${audit.status.toLowerCase()}`} style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
                                                    {audit.status === 'IN_PROGRESS' ? '진행 중' : audit.status === 'COMPLETED' ? '완료' : '취소됨'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>{audit.item_count}건</td>
                                            <td style={{ padding: '0.5rem 0.5rem', color: '#718096', fontSize: '0.85rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {audit.notes || '-'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                    <button
                                                        className="btn btn-outline-primary btn-sm"
                                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                        onClick={() => onSelect(audit.id)}
                                                    >
                                                        상세보기
                                                    </button>
                                                    {audit.status === 'CANCELLED' && (
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(audit);
                                                            }}
                                                        >
                                                            삭제
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            {ConfirmModalComponent}
        </div >
    );
};

export default AuditHistory;
