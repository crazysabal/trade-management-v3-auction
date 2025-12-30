import React from 'react';
import { createPortal } from 'react-dom';

const Taskbar = ({ windows, activeWindowId, onToggleWindow, onCloseWindow, onResetPosition, onCloseAll }) => {

    const [contextMenu, setContextMenu] = React.useState({
        visible: false,
        x: 0,
        y: 0,
        windowId: null
    });

    const contextMenuRef = React.useRef(null);

    // 메뉴 외부 클릭 시 닫기
    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
                setContextMenu({ ...contextMenu, visible: false });
            }
        };

        if (contextMenu.visible) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [contextMenu]);

    const handleContextMenu = (e, windowId) => {
        e.preventDefault();
        e.stopPropagation(); // 이벤트 전파 방지
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY, // 오프셋 제거 (바로 위쪽에 표시되도록)
            windowId
        });
    };

    const handleClose = () => {
        if (onCloseWindow && contextMenu.windowId) {
            onCloseWindow(contextMenu.windowId);
        }
        setContextMenu({ ...contextMenu, visible: false });
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '38px',
            backgroundColor: 'rgba(243, 244, 246, 0.9)', // backdrop-filter용 반투명
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1rem',
            zIndex: 100000,
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
        }}>
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', width: '100%' }}>
                {windows.map(win => {
                    const isActive = win.id === activeWindowId && !win.isMinimized;
                    return (
                        <button
                            key={win.id}
                            onClick={() => onToggleWindow(win.id)}
                            onContextMenu={(e) => handleContextMenu(e, win.id)}
                            style={{
                                padding: '0.2rem 1rem',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: isActive ? '#fff' : 'transparent',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                color: isActive ? '#1e293b' : '#64748b',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s',
                                maxWidth: '200px',
                                minWidth: '120px'
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)';
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            {win.icon ? (
                                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{win.icon}</span>
                            ) : (
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: isActive ? '#3b82f6' : (win.isMinimized ? '#cbd5e1' : '#94a3b8')
                                }} />
                            )}
                            <span style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontSize: '0.9rem',
                                fontWeight: isActive ? '500' : 'normal'
                            }}>
                                {win.title}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* 컨텍스트 메뉴 (우클릭 메뉴) - Portal 사용 */}
            {contextMenu.visible && createPortal(
                <div
                    ref={contextMenuRef}
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        transform: 'translateY(-100%)', // 커서 위로 표시
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        padding: '4px 0',
                        zIndex: 2147483647, // 최상위 보장
                        minWidth: '120px'
                    }}
                >
                    <button
                        onClick={() => {
                            if (onResetPosition && contextMenu.windowId) {
                                onResetPosition(contextMenu.windowId);
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                        style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            fontSize: '0.9rem',
                            color: '#3b82f6',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                        위치 초기화
                    </button>
                    <button
                        onClick={() => {
                            if (onCloseAll) {
                                onCloseAll();
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                        style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            fontSize: '0.9rem',
                            color: '#f59e0b', // Amber/Orange for caution
                            cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                        모두 닫기
                    </button>
                    <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }}></div>
                    <button
                        onClick={handleClose}
                        style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            fontSize: '0.9rem',
                            color: '#ef4444',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                        닫기
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Taskbar;
