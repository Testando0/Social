const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Gerenciamento de usuários conectados
const users = {}; 

io.on('connection', (socket) => {
    socket.on('register', (uid) => {
        users[uid] = socket.id;
        console.log(`Usuário ${uid} registrado no socket ${socket.id}`);
    });

    socket.on('send_msg', (data) => {
        const targetSocket = users[data.to];
        if (targetSocket) {
            io.to(targetSocket).emit('receive_msg', data);
        }
    });

    socket.on('disconnect', () => {
        for (let uid in users) {
            if (users[uid] === socket.id) delete users[uid];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
