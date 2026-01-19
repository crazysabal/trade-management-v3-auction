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

            // 파일명 추출 (로컬 시간 기준)
            const now = new Date();
            const timestamp = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');

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

    const handleDisconnectGoogle = async () => {
        if (!window.confirm('구글 계정 연결을 해제하시겠습니까?\n해제 후에는 다시 연동하기 전까지 구글 드라이브 백업을 사용할 수 없습니다.')) {
            return;
        }

        try {
            setLoading(true);
            const response = await systemAPI.disconnectGoogle();
            if (response.data.success) {
                setMessage({ text: response.data.message, type: 'success' });
                fetchCredentials(); // 상태 갱신
            }
        } catch (error) {
            console.error('Failed to disconnect:', error);
            setMessage({ text: '연결 해제에 실패했습니다.', type: 'error' });
        } finally {
            setLoading(false);
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
        <div className="backup-management" style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card" style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                padding: '1.25rem',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                minHeight: 0,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                    borderBottom: '2px solid #f1f5f9',
                    paddingBottom: '1rem'
                }}>
                    <h3 style={{ fontSize: '1.25rem', margin: 0, color: '#1e293b', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🛡️ 데이터 백업 및 관리
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontWeight: '600' }}>
                        System Integrity Module
                    </div>
                </div>

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

                <div className="backup-actions" style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
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
                    {apiConfig.hasRefreshToken ? (
                        <button
                            className="btn btn-outline-danger"
                            onClick={handleDisconnectGoogle}
                            disabled={loading}
                            style={{
                                flex: 0.5,
                                padding: '1rem',
                                borderRadius: '10px',
                                fontWeight: '600'
                            }}
                        >
                            🚫 연결 해제
                        </button>
                    ) : (
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
                    )}
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
                                padding: '1.5rem',
                                borderRadius: '12px',
                                marginBottom: '1.5rem',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem',
                                lineHeight: '1.7',
                                color: '#334155',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <h5 style={{ color: '#1e293b', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    📖 구글 드라이브 연동 상세 가이드
                                </h5>

                                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#fff7ed', borderRadius: '8px', borderLeft: '4px solid #f97316' }}>
                                    <strong style={{ color: '#c2410c' }}>💡 개요</strong><br />
                                    구글 클라우드 콘솔에서 API 키를 발급받는 과정입니다. 딱 한 번만 설정하면 이후에는 버튼 클릭 한 번으로 백업이 완료됩니다.
                                </div>

                                <div className="step-item" style={{ marginBottom: '1.2rem' }}>
                                    <strong style={{ color: '#6366f1' }}>1단계. 프로젝트 생성 및 API 활성화</strong>
                                    <ul style={{ paddingLeft: '1.2rem', marginTop: '0.4rem', fontSize: '0.85rem' }}>
                                        <li><a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ fontWeight: '600' }}>Google Cloud Console</a> 접속</li>
                                        <li>상단 프로젝트 선택 버튼 클릭 &gt; <strong>[새 프로젝트]</strong> 생성 (이름: HongdaBiz-Backup)</li>
                                        <li>좌측 메뉴 <strong>[라이브러리]</strong> &gt; <code>Google Drive API</code> 검색 후 <strong>[사용]</strong> 클릭</li>
                                    </ul>
                                </div>

                                <div className="step-item" style={{ marginBottom: '1.2rem' }}>
                                    <strong style={{ color: '#6366f1' }}>2단계. OAuth 동의 화면 설정 (중요 🌟)</strong>
                                    <ul style={{ paddingLeft: '1.2rem', marginTop: '0.4rem', fontSize: '0.85rem' }}>
                                        <li>좌측 메뉴 <strong>[OAuth 동의 화면]</strong> &gt; User Type <strong>[외부]</strong> 선택</li>
                                        <li>앱 이름(HongdaBiz)과 이메일 주소 등 필수 항목 입력</li>
                                        <li><strong>[Test users]</strong> 단계에서 <strong>반드시 본인의 구글 이메일을 추가</strong>해야 합니다. (미등록 시 접속 차단됨)</li>
                                    </ul>
                                </div>

                                <div className="step-item" style={{ marginBottom: '1.2rem' }}>
                                    <strong style={{ color: '#6366f1' }}>3단계. 클라이언트 ID 발급</strong>
                                    <ul style={{ paddingLeft: '1.2rem', marginTop: '0.4rem', fontSize: '0.85rem' }}>
                                        <li>좌측 메뉴 <strong>[사용자 인증 정보]</strong> &gt; <strong>[+ 사용자 인증 정보 만들기]</strong></li>
                                        <li><strong>[OAuth 클라이언트 ID]</strong> 선택 &gt; 유형: <strong>웹 애플리케이션</strong></li>
                                        <li><strong>[승인된 리디렉션 URI]</strong> 에 아래 주소 입력:<br />
                                            <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', color: '#dc2626' }}>http://localhost:5000/api/system/auth/google/callback</code>
                                        </li>
                                        <li>생성 후 화면에 뜨는 <strong>Client ID</strong>와 <strong>Client Secret</strong>을 복사하여 아래 입력 칸에 넣어주세요.</li>
                                    </ul>
                                </div>

                                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                                    <h6 style={{ fontWeight: '700', fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.5rem' }}>⚠️ 자주 발생하는 문제 (FAQ)</h6>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Q: "액세스 차단됨" 화면이 나와요.</strong><br />
                                            A: 2단계의 <b>Test users</b>에 현재 로그인하려는 이메일이 등록되어 있는지 확인해 주세요.</p>
                                        <p style={{ marginBottom: '0.5rem' }}><strong>Q: "안전하지 않은 앱" 경고가 떠요.</strong><br />
                                            A: 개인용 앱이라서 뜨는 정상적인 경고입니다. <b>[고급] &gt; [HongdaBiz(으)로 이동]</b>을 클릭하여 진행하세요.</p>
                                    </div>
                                </div>
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
                    marginTop: '1.25rem',
                    paddingTop: '1.25rem',
                    borderTop: '2px dashed #f1f5f9'
                }}>
                    <h4 style={{ fontSize: '1rem', marginBottom: '1.2rem', color: '#1e293b', fontWeight: '700' }}>
                        🔄 시스템 데이터 복구 (RESTORE)
                    </h4>
                    <div style={{ padding: '1rem', backgroundColor: '#fff1f2', borderRadius: '12px', border: '1px solid #fecdd3' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <label className="btn btn-danger" style={{
                                flex: 1,
                                minWidth: '200px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                padding: '1rem',
                                borderRadius: '10px',
                                fontWeight: '700',
                                boxShadow: '0 4px 6px -1px rgba(225, 29, 72, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '1.2rem' }}>📂</span> 백업 파일 선택 및 복구 실행
                                <input
                                    type="file"
                                    accept=".zip"
                                    style={{ display: 'none' }}
                                    onChange={handleRestoreBackup}
                                    disabled={loading}
                                />
                            </label>
                            <div style={{ flex: 1.5, minWidth: '250px', fontSize: '0.875rem', color: '#9f1239', lineHeight: '1.6' }}>
                                <strong>주의:</strong> 선택한 백업 파일로 데이터베이스를 완전히 덮어씌웁니다.<br />
                                <b>*.zip</b> 형식의 파일을 업로드하면 즉시 복구가 진행됩니다.
                            </div>
                        </div>
                    </div>
                </div>

                <div className="backup-history" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    marginTop: '1.25rem',
                    marginBottom: '1.25rem'
                }}>
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: '#64748b' }}>최근 로컬 백업 내역</h4>
                    <div className="backup-list" style={{
                        maxHeight: '300px',
                        overflowY: 'auto',
                        border: '1px solid #f1f5f9',
                        borderRadius: '8px',
                        backgroundColor: '#fcfcfd'
                    }}>
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
