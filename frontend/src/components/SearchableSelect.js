import React, { forwardRef } from 'react';
import Select from 'react-select';

// 공통 스타일 (기본 select와 동일한 높이)
const customStyles = {
  container: (base) => ({
    ...base,
    flex: 1
  }),
  control: (base, state) => ({
    ...base,
    minHeight: '40px',
    height: '40px',
    backgroundColor: state.isDisabled ? '#f1f5f9' : '#fff', // Disabled Background
    borderColor: state.isFocused ? '#4a90d9' : '#ddd',
    borderRadius: '4px',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(74, 144, 217, 0.2)' : 'none',
    '&:hover': {
      borderColor: '#4a90d9'
    },
    opacity: state.isDisabled ? 0.7 : 1 // Optional: reduce opacity
  }),
  valueContainer: (base) => ({
    ...base,
    padding: '0 10px',
    height: '38px',
    display: 'flex',
    alignItems: 'center'
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
    '& input': {
      outline: 'none !important',
      boxShadow: 'none !important'
    }
  }),
  placeholder: (base, state) => ({
    ...base,
    color: '#9ca3af',
    display: state.isFocused ? 'none' : 'block'
  }),
  singleValue: (base) => ({
    ...base,
    color: '#374151'
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? '#4a90d9'
      : state.isFocused
        ? '#e8f4fd'
        : 'white',
    color: state.isSelected ? 'white' : '#333',
    padding: '8px 12px',
    cursor: 'pointer',
    '&:active': {
      backgroundColor: '#4a90d9'
    }
  }),
  menu: (base) => ({
    ...base,
    zIndex: 100,
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: '200px',
    padding: '4px'
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 100005
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: '4px 6px'
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: '4px 6px'
  }),
  indicatorSeparator: () => ({
    display: 'none'
  })
};

// 작은 사이즈 스타일 (테이블 내부용) - 동일한 높이 유지
const smallStyles = {
  ...customStyles,
  container: (base) => ({
    ...base,
    flex: 1
  }),
  control: (base, state) => ({
    ...customStyles.control(base, state),
    minHeight: '30px',
    height: '30px'
  }),
  valueContainer: (base) => ({
    ...base,
    padding: '0 8px',
    height: '28px',
    display: 'flex',
    alignItems: 'center'
  }),
  option: (base, state) => ({
    ...customStyles.option(base, state),
    padding: '6px 10px',
    fontSize: '0.9rem'
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: '2px 4px'
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: '2px 4px'
  })
};

/**
 * 멀티 키워드 검색 필터
 * 공백으로 구분된 모든 키워드가 label 또는 subLabel에 포함되어 있는지 확인
 */
const multiKeywordFilter = (option, inputValue) => {
  if (!inputValue) return true;

  const label = (option.label || '').toLowerCase();
  const subLabel = (option.subLabel || option.data?.subLabel || '').toLowerCase();
  const code = (option.data?.code || '').toLowerCase();

  const searchString = `${label} ${subLabel} ${code}`;
  const keywords = inputValue.toLowerCase().trim().split(/\s+/);

  // 모든 키워드가 검색 스트링에 포함되어 있어야 함
  return keywords.every(keyword => searchString.includes(keyword));
};

/**
 * 기본 옵션 라벨 렌더러
 * subLabel이 있는 경우 작게 표시해줌
 */
const defaultFormatOptionLabel = (option) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
      <span style={{ fontWeight: '500' }}>{option.label}</span>
      {option.subLabel && (
        <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '10px', backgroundColor: '#f3f4f6', padding: '1px 5px', borderRadius: '3px' }}>
          {option.subLabel}
        </span>
      )}
    </div>
  );
};

/**
 * 검색 가능한 Select 컴포넌트
 * @param {Object} props
 * @param {Array} props.options - [{value, label}] 형태의 옵션 배열
 * @param {any} props.value - 선택된 값
 * @param {Function} props.onChange - 변경 핸들러 (선택된 option 객체 또는 null)
 * @param {string} props.placeholder - 플레이스홀더 텍스트
 * @param {boolean} props.isClearable - 지우기 버튼 표시 여부
 * @param {boolean} props.isDisabled - 비활성화 여부
 * @param {string} props.size - 'small' | 'normal'
 * @param {string} props.noOptionsMessage - 옵션 없음 메시지
 */
const SearchableSelect = forwardRef(({
  options = [],
  value,
  onChange,
  placeholder = '선택...',
  isClearable = true,
  isDisabled = false,
  size = 'normal',
  noOptionsMessage = '검색 결과 없음',

  ...rest
}, ref) => {
  // value를 option 객체로 변환
  const selectedOption = options.find(opt => opt.value === value) || null;

  // onChange 핸들러 래핑
  const handleChange = (option) => {
    onChange(option);
  };

  // 스타일 계산
  const computedStyles = React.useMemo(() => {
    return size === 'small' ? smallStyles : customStyles;
  }, [size]);

  return (
    <Select
      ref={ref}
      options={options}
      value={selectedOption}
      onChange={handleChange}
      placeholder={placeholder}
      isClearable={isClearable}
      isDisabled={isDisabled}
      isSearchable
      filterOption={multiKeywordFilter}
      formatOptionLabel={rest.formatOptionLabel || defaultFormatOptionLabel}
      noOptionsMessage={() => noOptionsMessage}
      styles={computedStyles}
      menuPortalTarget={document.body} // Portal for escaping modals
      {...rest}
    />
  );
});

SearchableSelect.displayName = 'SearchableSelect';

export default SearchableSelect;






