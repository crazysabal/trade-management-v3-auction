const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * 구글 드라이브 업로드 유틸리티
 */
const googleDriveUtil = {
    /**
     * 구글 드라이브 인증 객체 생성
     */
    getAuthClient: () => {
        const {
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            GOOGLE_REDIRECT_URI,
            GOOGLE_REFRESH_TOKEN
        } = process.env;

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            throw new Error('구글 API 설정(Client ID/Secret)이 누락되었습니다. .env 설정을 확인해주세요.');
        }

        const oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/system/auth/google/callback'
        );

        if (GOOGLE_REFRESH_TOKEN) {
            oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
        }

        return oauth2Client;
    },

    /**
     * 구글 로그인 URL 생성
     */
    generateAuthUrl: () => {
        const oauth2Client = googleDriveUtil.getAuthClient();
        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/drive.file'],
            prompt: 'consent'
        });
    },

    /**
     * 인증 코드를 토큰으로 교환
     */
    getTokenFromCode: async (code) => {
        const oauth2Client = googleDriveUtil.getAuthClient();
        const { tokens } = await oauth2Client.getToken(code);
        return tokens;
    },

    /**
     * 파일을 구글 드라이브에 업로드
     * @param {string} filePath 파일 경로
     * @param {string} fileName 드라이브에 저장될 파일명
     */
    uploadFile: async (filePath, fileName) => {
        try {
            const auth = googleDriveUtil.getAuthClient();

            // 구글 드라이브 v3 API 사용
            const driveV3 = google.drive({ version: 'v3', auth });

            // 폴더 찾기 또는 생성 (HongdaBiz_Backups)
            let folderId = await googleDriveUtil.getOrCreateFolder(driveV3, 'HongdaBiz_Backups');

            const fileMetadata = {
                name: fileName,
                parents: [folderId]
            };

            const media = {
                mimeType: 'application/zip',
                body: fs.createReadStream(filePath)
            };

            const response = await driveV3.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            });

            return response.data;
        } catch (error) {
            console.error('Google Drive Upload Error:', error);
            throw error;
        }
    },

    /**
     * 구글 드라이브 폴더 내 백업 파일 목록 조회
     */
    listFiles: async (folderName = 'HongdaBiz_Backups') => {
        try {
            const auth = googleDriveUtil.getAuthClient();
            const drive = google.drive({ version: 'v3', auth });

            // 1. 폴더 ID 찾기
            const folderId = await googleDriveUtil.getOrCreateFolder(drive, folderName);

            // [NEW] 폴더의 WebViewLink 가져오기
            const folderRes = await drive.files.get({
                fileId: folderId,
                fields: 'webViewLink'
            });
            const folderUrl = folderRes.data.webViewLink;

            // 2. 파일 목록 조회 (쿼리)
            const res = await drive.files.list({
                q: `'${folderId}' in parents and mimeType = 'application/zip' and trashed = false`,
                fields: 'files(id, name, size, createdTime, webViewLink, webContentLink)',
                orderBy: 'createdTime desc',
                pageSize: 20 // 최근 20개만
            });

            return {
                files: res.data.files,
                folderUrl
            };
        } catch (error) {
            console.error('Google Drive List Error:', error);
            throw error;
        }
    },

    /**
     * 전용 폴더가 있는지 확인하고 없으면 생성
     */
    getOrCreateFolder: async (drive, folderName) => {
        const res = await drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (res.data.files.length > 0) {
            return res.data.files[0].id;
        }

        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });

        return folder.data.id;
    }
};

module.exports = googleDriveUtil;
