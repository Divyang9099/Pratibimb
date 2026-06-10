import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const api = axios.create({ baseURL });

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export const keyStore = {
  get: () => {
    const exp = parseInt(localStorage.getItem('client_key_expires') || '0', 10);
    if (exp && Date.now() > exp) { keyStore.clear(); return ''; }
    return localStorage.getItem('client_key') || '';
  },
  set: (k) => {
    localStorage.setItem('client_key', k);
    localStorage.setItem('client_key_expires', String(Date.now() + SEVEN_DAYS));
  },
  clear: () => {
    localStorage.removeItem('client_key');
    localStorage.removeItem('client_key_expires');
    localStorage.removeItem('client_project');
  },
};

export const pageStore = {
  getProject: () => localStorage.getItem('client_project') || '',
  setProject: (id) => localStorage.setItem('client_project', id),
};

export async function accessWithKey(key) {
  const { data } = await api.post('/client/access', { key });
  return data; // { client, projects }
}

export async function fetchDashboard(projectId, key) {
  const { data } = await api.get(`/client/dashboard/${projectId}`, { params: { key } });
  return data;
}

export async function fetchPhotos(projectId, key) {
  const { data } = await api.get(`/client/photos/${projectId}`, { params: { key } });
  return data.photos;
}
