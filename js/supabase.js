const SUPABASE_URL = 'https://cvhgwtjfpwnaergxjldl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Lo0SsmalFrf-fssrccTMig_q4ryBu2K';

// تغيير اسم المتغير لمنع التضارب مع المكتبة الأصلية
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Load finance/task overrides after the normal application scripts have loaded.
document.addEventListener('DOMContentLoaded', () => {
    const load = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${src}?v=20260829-0201`;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
    load('js/finance-fixes.js')
        .then(() => load('js/finance-fixes-patch.js'))
        .catch(error => console.error('Finance fixes failed to load:', error));
});