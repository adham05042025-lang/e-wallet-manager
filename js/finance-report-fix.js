/* Finance report fix v1 */
(function () {
    'use strict';

    const money = value => `ج.م ${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
    const monthNow = () => new Date().toISOString().slice(0, 7);
    const monthRange = month => ({ start: `${month}-01`, end: `${month}-32` });

    function netBudgetEGP(client) {
        if (client.currency === 'USD') {
            const stored = Number(client.total_budget_egp);
            if (Number.isFinite(stored) && stored > 0) return stored;
            return Math.max(0, Number(client.total_budget || 0) * Number(client.exchange_rate || 0) - Number(client.transfer_fee_egp || 0));
        }
        return Number(client.total_budget_egp ?? client.total_budget ?? 0);
    }

    async function buildReport(month, type) {
        const range = monthRange(month);
        const [{ data: salaries }, { data: expenses }, { data: daily }, { data: clients }, { data: payments }, { data: adjustments }] = await Promise.all([
            supabaseClient.from('salaries').select('amount').eq('month_year', month).eq('is_received', true),
            supabaseClient.from('expenses').select('amount').eq('month_year', month).eq('is_paid', true),
            supabaseClient.from('daily_expenses').select('amount').gte('created_at', range.start).lt('created_at', range.end),
            supabaseClient.from('clients').select('id,name,total_budget,total_budget_egp,currency,exchange_rate,transfer_fee_egp'),
            supabaseClient.from('client_payments').select('client_id,amount_egp').eq('month_year', month),
            supabaseClient.from('balance_adjustments').select('amount').eq('month_year', month).order('created_at', { ascending: false }).limit(1)
        ]);

        const salary = (salaries || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const fixed = (expenses || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const dailyTotal = (daily || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const recurring = typeof recurringPaidExpensesTotal === 'function' ? recurringPaidExpensesTotal(month) : 0;
        const adjustment = adjustments?.[0] ? Number(adjustments[0].amount || 0) : 0;
        const paymentMap = (payments || []).reduce((m, p) => {
            m[p.client_id] = (m[p.client_id] || 0) + Number(p.amount_egp || 0);
            return m;
        }, {});
        const clientRows = clients || [];
        const collectedClients = clientRows.reduce((s, c) => s + (paymentMap[c.id] || 0), 0);
        const receivables = clientRows.reduce((s, c) => s + Math.max(0, netBudgetEGP(c) - (paymentMap[c.id] || 0)), 0);
        const movements = typeof getMovementSummary === 'function' ? getMovementSummary() : { cashImpact: 0, customerPending: 0, heldCustomerFunds: 0, loansOutstanding: 0, obligations: 0 };
        const available = salary + collectedClients + adjustment + Number(movements.cashImpact || 0) - fixed - recurring - dailyTotal;

        const sections = {
            income: `<p><strong>Confirmed salary:</strong> ${money(salary)}</p><p><strong>Client payments received this month:</strong> ${money(collectedClients)}</p><p><strong>Pending client receivables:</strong> ${money(receivables)}</p>`,
            expenses: `<p><strong>Paid one-time expenses:</strong> ${money(fixed)}</p><p><strong>Paid recurring obligations:</strong> ${money(recurring)}</p><p><strong>Daily expenses:</strong> ${money(dailyTotal)}</p><p><strong>Total expenses:</strong> ${money(fixed + recurring + dailyTotal)}</p>`,
            salary: `<p><strong>Confirmed salary:</strong> ${money(salary)}</p>`,
            clients: `<p><strong>Client payments received:</strong> ${money(collectedClients)}</p><p><strong>Still receivable:</strong> ${money(receivables)}</p><p><strong>Clients tracked:</strong> ${clientRows.length}</p>`,
            movements: `<p><strong>Movement cash impact:</strong> ${money(movements.cashImpact)}</p><p><strong>Customer payments pending:</strong> ${money(movements.customerPending)}</p><p><strong>Held customer funds:</strong> ${money(movements.heldCustomerFunds)}</p><p><strong>Loans outstanding:</strong> ${money(movements.loansOutstanding)}</p><p><strong>My obligations:</strong> ${money(movements.obligations)}</p>`,
            cashflow: `<p><strong>Balance adjustment:</strong> ${money(adjustment)}</p><p><strong>Net available balance:</strong> ${money(available)}</p>`
        };
        const body = type === 'comprehensive'
            ? `${sections.income}${sections.expenses}${sections.movements}${sections.cashflow}`
            : (sections[type] || sections.cashflow);
        return `<h3>Financial report — ${month}</h3>${body}<hr><p class="report-total"><strong>Net available balance:</strong> ${money(available)}</p>`;
    }

    async function renderReport(event) {
        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
        const results = document.getElementById('report-results');
        const month = document.getElementById('report-month')?.value || monthNow();
        const type = document.getElementById('report-type')?.value || 'comprehensive';
        if (!results) return;
        results.innerHTML = '<p>Generating report…</p>';
        try { results.innerHTML = await buildReport(month, type); }
        catch (error) { console.error(error); results.innerHTML = `<p class="message-error">Could not generate report: ${String(error.message || error)}</p>`; }
    }

    function init() {
        document.addEventListener('change', e => {
            if (e.target?.id === 'report-month' || e.target?.id === 'report-type') renderReport(e);
        }, true);
        document.addEventListener('click', e => {
            if (e.target?.closest?.('#btn-generate-report')) renderReport(e);
        }, true);
        window.generateFinanceReport = renderReport;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
