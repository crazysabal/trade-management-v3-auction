import React, { useState, useMemo } from 'react';

/**
 * 다중 필터링 테이블 래퍼 컴포넌트
 * 
 * @param {Object} props
 * @param {Array} props.data - 테이블 데이터 배열
 * @param {Array} props.searchableFields - 검색 대상 필드명 배열
 * @param {string} props.placeholder - 검색창 플레이스홀더
 * @param {Function} props.children - 필터링된 데이터를 받아 테이블을 렌더링하는 함수
 * @param {Object} props.style - 컨테이너 스타일
 */
function FilterableTable({
    data = [],
    searchableFields = [],
    placeholder = '검색...',
    children,
    style = {}
}) {
    const [searchTerm, setSearchTerm] = useState('');

    // 다중 키워드 필터링 로직
    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return data;

        const keywords = searchTerm.toLowerCase().trim().split(/\s+/);

        return data.filter(item => {
            // 검색 대상 필드들의 값을 하나의 문자열로 합침
            const searchString = searchableFields
                .map(field => {
                    const value = item[field];
                    if (value === null || value === undefined) return '';
                    return String(value).toLowerCase();
                })
                .join(' ');

            // 모든 키워드가 검색 문자열에 포함되어야 함
            return keywords.every(keyword => searchString.includes(keyword));
        });
    }, [data, searchTerm, searchableFields]);

    const handleClear = () => {
        setSearchTerm('');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
            {/* 검색 입력 영역 */}
            <div style={{
                padding: '0.5rem',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                <div style={{
                    position: 'relative',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    <span style={{
                        position: 'absolute',
                        left: '0.75rem',
                        color: '#9ca3af',
                        pointerEvents: 'none',
                        fontSize: '0.9rem'
                    }}>
                        🔍
                    </span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={placeholder}
                        style={{
                            width: '100%',
                            padding: '0.4rem 2rem 0.4rem 2rem',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            outline: 'none',
                            transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#4a90d9'}
                        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                    {searchTerm && (
                        <button
                            onClick={handleClear}
                            style={{
                                position: 'absolute',
                                right: '0.5rem',
                                background: 'none',
                                border: 'none',
                                color: '#9ca3af',
                                cursor: 'pointer',
                                padding: '0.2rem',
                                fontSize: '0.9rem',
                                lineHeight: 1
                            }}
                            title="검색어 지우기"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* 필터 결과 카운트 */}
                <div style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    whiteSpace: 'nowrap'
                }}>
                    {searchTerm.trim() ? (
                        <span>
                            <strong style={{ color: '#3b82f6' }}>{filteredData.length}</strong>
                            {' / '}
                            <span>{data.length}</span>
                        </span>
                    ) : (
                        <span>전체 {data.length}</span>
                    )}
                </div>
            </div>

            {/* 테이블 영역 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                {typeof children === 'function' ? children(filteredData) : children}
            </div>
        </div>
    );
}

export default FilterableTable;
