/**
 * 공통 포맷팅 유틸리티 함수들
 * 여러 컴포넌트에서 공통으로 사용하는 숫자/통화/날짜 포맷팅 함수
 */

/**
 * 로컬 시간대 기준 YYYY-MM-DD 형식 반환
 * @param {Date|null} date - 날짜 객체 (null이면 현재 날짜)
 * @returns {string} YYYY-MM-DD 형식 문자열
 */
export const formatLocalDate = (date) => {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * 숫자 포맷팅 (콤마, 소수점 2자리까지)
 * @param {number|string|null} value - 포맷할 숫자
 * @returns {string} 콤마가 포함된 문자열
 */
export const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '';
    return new Intl.NumberFormat('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(value || 0);
};

/**
 * 통화 포맷팅 (원화, 소수점 버림)
 * @param {number|string|null} value - 포맷할 금액
 * @returns {string} 콤마가 포함된 원화 문자열 (소수점 없음)
 */
export const formatCurrency = (value) => {
    // 숫자가 아니면 그대로 반환 (마이너스 부호 입력 등 대응)
    if (value === '-') return value;
    if (value === null || value === undefined || value === '' || isNaN(value)) return '';
    return new Intl.NumberFormat('ko-KR').format(value || 0);
};

/**
 * 날짜 문자열 포맷팅 (YYYY-MM-DD)
 * @param {string} dateString - ISO 날짜 문자열
 * @returns {string} YYYY-MM-DD 형식
 */
export const formatDate = (dateString) => {
    if (!dateString) return '-';
    return dateString.split('T')[0];
};

/**
 * 날짜 문자열 짧은 포맷팅 (MM-DD)
 * @param {string} dateString - ISO 날짜 문자열
 * @returns {string} MM-DD 형식
 */
export const formatDateShort = (dateString) => {
    if (!dateString) return '-';
    const date = dateString.split('T')[0];
    const parts = date.split('-');
    return `${parts[1]}-${parts[2]}`;
};

/**
 * 폰트 스케일에 따른 크기 계산 헬퍼
 * @param {number} size - 기본 크기 배수
 * @returns {string} rem 단위 크기 문자열
 */
export const fs = (size) => `${(size * 0.85).toFixed(2)}rem`;
