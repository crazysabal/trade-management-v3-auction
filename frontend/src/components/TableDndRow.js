import React from 'react';
import { createPortal } from 'react-dom';

/**
 * TableDndRow - Simplifies Portal rendering for Table Row DND
 * 
 * @param {Object} provided - DND provided object
 * @param {Object} snapshot - DND snapshot object
 * @param {React.ReactNode} children - The actual table row (AuditRow, CompanyRow, etc.)
 */
const TableDndRow = ({ provided, snapshot, children }) => {
    // Render in portal if dragging or in drop animation
    if (snapshot.isDragging || snapshot.isDropAnimating) {
        return createPortal(
            <table style={{
                tableLayout: 'fixed',
                width: provided.draggableProps.style.width,
                borderCollapse: 'collapse',
                zIndex: 10000
            }}>
                <tbody>
                    {children}
                </tbody>
            </table>,
            document.body
        );
    }

    return children;
};

export default TableDndRow;
