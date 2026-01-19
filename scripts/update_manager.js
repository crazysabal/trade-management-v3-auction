const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');

/**
 * UpdateManager
 * 온라인에서 최신 버전을 체크하고 업데이트를 수행합니다.
 */
class UpdateManager {
    constructor() {
        this.localVersionFile = path.join(__dirname, '../version.json');
        // 실제 사장님의 GitHub 저장소 URL로 수정 완료 (리포지토리: hongda-biz, 브랜치: master)
        this.remoteVersionUrl = 'https://raw.githubusercontent.com/crazysabal/hongda-biz/master/version.json';
        this.patchDownloadUrl = 'https://github.com/crazysabal/hongda-biz/archive/refs/heads/master.zip';
        this.tempDir = path.join(__dirname, '../temp_update');
    }

    async getLocalVersion() {
        if (!fs.existsSync(this.localVersionFile)) return '0.0.0';
        const data = JSON.parse(fs.readFileSync(this.localVersionFile, 'utf8'));
        return data.version;
    }

    async getRemoteVersion() {
        return new Promise((resolve, reject) => {
            https.get(this.remoteVersionUrl, (res) => {
                let data = '';
                res.on('data', d => data += d);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.version);
                    } catch (e) {
                        reject(new Error('원격 버전 정보를 읽을 수 없습니다.'));
                    }
                });
            }).on('error', reject);
        });
    }

    async downloadPatch(url, dest) {
        console.log(`[Update] 패치 다운로드 중: ${url}`);
        return new Promise((resolve, reject) => {
            try {
                // [FIX] 깃허브 리디렉션 대응을 위해 PowerShell의 Invoke-WebRequest 사용
                const psCommand = `Invoke-WebRequest -Uri "${url}" -OutFile "${dest}" -MaximumRedirection 10`;
                execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
                resolve();
            } catch (err) {
                console.error('[Update] 다운로드 실패:', err.message);
                reject(err);
            }
        });
    }

    async applyPatch() {
        const extractedDir = path.join(this.tempDir, 'extracted');

        // [FIX] 압축 해제가 실제로 성공했는지 확인
        if (!fs.existsSync(extractedDir) || fs.readdirSync(extractedDir).length === 0) {
            throw new Error('압축 해제된 파일이 없습니다. 패치 파일이 손상되었을 수 있습니다.');
        }

        const subDirs = fs.readdirSync(extractedDir);
        const sourceDir = subDirs.length === 1 ? path.join(extractedDir, subDirs[0]) : extractedDir;
        const projectRoot = path.join(__dirname, '..');

        const EXCLUDE_LIST = ['.env', 'cookies', 'puppeteer_data', 'logs', 'node_modules', '.git', 'temp_update'];

        function copyRecursive(src, dest) {
            const stats = fs.statSync(src);
            const isDirectory = stats.isDirectory();
            const name = path.basename(src);

            if (EXCLUDE_LIST.includes(name)) return;

            if (isDirectory) {
                if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                fs.readdirSync(src).forEach(child => {
                    copyRecursive(path.join(src, child), path.join(dest, child));
                });
            } else {
                fs.copyFileSync(src, dest);
            }
        }

        console.log('[Update] 코드 교체 중...');
        copyRecursive(sourceDir, projectRoot);

        // 뒷정리
        console.log('[Update] 임시 파일 정리 중...');
        fs.rmSync(this.tempDir, { recursive: true, force: true });
    }

    async installDependencies() {
        console.log('\n--- [Update Manager] 라이브러리 자동 설치 (Self-Repair) ---');
        const dirs = ['backend', 'frontend'];
        const rootDir = path.join(__dirname, '..');

        for (const dir of dirs) {
            console.log(`\n[${dir}] 설치 확인 및 진행 중...`);
            try {
                const targetPath = path.join(rootDir, dir);
                if (fs.existsSync(targetPath)) {
                    // Windows 대응: shell: true 옵션으로 npm/npm.cmd 자동 처리
                    execSync('npm install', { cwd: targetPath, stdio: 'inherit', shell: true });
                }
            } catch (err) {
                console.error(`❌ [${dir}] 설치 중 오류 발생 (무시하고 진행): ${err.message}`);
            }
        }
        console.log('\n--- [Update Manager] 설치 완료 ---\n');
    }

    async checkAndUpdate() {
        console.log('\n================================================');
        console.log('   홍다 비즈 (Hongda Biz) 온라인 업데이트');
        console.log('================================================\n');

        try {
            const local = await this.getLocalVersion();
            const remote = await this.getRemoteVersion();

            console.log(`- 현재 버전: ${local}`);
            console.log(`- 최신 버전: ${remote}`);

            if (local === remote) {
                console.log('\n✅ 이미 최신 버전을 사용 중입니다.');
                return;
            }

            console.log('\n🚀 새로운 업데이트가 발견되었습니다! 패치를 시작합니다.');

            if (fs.existsSync(this.tempDir)) fs.rmSync(this.tempDir, { recursive: true, force: true });
            fs.mkdirSync(this.tempDir, { recursive: true });

            const zipFile = path.join(this.tempDir, 'patch.zip');
            await this.downloadPatch(this.patchDownloadUrl, zipFile);

            console.log('[Update] 패치 압축 해제 중...');
            // [FIX] PowerShell 중단 로직($ErrorActionPreference) 추가 및 상세 로그 출력
            const psCommand = `$ErrorActionPreference = 'Stop'; Expand-Archive -Path "${zipFile}" -DestinationPath "${this.tempDir}/extracted" -Force`;
            try {
                execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
            } catch (extErr) {
                throw new Error(`압축 해제 실패: ${extErr.message}`);
            }

            await this.applyPatch();

            // [FIX] 배치 파일 종료 문제 방지를 위해 JS에서 직접 의존성 설치 수행
            await this.installDependencies();

            console.log('\n--- 업데이트 완료! ---');
            console.log('1. 라이브러리 갱신을 위해 npm install을 실행합니다.');
            console.log('2. 프로그램(런처)을 다시 실행해 주세요.');

        } catch (error) {
            console.log('\n❌ 업데이트 중 오류가 발생했습니다.');
            console.log('원인:', error.message);
            console.log('\n! 인터넷 연결을 확인하거나 나중에 다시 시도해 주세요.');
        }
    }
}

// 직접 실행 시
if (require.main === module) {
    const manager = new UpdateManager();
    manager.checkAndUpdate();
}

module.exports = UpdateManager;
