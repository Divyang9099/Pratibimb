import { io } from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5050/api';
// Strip /api or /api/ from the end of the API URL to connect to the socket server
const socketUrl = apiUrl.replace(/\/api\/?$/, '');

export const socket = io(socketUrl, {
  autoConnect: false,
});
