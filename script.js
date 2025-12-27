const sys = {
    peer: null, uid: null, db: {}, conns: {}, currentChat: null,
    recorder: null, chunks: [], tempFile: null, viewOnce: false,
    localStream: null, incomingCall: null, isVideo: false,

    init() {
        this.db = JSON.parse(localStorage.getItem('crimson_db') || '{}');
        const session = localStorage.getItem('crimson_session');
        if(session && this.db[session]) {
            this.uid = session;
            this.startApp();
        } else {
            document.getElementById('auth-screen').style.display = 'flex';
        }
        document.getElementById('msg-input').oninput = (e) => {
            const hasVal = e.target.value.trim().length > 0;
            document.getElementById('btn-audio').classList.toggle('hidden', hasVal);
            document.getElementById('btn-send').classList.toggle('hidden', !hasVal);
        };
    },

    auth(isReg) {
        const id = document.getElementById('auth-id').value.trim().toLowerCase();
        const pass = document.getElementById('auth-pass').value.trim();
        if(isReg) {
            if(this.db[id]) return alert("ID já existe");
            this.db[id] = { pass, name: id, bio: "Crimson User", pic: "", friends: {}, groups: {}, lastSeen: 'online' };
            this.save();
            alert("Criado!");
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
        this.peer.on('open', () => this.updateOnlineStatus('online'));
        this.peer.on('connection', c => this.setupConn(c));
        this.peer.on('call', call => { if(confirm("Atender chamada?")) this.answerCall(call); });
        this.updateHeader();
        this.renderHome();
        window.onbeforeunload = () => this.updateOnlineStatus(Date.now());
    },

    updateOnlineStatus(val) {
        if(!this.db[this.uid]) return;
        this.db[this.uid].lastSeen = val;
        this.save();
        Object.values(this.conns).forEach(c => { if(c.open) c.send({ type: 'status', val }); });
    },

    setupConn(conn) {
        this.conns[conn.peer] = conn;
        conn.on('data', d => {
            if(d.type === 'status' && this.db[this.uid].friends[conn.peer]) {
                this.db[this.uid].friends[conn.peer].lastSeen = d.val;
                if(this.currentChat === conn.peer) this.updateChatHeader(conn.peer);
            }
            if(d.type === 'msg') {
                this.pushMsg(conn.peer, conn.peer, d);
                if(this.currentChat === conn.peer) this.renderMsgs();
                this.renderHome();
            }
        });
    },

    // --- MENSAGENS E MÍDIA ---
    send() {
        const input = document.getElementById('msg-input');
        this.broadcast({ type: 'text', content: input.value });
        input.value = '';
        input.dispatchEvent(new Event('input'));
    },

    broadcast(msg) {
        const payload = { ...msg, id: Date.now(), sender: this.uid };
        const target = this.currentChat;
        if(this.conns[target] && this.conns[target].open) {
            this.conns[target].send({ type: 'msg', ...payload });
        }
        this.pushMsg(target, this.uid, payload);
        this.renderMsgs();
        this.renderHome();
    },

    pushMsg(chatId, sender, data) {
        if(chatId.startsWith('group_')) {
            this.db[this.uid].groups[chatId].history.push({...data, sender});
        } else {
            if(!this.db[this.uid].friends[chatId]) this.db[this.uid].friends[chatId] = { history: [], lastSeen: 0 };
            this.db[this.uid].friends[chatId].history.push({...data, sender});
        }
        this.save();
    },

    // --- AUDIO ---
    async startRec() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.recorder = new MediaRecorder(stream);
        this.chunks = [];
        this.recorder.ondataavailable = e => this.chunks.push(e.data);
        this.recorder.onstop = () => {
            const blob = new Blob(this.chunks, { type: 'audio/ogg' });
            const reader = new FileReader();
            reader.onload = () => this.broadcast({ type: 'audio', content: reader.result });
            reader.readAsDataURL(blob);
        };
        this.recorder.start();
        document.getElementById('btn-audio').style.color = 'var(--primary)';
    },
    stopRec() { if(this.recorder) this.recorder.stop(); document.getElementById('btn-audio').style.color = ''; },

    // --- FOTOS/VIDEOS ---
    handleFile(e) {
        this.tempFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            const disp = document.getElementById('preview-display');
            disp.innerHTML = this.tempFile.type.includes('image') ? `<img src="${ev.target.result}" style="max-width:90%">` : `<video src="${ev.target.result}" controls style="max-width:90%"></video>`;
            document.getElementById('media-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(this.tempFile);
    },

    toggleViewOnce() { this.viewOnce = !this.viewOnce; document.getElementById('v-once-txt').innerText = this.viewOnce ? "ON" : "OFF"; },
    
    sendMedia() {
        const reader = new FileReader();
        reader.onload = () => {
            this.broadcast({ type: this.tempFile.type.includes('image') ? 'image' : 'video', content: reader.result, viewOnce: this.viewOnce });
            this.cancelMedia();
        };
        reader.readAsDataURL(this.tempFile);
    },
    cancelMedia() { document.getElementById('media-preview').classList.add('hidden'); this.viewOnce = false; },

    // --- CHAMADAS ---
    async call(video) {
        this.isVideo = video;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: video });
        this.localStream = stream;
        const call = this.peer.call(this.currentChat, stream);
        this.setupCallUI(this.currentChat);
        call.on('stream', rem => { document.getElementById('remote-video').srcObject = rem; if(video) document.getElementById('remote-video').style.opacity = 1; });
    },

    async answerCall(call) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.localStream = stream;
        call.answer(stream);
        this.setupCallUI(call.peer);
        call.on('stream', rem => { document.getElementById('remote-video').srcObject = rem; });
    },

    setupCallUI(id) {
        const ui = document.getElementById('call-ui');
        ui.classList.add('active');
        const f = this.db[this.uid].friends[id] || { name: id };
        document.getElementById('voice-call-name').innerText = f.name;
        document.getElementById('voice-call-img').src = f.pic || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    },

    endCall() {
        if(this.localStream) this.localStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-ui').classList.remove('active');
    },

    // --- UI RENDER ---
    renderMsgs() {
        const area = document.getElementById('messages');
        area.innerHTML = '';
        const chat = this.currentChat.startsWith('group_') ? this.db[this.uid].groups[this.currentChat] : this.db[this.uid].friends[this.currentChat];
        chat.history.forEach((m, i) => {
            const div = document.createElement('div');
            div.className = `bubble ${m.sender === this.uid ? 'sent' : 'received'}`;
            if(m.viewOnce && m.sender !== this.uid) {
                div.innerHTML = `<i>👁 Visualização Única (Clique)</i>`;
                div.onclick = () => { 
                    const p = document.getElementById('preview-display');
                    p.innerHTML = m.type === 'image' ? `<img src="${m.content}" style="max-width:90%">` : `<video src="${m.content}" autoplay style="max-width:90%"></video>`;
                    document.getElementById('media-preview').classList.remove('hidden');
                    chat.history.splice(i, 1); this.save(); 
                };
            } else {
                if(m.type === 'text') div.innerText = m.content;
                if(m.type === 'audio') div.innerHTML = `<audio src="${m.content}" controls style="width:200px"></audio>`;
                if(m.type === 'image') div.innerHTML = `<img src="${m.content}" style="max-width:100%; border-radius:8px;">`;
                if(m.type === 'video') div.innerHTML = `<video src="${m.content}" controls style="max-width:100%;"></video>`;
            }
            area.appendChild(div);
        });
        area.scrollTop = area.scrollHeight;
    },

    renderHome() {
        const list = document.getElementById('chat-list');
        list.innerHTML = '';
        [...Object.keys(this.db[this.uid].friends), ...Object.keys(this.db[this.uid].groups)].forEach(id => {
            const isGrp = id.startsWith('group_');
            const data = isGrp ? this.db[this.uid].groups[id] : this.db[this.uid].friends[id];
            const div = document.createElement('div');
            div.style.padding = '15px'; div.style.borderBottom = '1px solid var(--border)';
            div.innerHTML = `<strong>${data.name || id}</strong>`;
            div.onclick = () => this.openChat(id);
            list.appendChild(div);
        });
    },

    // --- RE-IMPLEMENTANDO FUNÇÕES DE GRUPO DO USUÁRIO ---
    renderCreateGroup() {
        const list = document.getElementById('group-contact-list');
        list.innerHTML = '';
        this.selectedGroupMembers = [];
        Object.keys(this.db[this.uid].friends).forEach(id => {
            const f = this.db[this.uid].friends[id];
            const div = document.createElement('div');
            div.style.padding = '10px'; div.innerHTML = `<input type="checkbox" value="${id}"> ${f.name || id}`;
            div.onclick = (e) => {
                const cb = div.querySelector('input');
                if(e.target !== cb) cb.checked = !cb.checked;
                if(cb.checked) this.selectedGroupMembers.push(id);
                else this.selectedGroupMembers = this.selectedGroupMembers.filter(m => m !== id);
            };
            list.appendChild(div);
        });
    },

    createGroup() {
        const name = document.getElementById('group-name-input').value;
        const gid = 'group_' + Date.now();
        this.db[this.uid].groups[gid] = { name, members: [this.uid, ...this.selectedGroupMembers], history: [] };
        this.save(); this.renderHome(); this.closeView('view-create-group');
    },

    openChat(id) { 
        this.currentChat = id; 
        document.getElementById('view-chat').classList.add('active'); 
        this.updateChatHeader(id); this.renderMsgs(); 
        if(!id.startsWith('group_')) {
            const conn = this.peer.connect(id);
            this.setupConn(conn);
        }
    },

    updateChatHeader(id) {
        const isGrp = id.startsWith('group_');
        const f = isGrp ? this.db[this.uid].groups[id] : this.db[this.uid].friends[id];
        document.getElementById('chat-name').innerText = f.name || id;
        const st = document.getElementById('chat-status-text');
        if(isGrp) st.innerText = `${f.members.length} membros`;
        else {
            if(f.lastSeen === 'online') { st.innerText = 'Online'; st.style.color = 'var(--primary)'; }
            else { 
                const d = new Date(f.lastSeen); 
                st.innerText = f.lastSeen ? `Visto ${d.getHours()}:${d.getMinutes()}` : 'Desconhecido';
                st.style.color = '';
            }
        }
    },

    save() { localStorage.setItem('crimson_db', JSON.stringify(this.db)); },
    openView(id) { if(id === 'view-create-group') this.renderCreateGroup(); document.getElementById(id).classList.add('active'); },
    closeView(id) { document.getElementById(id).classList.remove('active'); },
    closeChat() { this.currentChat = null; document.getElementById('view-chat').classList.remove('active'); },
    toggleFab() { document.getElementById('fab-menu').classList.toggle('show'); },
    updateHeader() { 
        const me = this.db[this.uid];
        document.getElementById('header-name').innerText = me.name;
        document.getElementById('header-av').innerHTML = me.pic ? `<img src="${me.pic}">` : me.name[0].toUpperCase();
    },
    saveProfile() {
        this.db[this.uid].name = document.getElementById('edit-name').value;
        this.db[this.uid].bio = document.getElementById('edit-bio').value;
        this.db[this.uid].pic = document.getElementById('edit-pic').value;
        this.save(); this.updateHeader(); this.closeView('view-me');
    },
    addContact() {
        const id = document.getElementById('target-id').value.toLowerCase();
        if(!this.db[this.uid].friends[id]) this.db[this.uid].friends[id] = { name: id, history: [], lastSeen: 0 };
        this.save(); this.renderHome(); this.closeView('view-add');
    },
    logout() { localStorage.removeItem('crimson_session'); location.reload(); }
};

sys.init();
