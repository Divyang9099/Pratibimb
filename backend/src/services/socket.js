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

// Global change signal for screens that belong to no project room — the
// admin Projects/Clients/Pilots/Users lists, the pilot's project picker.
// project-update alone can never reach these: they are not scoped to a
// project, so there is no room to deliver into.
export function notifyDataChange(resource) {
  if (!io) return;
  io.emit('data-change', { resource });
  // Logged with the live client count so a "live updates aren't working"
  // report can be diagnosed from the logs alone: 0 clients means nobody was
  // subscribed, which is a very different problem from nothing being sent.
  const clients = io.engine?.clientsCount ?? 0;
  console.log(`✓ data-change → ${clients} client(s) | ${resource}`);
}

// Express middleware: after ANY successful mutating request on the router it
// is mounted on, broadcast a data-change. Registering this once is what makes
// coverage complete — a newly added route cannot silently forget to notify,
// which is exactly how the list screens ended up dead in the first place.
export function broadcastOnMutation(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode < 400) notifyDataChange(`${req.method} ${req.baseUrl}${req.path}`);
  });
  next();
}
