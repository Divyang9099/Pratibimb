import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = auth.token();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export const auth = {
  token: () => {
    const exp = parseInt(localStorage.getItem('admin_expires') || '0', 10);
    if (exp && Date.now() > exp) { auth.clear(); return null; }
    return localStorage.getItem('admin_token');
  },
  user: () => {
    const exp = parseInt(localStorage.getItem('admin_expires') || '0', 10);
    if (exp && Date.now() > exp) { auth.clear(); return null; }
    const raw = localStorage.getItem('admin_user');
    return raw ? JSON.parse(raw) : null;
  },
  save: (token, user) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    localStorage.setItem('admin_expires', String(Date.now() + SEVEN_DAYS));
  },
  clear: () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('admin_expires');
    localStorage.removeItem('admin_section');
  },
};

export const pageStore = {
  getSection: () => localStorage.getItem('admin_section') || 'projects',
  setSection: (s) => localStorage.setItem('admin_section', s),
};

export async function login(loginId, password) {
  const { data } = await api.post('/auth/login', { loginId, password, expectedRole: 'admin' });
  auth.save(data.token, data.user);
  return data.user;
}
