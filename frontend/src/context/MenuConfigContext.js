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

                    const userConfig = response.data.menuConfig;
                    const masterGroupMap = new Map(MENU_CONFIG.map(g => [g.id, g]));

                    // Deep Merge:
                    // 1. Process existing groups in user's config to add missing items
                    const integratedConfig = userConfig.map(group => {
                        const masterGroup = masterGroupMap.get(group.id);
                        if (!masterGroup) return group; // Custom or deprecated group

                        // 1. Update existing items with latest label/icon from master
                        const updatedItems = group.items.map(item => {
                            const masterItem = masterGroup.items.find(i => i.id === item.id);
                            if (masterItem) {
                                return { ...item, label: masterItem.label, icon: masterItem.icon };
                            }
                            return item;
                        });

                        // 2. Add missing items from master
                        const userItemIds = new Set(updatedItems.map(i => i.id));
                        const missingItems = masterGroup.items.filter(i => !userItemIds.has(i.id));

                        return {
                            ...group,
                            label: masterGroup.group, // Group label sync
                            icon: masterGroup.icon,   // Group icon sync
                            items: [...updatedItems, ...missingItems]
                        };
                    });

                    // 2. Add entirely new groups from master config
                    const userGroupIds = new Set(userConfig.map(g => g.id));
                    const missingGroups = MENU_CONFIG.filter(g => !userGroupIds.has(g.id));

                    setActiveMenuConfig([...integratedConfig, ...missingGroups]);
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
