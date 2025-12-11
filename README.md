# 매입/매출 거래명세서 관리 시스템

웹 기반 매입/매출 거래명세서 관리 프로그램입니다.

## 기술 스택

### 백엔드
- Node.js + Express
- MySQL

### 프론트엔드
- React
- React Router
- Axios

## 설치 및 실행 방법

### 1. 사전 준비

다음 프로그램들이 설치되어 있어야 합니다:
- Node.js (v14 이상) - https://nodejs.org/
- MySQL (이미 설치되어 있음)

### 2. 데이터베이스 설정

MySQL에 접속하여 데이터베이스를 생성하고 스키마를 import합니다.

```bash
# MySQL 접속
mysql -u root -p

# 또는 MySQL Workbench를 사용하여 database_schema.sql 파일을 실행
```

루트 디렉토리의 `database_schema.sql` 파일을 실행하세요.

### 3. 백엔드 설치 및 실행

```bash
# backend 폴더로 이동
cd backend

# 패키지 설치
npm install

# 환경변수 파일 생성
# .env.example 파일을 .env로 복사하고 MySQL 정보 입력
cp .env.example .env

# .env 파일 수정 (메모장 또는 편집기로 열어서 수정)
# DB_PASSWORD=your_mysql_password
# 다른 설정은 기본값 사용 가능

# 서버 실행
npm start
```

서버가 http://localhost:5000 에서 실행됩니다.

### 4. 프론트엔드 설치 및 실행

새 터미널(또는 명령 프롬프트)을 열어서:

```bash
# frontend 폴더로 이동
cd frontend

# 패키지 설치 (시간이 좀 걸립니다)
npm install

# 개발 서버 실행
npm start
```

브라우저가 자동으로 열리며 http://localhost:3000 에서 실행됩니다.

### 5. 로컬 네트워크에서 접속하기 (선택사항)

같은 네트워크의 다른 컴퓨터나 모바일에서 접속하려면:

1. 현재 컴퓨터의 IP 주소 확인:
   - Windows: `ipconfig` 명령어 실행
   - IPv4 주소 확인 (예: 192.168.0.10)

2. 프론트엔드 설정 수정:
   - `frontend/src/services/api.js` 파일을 열어서
   - `API_BASE_URL`을 `http://[컴퓨터IP]:5000/api`로 변경
   
3. 다른 기기에서 `http://[컴퓨터IP]:3000` 으로 접속

## 주요 기능

### 1. 거래처 관리
- 거래처 등록/수정/삭제
- 거래처 검색 및 필터링
- 매입처/매출처 구분 관리

### 2. 품목 관리
- 품목 등록/수정/삭제
- 품목별 단가 관리 (기준/매입/매출)
- 품목 검색 및 분류

### 3. 거래 전표 관리
- 매입/매출 전표 등록
- 전표 수정 및 삭제
- 거래명세서 출력
- 전표 상태 관리 (임시저장/확정/완료/취소)

### 4. 통계
- 거래처별 집계
- 기간별 매입/매출 통계
- 거래처별 비중 분석

### 5. 대시보드
- 오늘/이번 달 매입/매출 요약
- 최근 거래 내역
- 거래처/품목 수 현황

## 기본 계정

- ID: admin
- Password: admin123

## 폴더 구조

```
project/
├── database_schema.sql      # 데이터베이스 스키마
├── backend/                 # 백엔드 (API 서버)
│   ├── config/
│   │   └── database.js     # DB 연결 설정
│   ├── routes/
│   │   ├── companies.js    # 거래처 API
│   │   ├── products.js     # 품목 API
│   │   └── trades.js       # 거래전표 API
│   ├── server.js           # 메인 서버 파일
│   ├── package.json
│   └── .env                # 환경변수 (직접 생성)
│
└── frontend/               # 프론트엔드 (웹 UI)
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── pages/          # 페이지 컴포넌트들
    │   ├── services/       # API 통신
    │   ├── App.js          # 메인 앱
    │   ├── App.css         # 스타일
    │   └── index.js        # 진입점
    └── package.json
```

## 프로덕션 배포

### 백엔드
```bash
cd backend
npm start
```

### 프론트엔드
```bash
cd frontend
npm run build
```

빌드된 파일은 `frontend/build` 폴더에 생성됩니다.
이 폴더를 웹 서버(Apache, Nginx 등)에 배포하면 됩니다.

## 문제 해결

### 포트 충돌
- 백엔드: `.env` 파일에서 PORT 변경
- 프론트엔드: `package.json`의 start 스크립트 수정

### 데이터베이스 연결 오류
- MySQL이 실행 중인지 확인
- `.env` 파일의 DB 정보가 정확한지 확인

### CORS 오류
- 백엔드의 `server.js`에 cors 설정이 포함되어 있음
- 다른 도메인에서 접속 시 허용 도메인 추가 필요

## 향후 개선 사항

- [ ] 사용자 로그인/권한 관리
- [ ] 엑셀 내보내기
- [ ] PDF 생성
- [ ] 대시보드 차트 추가
- [ ] 모바일 반응형 개선

## 라이선스

MIT License

## 문의

문제가 발생하거나 개선 사항이 있으면 이슈를 등록해주세요.
