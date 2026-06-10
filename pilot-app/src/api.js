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
    const exp = parseInt(localStorage.getItem('pilot_expires') || '0', 10);
    if (exp && Date.now() > exp) { auth.clear(); return null; }
    return localStorage.getItem('pilot_token');
  },
  user: () => {
    const exp = parseInt(localStorage.getItem('pilot_expires') || '0', 10);
    if (exp && Date.now() > exp) { auth.clear(); return null; }
    const raw = localStorage.getItem('pilot_user');
    return raw ? JSON.parse(raw) : null;
  },
  save: (token, user) => {
    localStorage.setItem('pilot_token', token);
    localStorage.setItem('pilot_user', JSON.stringify(user));
    localStorage.setItem('pilot_expires', String(Date.now() + SEVEN_DAYS));
  },
  clear: () => {
    localStorage.removeItem('pilot_token');
    localStorage.removeItem('pilot_user');
    localStorage.removeItem('pilot_expires');
    localStorage.removeItem('pilot_tab');
    localStorage.removeItem('pilot_project');
  },
};

export const pageStore = {
  getTab: () => localStorage.getItem('pilot_tab') || 'start',
  setTab: (t) => localStorage.setItem('pilot_tab', t),
  getProject: () => localStorage.getItem('pilot_project') || '',
  setProject: (id) => localStorage.setItem('pilot_project', id),
};

export async function login(loginId, password) {
  const { data } = await api.post('/auth/login', { loginId, password, expectedRole: 'pilot' });
  auth.save(data.token, data.user);
  return data.user;
}
