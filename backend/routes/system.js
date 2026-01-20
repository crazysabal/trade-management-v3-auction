const express = require('express');
const router = express.Router();
const backupUtil = require('../utils/backupUtil');
const googleDriveUtil = require('../utils/googleDriveUtil');
const recoveryUtil = require('../utils/recoveryUtil');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// 백업 업로드용 설정
const upload = multer({ dest: 'temp_uploads/' });

// 구글 인증 URL 가져오기
router.get('/auth/google/url', (req, res) => {
    try {
        const url = googleDriveUtil.generateAuthUrl();
        res.json({ success: true, url });
    } catch (error) {
        console.error('Google Auth URL error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 구글 인증 콜백 (토큰 수신 및 저장)
router.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) throw new Error('인증 코드가 없습니다.');

        const tokens = await googleDriveUtil.getTokenFromCode(code);

        if (tokens.refresh_token) {
            // .env 파일 업데이트 로직
            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            } else {
                envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
            }

            fs.writeFileSync(envPath, envContent);
            // 메모리 상의 process.env도 업데이트
            process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;

            res.send(`
                <html>
                    <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
                        <div style="text-align: center; padding: 2rem; background: white; border-radius: 12px; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                            <h2 style="color: #059669;">✅ 구글 계정 연결 성공!</h2>
                            <p style="color: #475569;">이제 시스템에서 구글 드라이브 백업을 사용할 수 있습니다.</p>
                            <p style="color: #94a3b8; font-size: 0.875rem;">이 창을 닫고 원래 화면에서 작업을 계속하세요.</p>
                            <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600;">닫기</button>
                        </div>
                        <script>
                            // 부모 창(Opener)에게 성공 메시지 전송
                            if (window.opener) {
                                window.opener.postMessage('google-auth-success', '*');
                            }
                        </script>
                    </body>
                </html>
            `);
        } else {
            res.send('이미 연결된 계정입니다. (Refresh Token이 새로 발급되지 않음)');
        }
    } catch (error) {
        console.error('Google Callback Error:', error);
        res.status(500).send('인증 오류 발생: ' + error.message);
    }
});

// 구글 계정 연결 해제
router.post('/auth/google/disconnect', async (req, res) => {
    try {
        const envPath = path.join(__dirname, '../.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        // GOOGLE_REFRESH_TOKEN 항목 삭제 또는 초기화
        if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
            envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, 'GOOGLE_REFRESH_TOKEN=');
            fs.writeFileSync(envPath, envContent);

            // 메모리에서도 제거
            delete process.env.GOOGLE_REFRESH_TOKEN;

            res.json({ success: true, message: '구글 계정 연결이 성공적으로 해제되었습니다.' });
        } else {
            res.json({ success: true, message: '이미 연결된 계정이 없습니다.' });
        }
    } catch (error) {
        console.error('Google Disconnect Error:', error);
        res.status(500).json({ success: false, message: '연결 해제 중 오류가 발생했습니다.' });
    }
});

// 백업 생성 및 다운로드 (로컬 방식)
router.get('/backup/download', async (req, res) => {
    try {
        const { filePath, fileName } = await backupUtil.generateBackupZip();

        // 파일 전송 후 응답 완료 시 삭제 (선택 사항)
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Backup download error:', err);
            }
            // 백업 파일은 보관용으로 남겨두거나 삭제할 수 있음
            // 여기서는 즉시 다운로드용이므로 일정 시간이 지나면 삭제하는 로직을 추가할 수도 있음
        });
    } catch (error) {
        console.error('Backup error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 백업 생성 및 구글 드라이브 업로드
router.post('/backup/google-drive', async (req, res) => {
    try {
        // 0. 설정 확인
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
            return res.status(400).json({
                success: false,
                message: '구글 드라이브 인증 설정이 완료되지 않았습니다. .env 설정이 필요합니다.'
            });
        }

        // 1. 백업 생성
        const { filePath, fileName } = await backupUtil.generateBackupZip();

        // 2. 구글 드라이브 업로드
        await googleDriveUtil.uploadFile(filePath, fileName);

        res.json({
            success: true,
            message: '백업 파일이 성공적으로 구글 드라이브에 업로드되었습니다.',
            fileName: fileName
        });
    } catch (error) {
        console.error('Google Drive backup error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 기존 백업 파일 목록 조회
router.get('/backups', async (req, res) => {
    try {
        const backupDir = path.join(__dirname, '../../backups');
        if (!fs.existsSync(backupDir)) {
            return res.json({ success: true, data: [] });
        }

        const files = fs.readdirSync(backupDir)
            .filter(file => file.endsWith('.zip'))
            .map(file => {
                const stats = fs.statSync(path.join(backupDir, file));
                return {
                    fileName: file,
                    size: stats.size,
                    createdAt: stats.birthtime
                };
            })
            .sort((a, b) => b.createdAt - a.createdAt);

        res.json({ success: true, data: files });
    } catch (error) {
        console.error('Backup list error:', error);
        res.status(500).json({ success: false, message: '백업 목록을 가져오는 중 오류가 발생했습니다.' });
    }
});

// 백업 파일 업로드 및 복구 실행
router.post('/backup/restore', upload.single('backupFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '업로드된 파일이 없습니다.' });
        }

        const result = await recoveryUtil.restoreFromZip(req.file.path);

        // 업로드된 임시 파일 삭제
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json(result);
    } catch (error) {
        console.error('Restore error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 구글 API 자격 증명 조회 (마스킹 처리)
router.get('/backup/credentials', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                clientId: process.env.GOOGLE_CLIENT_ID ? '********' + process.env.GOOGLE_CLIENT_ID.slice(-4) : '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET ? '********' : '',
                hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 구글 API 자격 증명 저장
router.post('/backup/credentials', async (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        if (!clientId || !clientSecret) {
            return res.status(400).json({ success: false, message: 'Client ID와 Secret은 필수입니다.' });
        }

        const envPath = path.join(__dirname, '../.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        const updates = {
            'GOOGLE_CLIENT_ID': clientId,
            'GOOGLE_CLIENT_SECRET': clientSecret
        };

        for (const [key, value] of Object.entries(updates)) {
            if (envContent.includes(`${key}=`)) {
                const regex = new RegExp(`${key}=.*`);
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
            process.env[key] = value;
        }

        fs.writeFileSync(envPath, envContent);
        res.json({ success: true, message: 'API 자격 증명이 저장되었습니다.' });
    } catch (error) {
        console.error('Save credentials error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 구글 드라이브 백업 목록 조회 [NEW]
router.get('/backup/google-drive/files', async (req, res) => {
    try {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
            return res.json({ success: true, data: { files: [], folderUrl: '' } }); // 설정 없으면 일관된 구조 반환
        }

        const files = await googleDriveUtil.listFiles();
        res.json({ success: true, data: files });
    } catch (error) {
        console.error('Google Drive list error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
