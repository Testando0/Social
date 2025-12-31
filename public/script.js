const sys = {
    socket: null, 
    uid: null, 
    db: {}, 
    conns: {}, 
    currentChat: null,
    recorder: null, 
    chunks: [], 
    tempFile: null, 
    viewOnce: false,
    mediaStream: null,

    init() {
        // Inicializa Banco de Dados Local
        this.db = JSON.parse(localStorage.getItem('crimson_vault') || '{"users":{}}');
        const session = localStorage.getItem('active_session');
        
        // Conecta ao Socket.io do Zeabur
        this.socket = io();

        if(session) {
            this.uid = session;
            this.startSystem();
        }

        // Listeners de Interface
        document.getElementById('msg-input').addEventListener('input', (e) => {
            const val = e.target.value.trim();
            document.getElementById('btn-audio').classList.toggle('hidden', val.length > 0);
            document.getElementById('btn-send').classList.toggle('hidden', val.length === 0);
        });

        // Ouvir mensagens vindas do servidor Zeabur
        this.socket.on('receive_msg', (data) => {
            this.handleIncomingMessage(data);
        });

        console.log("Sistema Crimson Inicializado via Zeabur");
    },

    auth(isReg) {
        const id = document.getElementById('auth-id').value.trim().toLowerCase();
        const pass = document.getElementById('auth-pass').value.trim();
        if(!id || !pass) return alert("Campos Vazios");

        if(isReg) {
            if(this.db.users[id]) return alert("ID já em uso");
            this.db.users[id] = { pass, name: id, pic: "", friends: {}, groups: {}, lastSeen: 'online' };
            this.save();
            alert("Registado com sucesso!");
        } else {
            if(!this.db.users[id] || this.db.users[id].pass !== pass) return alert("Acesso Negado");
            this.uid = id;
            localStorage.setItem('active_session', id);
            this.startSystem();
        }
    },

    startSystem() {
        document.getElementById('auth-screen').classList.remove('active');
        // Regista o ID do utilizador no servidor para receber mensagens direcionadas
        this.socket.emit('register', this.uid);
        this.renderHome();
    },

    // ENVIO DE MENSAGEM VIA ZEABUR
    sendMsg() {
        const input = document.getElementById('msg-input');
        const text = input.value.trim();
        if(!text || !this.currentChat) return;

        const msgData = {
            sender: this.uid,
            to: this.currentChat,
            content: text,
            type: 'text',
            time: new Date().toLocaleTimeString()
        };

        // Envia para o servidor Zeabur distribuir
        this.socket.emit('send_msg', msgData);

        // Salva na memória local
        this.saveMsgLocal(this.currentChat, msgData);
        input.value = '';
        this.renderMsgs();
    },

    handleIncomingMessage(data) {
        // Se a conversa não existir no histórico local, cria
        if(!this.db.users[this.uid].friends[data.sender]) {
            this.addFriend(data.sender, true);
        }

        this.saveMsgLocal(data.sender, data);
        
        if(this.currentChat === data.sender) {
            this.renderMsgs();
        } else {
            // Notificação visual simples
            console.log("Nova mensagem de: " + data.sender);
        }
    },

    saveMsgLocal(targetId, msg) {
        if(!this.db.users[this.uid].friends[targetId]) return;
        this.db.users[this.uid].friends[targetId].history.push(msg);
        this.save();
    },

    addFriend(targetId, auto = false) {
        const id = auto ? targetId : document.getElementById('add-friend-id').value.trim().toLowerCase();
        if(!id || id === this.uid) return;

        if(!this.db.users[this.uid].friends[id]) {
            this.db.users[this.uid].friends[id] = { history: [] };
            this.save();
            this.renderHome();
        }
        if(!auto) this.toggleFab();
    },

    openChat(id) {
        this.currentChat = id;
        document.getElementById('chat-user-name').innerText = id;
        document.getElementById('view-chat').classList.add('active');
        this.renderMsgs();
    },

    closeChat() {
        document.getElementById('view-chat').classList.remove('active');
        this.currentChat = null;
    },

    renderHome() {
        const container = document.getElementById('chat-list');
        container.innerHTML = '';
        const friends = this.db.users[this.uid].friends;
        Object.keys(friends).forEach(id => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.innerHTML = `<div class="avatar"></div><div class="chat-info"><b>${id}</b><p>Clique para conversar</p></div>`;
            div.onclick = () => this.openChat(id);
            container.appendChild(div);
        });
    },

    renderMsgs() {
        const area = document.getElementById('messages');
        area.innerHTML = '';
        const history = this.db.users[this.uid].friends[this.currentChat].history;
        history.forEach(m => {
            const div = document.createElement('div');
            div.className = `bubble ${m.sender === this.uid ? 'sent' : 'received'}`;
            div.innerText = m.content;
            area.appendChild(div);
        });
        area.scrollTop = area.scrollHeight;
    },

    save() {
        localStorage.setItem('crimson_vault', JSON.stringify(this.db));
    },

    toggleFab() {
        const menu = document.getElementById('fab-menu');
        menu.classList.toggle('show');
    }
};

// Iniciar ao carregar a página
window.onload = () => sys.init();
