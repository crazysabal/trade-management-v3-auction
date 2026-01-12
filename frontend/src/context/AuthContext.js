import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for token in localStorage on init
        const token = localStorage.getItem('token');
        const savedPermissions = localStorage.getItem('permissions');

        if (token) {
            try {
                const decoded = jwtDecode(token);
                // Check simple expiration if available in token
                if (decoded.exp * 1000 < Date.now()) {
                    logout();
                } else {
                    // Restore user with permissions if available
                    const permissions = savedPermissions ? JSON.parse(savedPermissions) : {};
                    setUser({ ...decoded, permissions });

                    // Set default header
                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                }
            } catch (error) {
                console.error("Invalid token", error);
                logout();
            }
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        try {
            const response = await axios.post('/api/auth/login', { username, password });
            const { token, user } = response.data;

            localStorage.setItem('token', token);
            if (user.permissions) {
                localStorage.setItem('permissions', JSON.stringify(user.permissions));
            }

            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(user);
            return { success: true };
        } catch (error) {
            console.error("Login failed", error);
            return {
                success: false,
                message: error.response?.data?.message || '로그인에 실패했습니다.'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('permissions');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    const refreshPermissions = async () => {
        try {
            const response = await axios.get('/api/auth/me');
            const { user: updatedUser } = response.data;
            if (updatedUser.permissions) {
                localStorage.setItem('permissions', JSON.stringify(updatedUser.permissions));
                setUser(prev => ({ ...prev, ...updatedUser }));
            }
        } catch (error) {
            console.error("Permission refresh failed", error);
        }
    };

    // Axios interceptor for 401 handling
    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            response => response,
            error => {
                if (error.response && error.response.status === 401) {
                    logout();
                }
                return Promise.reject(error);
            }
        );
        return () => axios.interceptors.response.eject(interceptor);
    }, []);

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, refreshPermissions, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
