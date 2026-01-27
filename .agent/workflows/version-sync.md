---
description: 시스템 버전 동기화 및 0.0.1 상향 조정 (Standard 14.8/14.8.1)
---

이 워크플로우는 `version.json`, `frontend/package.json`, `backend/package.json`의 버전을 상호 대조하고, 미세 업데이트 시 버전을 일괄적으로 0.0.1 올리는 자동화 절차를 정의합니다.

// turbo
1. 현재 버전 확인
   - `c:\Project\hongda-biz\version.json`
   - `c:\Project\hongda-biz\frontend\package.json`
   - `c:\Project\hongda-biz\backend\package.json`
   위 세 파일의 `version` 필드를 읽어 현재 기준 버전을 확인합니다.

2. 버전 상향 조정 로직 실행
   - 확인된 버전 중 가장 높은 숫자를 기준으로 `0.0.1`을 올립니다. (예: `1.0.6` -> `1.0.7`)
   - 세 파일 모두에 동일한 새 버전을 적용합니다.

3. 변경 사항 저장
   - 각 파일의 내용을 새 버전으로 업데이트하여 저장합니다.

4. 요약 보고
   - 변경 전 버전과 변경 후 버전을 사용자에게 보고합니다.
