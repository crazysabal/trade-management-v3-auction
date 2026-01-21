import React, { useState, useEffect } from 'react';
import { inventoryAuditAPI } from '../../services/api';
import { useConfirmModal } from '../ConfirmModal';
import AuditDesk from './AuditDesk';
import AuditScanner from './AuditScanner';

const AuditSession = ({ auditId, onBack, isMobile }) => {
    const { openModal, ConfirmModalComponent } = useConfirmModal();
    const [audit, setAudit] = useState(null);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [reorderMode, setReorderMode] = useState(false);

    useEffect(() => {
        if (auditId) {
            fetchAuditDetail();
        }
    }, [auditId]);

    const fetchAuditDetail = async () => {
        setIsLoading(true);
        try {
            const res = await inventoryAuditAPI.getById(auditId);
            if (res.data.success) {
                // console.log('AuditSession fetched items:', res.data.data.items);
                setAudit(res.data.data.master);
                setItems(res.data.data.items);
            }
        } catch (error) {
            console.error('실사 상세 로딩 오류:', error);
            openModal({ type: 'warning', title: '로딩 실패', message: '상세 정보를 가져오지 못했습니다.' });
            onBack();
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateItems = async (updatedItems) => {
        setIsSaving(true);
        try {
            const res = await inventoryAuditAPI.updateItems(auditId, updatedItems);
            if (res.data.success) {
                setItems(prev => prev.map(item => {
                    const updated = updatedItems.find(u => u.id === item.id);
                    return updated ? { ...item, ...updated } : item;
                }));
            }
        } catch (error) {
            console.error('실사 결과 저장 오류:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleFinalize = () => {
        if (audit.status !== 'IN_PROGRESS') return;

        openModal({
            type: 'confirm',
            title: '실사 확정',
            message: '실사 결과를 확정하고 재고 조정을 반영하시겠습니까?',
            onConfirm: async () => {
                try {
                    const res = await inventoryAuditAPI.finalize(auditId);
                    if (res.data.success) {
                        openModal({ type: 'success', title: '확정 완료', message: '재고 실사가 완료되었습니다.' });
                        onBack();
                    }
                } catch (error) {
                    console.error('실사 확정 오류:', error);
                    openModal({ type: 'warning', title: '확정 실패', message: error.response?.data?.message || '확정 중 오류가 발생했습니다.' });
                }
            }
        });
    };

    const handleCancel = () => {
        openModal({
            type: 'confirm',
            title: '실사 취소',
            message: '이 실사 세션을 취소하시겠습니까?\n입력된 정보는 모두 무시됩니다.',
            onConfirm: async () => {
                try {
                    await inventoryAuditAPI.cancel(auditId);
                    onBack();
                } catch (error) {
                    console.error('실사 취소 오류:', error);
                }
            }
        });
    };

    const handleRevert = () => {
        openModal({
            type: 'confirm',
            title: '확정 취소 (재고 원복)',
            message: '실사 결과를 취소하고 재고를 원복하시겠습니까?\n조정되었던 재고 수량이 실사 전으로 돌아갑니다.',
            onConfirm: async () => {
                try {
                    const res = await inventoryAuditAPI.revert(auditId);
                    if (res.data.success) {
                        openModal({ type: 'success', title: '원복 완료', message: '재고가 실사 전 상태로 원복되었습니다.', showCancel: false });
                        fetchAuditDetail();
                    }
                } catch (error) {
                    console.error('실사 원복 오류:', error);
                    openModal({ type: 'warning', title: '원복 실패', message: error.response?.data?.message || '원복 중 오류가 발생했습니다.' });
                }
            }
        });
    };

    if (isLoading) return <div className="audit-loading">실사 데이터를 불러오는 중...</div>;
    if (!audit) return null;

    const sessionProps = {
        audit,
        items,
        isSaving,
        onUpdate: handleUpdateItems,
        onFinalize: handleFinalize,
        onCancel: handleCancel,
        onBack: onBack,
        onRefresh: fetchAuditDetail,
        reorderMode,
        setReorderMode
    };

    if (isMobile) {
        return (
            <div className="audit-session fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', paddingBottom: '0', boxSizing: 'border-box' }}>
                <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'white',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    position: 'sticky',
                    top: 0,
                    zIndex: 20
                }}>
                    <button
                        onClick={onBack}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            padding: 0,
                            cursor: 'pointer',
                            color: '#4a5568',
                            display: 'flex',
                            alignItems: 'center',
                            marginRight: '0.5rem'
                        }}
                    >
                        ←
                    </button>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {audit.warehouse_name} <span style={{ fontSize: '0.9rem', color: '#718096', fontWeight: 400, marginLeft: '4px' }}>{audit.audit_date}</span>
                        </h1>
                    </div>

                    {audit.status === 'IN_PROGRESS' && !reorderMode && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="btn btn-danger"
                                onClick={handleCancel}
                                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                                취소
                            </button>
                            <button
                                className="btn btn-success"
                                onClick={handleFinalize}
                                disabled={isSaving}
                                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                                {isSaving ? '저장...' : '확정'}
                            </button>
                        </div>
                    )}
                    {audit.status === 'COMPLETED' && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleRevert}
                            style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, backgroundColor: '#718096', whiteSpace: 'nowrap' }}
                        >
                            원복
                        </button>
                    )}
                </div>

                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    <AuditScanner {...sessionProps} />
                </div>

                {ConfirmModalComponent}
            </div>
        );
    }

    return (
        <div className="audit-session fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        className="btn btn-primary"
                        onClick={onBack}
                        style={{ height: '34px', padding: '0 1rem', fontWeight: 600, fontSize: '0.95rem' }}
                    >
                        목록으로
                    </button>
                    <h1 className="page-title" style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 0 }}>
                        {audit.warehouse_name} 실사
                        <span className={`session-status status-${audit.status.toLowerCase()}`} style={{ marginLeft: '0.75rem' }}>
                            {audit.status === 'IN_PROGRESS' ? '진행 중' : audit.status === 'COMPLETED' ? '완료' : '취소됨'}
                        </span>
                    </h1>
                </div>
                <div className="page-header-actions">
                    {audit.status === 'IN_PROGRESS' && (
                        <>
                            <button
                                className="btn btn-danger"
                                onClick={handleCancel}
                                style={{ height: '34px', padding: '0 1rem', fontWeight: 600, marginRight: '0.4rem' }}
                            >
                                실사 취소
                            </button>
                            <button
                                className="btn btn-success"
                                onClick={handleFinalize}
                                disabled={isSaving}
                                style={{ height: '34px', padding: '0 1rem', fontWeight: 600 }}
                            >
                                {isSaving ? '저장 중...' : '💾 최종 확정'}
                            </button>
                        </>
                    )}
                    {audit.status === 'COMPLETED' && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleRevert}
                            style={{ height: '34px', padding: '0 1rem', fontWeight: 600, backgroundColor: '#718096' }}
                        >
                            ↩ 확정 취소 (재고 원복)
                        </button>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
                <AuditDesk {...sessionProps} />
            </div>
            {ConfirmModalComponent}
        </div>
    );
};

export default AuditSession;
