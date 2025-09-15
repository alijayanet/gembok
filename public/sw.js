// Service Worker untuk Gembok PWA
const CACHE_NAME = 'gembok-v1.0.0';
const urlsToCache = [
  '/',
  '/admin/dashboard',
  '/admin/analytics',
  '/admin/trouble',
  '/admin/backup',
  '/css/style.css',
  '/css/responsive-admin.css',
  '/js/adminHotspotTable.js',
  '/js/adminMikrotikTable.js',
  '/img/logo.png',
  '/img/logo.svg',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Service Worker: Cache failed', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API calls - always fetch from network
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return response;
        }

        console.log('Service Worker: Fetching from network', event.request.url);
        return fetch(event.request)
          .then((response) => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone response for caching
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch((error) => {
            console.error('Service Worker: Fetch failed', error);
            // Return offline page for navigation requests
            if (event.request.destination === 'document') {
              return caches.match('/admin/dashboard');
            }
          });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'trouble-report-sync') {
    event.waitUntil(syncTroubleReports());
  }
});

// Push notification
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'New notification from Gembok',
    icon: '/img/logo.png',
    badge: '/img/logo.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Details',
        icon: '/img/icon-view.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/img/icon-close.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Gembok Notification', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click received');
  
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/admin/dashboard')
    );
  } else if (event.action === 'close') {
    // Just close the notification
  } else {
    // Default action - open dashboard
    event.waitUntil(
      clients.openWindow('/admin/dashboard')
    );
  }
});

// Helper function untuk sync trouble reports
async function syncTroubleReports() {
  try {
    // Get pending trouble reports from IndexedDB
    const pendingReports = await getPendingTroubleReports();
    
    for (const report of pendingReports) {
      try {
        const response = await fetch('/api/external/trouble-reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'gembok-api-2024'
          },
          body: JSON.stringify(report)
        });

        if (response.ok) {
          // Mark as synced
          await markTroubleReportAsSynced(report.id);
          console.log('Service Worker: Trouble report synced', report.id);
        }
      } catch (error) {
        console.error('Service Worker: Sync failed for report', report.id, error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

// Helper functions untuk IndexedDB (simplified)
async function getPendingTroubleReports() {
  // TODO: Implement IndexedDB operations
  return [];
}

async function markTroubleReportAsSynced(id) {
  // TODO: Implement IndexedDB operations
  console.log('Service Worker: Marking report as synced', id);
}
