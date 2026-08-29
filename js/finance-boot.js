// Finance boot compatibility: these names are called by app.js during initial startup.
// Keep them available synchronously; the full finance fixes load afterward.
(function () {
    'use strict';

    window.formatMoney = window.formatMoney || function (amount) {
        const n = Number(amount || 0);
        return `ج.م ${Number.isFinite(n) ? n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}`;
    };

    window.getMovementSummary = window.getMovementSummary || function () {
        return { cashImpact: 0, customerPending: 0, heldCustomerFunds: 0, loansOutstanding: 0, obligations: 0 };
    };

    window.loadExpenses = window.loadExpenses || async function () {
        const body = document.getElementById('expenses-table-body');
        if (!body || !window.supabaseClient) return;
        const month = new Date().toISOString().slice(0, 7);
        const { data, error } = await window.supabaseClient.from('expenses').select('*').eq('month_year', month).order('id', { ascending: false });
        if (error) { console.error('loadExpenses:', error); return; }
        body.innerHTML = (data || []).map(x => `<tr><td>${String(x.title || x.name || 'Expense')}</td><td>${window.formatMoney(x.amount)}</td><td>${x.due_date || month}</td><td>${x.is_paid ? 'Paid' : 'Pending'}</td><td></td></tr>`).join('');
    };

    window.loadMovements = window.loadMovements || async function () {
        // Movement summaries are supplied by the finance patch; this safe no-op prevents
        // the core dashboard from failing before that patch finishes loading.
        return;
    };
})();
