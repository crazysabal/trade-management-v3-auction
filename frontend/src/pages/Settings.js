import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
// import UserManagement from './UserManagement'; // Separated to standalone menu
// import './Settings.css'; // Assuming styling is handled in global or not needed if file missing

const Settings = ({ ...rest }) => {
    return (
        <div className="settings-container fade-in">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
                <h1 className="page-title" style={{ margin: 0 }}>⚙️ 시스템 설정</h1>
            </div>

            <div className="settings-content" style={{ marginTop: '20px' }}>
                <div className="general-settings">
                    <div className="settings-section">
                        <h2>윈도우 관리 설정</h2>
                        <div className="setting-item" style={{
                            backgroundColor: 'white',
                            padding: '1.5rem',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            marginBottom: '1rem'
                        }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1e293b' }}>앱 실행 모드</h3>
                            <div className="radio-group" style={{ display: 'flex', gap: '1rem' }}>
                                <label style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    cursor: 'pointer',
                                    padding: '1.25rem',
                                    borderRadius: '12px',
                                    border: rest.windowMode === 'multi' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                    background: rest.windowMode === 'multi' ? '#eff6ff' : '#ffffff',
                                    transition: 'all 0.2s ease',
                                    boxShadow: rest.windowMode === 'multi' ? '0 4px 6px -1px rgba(59, 130, 246, 0.1)' : 'none'
                                }}>
                                    <input
                                        type="radio"
                                        name="windowMode"
                                        value="multi"
                                        checked={rest.windowMode === 'multi'}
                                        onChange={(e) => rest.setWindowMode && rest.setWindowMode(e.target.value)}
                                        style={{ marginTop: '4px', marginRight: '1rem', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: '700', color: '#1e293b', marginBottom: '0.4rem', fontSize: '1rem' }}>다중 창 모드 (기본)</div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>
                                            같은 앱을 여러 개 띄울 수 있어 멀티태스킹에 유리합니다.
                                        </div>
                                    </div>
                                </label>

                                <label style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    cursor: 'pointer',
                                    padding: '1.25rem',
                                    borderRadius: '12px',
                                    border: rest.windowMode === 'single' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                    background: rest.windowMode === 'single' ? '#eff6ff' : '#ffffff',
                                    transition: 'all 0.2s ease',
                                    boxShadow: rest.windowMode === 'single' ? '0 4px 6px -1px rgba(59, 130, 246, 0.1)' : 'none'
                                }}>
                                    <input
                                        type="radio"
                                        name="windowMode"
                                        value="single"
                                        checked={rest.windowMode === 'single'}
                                        onChange={(e) => rest.setWindowMode && rest.setWindowMode(e.target.value)}
                                        style={{ marginTop: '4px', marginRight: '1rem', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: '700', color: '#1e293b', marginBottom: '0.4rem', fontSize: '1rem' }}>단일 창 모드</div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>
                                            이미 실행 중인 앱이 있으면 전용 창으로 전환하여 작업 효율을 높입니다.
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
