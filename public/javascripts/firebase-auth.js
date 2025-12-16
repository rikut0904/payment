import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const config = JSON.parse(document.getElementById('firebase-config').textContent);
const app = initializeApp(config);
const auth = getAuth(app);

document.querySelector('#loginBtn').addEventListener('click', () => {
    signInWithPopup(auth, new GoogleAuthProvider());
});
document.querySelector('#logoutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
    location.href = '/dashboard';
});