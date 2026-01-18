import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useMenuConfig } from '../context/MenuConfigContext';
import ConfirmModal from './ConfirmModal';
import { useModalDraggable } from '../hooks/useModalDraggable';

const MenuEditorModal = ({ isOpen, onClose }) => {
    const { activeMenuConfig, saveMenuConfig, resetMenuConfig, defaultConfig } = useMenuConfig();
    const [localConfig, setLocalConfig] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '', message: '', onConfirm: null });
    const { handleMouseDown, draggableStyle } = useModalDraggable(isOpen, { isCentered: true, useTransform: false });

    useEffect(() => {
        if (isOpen) {
            // Deep copy to avoid mutating context directly during edit
            setLocalConfig(JSON.parse(JSON.stringify(activeMenuConfig)));
        }
    }, [isOpen, activeMenuConfig]);

    // Prevent background scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isOpen) return;
            if (e.key === 'Escape') {
                if (!confirmModal.isOpen) {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, confirmModal.isOpen]);

    if (!isOpen) return null;

    const onDragEnd = (result) => {
        const { source, destination, type } = result;
        if (!destination) return;

        if (type === 'GROUP') {
            const newConfig = Array.from(localConfig);
            const [reorderedItem] = newConfig.splice(source.index, 1);
            newConfig.splice(destination.index, 0, reorderedItem);
            setLocalConfig(newConfig);
            return;
        }

        if (type === 'ITEM') {
            const sourceGroupIndex = localConfig.findIndex(g => g.id === source.droppableId);
            const destGroupIndex = localConfig.findIndex(g => g.id === destination.droppableId);
            const newConfig = [...localConfig];
            const sourceGroup = { ...newConfig[sourceGroupIndex] };
            const destGroup = { ...newConfig[destGroupIndex] };
            const [movedItem] = sourceGroup.items.splice(source.index, 1);

            if (sourceGroupIndex === destGroupIndex) {
                sourceGroup.items.splice(destination.index, 0, movedItem);
                newConfig[sourceGroupIndex] = sourceGroup;
            } else {
                destGroup.items.splice(destination.index, 0, movedItem);
                newConfig[sourceGroupIndex] = sourceGroup;
                newConfig[destGroupIndex] = destGroup;
            }
            setLocalConfig(newConfig);
        }
    };

    const toggleGroupVisibility = (groupId) => {
        setLocalConfig(prev => prev.map(group =>
            group.id === groupId ? { ...group, isHidden: !group.isHidden } : group
        ));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveMenuConfig(localConfig);
            onClose();
        } catch (error) {
            alert('저장 실패!');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setConfirmModal({
            isOpen: true,
            type: 'warning',
            message: '모든 메뉴 설정을 기본값으로 되돌리시겠습니까?',
            onConfirm: async () => {
                await resetMenuConfig();
                setLocalConfig(JSON.parse(JSON.stringify(defaultConfig)));
                setConfirmModal({ isOpen: false });
                onClose();
            }
        });
    };

    return createPortal(
        <div
            className="premium-modal-overlay"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
                zIndex: 11000, // Match ConfirmModal standard
                cursor: 'default'
            }}
        >
            <div
                className="premium-modal-container"
                style={{
                    width: '90%',
                    maxWidth: '1000px',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    ...draggableStyle
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="premium-modal-header" style={{ cursor: 'grab' }} onMouseDown={handleMouseDown}>
                    <div className="premium-modal-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                        <span role="img" aria-label="menu">☰</span>
                    </div>
                    <div style={{ flex: 1, marginLeft: '1rem' }}>
                        <h2 className="premium-modal-title">메뉴 편집</h2>
                        <p className="premium-modal-subtitle">자주 사용하는 메뉴 순서로 변경하거나 불필요한 메뉴를 숨길 수 있습니다.</p>
                    </div>
                </div>

                {/* Body */}
                <div className="premium-modal-body" style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: '1.5rem' }}>
                    <div style={{
                        marginBottom: '1.5rem',
                        padding: '1rem',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        color: '#1e40af',
                        fontSize: '0.95rem'
                    }}>
                        <span style={{ fontSize: '1.2rem' }}>💡</span>
                        <span><b>사용 팁:</b> 메뉴 그룹을 드래그하여 순서를 바꿀 수 있습니다. (아이템 이동은 추후 지원)</span>
                    </div>

                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId="all-groups" type="GROUP">
                            {(provided, snapshot) => (
                                <div
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.75rem',
                                        minHeight: '100px'
                                    }}
                                >
                                    {localConfig.map((group, index) => (
                                        <Draggable key={group.id} draggableId={group.id} index={index}>
                                            {(provided, snapshot) => {
                                                return (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        style={{
                                                            background: 'white',
                                                            border: '1px solid #e2e8f0',
                                                            borderRadius: '10px',
                                                            padding: '1rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1rem',
                                                            boxShadow: snapshot.isDragging ? '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' : 'none',
                                                            ...provided.draggableProps.style
                                                        }}
                                                    >
                                                        <div
                                                            {...provided.dragHandleProps}
                                                            style={{
                                                                cursor: 'grab',
                                                                padding: '0.5rem',
                                                                color: '#94a3b8',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                borderRadius: '4px',
                                                            }}
                                                        >
                                                            <span style={{ fontSize: '1.2rem' }}>☰</span>
                                                        </div>

                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                                                <div style={{
                                                                    width: '36px', height: '36px',
                                                                    borderRadius: '8px',
                                                                    background: '#f1f5f9',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: '1.2rem'
                                                                }}>
                                                                    {group.icon}
                                                                </div>
                                                                <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '1.05rem' }}>{group.group}</span>
                                                                {group.isHidden && (
                                                                    <span style={{
                                                                        fontSize: '0.75rem',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '9999px',
                                                                        background: '#f1f5f9',
                                                                        color: '#64748b',
                                                                        fontWeight: '600'
                                                                    }}>숨김됨</span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.85rem', color: '#64748b', paddingLeft: '0.25rem' }}>
                                                                {group.items.map(item => item.label).join(', ')}
                                                            </div>
                                                        </div>

                                                        <div
                                                            onClick={() => toggleGroupVisibility(group.id)}
                                                            style={{
                                                                cursor: 'pointer',
                                                                padding: '0.5rem 1rem',
                                                                borderRadius: '8px',
                                                                background: group.isHidden ? '#f1f5f9' : '#eff6ff',
                                                                border: `1px solid ${group.isHidden ? '#e2e8f0' : '#bfdbfe'}`,
                                                                color: group.isHidden ? '#94a3b8' : '#2563eb',
                                                                fontWeight: '600',
                                                                fontSize: '0.9rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem',
                                                                pointerEvents: snapshot.isDragging ? 'none' : 'auto'
                                                            }}
                                                        >
                                                            <div style={{
                                                                width: '18px', height: '18px',
                                                                borderRadius: '4px',
                                                                border: `2px solid ${group.isHidden ? '#cbd5e1' : '#3b82f6'}`,
                                                                background: group.isHidden ? 'white' : '#3b82f6',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: 'white', fontSize: '0.8rem'
                                                            }}>
                                                                {!group.isHidden && '✓'}
                                                            </div>
                                                            <span>노출</span>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                </div>

                {/* Footer */}
                <div className="premium-modal-footer">
                    <button
                        className="premium-modal-btn premium-btn-danger"
                        onClick={handleReset}
                        style={{ marginRight: 'auto', background: '#ef4444', color: 'white' }}
                    >
                        기본값 초기화
                    </button>
                    <button
                        className="premium-modal-btn premium-btn-secondary"
                        onClick={onClose}
                    >
                        취소
                    </button>
                    <button
                        className="premium-modal-btn premium-btn-primary"
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{ minWidth: '100px' }}
                    >
                        {isSaving ? '저장 중...' : '저장하기'}
                    </button>
                </div>
            </div>

            {confirmModal.isOpen && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title="초기화 확인"
                    message={confirmModal.message}
                    type={confirmModal.type}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal({ isOpen: false })}
                    confirmText="초기화"
                />
            )}
        </div>,
        document.body
    );
};

export default MenuEditorModal;
