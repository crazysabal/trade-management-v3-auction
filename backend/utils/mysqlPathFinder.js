const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * MySQL 설치 경로를 자동으로 찾아주는 유틸리티
 */
const mysqlPathFinder = {
    /**
     * MySQL bin 폴더 경로를 시스템에서 탐색합니다.
     * @returns {string|null} 찾은 bin 폴더 경로 또는 null
     */
    findBinPath: () => {
        const rootPaths = [
            'C:\\Program Files\\MySQL',
            'C:\\Program Files (x86)\\MySQL',
            'C:\\'
        ];

        for (const root of rootPaths) {
            if (!fs.existsSync(root)) continue;

            // 1. 직접적인 bin 폴더 검색 (C:\mysql\bin 등)
            const directBin = path.join(root, 'bin');
            if (fs.existsSync(path.join(directBin, 'mysqldump.exe'))) {
                return directBin;
            }

            // 2. MySQL Server X.X 폴더들 검색
            try {
                const subs = fs.readdirSync(root);
                for (const sub of subs) {
                    const fullPath = path.join(root, sub, 'bin');
                    if (fs.existsSync(path.join(fullPath, 'mysqldump.exe'))) {
                        return fullPath;
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // 3. 환경 변수(where 명령)에서 직접 찾기 시도
        try {
            const output = execSync('where mysqldump', { encoding: 'utf8' }).split('\n')[0].trim();
            if (output && fs.existsSync(output)) {
                return path.dirname(output);
            }
        } catch (e) { /* ignore */ }

        return null;
    },

    /**
     * 특정 실행 파일의 전체 경로를 반환합니다.
     * @param {string} fileName (예: 'mysqldump.exe' 또는 'mysql.exe')
     * @param {string} envValue (.env에 설정된 값)
     * @returns {string} 최종 실행 경로
     */
    getExecutablePath: (fileName, envValue) => {
        // 1. .env에 설정된 값이 있고, 그게 유효한 파일이면 우선 사용
        if (envValue && fs.existsSync(envValue) && !envValue.endsWith(fileName === 'mysqldump.exe' ? 'mysql.exe' : 'mysqldump.exe')) {
            // 파일명까지 정확히 일치하는지 확인 (상호 혼용 방지)
            if (envValue.toLowerCase().endsWith(fileName.toLowerCase())) return envValue;
            // 폴더 경로만 적혀있다면 합쳐서 확인
            const joined = path.join(envValue, fileName);
            if (fs.existsSync(joined)) return joined;
        }

        // 2. 자동 탐색 시도
        const binPath = mysqlPathFinder.findBinPath();
        if (binPath) {
            const fullPath = path.join(binPath, fileName);
            if (fs.existsSync(fullPath)) return fullPath;
        }

        // 3. 마지막 수단: 그냥 이름만 반환 (PATH 환경변수에 의존)
        return fileName.replace('.exe', '');
    }
};

module.exports = mysqlPathFinder;
