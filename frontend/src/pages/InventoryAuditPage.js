import React, { useState, useEffect } from 'react';
import { inventoryAuditAPI, warehousesAPI } from '../services/api';
import { useConfirmModal } from '../components/ConfirmModal';
import AuditHistory from '../components/audit/AuditHistory';
import AuditSession from '../components/audit/AuditSession';
import '../styles/InventoryAudit.css';

const InventoryAuditPage = ({ isWindow, onLaunchHistory }) => {
    const { openModal, ConfirmModalComponent } = useConfirmModal();
    const [view, setView] = useState('HISTORY'); // HISTORY, SESSION
    const [selectedAuditId, setSelectedAuditId] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleStartAudit = async (warehouseId, auditDate, notes) => {
        try {
            const res = await inventoryAuditAPI.start({ warehouse_id: warehouseId, audit_date: auditDate, notes });
            if (res.data.success) {
                setSelectedAuditId(res.data.audit_id);
                setView('SESSION');
            }
        } catch (error) {
            console.error('실사 시작 오류:', error);
            openModal({
                type: 'warning',
                title: '시작 실패',
                message: error.response?.data?.message || '실사를 시작할 수 없습니다.'
            });
        }
    };

    const handleSelectAudit = (id) => {
        setSelectedAuditId(id);
        setView('SESSION');
    };

    const handleBackToHistory = () => {
        setSelectedAuditId(null);
        setView('HISTORY');
    };

    return (
        <div className={`audit-container ${isWindow ? 'is-window' : ''} ${isMobile ? 'is-mobile' : 'is-desktop'}`}>
            {view === 'HISTORY' ? (
                <AuditHistory
                    onStart={handleStartAudit}
                    onSelect={handleSelectAudit}
                    limit={10}
                    onLaunchHistory={onLaunchHistory}
                />
            ) : (
                <AuditSession
                    auditId={selectedAuditId}
                    onBack={handleBackToHistory}
                    isMobile={isMobile}
                />
            )}
            {ConfirmModalComponent}
        </div>
    );
};

export default InventoryAuditPage;
