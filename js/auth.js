// Authentication flow for separate Login and Register screens
// ============================================================

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const btnLogout = document.getElementById('btn-logout');

function setAuthMessage(elementId, message, isError = true) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('message-error', isError && Boolean(message));
    element.classList.toggle('message-success', !isError && Boolean(message));
}

function clearAuthMessages() {
    setAuthMessage('login-message', '');
    setAuthMessage('register-message', '');
}

function showAuthScreen(screen) {
    const showLogin = screen === 'login';
    loginScreen?.classList.toggle('hidden', !showLogin);
    registerScreen?.classList.toggle('hidden', showLogin);
    clearAuthMessages();
    const firstInput = document.getElementById(showLogin ? 'login-email' : 'register-email');
    window.setTimeout(() => firstInput?.focus(), 120);
}

// Check the current session when the page opens.
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) showApp();
    else showAuth();
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) showApp();
    else showAuth();
});

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const button = document.getElementById('btn-login');
    button.disabled = true;
    button.textContent = 'Signing in…';
    setAuthMessage('login-message', 'Checking your account…', false);

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    button.disabled = false;
    button.textContent = 'Sign In';
    if (error) {
        setAuthMessage('login-message', `Could not sign in: ${error.message}`);
        return;
    }
    setAuthMessage('login-message', 'Signed in successfully.', false);
    showApp();
});

registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const button = registerForm.querySelector('button[type="submit"]');

    if (password.length < 6) {
        setAuthMessage('register-message', 'Password must be at least 6 characters.');
        return;
    }
    if (password !== confirmPassword) {
        setAuthMessage('register-message', 'Passwords do not match.');
        return;
    }

    button.disabled = true;
    button.textContent = 'Creating account…';
    setAuthMessage('register-message', 'Creating your account…', false);
    const { error } = await supabaseClient.auth.signUp({ email, password });
    button.disabled = false;
    button.textContent = 'Create Account';

    if (error) {
        setAuthMessage('register-message', `Could not create account: ${error.message}`);
        return;
    }

    const { error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (loginError) {
        setAuthMessage('register-message', 'Account created. Check your email if confirmation is required, then sign in.', false);
        showAuthScreen('login');
        return;
    }
    showApp();
});

document.getElementById('show-register')?.addEventListener('click', () => showAuthScreen('register'));
document.getElementById('show-login')?.addEventListener('click', () => showAuthScreen('login'));

btnLogout?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    showAuth();
});

function showApp() {
    authContainer?.classList.add('hidden');
    appContainer?.classList.remove('hidden');
    if (typeof initializeMovementStorage === 'function') {
        initializeMovementStorage().then(() => {
            if (typeof loadDashboardData === 'function') loadDashboardData();
        });
    } else if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }
}

function showAuth() {
    appContainer?.classList.add('hidden');
    authContainer?.classList.remove('hidden');
    showAuthScreen('login');
}
