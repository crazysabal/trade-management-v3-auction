# React 성능 표준 가이드 v1.0 (Vite/MDI 최적화)
> 원본: Vercel React Best Practices (2026.01)  
> 적용 대상: hongda-biz 프로젝트 (Vite + React 18 + MDI)

---

## 1. API 병렬 호출 (Eliminating Waterfalls)

**영향도: CRITICAL (2~10배 성능 향상)**

### ❌ 잘못된 예시: 순차 호출 (3번의 왕복)
```javascript
const user = await fetchUser();
const posts = await fetchPosts();
const comments = await fetchComments();
```

### ✅ 올바른 예시: 병렬 호출 (1번의 왕복)
```javascript
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
]);
```

### 적용 시나리오
- 페이지 초기화 시 여러 마스터 데이터(품목, 창고, 거래처) 로딩
- 모달 열 때 관련 정보 동시 조회

---

## 2. Barrel File Import 금지 (Bundle Optimization)

**영향도: CRITICAL (Dev 서버 200ms~800ms 절감)**

### ❌ 잘못된 예시: 라이브러리 전체 로드
```javascript
import { format, parseISO, addDays } from 'date-fns';
// date-fns 전체 모듈이 로드됨
```

### ✅ 올바른 예시: 개별 함수 직접 import
```javascript
import format from 'date-fns/format';
import parseISO from 'date-fns/parseISO';
import addDays from 'date-fns/addDays';
```

### 주의 대상 라이브러리
- `date-fns` - 개별 함수 import 권장
- `lodash` - `lodash/debounce` 형식으로 import
- 아이콘 라이브러리 - 개별 아이콘 파일 import

---

## 3. 컴포넌트 지연 로딩 (Lazy Loading)

**영향도: HIGH (초기 번들 크기 감소)**

### ✅ React.lazy + Suspense 패턴
```javascript
import React, { Suspense, lazy } from 'react';

// 무거운 컴포넌트는 lazy로 로딩
const HeavyChart = lazy(() => import('./HeavyChart'));
const MonacoEditor = lazy(() => import('./MonacoEditor'));

function App() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <HeavyChart />
    </Suspense>
  );
}
```

### 적용 대상
- 차트 컴포넌트 (`ag-grid` 등)
- PDF 미리보기
- 사용 빈도 낮은 설정 화면

---

## 4. 리렌더링 최적화 (Re-render Prevention)

**영향도: MEDIUM (MDI 환경에서 특히 중요)**

### 4.1 React.memo로 불필요한 렌더링 방지
```javascript
const ListItem = React.memo(function ListItem({ item, onSelect }) {
  return <div onClick={() => onSelect(item.id)}>{item.name}</div>;
});
```

### 4.2 useCallback으로 함수 참조 안정화
```javascript
// ❌ 매 렌더마다 새 함수 생성
<Button onClick={() => handleClick(id)} />

// ✅ 함수 참조 유지
const handleClick = useCallback((id) => {
  // 처리 로직
}, []);
<Button onClick={handleClick} />
```

### 4.3 useMemo로 계산 결과 캐싱
```javascript
const filteredItems = useMemo(() => {
  return items.filter(item => item.active);
}, [items]);
```

---

## 5. 클라이언트 데이터 캐싱 (MDI 필수)

**영향도: MEDIUM-HIGH (창 전환 시 재요청 방지)**

### 권장 패턴: Custom Hook + 캐시
```javascript
// hooks/useCompanyList.js
const cache = new Map();

export function useCompanyList() {
  const [companies, setCompanies] = useState(() => cache.get('companies') || []);
  
  useEffect(() => {
    if (!cache.has('companies')) {
      fetchCompanies().then(data => {
        cache.set('companies', data);
        setCompanies(data);
      });
    }
  }, []);
  
  return companies;
}
```

### 고급 옵션: SWR 또는 TanStack Query 도입 고려
- 자동 중복 요청 제거
- 포커스 시 자동 갱신
- 에러 재시도

---

## 빠른 참조표

| 영역 | 핵심 규칙 | 우선순위 |
|------|----------|:--------:|
| API 호출 | `Promise.all()` 사용 | 🔴 필수 |
| Import | Barrel file 금지, 직접 import | 🔴 필수 |
| 컴포넌트 | `React.memo` 적극 활용 | 🟡 권장 |
| 함수 | `useCallback` 으로 참조 안정화 | 🟡 권장 |
| 데이터 | 마스터 데이터 캐싱 | 🟡 권장 |
| 무거운 UI | `React.lazy` + `Suspense` | 🟢 선택 |

---

*최종 업데이트: 2026-02-01*
