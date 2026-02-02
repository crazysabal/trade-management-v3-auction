/**
 * voiceParser.js
 * 
 * 음성 인식 텍스트를 구조화된 품목 데이터로 파싱합니다.
 * 
 * 지원 패턴 예시:
 * - "사과 750그램 특등급 5000원"
 * - "배 1킬로 상등급 3000원 2개"
 * - "수박 5kg 중등급 만원"
 * - "포도 500g 1등급 오천원 3박스"
 * 
 * @created 2026-02-02
 */

/**
 * 한글 숫자를 아라비아 숫자로 변환
 */
const koreanNumberMap = {
    '영': 0, '일': 1, '이': 2, '삼': 3, '사': 4,
    '오': 5, '육': 6, '칠': 7, '팔': 8, '구': 9,
    '십': 10, '백': 100, '천': 1000, '만': 10000,
    '억': 100000000
};

const koreanUnitWords = {
    '만': 10000,
    '천': 1000,
    '백': 100
};

/**
 * 한글 금액 표현을 숫자로 변환
 * 예: "오천원" -> 5000, "만원" -> 10000, "이만오천원" -> 25000
 */
function parseKoreanNumber(text) {
    if (!text) return null;

    // 이미 숫자인 경우
    const directNumber = parseInt(text.replace(/,/g, ''), 10);
    if (!isNaN(directNumber)) return directNumber;

    let result = 0;
    let currentNumber = 0;
    let tempNumber = 0;

    // 숫자+단위 패턴 (예: 5천, 3만)
    const mixedPattern = /(\d+)(만|천|백)/g;
    let match;
    let processed = text;

    while ((match = mixedPattern.exec(text)) !== null) {
        const num = parseInt(match[1], 10);
        const unit = koreanUnitWords[match[2]];
        result += num * unit;
        processed = processed.replace(match[0], '');
    }

    // 순수 한글 숫자 처리
    for (const char of processed) {
        if (koreanNumberMap[char] !== undefined) {
            const value = koreanNumberMap[char];
            if (value >= 10) {
                if (tempNumber === 0) tempNumber = 1;
                if (value >= 10000) {
                    currentNumber += tempNumber * value;
                    tempNumber = 0;
                } else {
                    tempNumber *= value;
                }
            } else {
                tempNumber += value;
            }
        }
    }

    result += currentNumber + tempNumber;
    return result > 0 ? result : null;
}

/**
 * 중량 및 단위 추출
 * 패턴: 숫자 + (그램|킬로|킬로그램|g|kg|근)
 */
function extractWeight(text) {
    // 다양한 중량 패턴
    const patterns = [
        /(\d+(?:\.\d+)?)\s*(킬로그램|킬로|kg)/i,
        /(\d+(?:\.\d+)?)\s*(그램|g)/i,
        /(\d+(?:\.\d+)?)\s*(근)/,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            let weight = parseFloat(match[1]);
            let unit = match[2].toLowerCase();

            // 단위 정규화
            if (unit === '킬로그램' || unit === '킬로' || unit === 'kg') {
                unit = 'kg';
            } else if (unit === '그램' || unit === 'g') {
                unit = 'g';
            } else if (unit === '근') {
                // 1근 = 600g
                weight = weight * 600;
                unit = 'g';
            }

            return { weight, unit, matched: match[0] };
        }
    }

    return null;
}

/**
 * 등급 추출
 */
function extractGrade(text) {
    const gradePatterns = [
        // 명시적 등급
        /특등급|특등|특상/,
        /상등급|상등|1등급|일등급/,
        /중등급|중등|2등급|이등급/,
        /하등급|하등|3등급|삼등급/,
        // 일반적 등급 표현
        /[가-힣]*등급/,
        /上|中|下/
    ];

    const gradeMap = {
        '특등급': '특등급', '특등': '특등급', '특상': '특등급',
        '상등급': '상등급', '상등': '상등급', '1등급': '상등급', '일등급': '상등급',
        '중등급': '중등급', '중등': '중등급', '2등급': '중등급', '이등급': '중등급',
        '하등급': '하등급', '하등': '하등급', '3등급': '하등급', '삼등급': '하등급',
        '上': '상등급', '中': '중등급', '下': '하등급'
    };

    for (const pattern of gradePatterns) {
        const match = text.match(pattern);
        if (match) {
            const normalized = gradeMap[match[0]] || match[0];
            return { grade: normalized, matched: match[0] };
        }
    }

    return null;
}

/**
 * 단가 추출
 * 패턴: 숫자 + 원, 또는 한글 금액 (오천원, 만원 등)
 */
function extractPrice(text) {
    // 숫자 + 원 패턴
    const numericPattern = /(\d{1,3}(?:,?\d{3})*)\s*원/;
    const numericMatch = text.match(numericPattern);
    if (numericMatch) {
        const price = parseInt(numericMatch[1].replace(/,/g, ''), 10);
        return { price, matched: numericMatch[0] };
    }

    // 한글 금액 패턴 (만원, 오천원 등)
    const koreanPattern = /([일이삼사오육칠팔구십백천만\d]+)\s*원/;
    const koreanMatch = text.match(koreanPattern);
    if (koreanMatch) {
        const price = parseKoreanNumber(koreanMatch[1]);
        if (price) {
            return { price, matched: koreanMatch[0] };
        }
    }

    return null;
}

/**
 * 수량 추출
 * 패턴: 숫자 + (개|박스|상자|케이스|팩|봉지)
 */
function extractQuantity(text) {
    const pattern = /(\d+)\s*(개|박스|상자|케이스|팩|봉지|포기|송이|단|묶음)/;
    const match = text.match(pattern);
    if (match) {
        return { quantity: parseInt(match[1], 10), quantityUnit: match[2], matched: match[0] };
    }
    return null;
}

/**
 * 품목명 추출 (다른 정보를 제거한 나머지)
 */
function extractProductName(text, matchedParts) {
    let remaining = text;

    // 매칭된 부분들 제거
    for (const part of matchedParts) {
        if (part) {
            remaining = remaining.replace(part, ' ');
        }
    }

    // 정리
    remaining = remaining
        .replace(/\s+/g, ' ')  // 연속 공백 제거
        .replace(/[,\.]/g, '') // 구두점 제거
        .trim();

    return remaining || null;
}

/**
 * 음성 텍스트를 품목 데이터로 파싱
 * 
 * @param {string} text - 음성 인식 텍스트
 * @param {Array} productList - 등록된 품목 목록 (매칭용)
 * @returns {Object} 파싱된 품목 데이터
 */
export function parseVoiceInput(text, productList = []) {
    if (!text || typeof text !== 'string') {
        return { success: false, error: '입력 텍스트가 없습니다.' };
    }

    const normalized = text.trim().toLowerCase();
    const matchedParts = [];

    // 각 요소 추출
    const weightResult = extractWeight(normalized);
    if (weightResult) matchedParts.push(weightResult.matched);

    const gradeResult = extractGrade(text); // 등급은 원본 텍스트에서 추출
    if (gradeResult) matchedParts.push(gradeResult.matched);

    const priceResult = extractPrice(text);
    if (priceResult) matchedParts.push(priceResult.matched);

    const quantityResult = extractQuantity(normalized);
    if (quantityResult) matchedParts.push(quantityResult.matched);

    // 품목명 추출 (나머지 텍스트)
    const productName = extractProductName(text, matchedParts);

    // 품목 마스터 매칭 (fuzzy search)
    // API 응답이 product_name 필드를 사용함
    let matchedProduct = null;
    if (productName && productList.length > 0) {
        // 유효한 품목만 필터링 (product_name이 있는 품목)
        const validProducts = productList.filter(p => p && (p.product_name || p.name));

        // 정확히 일치하는 품목 찾기
        matchedProduct = validProducts.find(p => {
            const pName = (p.product_name || p.name || '').toLowerCase();
            return pName === productName.toLowerCase();
        });

        // 부분 일치 찾기
        if (!matchedProduct) {
            matchedProduct = validProducts.find(p => {
                const pName = (p.product_name || p.name || '').toLowerCase();
                return pName.includes(productName.toLowerCase()) ||
                    productName.toLowerCase().includes(pName);
            });
        }
    }

    const result = {
        success: true,
        raw: text,
        parsed: {
            productName: matchedProduct?.product_name || matchedProduct?.name || productName,
            productId: matchedProduct?.id || null,
            weight: weightResult?.weight || null,
            weightUnit: weightResult?.unit || 'g',
            grade: gradeResult?.grade || null,
            unitPrice: priceResult?.price || null,
            quantity: quantityResult?.quantity || 1,
            quantityUnit: quantityResult?.quantityUnit || '개'
        },
        matched: {
            product: matchedProduct,
            hasProductMatch: !!matchedProduct,
            confidence: calculateConfidence(weightResult, gradeResult, priceResult, productName)
        }
    };

    return result;
}

/**
 * 파싱 신뢰도 계산 (0-100)
 */
function calculateConfidence(weight, grade, price, productName) {
    let confidence = 0;
    let factors = 0;

    if (weight) { confidence += 25; factors++; }
    if (grade) { confidence += 20; factors++; }
    if (price) { confidence += 30; factors++; }
    if (productName) { confidence += 25; factors++; }

    return factors > 0 ? Math.min(100, confidence) : 0;
}

/**
 * 여러 품목을 한 번에 파싱 (쉼표 또는 "그리고"로 구분)
 */
export function parseMultipleItems(text, productList = []) {
    if (!text) return [];

    // 구분자로 분리
    const items = text
        .split(/[,，]|그리고|하고|이랑/)
        .map(item => item.trim())
        .filter(item => item.length > 0);

    return items.map(item => parseVoiceInput(item, productList));
}

export default { parseVoiceInput, parseMultipleItems };
