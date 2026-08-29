/* Available-to-spend consistency fix */
(function () {
    'use strict';

    const money = value => `ج.م ${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
    const currentMonth = () => new Date().toISOString().slice(0, 7);

    async function calculateAvailable() {
        const month = currentMonth();
        const [{ data: salaries }, { data: payments }, { data: expenses }, { data: daily }, { data: adjustments }] = await Promise.all([
            supabaseClient.from('salaries').select('amount').eq('month_year', month).eq('is_received', true),
            supabaseClient.from('client_payments').select('amount_egp').eq('month_year', month),
            supabaseClient.from('expenses').select('amount').eq('month_year', month).eq('is_paid', true),
            supabaseClient.from('daily_expenses').select('amount').gte('created_at', `${month}-01`).lt('created_at', `${month === '2026-12' ? '2027-01' : (() => { const [y,m]=month.split('-').map(Number); return `${y + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m + 1).padStart(2,'0')}-01`; })()}`),
            supabaseClient.from('balance_adjustments').select('amount').eq('month_year', month).order('created_at', { ascending: false }).limit(1)
        ]);

        const salary = (salaries || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const paymentsTotal = (payments || []).reduce((s, x) => s + Number(x.amount_egp || 0), 0);
        const fixed = (expenses || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const dailyTotal = (daily || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const adjustment = adjustments?.[0] ? Number(adjustments[0].amount || 0) : 0;

        // Available to Spend is the actual cash ledger. Movement summaries are reporting
        // categories and must not be added again here, otherwise cash is double-counted.
        return salary + paymentsTotal + adjustment - fixed - dailyTotal;
    }

    async function refreshAvailable() {
        try {
            const available = await calculateAvailable();
            const el = document.getElementById('dash-available');
            if (el) el.textContent = money(available);
        } catch (error) {
            console.error('Available balance fix:', error);
        }
    }

    function install() {
        refreshAvailable();
        const original = window.loadDashboardData;
        if (typeof original === 'function' && !original.__availableLedgerFix) {
            const wrapped = async function () {
                const result = await original.apply(this, arguments);
                await refreshAvailable();
                return result;
            };
            wrapped.__availableLedgerFix = true;
            window.loadDashboardData = wrapped;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
