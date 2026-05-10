import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e7 // 10MB limit for small files via sockets
  });

  const PORT = 3000;

  // Room storage: code -> { clients: Set<string>, lastActivity: number }
  const rooms = new Map<string, { clients: Set<string>; lastActivity: number }>();
  const ROOM_EXPIRY = 30 * 60 * 1000; // 30 minutes

  // Auto-expire rooms
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (now - room.lastActivity > ROOM_EXPIRY) {
        console.log(`Room ${code} expired due to inactivity.`);
        
        // 1. Notify all clients in that room
        io.to(code).emit('room_expired');
        
        // 2. Force all sockets to leave this room explicitly
        io.in(code).socketsLeave(code);
        
        // 3. Clean up internal state
        rooms.delete(code);
      }
    }
  }, 60000);

  function generateCode() {
    let code;
    do {
      code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
  }

  io.on('connection', (socket) => {
    let currentRoom: string | null = null;

    socket.on('create_room', () => {
      const code = generateCode();
      rooms.set(code, { clients: new Set([socket.id]), lastActivity: Date.now() });
      currentRoom = code;
      socket.join(code);
      socket.emit('room_created', code);
      console.log(`User ${socket.id} created room ${code}`);
    });

    socket.on('join_room', (code: string) => {
      console.log(`Join attempt: User ${socket.id} trying to join room ${code}`);
      if (rooms.has(code)) {
        const room = rooms.get(code)!;
        room.clients.add(socket.id);
        room.lastActivity = Date.now();
        currentRoom = code;
        socket.join(code);
        socket.emit('room_joined', code);
        // Notify others
        socket.to(code).emit('user_joined');
        console.log(`Success: User ${socket.id} joined room ${code}`);
      } else {
        console.log(`Fail: Room ${code} not found. Available rooms:`, Array.from(rooms.keys()));
        socket.emit('error_message', 'Room not found or expired');
      }
    });

    socket.on('send_message', (data: any) => {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.lastActivity = Date.now();
        console.log(`Message in ${currentRoom} from ${socket.id}: ${data.type}`);
        socket.to(currentRoom).emit('receive_message', {
          ...data,
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now()
        });
      } else {
        console.log(`Message failed: User ${socket.id} not in a valid room`);
      }
    });

    socket.on('disconnect', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.clients.delete(socket.id);
        if (room.clients.size === 0) {
          // Keep for a bit or delete? Prompt says auto-delete inactive.
          // We'll let the interval handle it or delete immediately if we want "temporary"
          // Let's keep it for a few mins in case of refresh
        } else {
          socket.to(currentRoom).emit('user_left');
        }
      }
    });
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SENDTO Server running on http://localhost:${PORT}`);
  });
}

startServer();
