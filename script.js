const sys = {
    peer: null, uid: null, db: {}, activeConns: {}, currentChat: null, callStream: null,
    
    init() {
        this.db = JSON.parse(localStorage.getItem('crimson_db')) || { users: {} };
        const session = localStorage.getItem('crimson_session');
        if (session) { this.uid = session; this.startApp(); }
    },

    auth(isReg) {
        const id = document.getElementById('auth-id').value.trim().toLowerCase();
        const pass = document.getElementById('auth-pass').value.trim();
        if (!id || !pass) return alert("Preencha tudo");
        if (isReg) {
            this.db.users[id] = { pass, name: id, pic: '', history: {} };
            this.save(); alert("Criado!");
        } else {
            if (this.db.users[id]?.pass === pass) {
                this.uid = id; localStorage.setItem('crimson_session', id); this.startApp();
            } else alert("Erro!");
        }
    },

    startApp() {
        document.getElementById('auth-screen').style.display = 'none';
        this.peer = new Peer(this.uid);
        
        this.peer.on('connection', c => this.setupConn(c));
        this.peer.on('call', call => this.answerCall(call));
        
        this.updateHeader();
        this.renderHome();
    },

    setupConn(conn) {
        this.activeConns[conn.peer] = conn;
        conn.on('data', data => {
            this.saveMsg(conn.peer, data);
            if(this.currentChat === conn.peer) this.renderMessages();
            this.renderHome();
        });
        conn.on('open', () => { if(this.currentChat === conn.peer) document.getElementById('chat-status').innerText = 'Online'; });
    },

    transmit(payload) {
        if(!this.currentChat) return;
        const msg = { ...payload, sender: this.uid, time: Date.now() };
        
        const conn = this.activeConns[this.currentChat];
        if (conn && conn.open) {
            conn.send(msg);
        } else {
            const newConn = this.peer.connect(this.currentChat);
            this.setupConn(newConn);
            newConn.on('open', () => newConn.send(msg));
        }
        this.saveMsg(this.currentChat, msg);
        this.renderMessages();
    },

    send() {
        const val = document.getElementById('msg-input').value;
        if (!val) return;
        this.transmit({ type: 'text', content: val });
        document.getElementById('msg-input').value = '';
    },

    sendFile() {
        const file = document.getElementById('file-input').files[0];
        const reader = new FileReader();
        reader.onload = () => {
            this.transmit({ type: 'file', content: reader.result, name: file.name, fType: file.type });
        };
        reader.readAsDataURL(file);
    },

    // CHAMADAS
    async call(video) {
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
        this.callStream = stream;
        const ui = document.getElementById('call-ui');
        ui.classList.add('active');
        if(!video) ui.classList.add('voice-mode');
        
        document.getElementById('local-video').srcObject = video ? stream : null;
        const call = this.peer.call(this.currentChat, stream);
        call.on('stream', rs => document.getElementById('remote-video').srcObject = rs);
    },

    answerCall(call) {
        if(confirm("Chamada recebida. Aceitar?")) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(s => {
                this.callStream = s;
                document.getElementById('call-ui').classList.add('active');
                call.answer(s);
                call.on('stream', rs => document.getElementById('remote-video').srcObject = rs);
            });
        }
    },

    endCall() {
        if(this.callStream) this.callStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-ui').classList.remove('active', 'voice-mode');
    },

    // UI & DB
    saveMsg(id, msg) {
        if(!this.db.users[this.uid].history[id]) this.db.users[this.uid].history[id] = [];
        this.db.users[this.uid].history[id].push(msg);
        this.save();
    },
    save() { localStorage.setItem('crimson_db', JSON.stringify(this.db)); },
    renderMessages() {
        const h = this.db.users[this.uid].history[this.currentChat] || [];
        const area = document.getElementById('messages');
        area.innerHTML = h.map(m => `
            <div class="bubble ${m.sender === this.uid ? 'sent' : 'received'}">
                ${m.type === 'file' ? (m.fType.includes('image') ? `<img src="${m.content}" width="100%">` : `📎 ${m.name}`) : m.content}
            </div>
        `).join('');
        area.scrollTop = area.scrollHeight;
    },
    renderHome() {
        const h = this.db.users[this.uid].history;
        document.getElementById('chat-list').innerHTML = Object.keys(h).map(id => `
            <div style="padding:15px; border-bottom:1px solid #222;" onclick="sys.openChat('${id}')">
                <b>${id}</b><br><small>${h[id][h[id].length-1]?.content || 'Mídia'}</small>
            </div>
        `).join('');
    },
    openChat(id) { this.currentChat = id; this.openView('view-chat'); this.renderMessages(); },
    openView(id) { document.getElementById(id).classList.add('active'); },
    closeView(id) { document.getElementById(id).classList.remove('active'); },
    closeChat() { this.currentChat = null; this.closeView('view-chat'); },
    updateHeader() { document.getElementById('header-name').innerText = this.uid; },
    toggleFab() { document.getElementById('fab-menu').classList.toggle('show'); }
};
sys.init();
