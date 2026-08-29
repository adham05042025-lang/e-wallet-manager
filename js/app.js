// ==========================================
// E-Wallet Core Logic & Dynamic Calculations
// ==========================================

const getCurrentMonthYear = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
};

// 1. Dashboard & Calculations Engine
async function loadDashboardData() {
    const currentMonth = getCurrentMonthYear();

    const { data: salaries } = await supabaseClient.from('salaries').select('amount').eq('month_year', currentMonth).eq('is_received', true);
    const salaryIncome = salaries?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0;

    const { data: clients } = await supabaseClient.from('clients').select('total_budget, remaining_budget, total_budget_egp, remaining_budget_egp, currency');
    const clientsIncome = clients?.reduce((sum, item) => {
        const total = Number(item.total_budget_egp ?? item.total_budget ?? 0);
        const remaining = Number(item.remaining_budget_egp ?? item.remaining_budget ?? 0);
        return sum + (total - remaining);
    }, 0) || 0;
    const clientPendingIncome = clients?.reduce((sum, item) => sum + Number(item.remaining_budget_egp ?? item.remaining_budget ?? 0), 0) || 0;

    const { data: expenses } = await supabaseClient.from('expenses').select('amount').eq('month_year', currentMonth).eq('is_paid', true);
    const paidRecurringExpenses = typeof recurringPaidExpensesTotal === 'function' ? recurringPaidExpensesTotal(currentMonth) : 0;
    const totalFixedExpenses = (expenses?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0) + paidRecurringExpenses;

    const start = `${currentMonth}-01`;
    const [year, month] = currentMonth.split('-').map(Number);
    const next = new Date(year, month, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: dailyExpenses } = await supabaseClient.from('daily_expenses').select('amount').gte('created_at', start).lt('created_at', end);
    const totalDailyExpenses = dailyExpenses?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0;

    const { data: balanceAdjustments } = await supabaseClient.from('balance_adjustments').select('amount').eq('month_year', currentMonth).order('created_at', { ascending: false }).limit(1);
    const balanceAdjustment = balanceAdjustments?.[0] ? Number(balanceAdjustments[0].amount || 0) : 0;

    // Movement cash impact is a reporting metric. It is NOT part of the available-cash
    // ledger, otherwise movement amounts are counted twice.
    const availableToSpend = salaryIncome + clientsIncome + balanceAdjustment - totalFixedExpenses - totalDailyExpenses;

    document.getElementById('dash-salary')?.replaceChildren(document.createTextNode(formatMoney(salaryIncome)));
    document.getElementById('dash-clients-income')?.replaceChildren(document.createTextNode(formatMoney(clientsIncome)));
    document.getElementById('dash-pending-income')?.replaceChildren(document.createTextNode(formatMoney(clientPendingIncome)));
    document.getElementById('dash-expenses')?.replaceChildren(document.createTextNode(formatMoney(totalFixedExpenses)));
    document.getElementById('dash-daily-expenses')?.replaceChildren(document.createTextNode(formatMoney(totalDailyExpenses)));
    document.getElementById('dash-available')?.replaceChildren(document.createTextNode(formatMoney(availableToSpend)));

    const movementSummary = getMovementSummary();
    document.getElementById('dash-customer-payments-pending')?.replaceChildren(document.createTextNode(formatMoney(clientPendingIncome + movementSummary.customerPending)));
    document.getElementById('dash-held-funds')?.replaceChildren(document.createTextNode(formatMoney(movementSummary.heldCustomerFunds)));
    document.getElementById('dash-loans-outstanding')?.replaceChildren(document.createTextNode(formatMoney(movementSummary.loansOutstanding)));
    document.getElementById('dash-obligations')?.replaceChildren(document.createTextNode(formatMoney(movementSummary.obligations)));

    loadDailyExpenses(); loadClients(); loadTasks(); loadExpenses(); loadSalaryForm(); loadMovements();
}

function refreshSectionData(sectionId) {
    if (sectionId === 'sec-dashboard') loadDashboardData();
    if (sectionId === 'sec-clients') loadClients();
    if (sectionId === 'sec-tasks') loadTasks();
    if (sectionId === 'sec-expenses') loadExpenses();
    if (sectionId === 'sec-salary') loadSalaryForm();
    if (sectionId === 'sec-movements') loadMovements();
    if (sectionId === 'sec-reports') generateReport();
}

// Manual adjustment is a TARGET for Available to Spend. Store the delta needed to reach it.
async function setAvailableBalance(targetAmount) {
    const currentMonth = getCurrentMonthYear();
    const target = Number(targetAmount);
    if (!Number.isFinite(target)) return;

    const [{ data: salaries }, { data: clients }, { data: expenses }, { data: daily }, { data: latest }] = await Promise.all([
        supabaseClient.from('salaries').select('amount').eq('month_year', currentMonth).eq('is_received', true),
        supabaseClient.from('clients').select('total_budget,remaining_budget,total_budget_egp,remaining_budget_egp'),
        supabaseClient.from('expenses').select('amount').eq('month_year', currentMonth).eq('is_paid', true),
        supabaseClient.from('daily_expenses').select('amount').gte('created_at', `${currentMonth}-01`),
        supabaseClient.from('balance_adjustments').select('amount').eq('month_year', currentMonth).order('created_at', { ascending: false }).limit(1)
    ]);
    const salary = (salaries || []).reduce((s, x) => s + Number(x.amount || 0), 0);
    const clientCash = (clients || []).reduce((s, x) => s + Number(x.total_budget_egp ?? x.total_budget ?? 0) - Number(x.remaining_budget_egp ?? x.remaining_budget ?? 0), 0);
    const fixed = (expenses || []).reduce((s, x) => s + Number(x.amount || 0), 0);
    const dailyTotal = (daily || []).reduce((s, x) => s + Number(x.amount || 0), 0);
    const currentAdjustment = latest?.[0] ? Number(latest[0].amount || 0) : 0;
    const requiredAdjustment = target - (salary + clientCash + currentAdjustment - fixed - dailyTotal);
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('balance_adjustments').insert([{ amount: currentAdjustment + requiredAdjustment, month_year: currentMonth, created_at: new Date().toISOString(), user_id: user?.id }]);
    if (!error) loadDashboardData(); else console.error('Error adjusting balance:', error);
}

document.getElementById('form-adjust-available')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await setAvailableBalance(document.getElementById('custom-available-input').value);
    document.getElementById('custom-available-input').value = '';
});

// 3. Daily Expenses Operations
document.getElementById('form-daily-expense')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('daily-title').value;
    const amount = Number(document.getElementById('daily-amount').value);
    const { error } = await supabaseClient.from('daily_expenses').insert([{ title, amount, created_at: new Date().toISOString() }]);
    if (!error) { document.getElementById('form-daily-expense').reset(); loadDashboardData(); }
});

async function loadDailyExpenses() {
    const container = document.getElementById('daily-expenses-list');
    if (!container) return;
    const { data } = await supabaseClient.from('daily_expenses').select('*').order('created_at', { ascending: false });
    container.innerHTML = (data || []).map(item => `<div class="expense-item"><div><strong>${item.title}</strong><small>${new Date(item.created_at).toLocaleString('ar-EG')}</small></div><span>${formatMoney(item.amount)}</span></div>`).join('');
}
