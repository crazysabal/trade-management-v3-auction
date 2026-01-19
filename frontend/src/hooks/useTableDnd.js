import { useState, useCallback, useEffect } from 'react';

/**
 * useTableDnd - Reusable hook for Premium Table Drag and Drop
 * 
 * @param {Array} initialItems - Initial list of items
 * @param {Function} onReorder - Callback called after successful reorder (receives newItems)
 * @param {String} dataAttr - Data attribute used to find the dragging element (default: 'data-id')
 */
export const useTableDnd = (initialItems, onReorder, dataAttr = 'data-id') => {
    const [localItems, setLocalItems] = useState(initialItems || []);
    const [columnWidths, setColumnWidths] = useState([]);

    // Sync local state when external items change
    useEffect(() => {
        setLocalItems(initialItems || []);
    }, [initialItems]);

    /**
     * Captures the widths of all cells in the dragging row to prevent layout collapse
     */
    const onDragStart = useCallback((start) => {
        const el = document.querySelector(`[${dataAttr}="${start.draggableId}"]`);
        if (el) {
            const cells = Array.from(el.querySelectorAll('td'));
            const widths = cells.map(cell => {
                const rect = cell.getBoundingClientRect();
                return `${rect.width}px`;
            });
            setColumnWidths(widths);
        }
    }, [dataAttr]);

    /**
     * Handles the movement of items and triggers the reorder callback
     */
    const onDragEnd = useCallback((result) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;

        const newItems = Array.from(localItems);
        const [movedItem] = newItems.splice(result.source.index, 1);
        newItems.splice(result.destination.index, 0, movedItem);

        setLocalItems(newItems);

        if (onReorder) {
            onReorder(newItems);
        }
    }, [localItems, onReorder]);

    return {
        localItems,
        setLocalItems,
        columnWidths,
        onDragStart,
        onDragEnd
    };
};

export default useTableDnd;
