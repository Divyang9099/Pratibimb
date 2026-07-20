import { useEffect, useRef } from 'react';
import { socket } from './socket';

// Subscribe to server-pushed changes for one project.
//
// Two things this handles that a naive useEffect does not:
//
//  1. The socket is created with autoConnect:false, so it has to be opened
//     explicitly. Without this, every listener below is wired to a transport
//     that never connects and no update ever arrives.
//
//  2. Rooms are server-side state and are dropped on every reconnect, so we
//     re-join on each 'connect' rather than only on mount. Otherwise a brief
//     network blip silently ends live updates for the rest of the session —
//     the socket looks healthy but the room membership is gone.

// How many mounted components care about each project room. Without the
// refcount, one component unmounting would emit leave-project and cut off any
// sibling still watching the same project.
const subscribers = new Map();

function joinRoom(projectId) {
  const n = subscribers.get(projectId) || 0;
  subscribers.set(projectId, n + 1);
  if (n === 0) socket.emit('join-project', projectId);
}

function leaveRoom(projectId) {
  const n = subscribers.get(projectId) || 0;
  if (n <= 1) {
    subscribers.delete(projectId);
    socket.emit('leave-project', projectId);
  } else {
    subscribers.set(projectId, n - 1);
  }
}

socket.on('connect', () => {
  for (const projectId of subscribers.keys()) socket.emit('join-project', projectId);
});

// Subscribe to *any* successful mutation on the server, for screens that
// belong to no project room — lists of projects, clients, pilots, users.
// The socket still has to be opened here: a list screen may be the only thing
// mounted, with no project selected at all.
export function useLiveData(onChange) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!socket.connected) socket.connect();
    const handle = () => cb.current();
    socket.on('data-change', handle);
    return () => socket.off('data-change', handle);
  }, []);
}

export function useProjectLive(projectId, onUpdate) {
  // Keep the latest callback without re-subscribing on every render.
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    if (!projectId) return undefined;

    if (!socket.connected) socket.connect();
    joinRoom(projectId);

    const handle = (data) => {
      if (String(data?.projectId) === String(projectId)) cb.current();
    };
    socket.on('project-update', handle);

    return () => {
      socket.off('project-update', handle);
      leaveRoom(projectId);
    };
  }, [projectId]);
}
