import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import CategoryManager from '../components/Integrated/CategoryManager';
import ProductManager from '../components/Integrated/ProductManager';

function IntegratedProductManagement() {
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

    // Split Pane Style - Modern Dashboard Look
    const containerStyle = {
        display: 'flex',
        height: isPopup ? '100vh' : 'calc(100vh - 120px)',
        overflow: 'hidden',
        backgroundColor: '#f1f5f9', // Soft slate background
        padding: '1.5rem',           // Breathing room
        gap: '0'                     // Gap handled by logic/resizer
    };

    const leftPanelStyle = {
        width: `${leftPanelWidth}px`,
        flexShrink: 0,
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        transition: isDragging ? 'none' : 'width 0.1s ease-out'
    };

    const resizerStyle = {
        width: '12px',
        cursor: 'col-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        zIndex: 10,
        margin: '0 4px'
    };

    const resizerLineStyle = {
        width: '4px',
        height: '40px',
        backgroundColor: isDragging ? '#3b82f6' : '#cbd5e1',
        borderRadius: '2px',
        transition: 'background-color 0.2s'
    };

    const rightPanelStyle = {
        flex: '1',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        minWidth: '400px'
    };

    return (
        <div className="integrated-product-management" style={containerStyle}>
            {/* Left Panel: Category Management */}
            <div style={leftPanelStyle}>
                <CategoryManager
                    onSelectCategory={(category) => setSelectedCategory(category)}
                    selectedCategoryId={selectedCategory?.id}
                />
            </div>

            {/* Resizer Handle */}
            <div
                style={resizerStyle}
                onMouseDown={handleMouseDown}
                title="너비 조절"
            >
                <div style={resizerLineStyle} />
            </div>

            {/* Right Panel: Product Management */}
            <div style={rightPanelStyle}>
                {/* We pass the selected category ID to filter products */}
                <ProductManager selectedCategoryId={selectedCategory?.id} />
            </div>
        </div>
    );
}

export default IntegratedProductManagement;
