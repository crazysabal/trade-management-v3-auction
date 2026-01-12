import { useAuth } from '../context/AuthContext';

export const usePermission = () => {
    const { user } = useAuth();

    /**
     * Check if user has permission for a specific resource and action
     * @param {string} resource - The resource key (e.g., 'TRADE_LIST', 'USER_MANAGEMENT')
     * @param {string} action - The action (e.g., 'READ', 'CREATE', 'UPDATE', 'DELETE') - Defaults to 'READ' if omitted
     * @returns {boolean}
     */
    const hasPermission = (resource, action = 'READ') => {
        if (!user) return false;

        // System Admin Bypass (optional, but good for safety)
        if (user.role === 'admin' || user.role === 'Administrator') return true;

        if (!user.permissions) return false;

        const resourcePermissions = user.permissions[resource];
        if (!resourcePermissions) return false;

        return resourcePermissions.includes(action);
    };

    return { hasPermission };
};
