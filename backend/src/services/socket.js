import { Server } from 'socket.io';

let io = null;

export function initSocket(server, origins) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, postman)
        if (!origin) return callback(null, true);

        // Check if origin matches allowed origins list
        if (origins.includes(origin)) {
          return callback(null, true);
        }

        // Automatically allow all Vercel deployment URLs and localhost
        const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
        const isVercel = /\.vercel\.app$/.test(origin);

        if (isLocalhost || isVercel) {
          return callback(null, true);
        }

        // If origins array is empty, default to allowing all in development/staging
        if (origins.length === 0) {
          return callback(null, true);
        }

        // Reject otherwise
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`✓ Socket connected: ${socket.id}`);

    socket.on('join-project', (projectId) => {
      if (projectId) {
        socket.join(`project:${projectId}`);
        console.log(`Socket ${socket.id} joined room project:${projectId}`);
      }
    });

    socket.on('leave-project', (projectId) => {
      if (projectId) {
        socket.leave(`project:${projectId}`);
        console.log(`Socket ${socket.id} left room project:${projectId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}

export function notifyProjectUpdate(projectId) {
  if (io && projectId) {
    io.to(`project:${projectId}`).emit('project-update', { projectId });
    console.log(`✓ Socket broadcasted project-update for project:${projectId}`);
  }
}
