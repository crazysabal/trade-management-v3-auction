# 🚀 홍다 Biz (Hongda Biz) - 통합 거래 관리 시스템

홍다 Biz는 매입/매출 거래명세서 관리, 재고 추적, 그리고 경매 데이터 자동 수집을 통합한 비즈니스 솔루션입니다.

---

## � 시스템 권장 사양

- **운영체제**: Windows 10/11 (64비트)
- **CPU**: i3급 이상 (i5급 이상 권장)
- **메모리(RAM)**: 4GB 이상 (**8GB 이상 강력 권장**)
- **저장장치**: SSD (여유 공간 2GB 이상)

---

## �📋 0. 필수 설치 프로그램 (먼저 설치해 주세요)

시스템 가동을 위해 아래 두 프로그램은 **반드시** 설치되어 있어야 합니다.

1.  **Node.js (v20 이상 LTS)**: [공식 홈페이지](https://nodejs.org/)에서 다운로드 후 설치
2.  **MySQL Server (8.0 또는 8.4 LTS)**: [다운로드](https://dev.mysql.com/downloads/mysql/) 및 설치 (비밀번호를 꼭 기억하세요)

---

## ⚡ 1. 퀵 스타트 (원스톱 설치)

1.  본 저장소를 다운로드하거나 복사합니다.
2.  루트 폴더의 **`Initial_Setup.bat`**를 실행합니다.
3.  안내에 따라 MySQL 비밀번호를 입력하면 모든 설정이 자동으로 완료됩니다.
4.  설치 완료 후 바탕화면의 **'홍다 비즈 (Hongda Biz)'** 아이콘을 실행하세요.

---

## 🔑 2. 기기 등록 및 라이선스

본 프로그램은 기기 인증이 필요합니다. 런처 실행 후 하단에 표시되는 **기기 ID**를 관리자(사장님)에게 전달하여 등록을 요청하세요. 승인 후에는 모든 기능을 자유롭게 사용하실 수 있습니다.

---

## 🚀 3. 주요 기능

- **통합 전표 관리**: 매입/매출 전표 작성 및 거래명세서 출력
- **스마트 재고 관리**: Lot 단위 재고 추적 및 창고 간 이동 관리
- **경매 데이터 크롤링**: 외부 경매 사이트의 낙찰 데이터를 자동으로 수집 및 연동
- **온라인 자동 업데이트**: 클릭 한 번으로 최신 패치 적용 및 DB 마이그레이션
- **하드웨어 기반 보안**: 기기 인증을 통한 안전한 데이터 보호

---

## 🛠 4. 기술 스택

- **Backend**: Node.js, Express, MySQL, Puppeteer (Crawl)
- **Frontend**: React, Material UI, CSS3
- **Launcher**: Electron (Node.js API integration)
- **Deployment**: Windows Batch, PowerShell Automation

---

## 📚 5. 상세 안내 문서

더 자세한 설치 및 운영 방법은 아래 링크를 참조하세요.

- [통합 설치 가이드 (HTML)](./Installation_Guide.html)
- [상세 운영 가이드 (Markdown)](./Installation_Guide.md)

---

© 2026 Hongda Biz. All rights reserved.
