const sys = {
    peer: null, uid: null, db: {}, conns: {}, currentChat: null,
    recorder: null, chunks: [], tempFile: null, viewOnce: false,
    mediaStream: null,

    init() {
        this.db = JSON.parse(localStorage.getItem('crimson_vault') || '{"users":{}}');
        const session = localStorage.getItem('active_session');
        if(session) {
            this.uid = session;
            this.startSystem();
        }

        // Troca de botões Input/Mic
        document.getElementById('msg-input').addEventListener('input', (e) => {
            const val = e.target.value.trim();
            document.getElementById('btn-audio').classList.toggle('hidden', val.length > 0);
            document.getElementById('btn-send').classList.toggle('hidden', val.length === 0);
        });
    },

    auth(isReg) {
        const id = document.getElementById('auth-id').value.trim().toLowerCase();
        const pass = document.getElementById('auth-pass').value.trim();
        if(!id || !pass) return alert("Campos Vazios");

        if(isReg) {
            if(this.db.users[id]) return alert("ID já em uso");
            this.db.users[id] = { pass, name: id, pic: "", friends: {}, groups: {}, lastSeen: 'online' };
            this.save();
        } else {
            if(!this.db.users[id] || this.db.users[id].pass !== pass) return alert("Acesso Negado");
        }
        this.uid = id;
        localStorage.setItem('active_session', id);
        this.startSystem();
    },

    startSystem() {
        document.getElementById('auth-screen').classList.add('hidden');
        this.peer = new Peer(this.uid);
        
        this.peer.on('open', () => {
            this.updateOnline('online');
            this.renderHome();
        });

        this.peer.on('connection', conn => this.setupReceiver(conn));
        
        this.peer.on('call', async call => {
            if(confirm("Chamada recebida. Atender?")) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                call.answer(stream);
                this.handleCallStream(call);
            }
        });
    },

    // --- MENSAGENS ---
    sendText() {
        const input = document.getElementById('msg-input');
        this.emit({ type: 'text', content: input.value });
        input.value = '';
        input.dispatchEvent(new Event('input'));
    },

    emit(msgData) {
        const payload = { ...msgData, id: Date.now(), sender: this.uid };
        const target = this.currentChat;

        if(!this.conns[target]) {
            const conn = this.peer.connect(target);
            this.setupReceiver(conn);
        }
        
        // Timer para garantir conexão aberta antes de enviar
        setTimeout(() => {
            if(this.conns[target] && this.conns[target].open) {
                this.conns[target].send(payload);
            }
        }, 500);

        this.storeMsg(target, payload);
        this.renderMsgs();
    },

    // --- ÁUDIO (SEGURAR PARA FALAR) ---
    async startRec() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.recorder = new MediaRecorder(stream);
            this.chunks = [];
            this.recorder.ondataavailable = e => this.chunks.push(e.data);
            this.recorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: 'audio/ogg' });
                const reader = new FileReader();
                reader.onload = () => this.emit({ type: 'audio', content: reader.result });
                reader.readAsDataURL(blob);
            };
            this.recorder.start();
            document.getElementById('btn-audio').style.color = 'var(--primary)';
        } catch(e) { alert("Sem permissão de Mic"); }
    },

    stopRec() {
        if(this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.stop();
            document.getElementById('btn-audio').style.color = '';
        }
    },

    // --- CHAMADAS ---
    async call(isVideo) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
            this.mediaStream = stream;
            const call = this.peer.call(this.currentChat, stream);
            this.handleCallStream(call, isVideo);
        } catch(e) { alert("Erro ao iniciar mídia"); }
    },

    handleCallStream(call, isVideo) {
        const ui = document.getElementById('call-ui');
        ui.classList.add('active');
        document.getElementById('call-name-ui').innerText = call.peer;

        call.on('stream', remoteStream => {
            document.getElementById('remote-video').srcObject = remoteStream;
            if(isVideo) document.getElementById('remote-video').style.opacity = 1;
        });

        call.on('close', () => this.endCall());
    },

    endCall() {
        if(this.mediaStream) this.mediaStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-ui').classList.remove('active');
    },

    // --- UTILS ---
    save() { localStorage.setItem('crimson_vault', JSON.stringify(this.db)); },
    
    updateOnline(val) {
        this.db.users[this.uid].lastSeen = val;
        this.save();
    },

    setupReceiver(conn) {
        this.conns[conn.peer] = conn;
        conn.on('data', data => {
            this.storeMsg(conn.peer, data);
            if(this.currentChat === conn.peer) this.renderMsgs();
            this.renderHome();
        });
    },

    storeMsg(chatId, data) {
        const me = this.db.users[this.uid];
        if(!me.friends[chatId]) me.friends[chatId] = { history: [] };
        me.friends[chatId].history.push(data);
        this.save();
    },

    openChat(id) {
        this.currentChat = id;
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
            div.innerHTML = `<div class="avatar"></div><div><b>${id}</b></div>`;
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
            if(m.type === 'text') div.innerText = m.content;
            if(m.type === 'audio') div.innerHTML = `<audio src="${m.content}" controls></audio>`;
            area.appendChild(div);
        });
        area.scrollTop = area.scrollHeight;
    },

    toggleFab() {
        document.getElementById('fab-options').classList.toggle('active');
        document.getElementById('fab-icon').classList.toggle('rotate');
    },

    openView(id) { document.getElementById(id).classList.add('active'); }
};

sys.init();
