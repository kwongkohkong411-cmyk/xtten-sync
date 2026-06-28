import client from './client';

export const getPermissions = () => client.get('/permissions');

export const createPermission = (data: any) => client.post('/permissions', data);

export const deletePermission = (id: string) => client.delete(`/permissions/${id}`);
