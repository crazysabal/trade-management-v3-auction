import React, { useState, useEffect } from 'react';
import { systemAPI } from '../services/api';

const BackupManagement = () => {
    const [backups, setBackups] = useState([]);
    const [remoteBackups, setRemoteBackups] = useState([]);
    const [driveFolderUrl, setDriveFolderUrl] = useState(''); // [NEW] 구글 드라이브 폴더 URL
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [apiConfig, setApiConfig] = useState({ clientId: '', clientSecret: '', hasRefreshToken: false });
    const [showApiSetup, setShowApiSetup] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        fetchBackups();
        fetchCredentials();
        fetchRemoteBackups();

        // [NEW] 구글 인증 성공 이벤트 리스너 추가 (팝업창에서 postMessage 전송 시 실행)
        const handleAuthMessage = (event) => {
            if (event.data === 'google-auth-success') {
                console.log('Google Auth Success detected via message event');
                fetchCredentials();
                fetchRemoteBackups();
                setMessage({ text: '구글 계정이 성공적으로 연결되었습니다.', type: 'success' });
            }
        };

        window.addEventListener('message', handleAuthMessage);
        return () => window.removeEventListener('message', handleAuthMessage);
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

    // 원격 백업 목록 조회
    const fetchRemoteBackups = async () => {
        try {
            const response = await systemAPI.getGoogleDriveBackups();
            if (response.data.success) {
                // [FIX] 데이터 구조 안전하게 수신 (null/undefined/배열 가능성 모두 대응)
                const remoteData = response.data.data || {};
                const files = remoteData.files || (Array.isArray(remoteData) ? remoteData : []);
                const folderUrl = remoteData.folderUrl || '';

                setRemoteBackups(files);
                setDriveFolderUrl(folderUrl);
            }
        } catch (error) {
            console.error('Failed to fetch remote backups:', error);
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
                fetchCredentials();
                setRemoteBackups([]);
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
                fetchRemoteBackups();
            }
        } catch (error) {
            console.error('Google Drive backup failed:', error);
            setMessage({ text: '구글 드라이브 백업에 실패했습니다. (API 인증 정보 확인 필요)', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDriveFolder = () => {
        if (driveFolderUrl) {
            window.open(driveFolderUrl, '_blank');
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
        <div className="backup-management" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1px' }}>
            <style>
                {`
                    .btn-google-drive {
                        background-color: #34a853 !important;
                        border-color: #34a853 !important;
                        color: white !important;
                        transition: all 0.2s ease;
                    }
                    .btn-google-drive:hover {
                        background-color: #2d8e47 !important;
                        border-color: #2d8e47 !important;
                        transform: translateY(-1px);
                        box-shadow: 0 6px 8px -1px rgba(52, 168, 83, 0.3) !important;
                    }
                    .btn-google-drive:active {
                        transform: translateY(0);
                        background-color: #26793c !important;
                    }
                    .btn-primary-custom {
                        background-color: #2563eb !important;
                        border-color: #2563eb !important;
                        transition: all 0.2s ease;
                    }
                    .btn-primary-custom:hover {
                        background-color: #1d4ed8 !important;
                        transform: translateY(-1px);
                        box-shadow: 0 6px 8px -1px rgba(37, 99, 235, 0.3) !important;
                    }
                    .btn-danger-custom {
                        background-color: #ef4444 !important;
                        border-color: #ef4444 !important;
                        color: white !important;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.2);
                    }
                    .btn-danger-custom:hover {
                        background-color: #dc2626 !important;
                        transform: translateY(-1px);
                        box-shadow: 0 6px 8px -1px rgba(225, 29, 72, 0.3) !important;
                    }
                    .btn-danger-custom:active {
                        transform: translateY(0);
                    }
                    .btn-outline-danger-custom {
                        color: #ef4444 !important;
                        border: 1px solid #ef4444 !important;
                        background-color: transparent !important;
                        transition: all 0.2s ease;
                    }
                    .btn-outline-danger-custom:hover {
                        background-color: #fef2f2 !important;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.1) !important;
                    }
                    .btn-outline-dark-custom {
                        color: #334155 !important;
                        border: 1px dashed #334155 !important;
                        background-color: transparent !important;
                        transition: all 0.2s ease;
                    }
                    .btn-outline-dark-custom:hover {
                        background-color: #f1f5f9 !important;
                        transform: translateY(-1px);
                    }
                `}
            </style>
            <div className="card" style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '1.25rem',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                margin: 0,
                minHeight: 0,
                overflowY: 'auto', // [MOD] hidden -> auto로 변경하여 전체 스크롤 허용
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

                <div className="backup-section" style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '1rem', marginBottom: '1.2rem', color: '#1e293b', fontWeight: '700' }}>
                        🚀 시스템 데이터 백업 (BACKUP)
                    </h4>
                    <div style={{ padding: '1.25rem', backgroundColor: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                        <div className="backup-actions" style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={handleDownloadBackup}
                                disabled={loading}
                                style={{
                                    flex: 1,
                                    padding: '1rem',
                                    borderRadius: '10px',
                                    fontWeight: '700',
                                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                                }}
                                className="btn btn-primary btn-primary-custom"
                            >
                                📥 내 PC로 백업 받기 (ZIP)
                            </button>
                            <button
                                className="btn btn-google-drive"
                                onClick={handleGoogleDriveBackup}
                                disabled={loading}
                                style={{
                                    flex: 1,
                                    padding: '1rem',
                                    borderRadius: '10px',
                                    fontWeight: '700',
                                    boxShadow: '0 4px 6px -1px rgba(52, 168, 83, 0.2)'
                                }}
                            >
                                ☁️ 구글 드라이브로 즉시 백업
                            </button>
                            {apiConfig.hasRefreshToken ? (
                                <button
                                    className="btn btn-outline-danger-custom"
                                    onClick={handleDisconnectGoogle}
                                    disabled={loading}
                                    style={{
                                        flex: 0.8,
                                        padding: '1rem',
                                        borderRadius: '10px',
                                        fontWeight: '700'
                                    }}
                                >
                                    🚫 구글 연동 해제
                                </button>
                            ) : (
                                <button
                                    className="btn btn-outline-dark-custom"
                                    onClick={handleConnectGoogle}
                                    disabled={loading || !apiConfig.clientId}
                                    style={{
                                        flex: 0.8,
                                        padding: '1rem',
                                        borderRadius: '10px',
                                        fontWeight: '700',
                                        borderStyle: 'dashed',
                                        opacity: !apiConfig.clientId ? 0.5 : 1
                                    }}
                                >
                                    🔗 구글 드라이브 연동
                                </button>
                            )}
                        </div>
                    </div>
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
                    marginTop: '0.4rem',
                    paddingTop: '0.4rem'
                }}>
                    <h4 style={{ fontSize: '1rem', marginBottom: '0.8rem', color: '#1e293b', fontWeight: '700' }}>
                        🔄 시스템 데이터 복구 (RESTORE)
                    </h4>
                    <div style={{ padding: '1.25rem', backgroundColor: '#fff1f2', borderRadius: '12px', border: '1px solid #fecdd3' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <label className="btn-danger-custom" style={{
                                flex: 1,
                                minWidth: '200px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                padding: '1rem',
                                borderRadius: '10px',
                                fontWeight: '700',
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
                            <div style={{ flex: 1.8, minWidth: '250px', fontSize: '0.875rem', color: '#9f1239', lineHeight: '1.6' }}>
                                <strong>주의:</strong> 선택한 백업 파일로 데이터베이스를 완전히 덮어씌웁니다.<br />
                                <b>*.zip</b> 형식의 파일을 업로드하면 즉시 복구가 진행됩니다.
                            </div>
                        </div>
                    </div>
                </div>

                <div className="backup-histories-wrapper" style={{
                    display: 'flex',
                    gap: '1.5rem',
                    marginTop: '0.4rem',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden'
                }}>
                    <div className="backup-history" style={{
                        flex: 1,
                        minWidth: '320px',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', height: '32px' }}>
                            <h4 style={{ fontSize: '0.95rem', margin: 0, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>최근 로컬 백업 내역</h4>
                        </div>
                        <div className="backup-list" style={{
                            flex: 1,
                            minHeight: 0,
                            overflowY: 'auto',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            backgroundColor: '#f8fafc',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {backups?.length > 0 ? (
                                backups.map((backup, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: '0.75rem 1rem',
                                        borderBottom: idx < backups.length - 1 ? '1px solid #e2e8f0' : 'none',
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

                    {/* [NEW] 구글 드라이브 원격 백업 목록 섹션 */}
                    {apiConfig.hasRefreshToken && (
                        <div className="remote-backup-history" style={{
                            flex: 1,
                            minWidth: '320px',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                            overflow: 'hidden'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', height: '32px' }}>
                                <h4 style={{ fontSize: '0.95rem', margin: 0, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    ☁️ 구글 드라이브 백업 내역
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#64748b' }}>(최근 20개)</span>
                                </h4>
                                {driveFolderUrl && (
                                    <button
                                        onClick={handleOpenDriveFolder}
                                        className="btn btn-sm btn-outline-primary"
                                        style={{
                                            fontSize: '0.75rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px',
                                            border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569'
                                        }}
                                    >
                                        📂 폴더 열기
                                    </button>
                                )}
                            </div>

                            <div className="backup-list" style={{
                                flex: 1,
                                minHeight: 0,
                                overflowY: 'auto',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                backgroundColor: '#f8fafc',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {remoteBackups?.length > 0 ? (
                                    remoteBackups.map((file, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '0.75rem 1rem',
                                            borderBottom: idx < remoteBackups.length - 1 ? '1px solid #e2e8f0' : 'none',
                                            fontSize: '0.85rem'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <div style={{ fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {file.name}
                                                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#1e40af' }}>Cloud</span>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {new Date(file.createdTime).toLocaleString()}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{formatSize(file.size)}</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                        {loading ? '목록을 불러오는 중...' : '구글 드라이브에 저장된 백업이 없습니다.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BackupManagement;
