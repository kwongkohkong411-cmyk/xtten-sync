import client from './client';

export const getLeaves = () => client.get('/leaves');

export const createLeave = (data: any) => client.post('/leaves', data);

export const updateLeave = (id: string, data: any) => client.put(`/leaves/${id}`, data);
