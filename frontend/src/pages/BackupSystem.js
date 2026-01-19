import React from 'react';
import BackupManagement from '../components/BackupManagement';

const BackupSystem = ({ isWindow }) => {
    return (
        <div className="backup-system-page" style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#f8fafc',
            padding: '0.5rem',
            boxSizing: 'border-box',
            overflow: 'auto'
        }}>
            <BackupManagement />
        </div>
    );
};

export default BackupSystem;
