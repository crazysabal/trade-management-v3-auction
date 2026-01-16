const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * HardwareInfo Utility (Launcher Copy)
 * 런처 패키징 시 독립성을 위해 복제된 모듈입니다.
 */
class HardwareInfo {
    static getBoardSerial() {
        try {
            const command = 'powershell -Command "Get-WmiObject win32_baseboard | Select-Object -ExpandProperty SerialNumber"';
            const output = execSync(command).toString().trim();
            return output || 'UNKNOWN_BOARD';
        } catch (error) {
            return 'FALLBACK_ID_' + (process.env.COMPUTERNAME || 'UNKNOWN');
        }
    }

    static getMachineId() {
        const serial = this.getBoardSerial();
        const hash = crypto.createHash('sha256').update(serial + 'HONGDA_SALT').digest('hex');
        return `HDB-${hash.substring(0, 8).toUpperCase()}`;
    }
}

module.exports = HardwareInfo;
