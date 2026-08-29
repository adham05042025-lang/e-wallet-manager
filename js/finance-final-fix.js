/* Final finance consistency layer */
(function () {
    'use strict';
    const money = v => `ج.م ${Number(v || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
    const monthKey = () => new Date().toISOString().slice(0, 7);
    const range = month => {
        const [y, m] = month.split('-').map(Number);
        const next = new Date(Date.UTC(y, m, 1));
        return [`${month}-01`, next.toISOString().slice(0, 10)];
    };

    async function report(month) {
        const [start, end] = range(month);
        const [{ data: salaries }, { data: expenses }, { data: daily }, { data: clients }, { data: payments }, { data: adjustments }] = await Promise.all([
            supabaseClient.from('salaries').select('amount').eq('month_year', month).eq('is_received', true),
            supabaseClient.from('expenses').select('amount').eq('month_year', month).eq('is_paid', true),
            supabaseClient.from('daily_expenses').select('amount').gte('created_at', start).lt('created_at', end),
            supabaseClient.from('clients').select('id,total_budget,total_budget_egp,remaining_budget,remaining_budget_egp,currency,exchange_rate,transfer_fee_egp'),
            supabaseClient.from('client_payments').select('client_id,amount_egp,month_year'),
            supabaseClient.from('balance_adjustments').select('amount').eq('month_year', month).order('created_at', { ascending: false }).limit(1)
        ]);
        const salary = (salaries || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const fixed = (expenses || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const dailyTotal = (daily || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const adjustment = adjustments?.[0] ? Number(adjustments[0].amount || 0) : 0;
        const paymentMap = {};
        (payments || []).forEach(p => { paymentMap[p.client_id] = (paymentMap[p.client_id] || 0) + Number(p.amount_egp || 0); });
        const collected = (payments || []).filter(p => p.month_year === month).reduce((s, p) => s + Number(p.amount_egp || 0), 0);
        const receivables = (clients || []).reduce((s, c) => s + Math.max(0, Number(c.remaining_budget_egp ?? c.remaining_budget ?? 0)), 0);
        const movements = typeof getMovementSummary === 'function' ? getMovementSummary() : { cashImpact: 0, customerPending: 0, heldCustomerFunds: 0, loansOutstanding: 0, obligations: 0 };
        // Movement cash impact is displayed as information only. It never changes cash available.
        const available = salary + collected + adjustment - fixed - dailyTotal;
        return `<h3>Comprehensive monthly report — ${month}</h3>
<p><strong>Confirmed salary:</strong> ${money(salary)}</p>
<p><strong>Collected clients:</strong> ${money(collected)}</p>
<p><strong>Pending client receivables:</strong> ${money(receivables)}</p>
<p><strong>Paid fixed expenses:</strong> ${money(fixed)}</p>
<p><strong>Paid recurring obligations:</strong> ${money(typeof recurringPaidExpensesTotal === 'function' ? recurringPaidExpensesTotal(month) : 0)}</p>
<p><strong>Daily expenses:</strong> ${money(dailyTotal)}</p>
<p><strong>Total expenses:</strong> ${money(fixed + dailyTotal + (typeof recurringPaidExpensesTotal === 'function' ? recurringPaidExpensesTotal(month) : 0))}</p>
<p><strong>Customer payments pending:</strong> ${money(movements.customerPending)}</p>
<p><strong>Held customer funds:</strong> ${money(movements.heldCustomerFunds)}</p>
<p><strong>Loans outstanding:</strong> ${money(movements.loansOutstanding)}</p>
<p><strong>My obligations:</strong> ${money(movements.obligations)}</p>
<p><strong>Cash impact from movements:</strong> ${money(movements.cashImpact)}</p>
<p><strong>Balance adjustment:</strong> ${money(adjustment)}</p>
<p><strong>Net available balance:</strong> ${money(available)}</p>
<hr><p class="report-total"><strong>Net available balance:</strong> ${money(available)}</p>`;
    }

    async function render(e) {
        if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
        const box = document.getElementById('report-results');
        if (!box) return;
        const month = document.getElementById('report-month')?.value || monthKey();
        box.innerHTML = '<p>Generating report…</p>';
        try { box.innerHTML = await report(month); } catch (err) { console.error(err); box.innerHTML = `<p class="message-error">${String(err.message || err)}</p>`; }
    }
    window.generateReport = render;
    window.generateFinanceReport = render;
    document.addEventListener('click', e => { if (e.target?.closest?.('#btn-generate-report')) render(e); }, true);
})();
