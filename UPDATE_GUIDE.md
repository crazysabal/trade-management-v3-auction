# 재고 관리 기능 추가 업데이트 가이드

## 🎉 새로 추가된 기능

### 1. 재고 관리 시스템
- **자동 재고 관리**: 매입 시 자동 재고 증가, 매출 시 자동 재고 감소
- **재고 현황**: 품목별 현재 재고 수량 및 중량 조회
- **재고 수불부**: 입출고 내역 상세 조회
- **재고 조정**: 분실, 폐기 등 수동 재고 조정 기능
- **재고 통계**: 대시보드에서 재고 요약 정보 확인

### 2. 과일 경매 특화 기능
- **품목 관리 개선**:
  - 과일 종류 (사과, 배, 포도 등)
  - 등급 (특, 상, 중, 하)
  - 산지 (충주, 나주, 제주 등)
  - Box 단위 + kg 중량 관리

- **거래 전표 개선**:
  - 경매가(낙찰가) 기록
  - 동일 품목도 거래마다 다른 가격 입력 가능

## 📦 설치 방법

### 기존 시스템을 이미 사용 중인 경우

#### 방법 1: 새로 설치 (권장)
기존 데이터를 보존하고 싶다면 먼저 백업 후 진행하세요.

```bash
# 1. MySQL에서 새 스키마 적용
mysql -u root -p < database_schema_v2.sql

# 2. 백엔드 업데이트
cd backend
npm install  # 새 패키지가 있을 수 있음
npm start

# 3. 프론트엔드 업데이트
cd frontend
npm install  # 새 패키지가 있을 수 있음
npm start
```

#### 방법 2: 기존 데이터베이스에 추가 (고급)
기존 데이터를 유지하면서 업데이트하려면:

```sql
-- MySQL에 접속하여 실행
USE trade_management;

-- 1. products 테이블에 새 컬럼 추가
ALTER TABLE products ADD COLUMN fruit_type VARCHAR(50) AFTER product_name;
ALTER TABLE products ADD COLUMN grade VARCHAR(20) AFTER fruit_type;
ALTER TABLE products ADD COLUMN origin VARCHAR(50) AFTER grade;
ALTER TABLE products ADD COLUMN box_weight DECIMAL(10,2) AFTER unit;

-- 2. trade_details 테이블에 새 컬럼 추가
ALTER TABLE trade_details ADD COLUMN total_weight DECIMAL(15,2) AFTER quantity;
ALTER TABLE trade_details ADD COLUMN auction_price DECIMAL(15,2) AFTER total_amount;

-- 3. 재고 테이블 생성
-- database_schema_v2.sql 파일에서 inventory, inventory_transactions 테이블 생성 부분만 복사해서 실행

-- 4. 트리거 생성
-- database_schema_v2.sql 파일에서 트리거 부분만 복사해서 실행
```

### 새로 설치하는 경우
```bash
# database_schema_v2.sql 파일을 사용하세요
mysql -u root -p < database_schema_v2.sql

cd backend
npm install
# .env 파일 설정
npm start

cd frontend
npm install
npm start
```

## 🆕 새로운 메뉴

### 재고 관리
- **재고 현황**: 품목별 현재 재고 확인
- **재고 수불부**: 입출고 내역 조회
- **재고 조정**: 수동 재고 조정

## 📋 주요 변경사항

### 데이터베이스
1. **products 테이블**: fruit_type, grade, origin, box_weight 컬럼 추가
2. **trade_details 테이블**: total_weight, auction_price 컬럼 추가
3. **inventory 테이블**: 재고 현황 (신규)
4. **inventory_transactions 테이블**: 재고 수불부 (신규)
5. **트리거**: 거래 발생 시 자동 재고 업데이트

### 백엔드 API
- `/api/inventory` - 재고 현황 조회
- `/api/inventory/transactions` - 재고 수불부 조회
- `/api/inventory/adjust` - 재고 조정
- `/api/inventory/stats` - 재고 통계

### 프론트엔드
- `InventoryList.js` - 재고 현황 페이지
- `InventoryTransactions.js` - 재고 수불부 페이지
- `InventoryAdjust.js` - 재고 조정 페이지
- ProductForm, ProductList 개선 (과일 경매 특화)

## 💡 사용 팁

### 1. 재고는 자동으로 관리됩니다
- 매입 전표 등록 → 자동으로 재고 증가
- 매출 전표 등록 → 자동으로 재고 감소
- 재고 조정은 분실, 폐기 등 특수한 경우에만 사용하세요

### 2. 품목 등록 시
- 과일 종류, 등급, 산지를 정확히 입력하세요
- Box당 중량을 입력하면 자동으로 총 중량이 계산됩니다

### 3. 거래 전표 등록 시
- 품목 선택 시 자동으로 참고 단가가 입력됩니다
- 경매가(낙찰가)는 수량과 단가로 자동 계산됩니다
- 동일 품목도 거래마다 다른 가격을 입력할 수 있습니다

### 4. 재고 알림
- 재고가 10 Box 미만이면 "재고 부족"으로 표시됩니다
- 재고 현황 페이지에서 "재고 부족만 보기"로 필터링 가능

## 🔧 문제 해결

### 재고가 맞지 않는 경우
1. 재고 수불부에서 내역 확인
2. 필요 시 재고 조정으로 정정
3. 조정 사유를 반드시 입력하세요

### 트리거가 작동하지 않는 경우
```sql
-- MySQL에서 트리거 확인
SHOW TRIGGERS FROM trade_management;

-- 트리거가 없으면 database_schema_v2.sql에서 트리거 부분만 다시 실행
```

## 📊 샘플 데이터
database_schema_v2.sql에는 다음 샘플 데이터가 포함되어 있습니다:
- 생산자/도매상 거래처 6개
- 과일 품목 8개 (사과, 배, 포도, 샤인머스캣, 감귤)
- 재고 초기값 0

## 🎯 다음 업데이트 예정
- [ ] 유통기한 관리
- [ ] 선입선출(FIFO) 관리
- [ ] 바코드 스캔 기능
- [ ] 재고 알림 설정
- [ ] 엑셀 일괄 등록

## 문의
문제가 발생하거나 개선 사항이 있으면 알려주세요!
