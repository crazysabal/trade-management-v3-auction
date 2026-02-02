/**
 * VoiceTradeTest.js
 * 
 * 음성 전표 등록 프로토타입 - 단계별 순차 입력 방식
 * 품목 → 중량 → 등급 → 단가 순서로 음성 입력
 * 
 * @created 2026-02-02
 * @updated 2026-02-02 - 단계별 입력 방식으로 리팩토링
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import { productAPI } from '../services/api';
import './VoiceTradeTest.css';

// 단계 정의
const STEPS = [
    { id: 'product', label: '품목', icon: '🍎', hint: '품목명 말하기 → "다음"으로 이동' },
    { id: 'weight', label: '중량', icon: '⚖️', hint: '중량 말하기 → "다음"으로 이동' },
    { id: 'grade', label: '등급', icon: '🏷️', hint: '등급 말하기 → "다음"으로 이동' },
    { id: 'price', label: '단가', icon: '💰', hint: '단가 말하기 → "추가"로 완료' }
];

// 음성 명령어 정의
const VOICE_COMMANDS = {
    next: ['다음', '앞으로', '넘어가', '넘어', '네스트'],
    prev: ['이전단계', '뒤로', '전으로', '앞단계'],
    reset: ['다시', '처음부터', '리셋', '재입력', '초기화'],
    confirm: ['확인', '추가', '완료', '등록', '추가해', '추가해줘'],
    stop: ['취소', '멈춰', '중지', '스탑', '그만']
};

// 중량 파싱
function parseWeight(text) {
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

            if (unit === '킬로그램' || unit === '킬로' || unit === 'kg') {
                unit = 'kg';
            } else if (unit === '그램' || unit === 'g') {
                unit = 'g';
            } else if (unit === '근') {
                weight = weight * 600;
                unit = 'g';
            }

            return { weight, unit };
        }
    }

    // 숫자만 있는 경우 kg로 가정
    const numMatch = text.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
        return { weight: parseFloat(numMatch[1]), unit: 'kg' };
    }

    return null;
}

// 단가 파싱
function parsePrice(text) {
    // 숫자 + 원 패턴
    const numericPattern = /(\d{1,3}(?:,?\d{3})*)\s*원?/;
    const numericMatch = text.match(numericPattern);
    if (numericMatch) {
        return parseInt(numericMatch[1].replace(/,/g, ''), 10);
    }

    // 한글 금액 패턴
    const koreanUnitWords = { '만': 10000, '천': 1000, '백': 100 };
    const mixedPattern = /(\d+)(만|천|백)/g;
    let result = 0;
    let match;
    while ((match = mixedPattern.exec(text)) !== null) {
        result += parseInt(match[1], 10) * koreanUnitWords[match[2]];
    }
    if (result > 0) return result;

    // 순수 한글 (만원, 오천원 등)
    if (text.includes('만')) result += 10000;
    if (text.includes('천')) result += 1000;

    return result > 0 ? result : null;
}

function VoiceTradeTest() {
    // 품목 마스터 데이터
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // 현재 단계
    const [currentStep, setCurrentStep] = useState('product');

    // 단계별 입력 데이터
    const [stepData, setStepData] = useState({
        product: null,      // 선택된 품목 객체
        weight: '',         // 중량 값
        weightUnit: 'kg',   // 중량 단위
        grade: '',          // 등급
        unitPrice: '',      // 단가
        quantity: 1         // 수량
    });

    // 품목 목록 (추가된 품목들)
    const [itemList, setItemList] = useState([]);

    // 음성 인식 훅
    const {
        isListening,
        transcript,
        interimTranscript,
        error,
        isSupported,
        startListening,
        stopListening,
        resetTranscript
    } = useVoiceRecognition({
        lang: 'ko-KR',
        continuous: true,  // 연속 음성 인식 모드
        interimResults: true,
        onResult: handleVoiceResult
    });

    // 마이크 권한 상태
    const [micPermission, setMicPermission] = useState('unknown');

    // 마이크 권한 확인
    useEffect(() => {
        checkMicPermission();
    }, []);

    const checkMicPermission = async () => {
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            setMicPermission(result.state);
            result.onchange = () => setMicPermission(result.state);
        } catch (err) {
            console.log('[Voice] 권한 API 미지원');
        }
    };

    // 품목 데이터 로드
    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        try {
            const res = await productAPI.getAll({ is_active: 'true' });
            setProducts(res.data.data || []);
        } catch (err) {
            console.error('품목 로딩 오류:', err);
        } finally {
            setLoading(false);
        }
    };

    // 현재 품목의 중량 목록 (중복 제거)
    const availableWeights = useMemo(() => {
        if (!stepData.product) return [];
        const productName = stepData.product.product_name;
        const weights = products
            .filter(p => p.product_name === productName && p.weight)
            .map(p => ({ weight: parseFloat(p.weight), unit: p.weight_unit || 'kg' }));
        // 중복 제거
        const unique = [];
        const seen = new Set();
        for (const w of weights) {
            const key = `${w.weight}${w.unit}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(w);
            }
        }
        return unique.sort((a, b) => a.weight - b.weight);
    }, [stepData.product, products]);

    // 현재 품목+중량의 등급 목록
    const availableGrades = useMemo(() => {
        if (!stepData.product) return [];
        const productName = stepData.product.product_name;
        const selectedWeight = parseFloat(stepData.weight) || null;
        return products
            .filter(p => {
                if (p.product_name !== productName || !p.grade) return false;
                // 중량이 선택된 경우 해당 중량의 등급만
                if (selectedWeight && p.weight) {
                    return Math.abs(parseFloat(p.weight) - selectedWeight) < 0.1;
                }
                return true;
            })
            .map(p => ({ id: p.id, grade: p.grade, weight: parseFloat(p.weight) }));
    }, [stepData.product, stepData.weight, products]);

    // 명령어 감지 함수
    function detectCommand(text) {
        const normalized = text.trim().toLowerCase();
        for (const [cmd, keywords] of Object.entries(VOICE_COMMANDS)) {
            for (const keyword of keywords) {
                if (normalized.includes(keyword)) {
                    console.log(`[Voice] Command detected: ${cmd} (keyword: ${keyword})`);
                    return cmd;
                }
            }
        }
        return null;
    }

    // 명령어 실행 함수
    function executeCommand(cmd) {
        const currentIdx = STEPS.findIndex(s => s.id === currentStep);

        switch (cmd) {
            case 'next':
                if (currentIdx < STEPS.length - 1) {
                    setCurrentStep(STEPS[currentIdx + 1].id);
                }
                break;
            case 'prev':
                if (currentIdx > 0) {
                    setCurrentStep(STEPS[currentIdx - 1].id);
                }
                break;
            case 'reset':
                resetAll();
                break;
            case 'confirm':
                if (stepData.product && stepData.unitPrice) {
                    handleAddItem();
                }
                break;
            case 'stop':
                stopListening();
                break;
            default:
                break;
        }
    }

    // 음성 인식 결과 처리 - 단계별
    function handleVoiceResult(text) {
        if (!text) return;

        console.log(`[Voice] Step ${currentStep}: "${text}"`);

        // 1. 명령어 우선 처크
        const command = detectCommand(text);
        if (command) {
            executeCommand(command);
            return;
        }

        // 2. 단계별 데이터 처리
        switch (currentStep) {
            case 'product':
                handleProductStep(text);
                break;
            case 'weight':
                handleWeightStep(text);
                break;
            case 'grade':
                handleGradeStep(text);
                break;
            case 'price':
                handlePriceStep(text);
                break;
            default:
                break;
        }
    }

    // 품목 단계 처리
    function handleProductStep(text) {
        const normalized = text.trim().toLowerCase();

        // 품목 매칭
        const matched = products.find(p => {
            const pName = (p.product_name || '').toLowerCase();
            return pName === normalized ||
                pName.includes(normalized) ||
                normalized.includes(pName);
        });

        if (matched) {
            setStepData(prev => ({ ...prev, product: matched }));
            // 자동 이동 제거 - "다음" 명령어로 이동
        } else {
            // 부분 일치라도 표시
            setStepData(prev => ({ ...prev, product: { product_name: text, isManual: true } }));
        }
    }

    // 중량 단계 처리
    function handleWeightStep(text) {
        const result = parseWeight(text);
        if (result) {
            // DB에서 가장 가까운 중량 찾기
            let matchedWeight = result.weight;
            let matchedUnit = result.unit;

            if (availableWeights.length > 0) {
                const closest = availableWeights.reduce((prev, curr) => {
                    const prevDiff = Math.abs(prev.weight - result.weight);
                    const currDiff = Math.abs(curr.weight - result.weight);
                    return currDiff < prevDiff ? curr : prev;
                });
                // 오차 범위 내면 매칭
                if (Math.abs(closest.weight - result.weight) <= 2) {
                    matchedWeight = closest.weight;
                    matchedUnit = closest.unit;
                }
            }

            setStepData(prev => ({
                ...prev,
                weight: matchedWeight.toString(),
                weightUnit: matchedUnit
            }));
            // 자동 이동 제거 - "다음" 명령어로 이동
        }
    }

    // 등급 단계 처리 - 음성 인식 후처리 포함
    function handleGradeStep(text) {
        let normalized = text.trim();

        // 음성 인식 오류 후처리: "이전"→"2전", "삼전"→"3전" 등
        const gradeCorrections = {
            '이전': '2전', '이후': '2후',
            '삼전': '3전', '삼후': '3후',
            '사전': '4전', '사후': '4후',
            '오전': '5전', '오후': '5후',
            '육전': '6전', '육단': '6단',
            '칠단': '7단',
            '일전': '1전', '일후': '1후'
        };

        // 숫자+전/후 패턴 변환: "2 전" → "2전"
        normalized = normalized.replace(/(\d)\s*(전|후|단)/g, '$1$2');

        // 한글 숫자 변환
        if (gradeCorrections[normalized]) {
            normalized = gradeCorrections[normalized];
        }

        console.log(`[Voice] Grade correction: "${text}" → "${normalized}"`);

        // 등급 매칭
        const matched = availableGrades.find(g => {
            const gName = (g.grade || '').toLowerCase();
            const norm = normalized.toLowerCase();
            return gName === norm ||
                gName.includes(norm) ||
                norm.includes(gName);
        });

        if (matched) {
            // 등급이 매칭되면 해당 품목 ID로 업데이트
            const productWithGrade = products.find(p => p.id === matched.id);
            setStepData(prev => ({
                ...prev,
                grade: matched.grade,
                product: productWithGrade || prev.product
            }));
        } else {
            setStepData(prev => ({ ...prev, grade: normalized }));
        }
        // 자동 이동 제거 - "다음" 명령어로 이동
    }

    // 단가 단계 처리
    function handlePriceStep(text) {
        const price = parsePrice(text);
        if (price) {
            setStepData(prev => ({ ...prev, unitPrice: price.toString() }));
        }
    }

    // 마이크 버튼 토글
    const handleMicToggle = useCallback(() => {
        if (isListening) {
            stopListening();
        } else {
            resetTranscript();
            startListening();
        }
    }, [isListening, startListening, stopListening, resetTranscript]);

    // 단계 이동
    const goToStep = (stepId) => {
        setCurrentStep(stepId);
        resetTranscript();
    };

    // 처음부터 다시
    const resetAll = () => {
        setCurrentStep('product');
        setStepData({
            product: null,
            weight: '',
            weightUnit: 'kg',
            grade: '',
            unitPrice: '',
            quantity: 1
        });
        resetTranscript();
    };

    // 품목 추가
    const handleAddItem = () => {
        if (!stepData.product?.product_name || !stepData.unitPrice) {
            alert('품목명과 단가는 필수입니다.');
            return;
        }

        const newItem = {
            id: Date.now(),
            productId: stepData.product.id,
            productName: stepData.product.product_name,
            weight: parseFloat(stepData.weight) || 0,
            weightUnit: stepData.weightUnit,
            grade: stepData.grade,
            unitPrice: parseInt(stepData.unitPrice, 10) || 0,
            quantity: parseInt(stepData.quantity, 10) || 1
        };

        newItem.totalPrice = newItem.unitPrice * newItem.quantity;

        setItemList(prev => [...prev, newItem]);
        resetAll();
    };

    // 품목 삭제
    const handleRemoveItem = (id) => {
        setItemList(prev => prev.filter(item => item.id !== id));
    };

    // 합계 계산
    const totalAmount = itemList.reduce((sum, item) => sum + item.totalPrice, 0);

    // 현재 단계 인덱스
    const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);
    const currentStepInfo = STEPS[currentStepIndex];

    if (loading) {
        return <div className="voice-trade-test"><div className="loading">로딩 중...</div></div>;
    }

    return (
        <div className="voice-trade-test">
            <div className="page-header">
                <h1 className="page-title">🎤 음성 전표 등록 (실험)</h1>
            </div>

            {/* 브라우저 지원 안내 */}
            {!isSupported && (
                <div className="browser-warning">
                    ⚠️ Chrome 또는 Edge를 사용해주세요.
                </div>
            )}

            {/* 진행률 표시 */}
            <div className="step-progress">
                {STEPS.map((step, idx) => (
                    <div
                        key={step.id}
                        className={`step-item ${step.id === currentStep ? 'active' : ''} ${idx < currentStepIndex ? 'completed' : ''}`}
                        onClick={() => idx <= currentStepIndex && goToStep(step.id)}
                    >
                        <span className="step-icon">{step.icon}</span>
                        <span className="step-label">{step.label}</span>
                    </div>
                ))}
            </div>

            {/* 현재 입력된 정보 요약 */}
            <div className="current-data-summary">
                {stepData.product && (
                    <span className="data-badge product">
                        🍎 {stepData.product.product_name}
                        {stepData.product.isManual && ' (수동)'}
                    </span>
                )}
                {stepData.weight && (
                    <span className="data-badge weight">
                        ⚖️ {stepData.weight}{stepData.weightUnit}
                    </span>
                )}
                {stepData.grade && (
                    <span className="data-badge grade">
                        🏷️ {stepData.grade}
                    </span>
                )}
                {stepData.unitPrice && (
                    <span className="data-badge price">
                        💰 {parseInt(stepData.unitPrice).toLocaleString()}원
                    </span>
                )}
            </div>

            {/* 음성 입력 섹션 */}
            <div className="voice-section">
                {/* 마이크 상태 */}
                <div className="mic-status-bar">
                    📋 마이크: {micPermission === 'granted' ? '✅ 허용됨' : '❓ 확인 필요'}
                </div>

                {/* 현재 단계 안내 */}
                <div className="current-step-info">
                    <span className="step-number">Step {currentStepIndex + 1}/4</span>
                    <span className="step-name">{currentStepInfo.icon} {currentStepInfo.label} 입력</span>
                </div>

                <div className="voice-input-area">
                    <button
                        className={`mic-button ${isListening ? 'listening' : ''}`}
                        onClick={handleMicToggle}
                        disabled={!isSupported}
                    >
                        {isListening ? '🔴' : '🎤'}
                    </button>
                    <div className="voice-status">
                        {isListening ? (
                            <span className="listening-text">듣는 중... {currentStepInfo.hint}</span>
                        ) : (
                            <span>{currentStepInfo.hint}</span>
                        )}
                    </div>
                </div>

                {/* 실시간 인식 결과 */}
                {(transcript || interimTranscript) && (
                    <div className="transcript-display">
                        <label>인식된 텍스트:</label>
                        <div className="transcript-text">
                            {transcript}
                            <span className="interim">{interimTranscript}</span>
                        </div>
                    </div>
                )}

                {/* 오류 메시지 */}
                {error && (
                    <div className="error-message">
                        ❌ {error}
                    </div>
                )}

                {/* 중량 선택 (중량 단계에서만) */}
                {currentStep === 'weight' && availableWeights.length > 0 && (
                    <div className="weight-selector">
                        <label>중량 선택 (또는 음성으로):</label>
                        <div className="weight-buttons">
                            {availableWeights.map((w, idx) => (
                                <button
                                    key={idx}
                                    className={`weight-btn ${stepData.weight === w.weight.toString() ? 'selected' : ''}`}
                                    onClick={() => {
                                        setStepData(prev => ({
                                            ...prev,
                                            weight: w.weight.toString(),
                                            weightUnit: w.unit
                                        }));
                                        // 해당 중량의 등급 확인 후 다음 단계로
                                        setTimeout(() => {
                                            const gradesForWeight = products.filter(p =>
                                                p.product_name === stepData.product?.product_name &&
                                                p.grade &&
                                                Math.abs(parseFloat(p.weight) - w.weight) < 0.1
                                            );
                                            if (gradesForWeight.length > 0) {
                                                setCurrentStep('grade');
                                            } else {
                                                setCurrentStep('price');
                                            }
                                        }, 300);
                                    }}
                                >
                                    {w.weight}{w.unit}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 등급 선택 (등급 단계에서만) */}
                {currentStep === 'grade' && availableGrades.length > 0 && (
                    <div className="grade-selector">
                        <label>등급 선택 (또는 음성으로):</label>
                        <div className="grade-buttons">
                            {availableGrades.map(g => (
                                <button
                                    key={g.id}
                                    className={`grade-btn ${stepData.grade === g.grade ? 'selected' : ''}`}
                                    onClick={() => {
                                        const productWithGrade = products.find(p => p.id === g.id);
                                        setStepData(prev => ({
                                            ...prev,
                                            grade: g.grade,
                                            product: productWithGrade || prev.product
                                        }));
                                        setTimeout(() => setCurrentStep('price'), 300);
                                    }}
                                >
                                    {g.grade}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 네비게이션 버튼 */}
                <div className="step-navigation">
                    <button
                        className="btn-prev"
                        onClick={() => goToStep(STEPS[Math.max(0, currentStepIndex - 1)].id)}
                        disabled={currentStepIndex === 0}
                    >
                        ← 이전
                    </button>
                    <button className="btn-reset" onClick={resetAll}>
                        🔄 처음부터
                    </button>
                    {currentStep === 'price' && stepData.unitPrice && (
                        <button className="btn-add" onClick={handleAddItem}>
                            ✓ 품목 추가
                        </button>
                    )}
                </div>
            </div>

            {/* 등록된 품목 목록 */}
            <div className="item-list-section">
                <h3>📋 등록된 품목 ({itemList.length}건)</h3>

                {itemList.length === 0 ? (
                    <div className="empty-list">음성으로 품목을 추가해주세요</div>
                ) : (
                    <>
                        <table className="item-table">
                            <thead>
                                <tr>
                                    <th>품목</th>
                                    <th>중량</th>
                                    <th>등급</th>
                                    <th>단가</th>
                                    <th>수량</th>
                                    <th>금액</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemList.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.productName}</td>
                                        <td>{item.weight}{item.weightUnit}</td>
                                        <td>{item.grade || '-'}</td>
                                        <td>{item.unitPrice.toLocaleString()}원</td>
                                        <td>{item.quantity}</td>
                                        <td className="amount">{item.totalPrice.toLocaleString()}원</td>
                                        <td>
                                            <button
                                                className="btn-remove"
                                                onClick={() => handleRemoveItem(item.id)}
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="total-row">
                                    <td colSpan="5">합계</td>
                                    <td className="amount">{totalAmount.toLocaleString()}원</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>

                        <div className="list-actions">
                            <button className="btn-reset" onClick={() => setItemList([])}>
                                🗑️ 전체 삭제
                            </button>
                            <button className="btn-save" disabled>
                                💾 전표 저장 (미구현)
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default VoiceTradeTest;
