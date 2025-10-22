let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.querySelector('[data-install-app]');
  if (btn) btn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  const btn = document.querySelector('[data-install-app]');
  if (btn) btn.style.display = 'none';
  deferredPrompt = null;
});

function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.finally(() => {
    deferredPrompt = null;
    const btn = document.querySelector('[data-install-app]');
    if (btn) btn.style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('[data-install-app]');
  if (btn) btn.addEventListener('click', installApp);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});


