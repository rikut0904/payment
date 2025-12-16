import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const configEl = document.getElementById('firebase-config');
const config = configEl ? JSON.parse(configEl.textContent) : null;
if (!config) {
  console.warn('Firebase config is missing.');
}
const app = config ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
const bodyDataset = document.body ? document.body.dataset : {};
const skipAuthRedirect = !!(bodyDataset && bodyDataset.skipAuthRedirect === 'true');

const logoutBtn = document.querySelector('#logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      if (auth && auth.currentUser) {
        await signOut(auth);
      }
      await fetch('/logout', { method: 'POST' });
      location.href = '/';
    } catch (err) {
      console.error(err);
      alert('ログアウトに失敗しました。時間をおいて再度お試しください。');
    }
  });
}

function setError(message) {
  const el = document.getElementById('loginError');
  if (el) {
    el.textContent = message || '';
  }
}

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setError('');
      return;
    }

    if (skipAuthRedirect) {
      return;
    }
    const token = await user.getIdToken();
    await fetch('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
    location.href = '/dashboard';
  });
}
