require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const bcrypt = require('bcrypt');

async function fixAdmin() {
    console.log('--- 관리자 계정 긴급 복구 시작 ---');
    try {
        const password = 'admin1234';
        const hash = bcrypt.hashSync(password, 10);

        console.log('1. 새로운 해시 생성 완료:', hash);

        // 1. 관리자 권한 확인 및 생성
        await db.query(`INSERT IGNORE INTO roles (name, description, is_system) VALUES ('Administrator', 'System Administrator', TRUE)`);
        const [roles] = await db.query("SELECT id FROM roles WHERE name = 'Administrator'");
        const adminRoleId = roles[0].id;

        // 2. 관리자 계정 업데이트 (또는 생성)
        const [users] = await db.query("SELECT * FROM users WHERE username = 'admin'");

        if (users.length === 0) {
            await db.query(
                "INSERT INTO users (username, password_hash, role, full_name, role_id) VALUES (?, ?, ?, ?, ?)",
                ['admin', hash, 'admin', '관리자', adminRoleId]
            );
            console.log('2. 관리자 계정이 새로 생성되었습니다. (PW: admin1234)');
        } else {
            // [Fix] 기존 계정이 있더라도 비밀번호를 admin1234로 강제 초기화 (신규 PC 설치 및 복구 대응)
            await db.query(
                "UPDATE users SET password_hash = ?, role_id = ?, is_active = 1 WHERE username = 'admin'",
                [hash, adminRoleId]
            );
            console.log('2. 기존 관리자 계정의 비밀번호와 권한을 초기화했습니다. (PW: admin1234)');
        }

        console.log('3. 복구 작업이 성공적으로 완료되었습니다.');

    } catch (err) {
        console.error('⚠️ 오류 발생:', err.message);
    } finally {
        process.exit();
    }
}

fixAdmin();
