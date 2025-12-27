import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import CategoryManager from '../components/Integrated/CategoryManager';
import ProductManager from '../components/Integrated/ProductManager';

import './IntegratedProductManagement.css';

function IntegratedProductManagement({ isWindow }) {
    const location = useLocation();
    const isPopup = location.pathname.startsWith('/popup');

    const [selectedCategory, setSelectedCategory] = useState(null);
    const [leftPanelWidth, setLeftPanelWidth] = useState(400);
    const [isDragging, setIsDragging] = useState(false);

    // Resize Refs to track delta
    const dragStartX = React.useRef(0);
    const dragStartWidth = React.useRef(0);

    // Resize Handlers
    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragStartX.current = e.clientX;
        dragStartWidth.current = leftPanelWidth;
        e.preventDefault();
    };

    React.useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - dragStartX.current;
            const newWidth = Math.max(250, Math.min(800, dragStartWidth.current + deltaX));
            setLeftPanelWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isDragging) setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            document.body.style.cursor = 'auto';
            document.body.style.userSelect = 'auto';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: (isPopup || isWindow) ? '100%' : 'calc(100vh - 60px)' }}>
            {!isPopup && !isWindow && (
                <div className="page-header" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <h1 className="page-title" style={{ margin: 0 }}>📦 품목 관리</h1>
                </div>
            )}
            <div className="integrated-product-management ipm-container">
                {/* Left Panel: Category Management */}
                <div
                    className={`ipm-left-panel ${isDragging ? 'dragging' : ''}`}
                    style={{ width: `${leftPanelWidth}px` }}
                >
                    <CategoryManager
                        onSelectCategory={(category) => setSelectedCategory(category)}
                        selectedCategoryId={selectedCategory?.id}
                    />
                </div>

                {/* Resizer Handle */}
                <div
                    className="ipm-resizer"
                    onMouseDown={handleMouseDown}
                    title="너비 조절"
                >
                    <div className={`ipm-resizer-line ${isDragging ? 'active' : ''}`} />
                </div>

                {/* Right Panel: Product Management */}
                <div className="ipm-right-panel">
                    {/* We pass the selected category ID to filter products */}
                    <ProductManager selectedCategoryId={selectedCategory?.id} />
                </div>
            </div>
        </div>
    );
}

export default IntegratedProductManagement;
