const CACHE_NAME = 'crimson-v1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

// Listener para disparar notificações vindas do app principal
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PUSH_NOTIF') {
        const options = {
            body: event.data.body,
            icon: 'https://cdn-icons-png.flaticon.com/512/106/106195.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/106/106195.png',
            vibrate: [200, 100, 200],
            data: { url: './' }
        };
        event.waitUntil(
            self.registration.showNotification(event.data.title, options)
        );
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            if (clientList.length > 0) return clientList[0].focus();
            return clients.openWindow('./');
        })
    );
});
