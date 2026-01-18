import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { MENU_CONFIG } from '../config/menuConfig';

const MenuConfigContext = createContext(null);

export const MenuConfigProvider = ({ children }) => {
    const { user } = useAuth();
    // activeMenuConfig: 실제 렌더링에 사용될 메뉴 구조
    const [activeMenuConfig, setActiveMenuConfig] = useState(MENU_CONFIG);
    const [isLoading, setIsLoading] = useState(true);

    // Load settings from server on mount or user change
    useEffect(() => {
        if (!user) {
            setActiveMenuConfig(MENU_CONFIG);
            setIsLoading(false);
            return;
        }

        const fetchSettings = async () => {
            try {
                const response = await axios.get('/api/user-settings/menu');
                if (response.data.menuConfig) {
                    // Merge logic: Ensure new system menus (not in user config) are preserved or handled
                    // For simplicity in V1, we trust the DB config but ideally should merge with MENU_CONFIG
                    // to support newly added features.

                    // Simple merge for robustness:
                    // 1. Load user config
                    // 2. Check if any 'id' from MENU_CONFIG is missing in user config -> Add it to end
                    const userConfig = response.data.menuConfig;
                    const userGroupIds = new Set(userConfig.map(g => g.id));

                    const missingGroups = MENU_CONFIG.filter(g => !userGroupIds.has(g.id));

                    // Filter items within groups as well if needed, but for now Group Level merge is enough for MVP

                    setActiveMenuConfig([...userConfig, ...missingGroups]);
                } else {
                    setActiveMenuConfig(MENU_CONFIG);
                }
            } catch (error) {
                console.error('Failed to load menu settings:', error);
                setActiveMenuConfig(MENU_CONFIG); // Fallback
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, [user]);

    const saveMenuConfig = async (newConfig) => {
        try {
            await axios.put('/api/user-settings/menu', { menuConfig: newConfig });
            setActiveMenuConfig(newConfig);
            return true;
        } catch (error) {
            console.error('Failed to save menu settings:', error);
            throw error;
        }
    };

    const resetMenuConfig = async () => {
        try {
            // Simply save the default config
            await saveMenuConfig(MENU_CONFIG);
        } catch (error) {
            console.error('Failed to reset menu settings:', error);
        }
    };

    return (
        <MenuConfigContext.Provider value={{
            activeMenuConfig,
            saveMenuConfig,
            resetMenuConfig,
            isLoading,
            defaultConfig: MENU_CONFIG
        }}>
            {children}
        </MenuConfigContext.Provider>
    );
};

export const useMenuConfig = () => useContext(MenuConfigContext);
