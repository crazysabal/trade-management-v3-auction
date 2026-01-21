/**
 * Returns the date string (YYYY-MM-DD) based on local timezone.
 * Unlike toISOString(), this honors the user's local timezone (e.g. KST).
 * @param {Date|number|string} [date] - Date to format. Defaults to now.
 * @returns {string} YYYY-MM-DD
 */
export const formatLocalDate = (date) => {
    const d = date ? new Date(date) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
