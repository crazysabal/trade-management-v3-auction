const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// MySQL 연결 풀 생성
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'trade_management',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // DATE/DATETIME 타입을 문자열로 반환 (UTC 변환 문제 해결)
  dateStrings: true,
  // 타임존 설정
  timezone: '+09:00',
  // BigInt 안전 처리
  supportBigNumbers: true,
  bigNumberStrings: true
});

// Promise 기반 풀 생성
const promisePool = pool.promise();

// 연결 테스트
pool.getConnection((err, connection) => {
  if (err) {
    console.error('데이터베이스 연결 실패:', err.message);
    return;
  }
  console.log('MySQL Database Connected Successfully');
  connection.release();
});

module.exports = promisePool;
