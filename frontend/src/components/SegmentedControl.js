import React from 'react';
import './SegmentedControl.css';

/**
 * SegmentedControl - A premium selection control
 * @param {Array} options - Array of { label, value } objects
 * @param {any} value - Current selected value
 * @param {Function} onChange - Callback function when value changes
 * @param {string} className - Optional extra class name
 */
const SegmentedControl = ({ options, value, onChange, className = '' }) => {
    return (
        <div className={`premium-segmented-control ${className}`}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={`segmented-item ${value === option.value ? 'is-active' : ''}`}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
            <div
                className="segmented-slider"
                style={{
                    width: `${100 / options.length}%`,
                    transform: `translateX(${options.findIndex(opt => opt.value === value) * 100}%)`
                }}
            />
        </div>
    );
};

export default SegmentedControl;
