const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * HardwareInfo Utility
 * PC의 고유 하드웨어 정보를 추출하여 라이선스 식별자로 활용합니다.
 */
class HardwareInfo {
    /**
     * 메인보드 시리얼 번호를 가져옵니다.
     */
    static getBoardSerial() {
        try {
            // Windows PowerShell 명령 사용
            const command = 'powershell -Command "Get-WmiObject win32_baseboard | Select-Object -ExpandProperty SerialNumber"';
            const output = execSync(command).toString().trim();
            return output || 'UNKNOWN_BOARD';
        } catch (error) {
            console.error('[License] 기기 정보 추출 실패:', error.message);
            return 'FALLBACK_ID_' + process.env.COMPUTERNAME;
        }
    }

    /**
     * 기기 고유 해시 ID를 생성합니다 (보안을 위해 원본 시리얼을 숨김).
     */
    static getMachineId() {
        const serial = this.getBoardSerial();
        // HDB(Hongda Biz) 접두사와 함께 짧은 해시 생성
        const hash = crypto.createHash('sha256').update(serial + 'HONGDA_SALT').digest('hex');
        return `HDB-${hash.substring(0, 8).toUpperCase()}`;
    }
}

module.exports = HardwareInfo;

// 직접 실행 시 테스트 (node HardwareInfo.js)
if (require.main === module) {
    console.log('--- 기기 정보 테스트 ---');
    console.log('Board Serial:', HardwareInfo.getBoardSerial());
    console.log('Machine ID:', HardwareInfo.getMachineId());
}
