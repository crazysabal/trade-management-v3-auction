/**
 * useVoiceRecognition.js
 * 
 * Web Speech API를 래핑하는 커스텀 훅
 * 음성을 텍스트로 변환하고 상태를 관리합니다.
 * 
 * @created 2026-02-02
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Web Speech API 지원 확인
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * 음성 인식 커스텀 훅
 * 
 * @param {Object} options - 옵션
 * @param {string} options.lang - 언어 설정 (기본: 'ko-KR')
 * @param {boolean} options.continuous - 연속 인식 여부 (기본: false)
 * @param {boolean} options.interimResults - 중간 결과 표시 여부 (기본: true)
 * @param {Function} options.onResult - 최종 결과 콜백
 * @param {Function} options.onInterimResult - 중간 결과 콜백
 * @returns {Object} 음성 인식 상태 및 메서드
 */
export function useVoiceRecognition({
    lang = 'ko-KR',
    continuous = false,
    interimResults = true,
    onResult,
    onInterimResult
} = {}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState(null);
    const [isSupported, setIsSupported] = useState(true);

    const recognitionRef = useRef(null);
    const onResultRef = useRef(onResult);
    const onInterimResultRef = useRef(onInterimResult);

    // 콜백 ref 업데이트
    useEffect(() => {
        onResultRef.current = onResult;
        onInterimResultRef.current = onInterimResult;
    }, [onResult, onInterimResult]);

    // 초기화
    useEffect(() => {
        if (!SpeechRecognition) {
            setIsSupported(false);
            setError('음성 인식이 지원되지 않는 브라우저입니다. Chrome 또는 Edge를 사용해주세요.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.continuous = continuous;
        recognition.interimResults = interimResults;

        recognition.onstart = () => {
            console.log('[Voice] 🎤 음성 인식 시작');
            setIsListening(true);
            setError(null);
        };

        recognition.onend = () => {
            console.log('[Voice] 🔇 음성 인식 종료');
            setIsListening(false);
        };

        recognition.onerror = (event) => {
            console.log('[Voice] ❌ 오류 발생:', event.error);
            setIsListening(false);
            switch (event.error) {
                case 'not-allowed':
                    setError('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
                    break;
                case 'no-speech':
                    setError('음성이 감지되지 않았습니다. 다시 시도해주세요.');
                    break;
                case 'audio-capture':
                    setError('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
                    break;
                case 'network':
                    setError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
                    break;
                case 'aborted':
                    // 사용자가 중단한 경우 에러로 처리하지 않음
                    break;
                default:
                    setError(`음성 인식 오류: ${event.error}`);
            }
        };

        recognition.onresult = (event) => {
            console.log('[Voice] 📝 결과 수신:', event.results);
            let finalTranscript = '';
            let interim = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interim += result[0].transcript;
                }
            }

            console.log('[Voice] 최종:', finalTranscript, '중간:', interim);

            if (finalTranscript) {
                setTranscript(prev => prev + finalTranscript);
                onResultRef.current?.(finalTranscript);
            }

            if (interim) {
                setInterimTranscript(interim);
                onInterimResultRef.current?.(interim);
            } else {
                setInterimTranscript('');
            }
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, [lang, continuous, interimResults]);

    // 음성 인식 시작
    const startListening = useCallback(() => {
        if (!recognitionRef.current) return;

        setTranscript('');
        setInterimTranscript('');
        setError(null);

        try {
            recognitionRef.current.start();
        } catch (err) {
            // 이미 시작된 경우 에러 무시
            if (err.name !== 'InvalidStateError') {
                setError('음성 인식을 시작할 수 없습니다.');
            }
        }
    }, []);

    // 음성 인식 중지
    const stopListening = useCallback(() => {
        if (!recognitionRef.current) return;
        recognitionRef.current.stop();
    }, []);

    // 음성 인식 취소 (결과 폐기)
    const abortListening = useCallback(() => {
        if (!recognitionRef.current) return;
        recognitionRef.current.abort();
        setTranscript('');
        setInterimTranscript('');
    }, []);

    // 텍스트 초기화
    const resetTranscript = useCallback(() => {
        setTranscript('');
        setInterimTranscript('');
    }, []);

    return {
        // 상태
        isListening,
        transcript,
        interimTranscript,
        error,
        isSupported,
        // 메서드
        startListening,
        stopListening,
        abortListening,
        resetTranscript
    };
}

export default useVoiceRecognition;
