import React from 'react';
import BackupManagement from '../components/BackupManagement';

const BackupSystem = ({ isWindow }) => {
    return (
        <div className="backup-system-page" style={{
            height: '100%',
            overflowY: 'auto',
            background: '#ffffff',
            padding: isWindow ? '0' : '20px'
        }}>
            <BackupManagement />
        </div>
    );
};

export default BackupSystem;
