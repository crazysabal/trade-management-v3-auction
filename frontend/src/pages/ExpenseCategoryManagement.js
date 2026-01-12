import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { expenseCategoryAPI } from '../services/api';
import ConfirmModal, { useConfirmModal } from '../components/ConfirmModal';
import { useModalDraggable } from '../hooks/useModalDraggable';
import '../components/TradePanel.css';

const ExpenseCategoryManagement = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState({ id: null, name: '', is_active: true });

    // Drag & Drop state
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    // Confirm Modal Hook
    const { openModal: openConfirm, ConfirmModalComponent } = useConfirmModal();

    // Draggable Modal Hook
    const { handleMouseDown, draggableStyle } = useModalDraggable(isModalOpen);

    useEffect(() => {
        fetchCategories();
    }, []);

    // ESC handling
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isModalOpen) {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isModalOpen]);

    const fetchCategories = async () => {
        setLoading(true);
        try {
            const response = await expenseCategoryAPI.getAll();
            setCategories(response.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching categories:', err);
            setError('지출 항목을 불러오는 데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const openModal = (category = null) => {
        if (category) {
            setModalData({
                id: category.id,
                name: category.name,
                is_active: category.is_active === 1
            });
        } else {
            setModalData({ id: null, name: '', is_active: true });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalData({ id: null, name: '', is_active: true });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (modalData.id) {
                // 수정
                const currentCat = categories.find(c => c.id === modalData.id);
                await expenseCategoryAPI.update(modalData.id, {
                    name: modalData.name,
                    is_active: modalData.is_active,
                    sort_order: currentCat.sort_order
                });
            } else {
                // 추가
                const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0;
                await expenseCategoryAPI.create({
                    name: modalData.name,
                    sort_order: maxOrder + 10,
                    is_active: modalData.is_active
                });
            }
            closeModal();
            fetchCategories();
        } catch (err) {
            openConfirm({
                type: 'warning',
                title: '저장 실패',
                message: err.response?.data?.message || '저장 중 오류가 발생했습니다.',
                showCancel: false
            });
        }
    };

    const handleToggleActive = async (category) => {
        try {
            await expenseCategoryAPI.update(category.id, {
                name: category.name,
                is_active: !category.is_active,
                sort_order: category.sort_order
            });
            fetchCategories();
        } catch (err) {
            console.error('상태 변경 실패:', err);
            openConfirm({
                type: 'warning',
                title: '상태 변경 실패',
                message: '상태 변경 중 오류가 발생했습니다.',
                showCancel: false
            });
        }
    };

    const handleDelete = async (category) => {
        openConfirm({
            type: 'delete',
            title: '항목 삭제',
            message: `[${category.name}] 항목을 정말 삭제하시겠습니까?\n지출 내역이 있는 경우 삭제할 수 없습니다.`,
            confirmText: '삭제',
            onConfirm: async () => {
                try {
                    await expenseCategoryAPI.delete(category.id);
                    fetchCategories();
                } catch (err) {
                    openConfirm({
                        type: 'warning',
                        title: '삭제 실패',
                        message: err.response?.data?.message || '항목 삭제 중 오류가 발생했습니다.',
                        showCancel: false
                    });
                }
            }
        });
    };

    // Drag & Drop Handlers
    const dragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = "move";
        // 드래그 이미지를 행 전체로 설정
        const row = e.target.closest('tr');
        if (row) {
            e.dataTransfer.setDragImage(row, 0, 0);
        }
    };

    const dragEnter = (e, position) => {
        dragOverItem.current = position;
    };

    const drop = async (e) => {
        // 유효성 검사
        if (dragItem.current === null || dragItem.current === undefined ||
            dragOverItem.current === null || dragOverItem.current === undefined) {
            return;
        }

        if (dragItem.current === dragOverItem.current) return;

        const copyListItems = [...categories];
        const dragItemContent = copyListItems[dragItem.current];

        // 리스트 순서 변경
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);

        dragItem.current = null;
        dragOverItem.current = null;

        // UI 즉시 업데이트
        setCategories(copyListItems);

        const reorderedItems = copyListItems.map((item, index) => ({
            id: item.id,
            sort_order: (index + 1) * 10
        }));

        try {
            await expenseCategoryAPI.reorder({
                items: reorderedItems
            });
        } catch (err) {
            console.error('순서 저장 실패:', err);
            // alert('순서 저장에 실패했습니다.'); // UX 방해 최소화
            fetchCategories();
        }
    };

    return (
        <div className="expense-category-management" style={{ width: '100%', height: '100%', padding: '0.5rem' }}>
            {/* 상단 버튼 영역 */}
            <div style={{ textAlign: 'right', marginBottom: '0.5rem' }}>
                <button
                    onClick={() => openModal()}
                    className="btn btn-primary"
                    style={{
                        fontSize: '0.9rem',
                        padding: '0.4rem 0.8rem',
                        width: 'auto',
                        minWidth: '0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none'
                    }}
                >
                    + 항목 추가
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>로딩 중...</div>
            ) : (
                <div className="table-container">
                    <table className="trade-Table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '50px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}></th>
                                <th style={{ width: '80px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>순서</th>
                                <th style={{ padding: '0.5rem', fontSize: '0.85rem' }}>항목명</th>
                                <th style={{ width: '100px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>상태</th>
                                <th style={{ width: '150px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((cat, index) => (
                                <tr
                                    key={cat.id}
                                    onDragEnter={(e) => dragEnter(e, index)}
                                    onDragEnd={drop}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="hover-row"
                                >
                                    <td style={{ textAlign: 'center', color: '#adb5bd', padding: '0.5rem', fontSize: '0.85rem' }}>
                                        <span
                                            className="drag-handle"
                                            draggable={true}
                                            onDragStart={(e) => dragStart(e, index)}
                                            style={{ cursor: 'grab', display: 'inline-block', width: '100%', height: '100%' }}
                                            title="드래그하여 순서 변경"
                                        >
                                            ☰
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>{index + 1}</td>
                                    <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{cat.name}</td>
                                    <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>
                                        <span
                                            className={`badge ${cat.is_active ? 'badge-success' : 'badge-secondary'}`}
                                            style={{
                                                padding: '0.4em 0.8em',
                                                borderRadius: '10px',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                            onClick={() => handleToggleActive(cat)}
                                            title="클릭하여 상태 변경"
                                        >
                                            {cat.is_active ? '사용' : '미사용'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                            <button
                                                onClick={() => openModal(cat)}
                                                className="btn btn-sm btn-primary"
                                                style={{
                                                    padding: '2px 8px',
                                                    fontSize: '0.8rem',
                                                    width: 'auto',
                                                    minWidth: '0',
                                                    height: '28px',
                                                    whiteSpace: 'nowrap',
                                                    flex: 'none'
                                                }}
                                            >
                                                수정
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cat)}
                                                className="btn btn-sm btn-danger"
                                                style={{
                                                    padding: '2px 8px',
                                                    fontSize: '0.8rem',
                                                    width: 'auto',
                                                    minWidth: '0',
                                                    height: '28px',
                                                    whiteSpace: 'nowrap',
                                                    flex: 'none'
                                                }}
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {categories.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
                                        등록된 항목이 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#6c757d' }}>
                💡 목록의 ☰ 아이콘을 드래그하여 순서를 변경할 수 있습니다.<br />
                💡 상태 뱃지를 클릭하여 사용 여부를 변경할 수 있습니다.
            </div>

            {/* Modal */}
            {isModalOpen && createPortal(
                <div className="modal-overlay" style={{ zIndex: 10100 }}>
                    <div
                        className="styled-modal"
                        style={{ width: '400px', ...draggableStyle }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div
                            className="modal-header draggable-header"
                            onMouseDown={handleMouseDown}
                            style={{ cursor: 'move' }}
                        >
                            <h3 style={{ margin: 0 }}>💸 {modalData.id ? '항목 수정' : '새 항목 추가'}</h3>
                            <button className="close-btn" onClick={closeModal}>&times;</button>
                        </div>

                        <div className="modal-body">
                            <form id="category-form" onSubmit={handleSave}>
                                <div className="form-group">
                                    <label style={{ width: '80px', minWidth: '80px' }}>항목명</label>
                                    <input
                                        type="text"
                                        value={modalData.name}
                                        onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                                        placeholder="예: 식대, 교통비"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </form>
                        </div>

                        <div className="modal-footer">
                            <button className="modal-btn modal-btn-cancel" onClick={closeModal}>취소</button>
                            <button className="modal-btn modal-btn-primary" type="submit" form="category-form">
                                저장
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {ConfirmModalComponent}
        </div>
    );
};

export default ExpenseCategoryManagement;
