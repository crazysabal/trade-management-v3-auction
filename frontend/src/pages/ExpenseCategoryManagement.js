import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
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

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        setLoading(true);
        try {
            const response = await axios.get('http://localhost:5000/api/expense-categories');
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
                await axios.put(`http://localhost:5000/api/expense-categories/${modalData.id}`, {
                    name: modalData.name,
                    is_active: modalData.is_active,
                    sort_order: currentCat.sort_order
                });
            } else {
                // 추가
                const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0;
                await axios.post('http://localhost:5000/api/expense-categories', {
                    name: modalData.name,
                    sort_order: maxOrder + 10,
                    is_active: modalData.is_active
                });
            }
            closeModal();
            fetchCategories();
        } catch (err) {
            alert(err.response?.data?.message || '저장 중 오류가 발생했습니다.');
        }
    };

    const handleToggleActive = async (category) => {
        try {
            await axios.put(`http://localhost:5000/api/expense-categories/${category.id}`, {
                name: category.name,
                is_active: !category.is_active,
                sort_order: category.sort_order
            });
            fetchCategories();
        } catch (err) {
            console.error('상태 변경 실패:', err);
            alert('상태 변경 중 오류가 발생했습니다.');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('정말 삭제하시겠습니까? 지출 내역이 있는 경우 삭제할 수 없습니다.')) return;
        try {
            await axios.delete(`http://localhost:5000/api/expense-categories/${id}`);
            fetchCategories();
        } catch (err) {
            alert(err.response?.data?.message || '항목 삭제 중 오류가 발생했습니다.');
        }
    };

    // Drag & Drop Handlers
    const dragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = "move";
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
            await axios.put('http://localhost:5000/api/expense-categories/reorder', {
                items: reorderedItems
            });
        } catch (err) {
            console.error('순서 저장 실패:', err);
            // alert('순서 저장에 실패했습니다.'); // UX 방해 최소화
            fetchCategories();
        }
    };

    return (
        <div className="expense-category-management" style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
            {/* 헤더 섹션 */}
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h1 className="page-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>🏷️ 지출 항목 관리</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => openModal()}
                        className="btn btn-primary"
                        style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}
                    >
                        + 항목 추가
                    </button>
                </div>
            </div>

            {error && <div className="error-message" style={{ marginBottom: '1rem', color: '#dc3545' }}>{error}</div>}

            {/* 본문 카드 섹션 */}
            <div className="card" style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>로딩 중...</div>
                ) : (
                    <div className="table-container">
                        <table className="trade-Table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '50px', textAlign: 'center' }}></th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>순서</th>
                                    <th>항목명</th>
                                    <th style={{ width: '100px', textAlign: 'center' }}>상태</th>
                                    <th style={{ width: '150px', textAlign: 'center' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((cat, index) => (
                                    <tr
                                        key={cat.id}
                                        draggable
                                        onDragStart={(e) => dragStart(e, index)}
                                        onDragEnter={(e) => dragEnter(e, index)}
                                        onDragEnd={drop}
                                        onDragOver={(e) => e.preventDefault()}
                                        style={{ cursor: 'move' }}
                                        className="hover-row"
                                    >
                                        <td style={{ textAlign: 'center', color: '#adb5bd' }}>☰</td>
                                        <td style={{ textAlign: 'center' }}>{index + 1}</td>
                                        <td>{cat.name}</td>
                                        <td style={{ textAlign: 'center' }}>
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
                                                {cat.is_active ? '사용 중' : '미사용'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                onClick={() => openModal(cat)}
                                                className="btn btn-sm btn-info"
                                                style={{ marginRight: '5px' }}
                                            >
                                                수정
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cat.id)}
                                                className="btn btn-sm btn-danger"
                                            >
                                                삭제
                                            </button>
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
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="modal-content" style={{
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        width: '400px',
                        maxWidth: '90%',
                        padding: '1.5rem',
                        position: 'relative'
                    }}>
                        <div className="modal-header" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1.5rem',
                            borderBottom: '1px solid #eee',
                            paddingBottom: '1rem'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#2c3e50', fontWeight: '600' }}>
                                {modalData.id ? '항목 수정' : '새 항목 추가'}
                            </h3>
                            <button
                                onClick={closeModal}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '1.5rem',
                                    lineHeight: '1',
                                    color: '#95a5a6',
                                    cursor: 'pointer',
                                    padding: '0'
                                }}
                            >
                                &times;
                            </button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleSave}>
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#34495e' }}>항목명</label>
                                    <input
                                        type="text"
                                        className="trade-input"
                                        value={modalData.name}
                                        onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                                        placeholder="예: 식대, 교통비"
                                        required
                                        autoFocus
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '2rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={closeModal}
                                        style={{ padding: '0.5rem 1rem' }}
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        style={{ padding: '0.5rem 1rem' }}
                                    >
                                        저장
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpenseCategoryManagement;
