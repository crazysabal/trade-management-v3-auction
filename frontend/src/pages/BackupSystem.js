import React from 'react';
import BackupManagement from '../components/BackupManagement';

const BackupSystem = ({ isWindow, onRestoreSuccess }) => {
    return (
        <div className="backup-system-page" style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#f8fafc',
            padding: '0.5rem',
            boxSizing: 'border-box',
            overflow: 'hidden' // [MOD] 부모는 숨기고 자식(Card)에서 스크롤
        }}>
            <BackupManagement onRestoreSuccess={onRestoreSuccess} />
        </div>
    );
};

export default BackupSystem;
