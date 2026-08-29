/* Correct dashboard cash-flow calculations */
(function () {
    'use strict';

    const money = value => {
        const n = Number(value || 0);
        return `ج.م ${Number.isFinite(n) ? n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}`;
    };

    window.formatMoney = money;

    window.getMovementSummary = window.getMovementSummary || function () {
        return { cashImpact: 0, customerPending: 0, heldCustomerFunds: 0, loansOutstanding: 0, obligations: 0 };
    };

    window.loadDashboardData = async function () {
        const d = new Date();
        const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const start = `${currentMonth}-01`;
        const [year, month] = currentMonth.split('-').map(Number);
        const next = new Date(year, month, 1);
        const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;

        const [salaryRes, paymentRes, clientRes, expenseRes, dailyRes, adjustmentRes] = await Promise.all([
            supabaseClient.from('salaries').select('amount').eq('month_year', currentMonth).eq('is_received', true),
            supabaseClient.from('client_payments').select('amount_egp').eq('month_year', currentMonth),
            supabaseClient.from('clients').select('total_budget,total_budget_egp,remaining_budget,remaining_budget_egp,currency,exchange_rate,transfer_fee_egp,collected_amount'),
            supabaseClient.from('expenses').select('amount').eq('month_year', currentMonth).eq('is_paid', true),
            supabaseClient.from('daily_expenses').select('amount').gte('created_at', start).lt('created_at', end),
            supabaseClient.from('balance_adjustments').select('amount').eq('month_year', currentMonth).order('created_at', { ascending: false }).limit(1)
        ]);

        const salaryIncome = (salaryRes.data || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const payments = paymentRes.data || [];
        let collectedRevenue = payments.reduce((s, x) => s + Number(x.amount_egp || 0), 0);

        // Legacy fallback: if no client_payments rows exist, use the old collected_amount field.
        if (!payments.length) {
            collectedRevenue = (clientRes.data || []).reduce((s, c) => {
                const gross = Number(c.collected_amount || 0);
                if (!gross) return s;
                if (c.currency !== 'USD') return s + gross;
                const rate = Number(c.exchange_rate || 0);
                const fee = Number(c.transfer_fee_egp || 0);
                const budget = Number(c.total_budget || 0);
                const feeShare = budget > 0 ? fee * Math.min(1, gross / budget) : 0;
                return s + Math.max(0, gross * rate - feeShare);
            }, 0);
        }

        const pendingIncome = (clientRes.data || []).reduce((s, c) => {
            const budget = Number(c.total_budget_egp ?? c.total_budget ?? 0);
            const rate = c.currency === 'USD' ? Number(c.exchange_rate || 0) : 1;
            const netBudget = c.currency === 'USD'
                ? (Number(c.total_budget_egp) > 0 ? Number(c.total_budget_egp) : Math.max(0, Number(c.total_budget || 0) * rate - Number(c.transfer_fee_egp || 0)))
                : budget;
            return s + Math.max(0, netBudget);
        }, 0) - collectedRevenue;

        const fixedExpenses = (expenseRes.data || []).reduce((s, x) => s + Number(x.amount || 0), 0)
            + (typeof recurringPaidExpensesTotal === 'function' ? Number(recurringPaidExpensesTotal(currentMonth) || 0) : 0);
        const dailyExpenses = (dailyRes.data || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const adjustment = adjustmentRes.data?.[0] ? Number(adjustmentRes.data[0].amount || 0) : 0;
        const available = salaryIncome + collectedRevenue + adjustment - fixedExpenses - dailyExpenses;

        document.getElementById('dash-salary')?.replaceChildren(document.createTextNode(money(salaryIncome)));
        document.getElementById('dash-clients-income')?.replaceChildren(document.createTextNode(money(collectedRevenue)));
        document.getElementById('dash-pending-income')?.replaceChildren(document.createTextNode(money(Math.max(0, pendingIncome))));
        document.getElementById('dash-expenses')?.replaceChildren(document.createTextNode(money(fixedExpenses)));
        document.getElementById('dash-daily-expenses')?.replaceChildren(document.createTextNode(money(dailyExpenses)));
        document.getElementById('dash-available')?.replaceChildren(document.createTextNode(money(available)));

        const movementSummary = window.getMovementSummary();
        document.getElementById('dash-customer-payments-pending')?.replaceChildren(document.createTextNode(money(Math.max(0, pendingIncome) + Number(movementSummary.customerPending || 0))));
        document.getElementById('dash-held-funds')?.replaceChildren(document.createTextNode(money(movementSummary.heldCustomerFunds)));
        document.getElementById('dash-loans-outstanding')?.replaceChildren(document.createTextNode(money(movementSummary.loansOutstanding)));
        document.getElementById('dash-obligations')?.replaceChildren(document.createTextNode(money(movementSummary.obligations)));

        if (typeof loadDailyExpenses === 'function') loadDailyExpenses();
        if (typeof loadClients === 'function') loadClients();
        if (typeof loadTasks === 'function') loadTasks();
        if (typeof loadExpenses === 'function') loadExpenses();
        if (typeof loadSalaryForm === 'function') loadSalaryForm();
        if (typeof loadMovements === 'function') loadMovements();
    };

    // app.js may have already rendered once; redraw after this fix is installed.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(window.loadDashboardData, 0), { once: true });
    } else {
        setTimeout(window.loadDashboardData, 0);
    }
})();
