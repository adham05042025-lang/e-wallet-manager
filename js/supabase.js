const SUPABASE_URL = 'https://cvhgwtjfpwnaergxjldl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Lo0SsmalFrf-fssrccTMig_q4ryBu2K';

// Shared money formatter. app.js uses this during initial rendering.
window.formatMoney = function (amount) {
    const value = Number(amount);
    return `ج.م ${Number.isFinite(value) ? value.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}`;
};

// Must exist synchronously because app.js calls it during initial dashboard rendering.
window.getMovementSummary = function () {
    return {
        cashImpact: 0,
        customerPending: 0,
        heldCustomerFunds: 0,
        loansOutstanding: 0,
        obligations: 0
    };
};

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    const load = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${src}?v=20260829-0345`;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });

    load('js/finance-fixes.js')
        .then(() => load('js/finance-fixes-patch.js'))
        .then(() => load('js/finance-dashboard-fix.js'))
        .catch(error => console.error('Finance fixes failed to load:', error));
});
