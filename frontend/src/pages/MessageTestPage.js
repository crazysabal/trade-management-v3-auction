import React, { useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import TradeDeleteConfirmModal from '../components/TradeDeleteConfirmModal';

function MessageTestPage() {
    const [modal, setModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        showCancel: false,
        onConfirm: () => { }
    });

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const closeModal = () => {
        setModal(prev => ({ ...prev, isOpen: false }));
    };

    const showModal = (type, title, message, showCancel = false) => {
        setModal({
            isOpen: true,
            type,
            title,
            message,
            showCancel,
            onConfirm: () => console.log('Confirmed!'),
            onClose: closeModal
        });
    };

    const styles = {
        container: {
            padding: '2rem',
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        },
        header: {
            marginBottom: '2rem',
            borderBottom: '1px solid #eee',
            paddingBottom: '1rem'
        },
        section: {
            marginBottom: '2rem',
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
        },
        card: {
            padding: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#f8f9fa'
        },
        button: {
            marginTop: '1rem',
            padding: '0.6rem 1.2rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500',
            width: '100%',
            color: 'white',
            transition: 'opacity 0.2s'
        },
        infoBox: {
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: '#0369a1'
        }
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1>💬 공통 메시지 확인창 테스트</h1>
                <p>시스템에서 사용하는 모든 종류의 알림/확인 모달 미리보기</p>
            </header>

            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#555' }}>1. 기본 메시지 (Common Messages)</h2>
            <div style={styles.section}>
                {/* Success */}
                <div style={styles.card}>
                    <h3>Success (성공)</h3>
                    <p>작업 완료 알림</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#16a34a' }}
                        onClick={() => showModal('success', '저장 완료', '데이터가 성공적으로 저장되었습니다.')}
                    >
                        Show Success
                    </button>
                </div>

                {/* Info */}
                <div style={styles.card}>
                    <h3>Info (정보)</h3>
                    <p>일반적인 정보 알림</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#0284c7' }}
                        onClick={() => showModal('info', '안내', '새로운 버전이 업데이트되었습니다.')}
                    >
                        Show Info
                    </button>
                </div>

                {/* Warning */}
                <div style={styles.card}>
                    <h3>Warning (경고)</h3>
                    <p>주의가 필요한 알림</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#d97706' }}
                        onClick={() => showModal('warning', '입력 오류', '필수 항목을 모두 입력해주세요.')}
                    >
                        Show Warning
                    </button>
                </div>

                {/* Confirm */}
                <div style={styles.card}>
                    <h3>Confirm (확인)</h3>
                    <p>사용자 확인 필요</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#2563eb' }}
                        onClick={() => showModal('confirm', '로그아웃', '정말 로그아웃 하시겠습니까?', true)}
                    >
                        Show Confirm
                    </button>
                </div>

                {/* Delete */}
                <div style={styles.card}>
                    <h3>Delete (삭제)</h3>
                    <p>삭제 등 위험 작업 확인</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#dc2626' }}
                        onClick={() => showModal('delete', '삭제 확인', '이 항목을 영구적으로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.', true)}
                    >
                        Show Delete
                    </button>
                </div>
            </div>

            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#555', marginTop: '3rem' }}>2. 특수 확인창 (Specialized Confirmations)</h2>
            <div style={styles.section}>
                {/* Trade Delete Confirm */}
                <div style={styles.card}>
                    <h3>전표 삭제 확인</h3>
                    <p>강력한 삭제 확인 (입력 요구)</p>
                    <button
                        style={{ ...styles.button, backgroundColor: '#c0392b' }}
                        onClick={() => setDeleteModalOpen(true)}
                    >
                        Show Trade Delete
                    </button>
                </div>
            </div>

            <div style={styles.infoBox}>
                <strong>💡 기타 시스템 기능 모달 (데이터 필요)</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                    <li><code>PaymentModal</code>: 입금/출금 등록 및 미수금 관리 (거래처 데이터 필요)</li>
                    <li><code>TradeDetailModal</code>: 전표 상세 조회 (전표 ID 필요)</li>
                    <li><code>TradePrintModal</code>: 전표 인쇄 미리보기 (전표 ID 필요)</li>
                </ul>
            </div>

            <ConfirmModal
                isOpen={modal.isOpen}
                onClose={closeModal}
                onConfirm={modal.onConfirm}
                title={modal.title}
                message={modal.message}
                type={modal.type}
                showCancel={modal.showCancel}
            />

            <TradeDeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={() => {
                    console.log("Deleted!");
                    setDeleteModalOpen(false);
                    showModal('success', '삭제 완료', '항목이 삭제되었습니다.');
                }}
                title="전표 삭제 확인"
                tradeDate="2024-03-25"
                tradeType="SALE"
                tradePartnerName="(주)행복유통"
            />
        </div>
    );
}

export default MessageTestPage;
