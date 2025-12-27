const sys = {
    peer: null, uid: null, db: {}, conns: {}, currentChat: null,
    recorder: null, chunks: [], tempFile: null, viewOnce: false,
    localStream: null, currentCall: null,

    init() {
        this.db = JSON.parse(localStorage.getItem('crimson_db') || '{}');
        const session = localStorage.getItem('crimson_session');
        if(session && this.db[session]) {
            this.uid = session;
            this.startApp();
        }
        
        // Listener de Input para trocar Microfone/Enviar
        document.getElementById('msg-input').oninput = (e) => {
            const hasVal = e.target.value.trim().length > 0;
            document.getElementById('btn-audio').classList.toggle('hidden', hasVal);
            document.getElementById('btn-send').classList.toggle('hidden', !hasVal);
        };
    },

    auth(isReg) {
        const id = document.getElementById('auth-id').value.trim().toLowerCase();
        const pass = document.getElementById('auth-pass').value.trim();
        if(!id || !pass) return alert("Preencha tudo");

        if(isReg) {
            if(this.db[id]) return alert("ID já existe");
            this.db[id] = { pass, name: id, pic: "", friends: {}, lastSeen: 'online' };
            this.save();
            alert("Registrado!");
        } else {
            if(!this.db[id] || this.db[id].pass !== pass) return alert("Erro");
            this.uid = id;
            localStorage.setItem('crimson_session', id);
            this.startApp();
        }
    },

    startApp() {
        document.getElementById('auth-screen').style.display = 'none';
        this.peer = new Peer(this.uid);
        
        this.peer.on('open', () => this.updateStatus('online'));
        this.peer.on('connection', conn => this.handleConn(conn));
        this.peer.on('call', call => this.handleCall(call));

        this.updateHeader();
        this.renderHome();
        
        // Corrigir Visto por Último ao fechar aba
        window.addEventListener('beforeunload', () => this.updateStatus(Date.now()));
    },

    updateStatus(val) {
        this.db[this.uid].lastSeen = val;
        this.save();
        Object.values(this.conns).forEach(c => {
            if(c.open) c.send({ type: 'status', val });
        });
    },

    handleConn(conn) {
        this.conns[conn.peer] = conn;
        conn.on('open', () => conn.send({ type: 'status', val: 'online' }));
        conn.on('data', data => this.handleData(conn.peer, data));
        conn.on('close', () => this.db[this.uid].friends[conn.peer].lastSeen = Date.now());
    },

    handleData(sender, data) {
        if(data.type === 'status') {
            if(this.db[this.uid].friends[sender]) {
                this.db[this.uid].friends[sender].lastSeen = data.val;
                if(this.currentChat === sender) this.updateChatHeader(sender);
            }
        }
        if(data.type === 'msg') {
            this.pushMsg(sender, sender, data);
            if(this.currentChat === sender) this.renderMsgs();
            this.renderHome();
        }
    },

    // --- MENSAGENS E MÍDIA ---
    sendText() {
        const input = document.getElementById('msg-input');
        const text = input.value.trim();
        if(!text) return;
        this.broadcast({ type: 'text', content: text });
        input.value = '';
        input.dispatchEvent(new Event('input'));
    },

    broadcast(msgData) {
        const target = this.currentChat;
        const msg = { ...msgData, id: Date.now(), sender: this.uid };
        
        if(this.conns[target] && this.conns[target].open) {
            this.conns[target].send({ type: 'msg', ...msg });
        } else {
            const conn = this.peer.connect(target);
            this.handleConn(conn);
            setTimeout(() => conn.send({ type: 'msg', ...msg }), 1000);
        }

        this.pushMsg(target, this.uid, msg);
        this.renderMsgs();
    },

    pushMsg(chatId, sender, data) {
        if(!this.db[this.uid].friends[chatId]) this.db[this.uid].friends[chatId] = { history: [] };
        this.db[this.uid].friends[chatId].history.push({ ...data, sender });
        this.save();
    },

    // --- ÁUDIO ---
    async startRec() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.recorder = new MediaRecorder(stream);
        this.chunks = [];
        this.recorder.ondataavailable = e => this.chunks.push(e.data);
        this.recorder.onstop = () => this.finishAudio();
        this.recorder.start();
        document.getElementById('btn-audio').style.color = "var(--primary)";
    },

    stopRec() { if(this.recorder) this.recorder.stop(); document.getElementById('btn-audio').style.color = ""; },

    finishAudio() {
        const blob = new Blob(this.chunks, { type: 'audio/ogg' });
        const reader = new FileReader();
        reader.onload = () => this.broadcast({ type: 'audio', content: reader.result });
        reader.readAsDataURL(blob);
    },

    // --- FOTOS / VIDEOS ---
    handleFile(e) {
        const file = e.target.files[0];
        if(!file) return;
        this.tempFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = document.getElementById('preview-content');
            preview.innerHTML = file.type.includes('image') ? `<img src="${ev.target.result}">` : `<video src="${ev.target.result}" controls></video>`;
            document.getElementById('media-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    },

    toggleViewOnce() {
        this.viewOnce = !this.viewOnce;
        document.getElementById('v-once-status').innerText = this.viewOnce ? "ON" : "OFF";
    },

    sendMedia() {
        const reader = new FileReader();
        reader.onload = () => {
            this.broadcast({
                type: this.tempFile.type.includes('image') ? 'image' : 'video',
                content: reader.result,
                viewOnce: this.viewOnce,
                caption: document.getElementById('media-caption').value
            });
            this.cancelMedia();
        };
        reader.readAsDataURL(this.tempFile);
    },

    cancelMedia() {
        document.getElementById('media-preview').classList.add('hidden');
        this.tempFile = null;
        this.viewOnce = false;
        document.getElementById('v-once-status').innerText = "OFF";
    },

    // --- CHAMADAS (ESTILO TELEGRAM) ---
    async call(video) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: video });
        this.localStream = stream;
        const call = this.peer.call(this.currentChat, stream);
        this.setupCallUI(this.currentChat, video);
        this.handleCall(call);
    },

    handleCall(call) {
        this.currentCall = call;
        call.on('stream', remote => {
            document.getElementById('remote-video').srcObject = remote;
            if(!this.localStream) this.setupCallUI(call.peer, false);
        });
        call.on('close', () => this.endCall());
    },

    setupCallUI(id, video) {
        const ui = document.getElementById('call-ui');
        ui.classList.add('active');
        const f = this.db[this.uid].friends[id] || { name: id };
        document.getElementById('call-name-ui').innerText = f.name;
        document.getElementById('call-img').src = f.pic || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        
        if(video) {
            document.getElementById('local-video').classList.remove('hidden');
            document.getElementById('local-video').srcObject = this.localStream;
            document.getElementById('remote-video').style.opacity = "1";
        } else {
            document.getElementById('local-video').classList.add('hidden');
            document.getElementById('remote-video').style.opacity = "0"; // Esconde vídeo na voz
        }
    },

    endCall() {
        if(this.currentCall) this.currentCall.close();
        if(this.localStream) this.localStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-ui').classList.remove('active');
    },

    // --- UTILS ---
    updateChatHeader(id) {
        const f = this.db[this.uid].friends[id];
        document.getElementById('chat-name').innerText = f.name || id;
        const statusEl = document.getElementById('chat-status-text');
        
        if(f.lastSeen === 'online') {
            statusEl.innerText = "Online";
            statusEl.style.color = "#4ade80";
        } else {
            const date = new Date(f.lastSeen);
            statusEl.innerText = `Visto por último: ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
            statusEl.style.color = "var(--text-dim)";
        }
    },

    renderMsgs() {
        const area = document.getElementById('messages');
        area.innerHTML = '';
        const history = this.db[this.uid].friends[this.currentChat].history;
        
        history.forEach((m, idx) => {
            const div = document.createElement('div');
            div.className = `bubble ${m.sender === this.uid ? 'sent' : 'received'}`;
            
            if(m.viewOnce && m.sender !== this.uid) {
                div.innerHTML = `<i class="ri-eye-off-line"></i> Foto de visualização única (Clique)`;
                div.onclick = () => this.openViewOnce(m, idx);
            } else {
                if(m.type === 'text') div.innerText = m.content;
                if(m.type === 'audio') div.innerHTML = `<audio src="${m.content}" controls style="width:200px"></audio>`;
                if(m.type === 'image') div.innerHTML = `<img src="${m.content}" style="max-width:100%; border-radius:8px;"><p>${m.caption || ''}</p>`;
                if(m.type === 'video') div.innerHTML = `<video src="${m.content}" controls style="max-width:100%;"></video>`;
            }
            area.appendChild(div);
        });
        area.scrollTop = area.scrollHeight;
    },

    openViewOnce(m, idx) {
        const preview = document.getElementById('preview-content');
        preview.innerHTML = m.type === 'image' ? `<img src="${m.content}">` : `<video src="${m.content}" autoplay></video>`;
        document.getElementById('media-preview').classList.remove('hidden');
        document.getElementById('view-once-btn').classList.add('hidden');
        
        // Deletar após fechar
        const closeBtn = document.querySelector('.preview-header i');
        const oldClick = closeBtn.onclick;
        closeBtn.onclick = () => {
            this.db[this.uid].friends[this.currentChat].history.splice(idx, 1);
            this.save();
            this.cancelMedia();
            this.renderMsgs();
            closeBtn.onclick = oldClick;
            document.getElementById('view-once-btn').classList.remove('hidden');
        };
    },

    save() { localStorage.setItem('crimson_db', JSON.stringify(this.db)); },
    renderHome() {
        const list = document.getElementById('chat-list');
        list.innerHTML = '';
        Object.keys(this.db[this.uid].friends).forEach(id => {
            const f = this.db[this.uid].friends[id];
            const last = f.history[f.history.length-1]?.content || "Inicie uma conversa";
            const div = document.createElement('div');
            div.className = 'contact-item'; // Adicione estilo no CSS se desejar
            div.style.padding = "20px"; div.style.borderBottom = "1px solid var(--border)";
            div.innerHTML = `<strong>${f.name || id}</strong><br><small style="color:gray">${last.substring(0,30)}</small>`;
            div.onclick = () => this.openChat(id);
            list.appendChild(div);
        });
    },
    openChat(id) { this.currentChat = id; document.getElementById('view-chat').classList.add('active'); this.updateChatHeader(id); this.renderMsgs(); },
    closeChat() { document.getElementById('view-chat').classList.remove('active'); this.currentChat = null; },
    toggleFab() { document.getElementById('fab-menu').classList.toggle('active'); },
    openView(id) { document.getElementById(id).classList.add('active'); },
    closeView(id) { document.getElementById(id).classList.remove('active'); },
    logout() { localStorage.removeItem('crimson_session'); location.reload(); }
};

sys.init();
