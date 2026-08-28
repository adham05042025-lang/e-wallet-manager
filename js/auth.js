// ==========================================
// إدارة التوثيق وتسجيل الدخول (Supabase Auth)
// ==========================================

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authMessage = document.getElementById('auth-message');
const btnSignup = document.getElementById('btn-signup');
const btnLogout = document.getElementById('btn-logout');

// 1. فحص حالة المستخدم والتأكد من الجلسة عند فتح الصفحة
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        showApp();
    } else {
        showAuth();
    }
});

// الاستماع لتغير حالة التوثيق
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) {
        showApp();
    } else {
        showAuth();
    }
});

// 2. تسجيل الدخول
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authMessage.textContent = 'جاري التحقق...';

    const email = authEmail.value.trim();
    const password = authPassword.value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        authMessage.textContent = `خطأ: ${error.message}`;
    } else {
        authMessage.textContent = '';
        showApp();
    }
});

// 3. إنشاء حساب جديد
btnSignup.addEventListener('click', async (e) => {
    e.preventDefault();
    authMessage.textContent = 'جاري إنشاء الحساب...';

    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
        authMessage.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور أولاً.';
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
    });

    if (error) {
        authMessage.textContent = `خطأ: ${error.message}`;
    } else {
        const { error: loginError } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (loginError) {
            authMessage.textContent = 'تم إنشاء الحساب بنجاح!';
        } else {
            authMessage.textContent = '';
            showApp();
        }
    }
});

// 4. تسجيل الخروج
btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    showAuth();
});

// 5. دوال مساعدة لإظهار/إخفاء الشاشات
function showApp() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    if (typeof initializeMovementStorage === 'function') {
        initializeMovementStorage().then(() => {
            if (typeof loadDashboardData === 'function') loadDashboardData();
        });
    } else if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }
}

function showAuth() {
    appContainer.classList.add('hidden');
    authContainer.classList.remove('hidden');
}