import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { expenseCategoryAPI } from '../services/api';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import useTableDnd from '../hooks/useTableDnd';
import TableDndRow from '../components/TableDndRow';
import ConfirmModal, { useConfirmModal } from '../components/ConfirmModal';
import { useModalDraggable } from '../hooks/useModalDraggable';
import '../components/TradePanel.css';

const CategoryRow = React.memo(({
    cat,
    index,
    provided,
    snapshot,
    columnWidths,
    handleToggleActive,
    handleDelete,
    openModal
}) => {
    return (
        <tr
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`${snapshot.isDragging ? 'drag-over' : ''} hover-row`}
            data-id={cat.id}
            style={{
                ...provided.draggableProps.style,
                backgroundColor: snapshot.isDragging ? '#f8fafc' : (index % 2 === 0 ? '#ffffff' : '#f8fafc'),
                boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
                opacity: snapshot.isDragging ? 0.9 : 1
            }}
        >
            <td
                {...provided.dragHandleProps}
                style={{
                    textAlign: 'center',
                    color: snapshot.isDragging ? '#3182ce' : '#cbd5e0',
                    padding: '0.5rem',
                    fontSize: '1.2rem',
                    width: snapshot.isDragging ? columnWidths[0] : '50px',
                    cursor: snapshot.isDragging ? 'grabbing' : 'grab'
                }}
            >
                ☰
            </td>
            <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[1] } : {}) }}>{index + 1}</td>
            <td style={{ padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[2] } : {}) }}>{cat.name}</td>
            <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[3] } : {}) }}>
                <span
                    className={`badge ${cat.is_active ? 'badge-success' : 'badge-secondary'}`}
                    onClick={() => handleToggleActive(cat)}
                    style={{ cursor: 'pointer' }}
                    title="클릭하여 상태 변경"
                >
                    {cat.is_active ? '사용' : '미사용'}
                </span>
            </td>
            <td style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem', ...(snapshot.isDragging ? { width: columnWidths[4] } : {}) }}>
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
    );
});

const ExpenseCategoryManagement = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Reorder persistence
    const handleReorder = async (newItems) => {
        const reorderedItems = newItems.map((item, index) => ({
            id: item.id,
            sort_order: (index + 1) * 10
        }));

        try {
            await expenseCategoryAPI.reorder({ items: reorderedItems });
        } catch (err) {
            console.error('순서 저장 실패:', err);
            fetchCategories();
        }
    };

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
    const [currentCategory, setCurrentCategory] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', is_active: true });

    const { openModal: openConfirm, ConfirmModalComponent } = useConfirmModal();

    // Draggable Modal
    const { position, headerDragProps } = useModalDraggable({
        isOpen: isModalOpen,
        initialPosition: { x: window.innerWidth / 2 - 200, y: 100 }
    });
    const draggableStyle = {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        margin: 0
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        setLoading(true);
        try {
            const { data } = await expenseCategoryAPI.getAll();
            // sort by sort_order
            const sorted = data.sort((a, b) => a.sort_order - b.sort_order);
            setCategories(sorted);
        } catch (err) {
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleActive = async (category) => {
        try {
            await expenseCategoryAPI.update(category.id, { is_active: !category.is_active });
            fetchCategories();
        } catch (err) {
            console.error('상태 변경 실패:', err);
            openConfirm({
                type: 'error',
                title: '오류',
                message: '상태 변경 중 오류가 발생했습니다.'
            });
        }
    };

    const handleDelete = async (category) => {
        openConfirm({
            type: 'warning',
            title: '삭제 확인',
            message: `'${category.name}' 항목을 삭제하시겠습니까?`,
            onConfirm: async () => {
                try {
                    await expenseCategoryAPI.delete(category.id);
                    fetchCategories();
                } catch (err) {
                    // console.error('삭제 실패:', err);
                    openConfirm({
                        type: 'error',
                        title: '삭제 실패',
                        message: '삭제 중 오류가 발생했습니다. (사용 중인 항목일 수 있습니다)'
                    });
                }
            }
        });
    };

    const openModal = (category = null) => {
        if (category) {
            setModalMode('edit');
            setCurrentCategory(category);
            setFormData({
                name: category.name,
                description: category.description || '',
                is_active: category.is_active
            });
        } else {
            setModalMode('add');
            setCurrentCategory(null);
            setFormData({ name: '', description: '', is_active: true });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'add') {
                // Get max sort order
                const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0;
                await expenseCategoryAPI.create({ ...formData, sort_order: maxOrder + 10 });
            } else {
                await expenseCategoryAPI.update(currentCategory.id, formData);
            }
            closeModal();
            fetchCategories();
        } catch (err) {
            console.error('저장 실패:', err);
            openConfirm({
                type: 'error',
                title: '오류',
                message: '저장 중 오류가 발생했습니다.'
            });
        }
    };


    const {
        localItems: displayedCategories,
        columnWidths,
        onDragStart,
        onDragEnd
    } = useTableDnd(categories, handleReorder);

    return (
        <div className="expense-category-management" style={{
            display: 'block',
            height: 'auto',
            padding: '0.5rem',
            overflow: 'visible'
        }}>
            {/* Standard 35.29: MDI High-Density Flexbar (Sticky Utility) */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 110,
                backgroundColor: 'white',
                padding: '0.5rem', // Restore internal padding
                borderBottom: '1px solid #e5e7eb',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
                <div style={{ textAlign: 'right' }}>
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
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>로딩 중...</div>
            ) : (
                <div className="table-container" style={{ overflow: 'visible' }}>
                    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
                        <table className="trade-Table" style={{ width: '100%', tableLayout: 'fixed' }}>
                            <thead style={{ position: 'sticky', top: '54px', zIndex: 10 }}>
                                <tr>
                                    <th style={{ width: '50px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}></th>
                                    <th style={{ width: '80px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>순서</th>
                                    <th style={{ padding: '0.5rem', fontSize: '0.85rem' }}>항목명</th>
                                    <th style={{ width: '100px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>상태</th>
                                    <th style={{ width: '150px', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>관리</th>
                                </tr>
                            </thead>
                            <Droppable droppableId="expense-categories">
                                {(provided) => (
                                    <tbody ref={provided.innerRef} {...provided.droppableProps}>
                                        {displayedCategories.map((cat, index) => (
                                            <Draggable key={cat.id} draggableId={String(cat.id)} index={index}>
                                                {(provided, snapshot) => (
                                                    <TableDndRow provided={provided} snapshot={snapshot}>
                                                        <CategoryRow
                                                            cat={cat}
                                                            index={index}
                                                            provided={provided}
                                                            snapshot={snapshot}
                                                            columnWidths={columnWidths}
                                                            handleToggleActive={handleToggleActive}
                                                            handleDelete={handleDelete}
                                                            openModal={openModal}
                                                        />
                                                    </TableDndRow>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </tbody>
                                )}
                            </Droppable>
                        </table>
                    </DragDropContext>
                </div>
            )
            }
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#6c757d' }}>
                💡 목록의 ☰ 아이콘을 드래그하여 순서를 변경할 수 있습니다.<br />
                💡 상태 뱃지를 클릭하여 사용 여부를 변경할 수 있습니다.
            </div>

            {/* Modal */}
            {
                isModalOpen && createPortal(
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
                )
            }

            {ConfirmModalComponent}
        </div >
    );
};

export default ExpenseCategoryManagement;
