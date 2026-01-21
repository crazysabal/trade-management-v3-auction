import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useConfirmModal } from '../components/ConfirmModal';
import { MENU_CONFIG, RESOURCE_METADATA } from '../config/menuConfig';

const RoleManagement = () => {
    const [roles, setRoles] = useState([]);
    const [allPermissions, setAllPermissions] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [newRoleName, setNewRoleName] = useState('');
    const [rolePermissions, setRolePermissions] = useState({}); // { [resource]: { READ: true, ... } }
    const [loading, setLoading] = useState(false);

    const { user, refreshPermissions } = useAuth();
    const { openModal, ConfirmModalComponent } = useConfirmModal();

    // Derive resources list from MENU_CONFIG
    const resources = MENU_CONFIG.map(group => ({
        group: group.group,
        items: group.items.map(item => item.id)
    }));

    // Add extra items not in main menu (e.g., DASHBOARD)
    resources.find(r => r.group === '설정')?.items.push('DASHBOARD', 'MESSAGE_TEST');
    // Ensure uniqueness if needed, but here we just want them visible in permissions
    const seen = new Set();
    resources.forEach(r => {
        r.items = r.items.filter(id => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    });

    // Derive resource names mapping
    const resourceNames = Object.keys(RESOURCE_METADATA).reduce((acc, id) => {
        acc[id] = RESOURCE_METADATA[id].label;
        return acc;
    }, {});

    const actions = ['READ', 'CREATE', 'UPDATE', 'DELETE'];
    const actionNames = { 'READ': '조회', 'CREATE': '등록', 'UPDATE': '수정', 'DELETE': '삭제' };

    useEffect(() => {
        fetchRoles();
        fetchPermissions();
    }, []);

    const fetchRoles = async () => {
        try {
            const response = await axios.get('/api/roles');
            setRoles(response.data);
        } catch (error) {
            console.error('Error fetching roles:', error);
        }
    };

    const fetchPermissions = async () => {
        try {
            const response = await axios.get('/api/roles/permissions');
            setAllPermissions(response.data);
        } catch (error) {
            console.error('Error fetching system permissions:', error);
        }
    };

    const handleRoleSelect = (role) => {
        setSelectedRole(role);
        // Transform permissions array to map for easy lookup
        const permMap = {};
        role.permissions.forEach(p => {
            if (!permMap[p.resource]) permMap[p.resource] = {};
            permMap[p.resource][p.action] = true;
        });
        setRolePermissions(permMap);
    };

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return;
        try {
            await axios.post('/api/roles', { name: newRoleName, description: 'User defined role' });
            setNewRoleName('');
            fetchRoles();
        } catch (error) {
            openModal({
                type: 'warning',
                title: '생성 오류',
                message: error.response?.data?.message || error.message,
                showCancel: false
            });
        }
    };

    const handleDeleteRole = async (roleId) => {
        openModal({
            type: 'delete',
            title: '역할 삭제',
            message: '이 역할을 정말 삭제하시겠습니까?',
            onConfirm: async () => {
                try {
                    await axios.delete(`/api/roles/${roleId}`);
                    if (selectedRole?.id === roleId) setSelectedRole(null);
                    fetchRoles();
                } catch (error) {
                    openModal({
                        type: 'error',
                        title: '삭제 오류',
                        message: error.response?.data?.message || '시스템 역할은 삭제할 수 없습니다.',
                        showCancel: false
                    });
                }
            }
        });
    };

    const togglePermission = (resource, action) => {
        if (!selectedRole) return;

        setRolePermissions(prev => {
            // Create a deep-ish copy to ensure React detects the change
            const next = { ...prev };

            // Resource object must also be copied
            const resourcePerms = { ...(next[resource] || {}) };

            if (resourcePerms[action]) {
                delete resourcePerms[action];
            } else {
                resourcePerms[action] = true;
            }

            next[resource] = resourcePerms;
            return next;
        });
    };

    const toggleAllPermissions = () => {
        if (!selectedRole || (selectedRole.is_system && selectedRole.name === 'Administrator')) return;

        // Check if all are currently checked
        let allChecked = true;
        for (const group of resources) {
            for (const resource of group.items) {
                for (const action of actions) {
                    if (!rolePermissions[resource]?.[action]) {
                        allChecked = false;
                        break;
                    }
                }
                if (!allChecked) break;
            }
            if (!allChecked) break;
        }

        const newPermissions = {};
        if (!allChecked) {
            // Turn ON all
            resources.forEach(group => {
                group.items.forEach(resource => {
                    newPermissions[resource] = {};
                    actions.forEach(action => {
                        newPermissions[resource][action] = true;
                    });
                });
            });
        } else {
            // Turn OFF all - empty object is fine, or explicit false
            // standard state implies missing key = false
        }
        setRolePermissions(newPermissions);
    };

    const handleSavePermissions = async () => {
        if (!selectedRole) return;
        setLoading(true);
        try {
            // Convert map back to list of permission IDs
            const permissionIds = [];

            // Iterate over the map state
            Object.keys(rolePermissions).forEach(resource => {
                Object.keys(rolePermissions[resource]).forEach(action => {
                    if (rolePermissions[resource][action]) {
                        // Find matching permission ID from allPermissions
                        const perm = allPermissions.find(p => p.resource === resource && p.action === action);
                        // If permission doesn't exist in DB yet (e.g. new app added), skip or handle error
                        // Here we assume allPermissions covers it.
                        if (perm) permissionIds.push(perm.id);
                    }
                });
            });

            await axios.put(`/api/roles/${selectedRole.id}`, {
                name: selectedRole.name,
                description: selectedRole.description,
                permissionIds
            });

            openModal({
                type: 'success',
                title: '저장 완료',
                message: '권한 설정이 저장되었습니다.',
                showCancel: false
            });

            // If the role being updated is the current user's role, refresh permissions
            if (user && user.role_id === selectedRole.id) {
                // console.log('Refreshing current user permissions...');
                refreshPermissions();
            }

            fetchRoles(); // Refresh to ensure sync
        } catch (error) {
            console.error('Save failed:', error);
            openModal({
                type: 'error',
                title: '저장 실패',
                message: '권한 저장에 실패했습니다.',
                showCancel: false
            });
        } finally {
            setLoading(false);
        }
    };

    // Styling
    const containerStyle = {
        padding: '0.5rem',
        height: '100%',
        display: 'flex',
        gap: '0.5rem',
        backgroundColor: '#f8f9fa'
    };

    const cardStyle = {
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column'
    };

    const tableHeaderStyle = {
        position: 'sticky',
        top: 0,
        backgroundColor: '#f8f9fa',
        zIndex: 1
    };

    return (
        <div className="main-content" style={{ display: 'flex', gap: '1rem', padding: '1rem', height: '100%', overflow: 'hidden' }}>
            {/* Left Panel: Role List */}
            <div className="card" style={{ width: '300px', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    역할 목록
                    <button className="clickable" onClick={fetchRoles} style={{ border: 'none', background: 'none', fontSize: '1.2rem' }}>
                        🔄
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <input
                        type="text"
                        placeholder="새 역할 명칭"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        className="input-styled"
                        style={{ flex: 1, textAlign: 'left' }}
                    />
                    <button onClick={handleCreateRole} className="btn-sm btn-primary" style={{ height: '40px', width: '40px', padding: 0 }}>
                        ➕
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {roles.map(role => (
                        <div
                            key={role.id}
                            onClick={() => handleRoleSelect(role)}
                            style={{
                                padding: '1rem',
                                borderRadius: '12px',
                                marginBottom: '0.75rem',
                                cursor: 'pointer',
                                backgroundColor: selectedRole?.id === role.id ? '#eff6ff' : '#fff',
                                border: selectedRole?.id === role.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                boxShadow: selectedRole?.id === role.id ? '0 4px 6px -1px rgba(59, 130, 246, 0.1)' : 'none',
                                transition: 'all 0.2s',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 'bold', color: selectedRole?.id === role.id ? '#1e40af' : '#1e293b' }}>{role.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                                    {role.is_system ? '🛡️ 시스템 역할' : '👤 사용자 정의 역할'}
                                </div>
                            </div>
                            {!role.is_system && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
                                    className="clickable"
                                    style={{ border: 'none', background: 'none', color: '#ef4444' }}
                                >
                                    🗑️
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Panel: Permission Matrix */}
            <div className="card" style={{ flex: 1, marginBottom: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center', minHeight: '40px' }}>
                    <div className="card-title" style={{ borderBottom: 'none', marginBottom: 0, flex: 1 }}>
                        {selectedRole ? `권한 설정: ${selectedRole.name}` : '역할을 선택하세요'}
                    </div>
                    {selectedRole && (
                        <div style={{ flex: '0 0 auto', display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={toggleAllPermissions}
                                disabled={selectedRole.is_system && selectedRole.name === 'Administrator'}
                                className="btn btn-outline-secondary"
                                style={{
                                    height: '40px',
                                    padding: '0 1rem',
                                    display: 'flex',
                                    gap: '0.5rem',
                                    alignItems: 'center',
                                    fontWeight: 600,
                                    borderRadius: '8px'
                                }}
                            >
                                ✨ 전체 선택/해제
                            </button>
                            <button
                                onClick={handleSavePermissions}
                                disabled={loading || (selectedRole.is_system && selectedRole.name === 'Administrator')}
                                className="btn btn-primary"
                                style={{
                                    height: '40px',
                                    padding: '0 1.25rem',
                                    display: 'flex',
                                    gap: '0.5rem',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 600,
                                    width: 'fit-content',
                                    borderRadius: '8px'
                                }}
                            >
                                💾 저장
                            </button>
                        </div>
                    )}
                </div>

                <div className="table-container" style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0' }}>
                    <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr style={{ background: '#334155' }}>
                                <th style={{ padding: '0.5rem 1rem', color: '#fff' }}>리소스 (화면/기능)</th>
                                {actions.map(action => (
                                    <th key={action} className="text-center" style={{ padding: '0.5rem 1rem', color: '#fff', width: '120px' }}>
                                        {actionNames[action]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {selectedRole ? resources.map((group, gIdx) => (
                                <React.Fragment key={group.group}>
                                    <tr style={{ backgroundColor: '#f8fafc' }}>
                                        <td colSpan={5} style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                                            🔹 {group.group}
                                        </td>
                                    </tr>
                                    {group.items.map((resource, rIdx) => (
                                        <tr key={resource} style={{ backgroundColor: rIdx % 2 === 0 ? 'white' : '#fcfcfc' }}>
                                            <td style={{ padding: '0.5rem 1rem', color: '#334155', fontWeight: 500 }}>
                                                {resourceNames[resource] || resource}
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '6px', fontWeight: 'normal' }}>
                                                    [{resource}]
                                                </span>
                                            </td>
                                            {actions.map(action => {
                                                const isChecked = rolePermissions[resource]?.[action] || false;
                                                const isDisabled = selectedRole.name === 'Administrator';

                                                return (
                                                    <td key={action} className="text-center" style={{ padding: '0.5rem' }}>
                                                        <label className={`badge-toggle ${isChecked ? 'checked' : ''}`} style={{ opacity: isDisabled ? 0.7 : 1, width: '100%', height: '36px', justifyContent: 'center' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => !isDisabled && togglePermission(resource, action)}
                                                                disabled={isDisabled}
                                                            />
                                                            {isChecked ? 'ON' : 'OFF'}
                                                        </label>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan={5} style={{ padding: '5rem', textAlign: 'center', color: '#94a3b8' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                                        왼쪽 목록에서 역할을 선택하여 상세 권한을 관리하세요.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {ConfirmModalComponent}
        </div>
    );
};

export default RoleManagement;
