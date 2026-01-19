import React, { useState, useEffect } from 'react';
import { systemAPI } from '../services/api';

const BackupManagement = () => {
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [apiConfig, setApiConfig] = useState({ clientId: '', clientSecret: '', hasRefreshToken: false });
    const [showApiSetup, setShowApiSetup] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        fetchBackups();
        fetchCredentials();
    }, []);

    const fetchCredentials = async () => {
        try {
            const response = await systemAPI.getCredentials();
            if (response.data.success) {
                setApiConfig(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch credentials:', error);
        }
    };

    const fetchBackups = async () => {
        try {
            const response = await systemAPI.getBackups();
            if (response.data.success) {
                setBackups(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch backups:', error);
        }
    };

    const handleDownloadBackup = async () => {
        try {
            setLoading(true);
            setMessage({ text: '백업 파일을 생성 중입니다...', type: 'info' });

            const response = await systemAPI.downloadBackup();

            // Blob을 이용한 파일 다운로드
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            // 파일명 추출 (Content-Disposition 확인이 어려우면 기본값 사용)
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.setAttribute('download', `HongdaBiz_Backup_${timestamp}.zip`);

            document.body.appendChild(link);
            link.click();
            link.remove();

            setMessage({ text: '백업 파일이 성공적으로 생성되었습니다.', type: 'success' });
            fetchBackups();
        } catch (error) {
            console.error('Backup download failed:', error);
            setMessage({ text: '백업 생성에 실패했습니다.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleConnectGoogle = async () => {
        try {
            const response = await systemAPI.getGoogleAuthUrl();
            if (response.data.success && response.data.url) {
                // 구글 로그인 창을 새 창으로 띄움
                window.open(response.data.url, 'google-auth', 'width=600,height=700');
            }
        } catch (error) {
            console.error('Failed to get auth URL:', error);
            setMessage({ text: '구글 인증 주소를 가져오지 못했습니다. Client ID 설정을 확인해주세요.', type: 'error' });
        }
    };

    const handleGoogleDriveBackup = async () => {
        try {
            setLoading(true);
            setMessage({ text: '구글 드라이브에 백업 중입니다...', type: 'info' });

            const response = await systemAPI.backupToGoogleDrive();
            if (response.data.success) {
                setMessage({ text: response.data.message, type: 'success' });
                fetchBackups();
            }
        } catch (error) {
            console.error('Google Drive backup failed:', error);
            setMessage({ text: '구글 드라이브 백업에 실패했습니다. (API 인증 정보 확인 필요)', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleRestoreBackup = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const confirmRestore = window.confirm(
            '경고: 데이터 복구를 진행하면 현재의 전표 및 모든 데이터가 백업 파일의 상태로 덮어씌워집니다.\n' +
            '복구 직전에 현재 상태가 자동으로 한 번 더 백업되지만, 신중하게 진행해주세요.\n\n' +
            '정말로 복구를 진행하시겠습니까?'
        );

        if (!confirmRestore) {
            event.target.value = '';
            return;
        }

        try {
            setLoading(true);
            setMessage({ text: '데이터 복구를 진행 중입니다. 잠시만 기다려주세요...', type: 'info' });

            const formData = new FormData();
            formData.append('backupFile', file);

            const response = await systemAPI.restoreBackup(formData);
            if (response.data.success) {
                alert('데이터 복구가 성공적으로 완료되었습니다.\n정확한 데이터 반영을 위해 페이지를 새로고침합니다.');
                window.location.reload();
            }
        } catch (error) {
            console.error('Restore failed:', error);
            setMessage({
                text: '복구 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message),
                type: 'error'
            });
        } finally {
            setLoading(false);
            event.target.value = '';
        }
    };

    const handleSaveCredentials = async () => {
        try {
            setLoading(true);
            const response = await systemAPI.saveCredentials({
                clientId: apiConfig.clientId,
                clientSecret: apiConfig.clientSecret
            });
            if (response.data.success) {
                setMessage({ text: 'API 설정이 저장되었습니다.', type: 'success' });
                setShowApiSetup(false);
                fetchCredentials();
            }
        } catch (error) {
            setMessage({ text: '저장 실패: ' + error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="backup-management">
            <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1.2rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🛡️ 데이터 백업 및 관리
                </h3>

                {message.text && (
                    <div className={`alert alert-${message.type}`} style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        backgroundColor: message.type === 'error' ? '#fee2e2' : message.type === 'success' ? '#dcfce7' : '#e0f2fe',
                        color: message.type === 'error' ? '#b91c1c' : message.type === 'success' ? '#15803d' : '#0369a1',
                        fontSize: '0.9rem'
                    }}>
                        {message.type === 'info' && '⏳ '}
                        {message.type === 'success' && '✅ '}
                        {message.type === 'error' && '❌ '}
                        {message.text}
                    </div>
                )}

                <div className="backup-actions" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleDownloadBackup}
                        disabled={loading}
                        style={{ flex: 1, padding: '1rem', borderRadius: '10px', fontWeight: '600' }}
                    >
                        📥 내 PC로 백업 받기 (ZIP)
                    </button>
                    <button
                        className="btn btn-success"
                        onClick={handleGoogleDriveBackup}
                        disabled={loading}
                        style={{
                            flex: 1,
                            padding: '1rem',
                            borderRadius: '10px',
                            fontWeight: '600',
                            backgroundColor: '#34a853',
                            borderColor: '#34a853'
                        }}
                    >
                        ☁️ 구글 드라이브로 즉시 백업
                    </button>
                    <button
                        className="btn btn-outline-dark"
                        onClick={handleConnectGoogle}
                        disabled={loading || !apiConfig.clientId}
                        style={{
                            flex: 0.5,
                            padding: '1rem',
                            borderRadius: '10px',
                            fontWeight: '600',
                            borderStyle: 'dashed',
                            opacity: !apiConfig.clientId ? 0.5 : 1
                        }}
                    >
                        🔗 계정 연결
                    </button>
                </div>

                {!apiConfig.clientId && !showApiSetup && (
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <button
                            className="btn btn-link"
                            onClick={() => setShowApiSetup(true)}
                            style={{ color: '#6366f1', fontSize: '0.9rem', textDecoration: 'none' }}
                        >
                            ⚙️ 구글 API 초기 설정이 필요한가요?
                        </button>
                    </div>
                )}

                {showApiSetup && (
                    <div className="api-setup-panel" style={{
                        backgroundColor: '#f8fafc',
                        padding: '1.25rem',
                        borderRadius: '10px',
                        marginBottom: '1.5rem',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h4 style={{ fontSize: '0.9rem', margin: 0, color: '#334155' }}>구글 API 설정 (최초 1회)</h4>
                            <button
                                className="btn btn-sm btn-link"
                                onClick={() => setShowGuide(!showGuide)}
                                style={{ fontSize: '0.8rem', textDecoration: 'none', color: '#6366f1' }}
                            >
                                {showGuide ? '📖 가이드 닫기' : '❓ 가이드 보기'}
                            </button>
                        </div>

                        {showGuide && (
                            <div className="setup-guide" style={{
                                backgroundColor: '#ffffff',
                                padding: '1rem',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                lineHeight: '1.6',
                                color: '#475569'
                            }}>
                                <strong style={{ color: '#1e293b' }}>🚀 1분 만에 따라하기:</strong>
                                <ol style={{ paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
                                    <li><a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> 접속</li>
                                    <li><b>Google Drive API</b> 사용 버튼 클릭</li>
                                    <li><b>OAuth 동의 화면</b> 설정 (외부 선택)</li>
                                    <li><b>[중요]</b> 동의 화면 하단 <b>Test users</b>에 본인 이메일 추가</li>
                                    <li><b>사용자 인증 정보</b>에서 <b>OAuth 클라이언트 ID</b>(웹 애플리케이션) 생성</li>
                                    <li><b>리디렉션 URI</b>에 <code>http://localhost:5000/api/system/auth/google/callback</code> 입력</li>
                                </ol>
                                <p style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.5rem', marginBottom: 0 }}>
                                    * 상세 매뉴얼은 <code>google_api_guide.md</code> 파일을 확인해주세요.
                                </p>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <input
                                className="form-control"
                                placeholder="Google Client ID"
                                value={apiConfig.clientId.includes('***') ? '' : apiConfig.clientId}
                                onChange={(e) => setApiConfig({ ...apiConfig, clientId: e.target.value })}
                                style={{ fontSize: '0.9rem' }}
                            />
                            <input
                                className="form-control"
                                type="password"
                                placeholder="Google Client Secret"
                                value={apiConfig.clientSecret.includes('***') ? '' : apiConfig.clientSecret}
                                onChange={(e) => setApiConfig({ ...apiConfig, clientSecret: e.target.value })}
                                style={{ fontSize: '0.9rem' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-primary btn-sm" onClick={handleSaveCredentials} disabled={loading}>저장하기</button>
                                <button className="btn btn-light btn-sm" onClick={() => setShowApiSetup(false)}>취소</button>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                                * 구글 클라우드 콘솔에서 발급받은 정보를 입력해주세요.
                            </p>
                        </div>
                    </div>
                )}

                <div className="recovery-section" style={{
                    marginTop: '2rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px dashed #e2e8f0',
                    marginBottom: '2rem'
                }}>
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '1rem', color: '#1e293b' }}>🔄 시스템 데이터 복구</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <label className="btn btn-outline-danger" style={{
                            flex: 1,
                            cursor: 'pointer',
                            textAlign: 'center',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            fontWeight: '600'
                        }}>
                            📁 백업 파일 선택 및 복구 실행
                            <input
                                type="file"
                                accept=".zip"
                                style={{ display: 'none' }}
                                onChange={handleRestoreBackup}
                                disabled={loading}
                            />
                        </label>
                        <div style={{ flex: 1.5, fontSize: '0.85rem', color: '#64748b', lineHeight: '1.4' }}>
                            *.zip 형식의 백업 파일을 선택하면 데이터베이스가 해당 시점으로 복원됩니다.
                        </div>
                    </div>
                </div>

                <div className="backup-history">
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: '#64748b' }}>최근 로컬 백업 내역</h4>
                    <div className="backup-list" style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                        {backups.length > 0 ? (
                            backups.map((backup, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '0.75rem 1rem',
                                    borderBottom: idx < backups.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    fontSize: '0.85rem'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: '500', color: '#334155' }}>{backup.fileName}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                            {new Date(backup.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <span style={{ alignSelf: 'center', color: '#64748b' }}>{formatSize(backup.size)}</span>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>생성된 백업 내역이 없습니다.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BackupManagement;
