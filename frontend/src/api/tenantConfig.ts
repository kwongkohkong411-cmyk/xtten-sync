import client from './client';

export const getTenantConfig = (companyId?: string) => {
  if (companyId) {
    return client.get('/tenant-config', { params: { companyId } });
  }
  return client.get('/tenant-config');
};

export const upsertTenantConfig = (data: any) =>
  client.patch('/tenant-config', data);
