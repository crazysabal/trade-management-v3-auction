import React, { useState } from 'react';

const AuctionStatement = ({ isWindow }) => {
    const TARGET_URL = 'http://tgjungang.co.kr/renew/result/successful.html';

    const openInNewWindow = () => {
        window.open(TARGET_URL, '_blank', 'width=1200,height=800,resizable=yes,scrollbars=yes');
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: '#ffffff',
            boxSizing: 'border-box'
        }}>
            {/* Toolbar */}
            <div style={{
                padding: '10px 15px',
                borderBottom: '1px solid #e0e0e0',
                backgroundColor: '#f8f9fa',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
            }}>
                <div style={{ fontSize: '14px', color: '#666' }}>
                    ⚠️ 외부 경매 사이트 화면입니다. 화면이 보이지 않으면 <b>새 창으로 열기</b>를 눌러주세요.
                </div>
                <button
                    onClick={openInNewWindow}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                    <span>🔗</span> 새 창으로 열기
                </button>
            </div>

            {/* Iframe Container */}
            <div style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden'
            }}>
                <iframe
                    src={TARGET_URL}
                    title="Auction Statement"
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        position: 'absolute',
                        top: 0,
                        left: 0
                    }}
                    referrerPolicy="no-referrer"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
            </div>
        </div>
    );
};

export default AuctionStatement;
