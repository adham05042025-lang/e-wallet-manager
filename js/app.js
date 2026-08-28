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

    // 1. Fixed Salary (المرتبات المقبوضة)
    const { data: salaries } = await supabaseClient
        .from('salaries')
        .select('amount')
        .eq('month_year', currentMonth)
        .eq('is_received', true);

    const salaryIncome =
        salaries?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    // 2. Clients Income (المبالغ المحصلة فعلياً = Total Budget - Remaining Budget)
    const { data: clients } = await supabaseClient
        .from('clients')
        .select('total_budget, remaining_budget');

    const clientsIncome =
        clients?.reduce((sum, item) => {
            const total = Number(item.total_budget || 0);
            const remaining = Number(item.remaining_budget || 0);
            return sum + (total - remaining);
        }, 0) || 0;

    const clientPendingIncome =
        clients?.reduce((sum, item) => sum + Number(item.remaining_budget || 0), 0) || 0;

    // 3. Paid Fixed Expenses (المصروفات الثابتة المدفوعة)
    const { data: expenses } = await supabaseClient
        .from('expenses')
        .select('amount')
        .eq('month_year', currentMonth)
        .eq('is_paid', true);

    const paidRecurringExpenses = typeof recurringPaidExpensesTotal === 'function'
        ? recurringPaidExpensesTotal(currentMonth)
        : 0;
    const totalFixedExpenses =
        (expenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0) + paidRecurringExpenses;

    // 4. Daily Expenses Total (إجمالي المصروفات اليومية للشهر)
    const { data: dailyExpenses } = await supabaseClient
        .from('daily_expenses')
        .select('amount')
        .gte('created_at', `${currentMonth}-01`);

    const totalDailyExpenses =
        dailyExpenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    // 5. Manual Balance Adjustment (تعديل الرصيد المخصص)
    const { data: balanceAdjustments } = await supabaseClient
        .from('balance_adjustments')
        .select('amount')
        .eq('month_year', currentMonth)
        .order('created_at', { ascending: false })
        .limit(1);

    const balanceAdjustment =
        balanceAdjustments?.[0]
            ? Number(balanceAdjustments[0].amount)
            : 0;

    const movementSummary = getMovementSummary();

    // المتاح يعكس فقط الحركات التي أثرت فعليًا على النقد الموجود.
    const availableToSpend =
        (salaryIncome + clientsIncome + balanceAdjustment + movementSummary.cashImpact) -
        (totalFixedExpenses + totalDailyExpenses);

    // Update Dashboard UI Cards
    if (document.getElementById('dash-salary'))
        document.getElementById('dash-salary').textContent = formatMoney(salaryIncome);

    if (document.getElementById('dash-clients-income'))
        document.getElementById('dash-clients-income').textContent = formatMoney(clientsIncome);
    if (document.getElementById('dash-pending-income'))
        document.getElementById('dash-pending-income').textContent = formatMoney(clientPendingIncome);

    if (document.getElementById('dash-expenses'))
        document.getElementById('dash-expenses').textContent = formatMoney(totalFixedExpenses);

    if (document.getElementById('dash-daily-expenses'))
        document.getElementById('dash-daily-expenses').textContent = formatMoney(totalDailyExpenses);

    if (document.getElementById('dash-available'))
        document.getElementById('dash-available').textContent = formatMoney(availableToSpend);

    if (document.getElementById('dash-customer-payments-pending'))
        document.getElementById('dash-customer-payments-pending').textContent = formatMoney(clientPendingIncome + movementSummary.customerPending);
    if (document.getElementById('dash-held-funds'))
        document.getElementById('dash-held-funds').textContent = formatMoney(movementSummary.heldCustomerFunds);
    if (document.getElementById('dash-loans-outstanding'))
        document.getElementById('dash-loans-outstanding').textContent = formatMoney(movementSummary.loansOutstanding);
    if (document.getElementById('dash-obligations'))
        document.getElementById('dash-obligations').textContent = formatMoney(movementSummary.obligations);

    // Load Tabular Views
    loadDailyExpenses();
    loadClients();
    loadTasks();
    loadExpenses();
    loadSalaryForm();
    loadMovements();
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

// 2. Dynamic Available Balance Manual Adjustment
async function setAvailableBalance(targetAmount) {
    const currentMonth = getCurrentMonthYear();
    const target = Number(targetAmount);

    if (isNaN(target)) return;

    const { error } = await supabaseClient
        .from('balance_adjustments')
        .insert([{
            amount: target,
            month_year: currentMonth,
            created_at: new Date().toISOString()
        }]);

    if (!error) {
        loadDashboardData();
    } else {
        console.error('Error adjusting balance:', error);
    }
}

document.getElementById('form-adjust-available')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetValue = document.getElementById('custom-available-input').value;
    await setAvailableBalance(targetValue);
    document.getElementById('custom-available-input').value = '';
});

// 3. Daily Expenses Operations
document.getElementById('form-daily-expense')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('daily-title').value;
    const amount = Number(document.getElementById('daily-amount').value);

    const { error } = await supabaseClient.from('daily_expenses').insert([{
        title,
        amount,
        created_at: new Date().toISOString()
    }]);

    if (!error) {
        document.getElementById('form-daily-expense').reset();
        loadDashboardData();
    }
});

async function loadDailyExpenses() {
    const todayDate = new Date().toISOString().split('T')[0];
    const { data: dailyList } = await supabaseClient
        .from('daily_expenses')
        .select('*')
        .gte('created_at', todayDate)
        .order('id', { ascending: false });

    const tbody = document.getElementById('daily-expenses-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    dailyList?.forEach(item => {
        const time = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        tbody.innerHTML += `
            <tr>
                <td>${item.title}</td>
                <td style="color: var(--danger); font-weight: bold;">${formatMoney(item.amount)}</td>
                <td>${time}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; width: auto;" onclick="deleteDailyExpense(${item.id})">Delete</button>
                </td>
            </tr>
        `;
    });
}

async function deleteDailyExpense(id) {
    if (confirm('Delete this daily expense entry?')) {
        await supabaseClient.from('daily_expenses').delete().eq('id', id);
        loadDashboardData();
    }
}

// 4. Clients & Receivables Module (تحصيل جزئي أو كلي)
async function loadClients() {
    const { data: clients, error } = await supabaseClient.from('clients').select('*').order('id', { ascending: false });
    if (error) return console.error(error);

    const tbody = document.getElementById('clients-table-body');
    const selectClient = document.getElementById('task-client-id');
    const pendingIncomeEl = document.getElementById('total-pending-income');

    if (tbody) tbody.innerHTML = '';
    if (selectClient) selectClient.innerHTML = '<option value="">Select Client...</option>';

    let pendingTotal = 0;

    clients?.forEach(client => {
        const remaining = Number(client.remaining_budget || 0);
        const isPending = client.is_collected === false && remaining > 0;

        if (isPending) {
            pendingTotal += remaining;
        }

        if (tbody) {
            tbody.innerHTML += `
                <tr>
                    <td>${client.name}</td>
                    <td>${formatMoney(client.total_budget)}</td>
                    <td><strong>${formatMoney(remaining)}</strong></td>
                    <td>
                        <span class="status-badge ${isPending ? 'pending' : 'collected'}">
                            ${isPending ? 'Pending' : 'Collected'}
                        </span>
                    </td>
                    <td>
                        ${isPending ? `<button class="btn btn-primary btn-sm" onclick="collectClientIncome(${client.id}, ${remaining})">Collect Income</button>` : '<span style="color: var(--text-secondary); font-size: 12px;">Fully Collected</span>'}
                        <button class="btn btn-secondary btn-sm" style="width: auto;" onclick="deleteClient(${client.id})">Delete</button>
                    </td>
                </tr>
            `;
        }

        if (selectClient) {
            selectClient.innerHTML += `<option value="${client.id}">${client.name}</option>`;
        }
    });

    if (pendingIncomeEl) {
        pendingIncomeEl.textContent = formatMoney(pendingTotal);
    }
}

document.getElementById('form-client')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('client-name').value;
    const budget = Number(document.getElementById('client-budget').value);
    const isCollected = document.getElementById('client-is-collected')?.checked ?? false;

    const remaining = isCollected ? 0 : budget;

    const { error } = await supabaseClient.from('clients').insert([{
        name: name,
        total_budget: budget,
        remaining_budget: remaining,
        is_collected: isCollected
    }]);

    if (!error) {
        document.getElementById('form-client').reset();
        if (typeof closeModal === 'function') closeModal('modal-client');
        loadDashboardData();
    }
});

// إمكانية تحصيل جزء من المبلغ أو تحصيله بالكامل
async function collectClientIncome(clientId, currentRemaining) {
    const input = prompt(`Enter amount to collect (Remaining: ${formatMoney(currentRemaining)}):`, currentRemaining);
    if (input === null) return; // Cancelled

    const collectAmount = Number(input);
    if (isNaN(collectAmount) || collectAmount <= 0) {
        alert('Please enter a valid positive amount.');
        return;
    }

    if (collectAmount > currentRemaining) {
        alert('Collected amount cannot exceed the remaining balance.');
        return;
    }

    const newRemaining = currentRemaining - collectAmount;
    const isFullyCollected = newRemaining === 0;

    const { error } = await supabaseClient
        .from('clients')
        .update({ 
            remaining_budget: newRemaining,
            is_collected: isFullyCollected 
        })
        .eq('id', clientId);

    if (!error) {
        loadDashboardData();
    } else {
        console.error('Error collecting client income:', error);
    }
}

async function deleteClient(id) {
    if (confirm('Are you sure you want to delete this client and all associated tasks?')) {
        await supabaseClient.from('clients').delete().eq('id', id);
        loadDashboardData();
    }
}

// 5. Tasks Module & Budget Deduction
async function loadTasks() {
    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select('*, clients(name)')
        .order('id', { ascending: false });

    if (error) return console.error(error);

    const tbody = document.getElementById('tasks-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    tasks?.forEach(task => {
        const isCompleted = task.status === 'completed';
        tbody.innerHTML += `
            <tr>
                <td>${task.title}</td>
                <td>${task.clients?.name || 'N/A'}</td>
                <td>${formatMoney(task.cost)}</td>
                <td><span style="color: ${isCompleted ? 'var(--accent)' : 'orange'}">${isCompleted ? 'Completed' : 'Pending'}</span></td>
                <td>
                    ${!isCompleted ? `<button class="btn btn-primary" style="padding: 4px 8px; font-size: 12px; width: auto;" onclick="completeTask(${task.id}, ${task.client_id}, ${task.cost})">Complete & Deduct</button>` : ''}
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; width: auto;" onclick="deleteTask(${task.id})">Delete</button>
                </td>
            </tr>
        `;
    });
}

document.getElementById('form-task')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clientId = document.getElementById('task-client-id').value;
    const title = document.getElementById('task-title').value;
    const cost = Number(document.getElementById('task-cost').value);

    const { error } = await supabaseClient.from('tasks').insert([{
        client_id: clientId,
        title: title,
        cost: cost,
        status: 'pending'
    }]);

    if (!error) {
        document.getElementById('form-task').reset();
        if (typeof closeModal === 'function') closeModal('modal-task');
        loadTasks();
    }
});

async function completeTask(taskId, clientId, taskCost) {
    await supabaseClient.from('tasks').update({ status: 'completed' }).eq('id', taskId);

    const { data: client } = await supabaseClient.from('clients').select('remaining_budget').eq('id', clientId).single();
    if (client) {
        const newRemaining = Math.max(0, client.remaining_budget - taskCost);
        await supabaseClient.from('clients').update({ remaining_budget: newRemaining }).eq('id', clientId);
    }

    loadDashboardData();
}

async function deleteTask(id) {
    if (confirm('Delete task?')) {
        await supabaseClient.from('tasks').delete().eq('id', id);
        loadTasks();
    }
}

// 6. Salary Center Module
function shiftMonth(monthYear, offset) {
    const [year, month] = monthYear.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthYear) {
    if (!monthYear) return '—';
    const [year, month] = monthYear.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

async function getSalaryRecord(monthYear) {
    const { data, error } = await supabaseClient
        .from('salaries')
        .select('*')
        .eq('month_year', monthYear)
        .maybeSingle();
    if (error) console.error('Could not load salary:', error);
    return data || null;
}

async function upsertSalary(monthYear, amount, isReceived, createNextPending = false) {
    const { data: existing } = await supabaseClient
        .from('salaries')
        .select('id')
        .eq('month_year', monthYear)
        .maybeSingle();

    let error;
    if (existing) {
        ({ error } = await supabaseClient
            .from('salaries')
            .update({ amount, is_received: isReceived })
            .eq('id', existing.id));
    } else {
        ({ error } = await supabaseClient
            .from('salaries')
            .insert([{ month_year: monthYear, amount, is_received: isReceived }]));
    }

    if (error) {
        console.error('Could not save salary:', error);
        return false;
    }

    if (createNextPending && isReceived) {
        const nextMonth = shiftMonth(monthYear, 1);
        const nextSalary = await getSalaryRecord(nextMonth);
        if (!nextSalary) {
            const { error: nextError } = await supabaseClient
                .from('salaries')
                .insert([{ month_year: nextMonth, amount, is_received: false }]);
            if (nextError) console.error('Could not create next pending salary:', nextError);
        }
    }
    return true;
}

function setSalaryMessage(message, isError = false) {
    const element = document.getElementById('salary-form-message');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('message-error', isError);
    element.classList.toggle('message-success', !isError && Boolean(message));
}

function paintSalaryCard(prefix, monthYear, salary) {
    const status = salary?.is_received ? 'received' : 'pending';
    const statusLabel = salary?.is_received ? 'Received' : 'Pending';
    const amount = Number(salary?.amount || 0);
    const statusElement = document.getElementById(`salary-${prefix}-status`);
    const monthElement = document.getElementById(`salary-${prefix}-month-label`);
    const amountElement = document.getElementById(`salary-${prefix}-amount`);
    const hintElement = document.getElementById(`salary-${prefix}-hint`);

    if (statusElement) {
        statusElement.textContent = statusLabel;
        statusElement.className = `status-badge salary-status-${status}`;
    }
    if (monthElement) monthElement.textContent = formatMonthLabel(monthYear);
    if (amountElement) amountElement.textContent = formatMoney(amount);
    if (hintElement) {
        hintElement.textContent = salary?.is_received
            ? 'This amount is included in this month’s available cash.'
            : salary
                ? 'Planned salary. Confirm it when the money reaches you.'
                : 'No salary plan yet. Add an amount below to create a pending salary.';
    }

    const actionButton = document.getElementById(prefix === 'current' ? 'btn-confirm-current-salary' : 'btn-edit-next-salary');
    if (actionButton && prefix === 'current') {
        actionButton.disabled = Boolean(salary?.is_received);
        actionButton.textContent = salary?.is_received ? 'Salary received' : 'Confirm salary received';
    }
    return { amount, status };
}

function renderSalaryHistory(salaries) {
    const tbody = document.getElementById('salary-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!salaries?.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No salary plans yet.</td></tr>';
        return;
    }
    salaries.forEach(salary => {
        const status = salary.is_received ? 'received' : 'pending';
        tbody.innerHTML += `
            <tr>
                <td>${escapeHTML(formatMonthLabel(salary.month_year))}</td>
                <td><strong>${formatMoney(salary.amount)}</strong></td>
                <td><span class="status-badge salary-status-${status}">${salary.is_received ? 'Received' : 'Pending'}</span></td>
                <td><button class="btn btn-secondary btn-sm" onclick="editSalaryMonth('${escapeHTML(salary.month_year)}')">Edit</button></td>
            </tr>
        `;
    });
}

async function loadSalaryForm(selectedMonth = getCurrentMonthYear()) {
    const nextMonth = shiftMonth(getCurrentMonthYear(), 1);
    const monthInput = document.getElementById('salary-month');
    if (!monthInput) return;
    monthInput.value = selectedMonth;

    const [{ data: salaries }, currentSalary, nextSalary] = await Promise.all([
        supabaseClient.from('salaries').select('*').order('month_year', { ascending: false }),
        getSalaryRecord(getCurrentMonthYear()),
        getSalaryRecord(nextMonth)
    ]);

    paintSalaryCard('current', getCurrentMonthYear(), currentSalary);
    paintSalaryCard('next', nextMonth, nextSalary);
    renderSalaryHistory(salaries || []);

    const selectedSalary = await getSalaryRecord(selectedMonth);
    document.getElementById('salary-amount').value = selectedSalary?.amount || '';
    setSalaryMessage('');
}

async function saveSalaryFromForm(isReceived) {
    const monthYear = document.getElementById('salary-month')?.value;
    const amount = Number(document.getElementById('salary-amount')?.value);
    if (!monthYear || !Number.isFinite(amount) || amount <= 0) {
        setSalaryMessage('Enter a valid salary amount first.', true);
        return;
    }
    const saved = await upsertSalary(monthYear, amount, isReceived, isReceived && monthYear === getCurrentMonthYear());
    if (!saved) {
        setSalaryMessage('Could not save salary. Please try again.', true);
        return;
    }
    setSalaryMessage(isReceived
        ? `Salary for ${formatMonthLabel(monthYear)} confirmed. Next month is now pending.`
        : `Salary for ${formatMonthLabel(monthYear)} saved as pending.`);
    await loadSalaryForm(monthYear);
    loadDashboardData();
}

document.getElementById('salary-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveSalaryFromForm(false);
});
document.getElementById('btn-confirm-salary')?.addEventListener('click', () => saveSalaryFromForm(true));
document.getElementById('btn-confirm-current-salary')?.addEventListener('click', async () => {
    const currentMonth = getCurrentMonthYear();
    const currentSalary = await getSalaryRecord(currentMonth);
    if (!currentSalary?.amount) {
        document.getElementById('salary-month').value = currentMonth;
        setSalaryMessage('Set this month’s salary amount first, then confirm it here.', true);
        document.getElementById('salary-amount').focus();
        return;
    }
    document.getElementById('salary-month').value = currentMonth;
    document.getElementById('salary-amount').value = currentSalary.amount;
    await saveSalaryFromForm(true);
});
document.getElementById('btn-edit-next-salary')?.addEventListener('click', async () => {
    const nextMonth = shiftMonth(getCurrentMonthYear(), 1);
    const nextSalary = await getSalaryRecord(nextMonth);
    document.getElementById('salary-month').value = nextMonth;
    document.getElementById('salary-amount').value = nextSalary?.amount || '';
    document.getElementById('salary-amount').focus();
    setSalaryMessage(`Planning salary for ${formatMonthLabel(nextMonth)}.`);
});
document.getElementById('salary-month')?.addEventListener('change', async (event) => {
    const salary = await getSalaryRecord(event.target.value);
    document.getElementById('salary-amount').value = salary?.amount || '';
    setSalaryMessage(salary ? `${salary.is_received ? 'Received' : 'Pending'} salary plan loaded.` : 'No plan for this month yet.');
});

async function editSalaryMonth(monthYear) {
    document.getElementById('salary-month').value = monthYear;
    const salary = await getSalaryRecord(monthYear);
    document.getElementById('salary-amount').value = salary?.amount || '';
    setSalaryMessage(`Editing salary for ${formatMonthLabel(monthYear)}.`);
    document.getElementById('salary-amount').focus();
}
window.editSalaryMonth = editSalaryMonth;

// 7. Monthly Obligations Module
let recurringObligationsCache = [];
let obligationPaymentsCache = [];

function readRecurringExpenses() {
    return recurringObligationsCache;
}

async function initializeRecurringObligations() {
    if (!movementUserKey) return;
    const { data: obligations, error } = await supabaseClient.from('recurring_obligations').select('*').eq('user_id', movementUserKey).order('created_at', { ascending: false });
    if (error) throw error;
    const { data: payments, error: paymentError } = await supabaseClient.from('obligation_payments').select('*').eq('user_id', movementUserKey);
    if (paymentError) throw paymentError;
    obligationPaymentsCache = payments || [];
    recurringObligationsCache = (obligations || []).map(item => ({
        id: item.id, title: item.title, amount: Number(item.amount || 0), currency: item.currency || HOME_CURRENCY,
        startDate: item.start_date, endDate: item.end_date, dueDay: item.day_of_month, frequency: item.frequency,
        notes: item.notes, paidMonths: obligationPaymentsCache.filter(p => p.obligation_id === item.id && p.status === 'paid').map(p => String(p.due_month).slice(0, 7))
    }));
}

async function saveRecurringExpense(expense) {
    const row = { id: expense.id, user_id: movementUserKey, title: expense.title, amount: expense.amount, currency: expense.currency || HOME_CURRENCY, start_date: expense.startDate, end_date: expense.endDate, frequency: expense.frequency || 'monthly', day_of_month: expense.dueDay || 1, notes: expense.notes || null, is_active: true };
    const { data, error } = await supabaseClient.from('recurring_obligations').upsert(row, { onConflict: 'id' }).select('*').single();
    if (error) throw error;
    const normalized = { ...expense, id: data.id };
    recurringObligationsCache = [normalized, ...recurringObligationsCache.filter(item => item.id !== normalized.id)];
    return normalized;
}

async function saveObligationPayment(obligation, monthYear, isPaid) {
    const dueMonth = `${monthYear}-01`;
    if (isPaid) {
        const row = { obligation_id: obligation.id, user_id: movementUserKey, due_month: dueMonth, amount: obligation.amount, currency: obligation.currency || HOME_CURRENCY, status: 'paid', paid_at: new Date().toISOString() };
        const { error } = await supabaseClient.from('obligation_payments').upsert(row, { onConflict: 'obligation_id,due_month' });
        if (error) throw error;
    } else {
        const { error } = await supabaseClient.from('obligation_payments').delete().eq('obligation_id', obligation.id).eq('due_month', dueMonth);
        if (error) throw error;
    }
    obligation.paidMonths = isPaid ? [...new Set([...(obligation.paidMonths || []), monthYear])] : (obligation.paidMonths || []).filter(item => item !== monthYear);
}

function monthFromDate(dateValue) {
    return String(dateValue || '').slice(0, 7);
}

function isRecurringExpenseActive(expense, monthYear) {
    const startMonth = monthFromDate(expense.startDate);
    const endMonth = monthFromDate(expense.endDate);
    return Boolean(startMonth && endMonth && monthYear >= startMonth && monthYear <= endMonth);
}

function recurringExpenseDueDate(expense, monthYear) {
    const day = Number(expense.dueDay || String(expense.startDate || '').slice(8, 10) || 1);
    const [year, month] = monthYear.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${monthYear}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function recurringPaidExpensesTotal(monthYear) {
    return readRecurringExpenses()
        .filter(expense => isRecurringExpenseActive(expense, monthYear) && expense.paidMonths?.includes(monthYear))
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function recurringObligationsForMonth(monthYear) {
    return readRecurringExpenses().filter(expense => isRecurringExpenseActive(expense, monthYear));
}

async function loadExpenses() {
    const currentMonth = getCurrentMonthYear();
    const { data: expenses } = await supabaseClient
        .from('expenses')
        .select('*')
        .eq('month_year', currentMonth)
        .order('id', { ascending: false });
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const legacyExpenses = expenses || [];
    const recurringExpenses = recurringObligationsForMonth(currentMonth);
    if (!legacyExpenses.length && !recurringExpenses.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No obligations for this month. Add one to start your plan.</td></tr>';
        return;
    }

    legacyExpenses.forEach(expense => {
        const paid = Boolean(expense.is_paid);
        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHTML(expense.title)}</strong><small class="expense-kind">One-time expense</small></td>
                <td><strong>${formatMoney(expense.amount)}</strong></td>
                <td>${escapeHTML(expense.due_date || '—')}</td>
                <td>
                    <span class="status-badge expense-status-${paid ? 'paid' : 'pending'}">${paid ? 'Paid' : 'Pending'}</span>
                    <button class="btn btn-secondary btn-sm" onclick="toggleExpensePaid(${expense.id}, ${!paid})">${paid ? 'Undo' : 'Confirm Paid'}</button>
                </td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteExpense(${expense.id})">Delete</button></td>
            </tr>
        `;
    });

    recurringExpenses.forEach(expense => {
        const paid = expense.paidMonths?.includes(currentMonth);
        const dueDate = recurringExpenseDueDate(expense, currentMonth);
        tbody.innerHTML += `
            <tr class="recurring-expense-row">
                <td>
                    <strong>${escapeHTML(expense.title)}</strong>
                    <small class="expense-kind">Monthly · ${escapeHTML(expense.startDate)} → ${escapeHTML(expense.endDate)}</small>
                </td>
                <td><strong>${formatMoney(expense.amount)}</strong><small class="expense-kind">Auto-added monthly</small></td>
                <td>${escapeHTML(dueDate)}</td>
                <td>
                    <span class="status-badge expense-status-${paid ? 'paid' : 'pending'}">${paid ? 'Paid' : 'Pending'}</span>
                    <button class="btn btn-secondary btn-sm" onclick="toggleRecurringExpensePaid('${escapeHTML(expense.id)}', '${currentMonth}', ${!paid})">${paid ? 'Undo' : 'Confirm Paid'}</button>
                </td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteRecurringExpense('${escapeHTML(expense.id)}')">Delete plan</button></td>
            </tr>
        `;
    });
}

function syncExpenseRecurrenceFields() {
    const recurring = document.getElementById('expense-recurring')?.checked;
    const endDate = document.getElementById('expense-end-date');
    const help = document.getElementById('expense-recurring-help');
    if (!endDate) return;
    endDate.required = Boolean(recurring);
    endDate.disabled = !recurring;
    if (!recurring) endDate.value = '';
    if (help) help.textContent = recurring
        ? 'This obligation will appear automatically in every active month.'
        : 'It will be saved only for the current month.';
}

document.getElementById('expense-recurring')?.addEventListener('change', syncExpenseRecurrenceFields);
document.getElementById('open-add-expense-modal')?.addEventListener('click', () => {
    const startDate = document.getElementById('expense-start-date');
    if (startDate && !startDate.value) startDate.value = new Date().toISOString().slice(0, 10);
    syncExpenseRecurrenceFields();
});

document.getElementById('form-expense')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.getElementById('expense-title').value.trim();
    const amount = Number(document.getElementById('expense-amount').value);
    const startDate = document.getElementById('expense-start-date').value;
    const endDate = document.getElementById('expense-end-date').value;
    const isRecurring = document.getElementById('expense-recurring').checked;
    const currentMonth = getCurrentMonthYear();

    if (!title || !Number.isFinite(amount) || amount <= 0 || !startDate || (isRecurring && (!endDate || endDate < startDate))) {
        alert(isRecurring ? 'Please complete the name, amount, and a valid start/end date.' : 'Please complete the name, amount, and start date.');
        return;
    }

    if (isRecurring) {
        try {
            await saveRecurringExpense({
                title, amount, startDate, endDate,
                dueDay: Number(startDate.slice(8, 10)),
                frequency: 'monthly', currency: HOME_CURRENCY, paidMonths: []
            });
        } catch (error) {
            console.error('Could not save recurring obligation:', error);
            alert('Could not save this recurring obligation to Supabase.');
            return;
        }
    } else {
        await supabaseClient.from('expenses').insert([{
            title,
            amount,
            due_date: startDate,
            is_paid: false,
            month_year: currentMonth
        }]);
    }

    document.getElementById('form-expense').reset();
    document.getElementById('expense-recurring').checked = true;
    syncExpenseRecurrenceFields();
    if (typeof closeModal === 'function') closeModal('modal-expense');
    loadDashboardData();
});

async function toggleExpensePaid(id, isPaid) {
    await supabaseClient.from('expenses').update({ is_paid: isPaid }).eq('id', id);
    loadDashboardData();
}

async function toggleRecurringExpensePaid(id, monthYear, isPaid) {
    const expense = readRecurringExpenses().find(item => item.id === id);
    if (!expense) return;
    try {
        await saveObligationPayment(expense, monthYear, isPaid);
        loadDashboardData();
    } catch (error) {
        console.error('Could not update obligation payment:', error);
        alert('Could not update this payment in Supabase.');
    }
}

async function deleteExpense(id) {
    if (confirm('Delete this expense?')) {
        await supabaseClient.from('expenses').delete().eq('id', id);
        loadDashboardData();
    }
}

async function deleteRecurringExpense(id) {
    if (!confirm('Delete this recurring obligation and its future months?')) return;
    const { error } = await supabaseClient.from('recurring_obligations').delete().eq('id', id);
    if (error) return alert('Could not delete this obligation from Supabase.');
    recurringObligationsCache = recurringObligationsCache.filter(expense => expense.id !== id);
    loadDashboardData();
}

window.toggleExpensePaid = toggleExpensePaid;
window.toggleRecurringExpensePaid = toggleRecurringExpensePaid;
window.initializeRecurringObligations = initializeRecurringObligations;
window.deleteExpense = deleteExpense;
window.deleteRecurringExpense = deleteRecurringExpense;

// 8. Monthly Reporting Engine & Exporting
async function generateReport() {
    const monthInput = document.getElementById('report-month');
    const typeInput = document.getElementById('report-type');
    const results = document.getElementById('report-results');
    if (!monthInput || !results) return;
    if (!monthInput.value) monthInput.value = getCurrentMonthYear();
    const month = monthInput.value;
    const reportType = typeInput?.value || 'comprehensive';
    const [{ data: salary }, { data: expenses }, { data: daily }, { data: clients }, { data: balanceAdjustments }] = await Promise.all([
        supabaseClient.from('salaries').select('amount').eq('month_year', month).eq('is_received', true),
        supabaseClient.from('expenses').select('amount').eq('month_year', month).eq('is_paid', true),
        supabaseClient.from('daily_expenses').select('amount').gte('created_at', `${month}-01`).lt('created_at', `${month}-32`),
        supabaseClient.from('clients').select('name,total_budget,remaining_budget'),
        supabaseClient.from('balance_adjustments').select('amount').eq('month_year', month).order('created_at', { ascending: false }).limit(1)
    ]);
    const totalSalary = salary?.reduce((sum, i) => sum + Number(i.amount || 0), 0) || 0;
    const paidObligations = typeof recurringPaidExpensesTotal === 'function' ? recurringPaidExpensesTotal(month) : 0;
    const fixedExpenses = expenses?.reduce((sum, i) => sum + Number(i.amount || 0), 0) || 0;
    const totalExpenses = fixedExpenses + paidObligations;
    const totalDaily = daily?.reduce((sum, i) => sum + Number(i.amount || 0), 0) || 0;
    const totalClients = clients?.reduce((sum, i) => sum + Number(i.total_budget || 0) - Number(i.remaining_budget || 0), 0) || 0;
    const pendingClients = clients?.reduce((sum, i) => sum + Number(i.remaining_budget || 0), 0) || 0;
    const balanceAdjustment = balanceAdjustments?.[0] ? Number(balanceAdjustments[0].amount) : 0;
    const monthMovements = readMovements().filter(item => String(item.createdAt || '').slice(0, 7) === month);
    const movementSummary = getMovementSummary();
    const movementRows = monthMovements.map(item => `<tr><td>${escapeHTML(item.title)}</td><td>${escapeHTML(movementTypeLabels[item.type] || item.type)}</td><td>${formatCurrency(item.amount, item.currency)}</td><td>${formatMoney(getMovementBaseAmount(item))}</td></tr>`).join('');
    const netProfit = totalSalary + totalClients + balanceAdjustment + movementSummary.cashImpact - totalExpenses - totalDaily;
    const sections = {
        income: `<p><strong>Confirmed salary:</strong> ${formatMoney(totalSalary)}</p><p><strong>Collected clients:</strong> ${formatMoney(totalClients)}</p><p><strong>Pending client receivables:</strong> ${formatMoney(pendingClients)}</p>`,
        expenses: `<p><strong>Paid fixed expenses:</strong> ${formatMoney(fixedExpenses)}</p><p><strong>Paid recurring obligations:</strong> ${formatMoney(paidObligations)}</p><p><strong>Daily expenses:</strong> ${formatMoney(totalDaily)}</p><p><strong>Total expenses:</strong> ${formatMoney(totalExpenses + totalDaily)}</p>`,
        salary: `<p><strong>Confirmed salary for ${escapeHTML(month)}:</strong> ${formatMoney(totalSalary)}</p>`,
        movements: `<p><strong>Customer payments pending:</strong> ${formatMoney(movementSummary.customerPending)}</p><p><strong>Held customer funds:</strong> ${formatMoney(movementSummary.heldCustomerFunds)}</p><p><strong>Loans outstanding:</strong> ${formatMoney(movementSummary.loansOutstanding)}</p><p><strong>My obligations:</strong> ${formatMoney(movementSummary.obligations)}</p><table class="report-mini-table"><thead><tr><th>Title</th><th>Type</th><th>Original</th><th>EGP</th></tr></thead><tbody>${movementRows || '<tr><td colspan="4">No movements in this month.</td></tr>'}</tbody></table>`,
        clients: `<p><strong>Collected from clients:</strong> ${formatMoney(totalClients)}</p><p><strong>Still receivable:</strong> ${formatMoney(pendingClients)}</p><p><strong>Clients tracked:</strong> ${clients?.length || 0}</p>`,
        cashflow: `<p><strong>Cash impact from movements:</strong> ${formatMoney(movementSummary.cashImpact)}</p><p><strong>Balance adjustment:</strong> ${formatMoney(balanceAdjustment)}</p><p><strong>Net available balance:</strong> ${formatMoney(netProfit)}</p>`
    };
    const body = reportType === 'comprehensive' ? `${sections.income}${sections.expenses}${sections.movements}${sections.cashflow}` : (sections[reportType] || sections.cashflow);
    results.innerHTML = `<h3>${escapeHTML(typeInput?.selectedOptions?.[0]?.textContent || 'Financial report')} — ${escapeHTML(month)}</h3>${body}<hr><p class="report-total"><strong>Net available balance:</strong> ${formatMoney(netProfit)}</p>`;
}

document.getElementById('report-month')?.addEventListener('change', generateReport);
document.getElementById('report-type')?.addEventListener('change', generateReport);
document.getElementById('btn-generate-report')?.addEventListener('click', generateReport);

document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    const reportElement = document.getElementById('report-results');
    const selectedMonth = document.getElementById('report-month')?.value || getCurrentMonthYear();

    if (!reportElement || reportElement.innerText.trim() === '') {
        alert('Please select a month and generate the report first.');
        return;
    }

    const opt = {
        margin:       15,
        filename:     `Financial_Report_${selectedMonth}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(reportElement).save();
});

// Make functions global
window.setAvailableBalance = setAvailableBalance;
window.collectClientIncome = collectClientIncome;
window.deleteDailyExpense = deleteDailyExpense;
window.deleteClient = deleteClient;
window.deleteTask = deleteTask;
window.deleteExpense = deleteExpense;
window.completeTask = completeTask;
window.toggleExpensePaid = toggleExpensePaid;


// 9. Money Movements Module
const HOME_CURRENCY = 'EGP';
const FX_RATE_STORAGE_KEY = 'e_wallet_manager_usd_egp_rate_v1';
let liveUsdEgpRate = null;
let liveUsdEgpRateMeta = null;

function formatMoney(amount) {
    return `ج.م ${Number(amount || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

function formatCurrency(amount, currency = HOME_CURRENCY) {
    if (currency === 'USD') return `$${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return formatMoney(amount);
}

function readCachedFxRate() {
    return null;
}

async function fetchUsdEgpRate(force = false) {
    const cached = readCachedFxRate();
    const today = new Date().toISOString().slice(0, 10);
    if (!force && cached?.rate && cached?.date === today) {
        liveUsdEgpRate = Number(cached.rate);
        liveUsdEgpRateMeta = cached;
        return cached;
    }

    const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    if (!response.ok) throw new Error(`FX request failed (${response.status})`);
    const data = await response.json();
    const rate = Number(data?.rates?.EGP);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('USD to EGP rate is unavailable');
    const result = {
        rate,
        date: today,
        lastUpdateUtc: data.time_last_update_utc || new Date().toISOString(),
        nextUpdateUtc: data.time_next_update_utc || ''
    };
    liveUsdEgpRate = rate;
    liveUsdEgpRateMeta = result;
    return result;
}

function getMovementNetForeignAmount(movement) {
    return Math.max(0, Number(movement.amount || 0) - Number(movement.transferFee || 0));
}

function getMovementBaseAmount(movement) {
    const foreignNet = getMovementNetForeignAmount(movement);
    if (movement.currency !== 'USD') return Number(movement.amount || 0);
    return foreignNet * Number(movement.exchangeRate || 0);
}

function getMovementSettledBaseAmount(movement) {
    const settledForeign = Math.min(
        getMovementNetForeignAmount(movement),
        Math.max(0, Number(movement.settledAmount || 0))
    );
    return movement.currency === 'USD'
        ? settledForeign * Number(movement.exchangeRate || 0)
        : settledForeign;
}

function formatMovementValue(amount, currency = HOME_CURRENCY) {
    return formatCurrency(amount, currency);
}

// Supabase is the source of truth. This in-memory cache is only for rendering and calculations.
let movementUserKey = null;
let movementCache = [];
let movementStorageReady = false;

const movementTypeLabels = {
    customer_paid_unreceived: 'Customer paid — not received',
    customer_received_undelivered: 'Received — delivery pending',
    loan_given: 'Loan given',
    receivable: 'Money owed to me',
    payable: 'Money I owe',
    other_income: 'Other income',
    cash_expense: 'Other cash expense'
};

const movementStatusLabels = {
    pending: 'Pending',
    partial: 'Partially settled',
    overdue: 'Overdue',
    settled: 'Settled',
    cancelled: 'Cancelled'
};

async function initializeMovementStorage() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    movementUserKey = user?.id || null;
    if (!movementUserKey) {
        movementCache = [];
        movementStorageReady = true;
        return;
    }
    const { data, error } = await supabaseClient
        .from('money_movements')
        .select('*')
        .eq('user_id', movementUserKey)
        .order('created_at', { ascending: false });
    if (error) throw error;
    movementCache = (data || []).map(fromSupabaseMovement);
    movementStorageReady = true;
}

function readMovements() {
    return Array.isArray(movementCache) ? movementCache : [];
}

function movementRow(movement) {
    return {
        id: movement.id,
        user_id: movementUserKey,
        title: movement.title,
        kind: movement.type,
        counterparty: movement.person,
        amount: movement.amount,
        currency: movement.currency,
        fee: movement.transferFee,
        exchange_rate: movement.exchangeRate,
        amount_egp: getMovementBaseAmount(movement),
        settled_amount: movement.settledAmount,
        due_date: movement.dueDate || null,
        status: movement.status,
        notes: movement.notes,
        occurred_at: movement.createdAt,
        updated_at: movement.updatedAt
    };
}

function fromSupabaseMovement(row) {
    return normalizeMovement({
        id: row.id,
        title: row.title,
        person: row.counterparty || '',
        amount: row.amount,
        settledAmount: row.settled_amount,
        currency: row.currency,
        transferFee: row.fee,
        exchangeRate: row.exchange_rate,
        dueDate: row.due_date,
        type: row.kind || row.movement_type,
        status: row.status,
        notes: row.notes,
        createdAt: row.occurred_at || row.created_at,
        updatedAt: row.updated_at
    });
}

async function writeMovement(movement) {
    if (!movementUserKey) throw new Error('No authenticated user');
    const { data, error } = await supabaseClient
        .from('money_movements')
        .upsert(movementRow(movement), { onConflict: 'id' })
        .select('*')
        .single();
    if (error) throw error;
    const normalized = fromSupabaseMovement(data);
    movementCache = [normalized, ...movementCache.filter(item => item.id !== normalized.id)];
    return normalized;
}

async function deleteMovementRow(id) {
    const { error } = await supabaseClient.from('money_movements').delete().eq('id', id);
    if (error) throw error;
    movementCache = movementCache.filter(item => item.id !== id);
}

function normalizeMovement(movement) {
    const amount = Math.max(0, Number(movement.amount) || 0);
    const transferFee = Math.min(amount, Math.max(0, Number(movement.transferFee) || 0));
    const exchangeRate = movement.currency === 'USD' ? Math.max(0, Number(movement.exchangeRate) || 0) : 1;
    const settledAmount = Math.min(amount, Math.max(0, Number(movement.settledAmount) || 0));
    return {
        id: movement.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0')}`),
        title: String(movement.title || '').trim(),
        person: String(movement.person || '').trim(),
        amount,
        settledAmount,
        currency: movement.currency === 'USD' ? 'USD' : HOME_CURRENCY,
        transferFee,
        exchangeRate,
        fxRateUpdatedAt: movement.fxRateUpdatedAt || '',
        dueDate: movement.dueDate || '',
        type: movement.type || 'receivable',
        status: movement.status || 'pending',
        notes: String(movement.notes || '').trim(),
        createdAt: movement.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function getMovementById(id) {
    return readMovements().find(movement => String(movement.id) === String(id));
}

function getOutstandingAmount(movement) {
    if (!movement || movement.status === 'cancelled' || movement.status === 'settled') return 0;
    return Math.max(0, Number(movement.amount || 0) - Number(movement.settledAmount || 0));
}

function getEffectiveMovementStatus(movement) {
    if (movement.status === 'cancelled' || movement.status === 'settled') return movement.status;
    if (getOutstandingAmount(movement) <= 0 && Number(movement.amount || 0) > 0) return 'settled';
    if (movement.dueDate && movement.dueDate < new Date().toISOString().split('T')[0]) return 'overdue';
    return movement.status || 'pending';
}

function getMovementCashImpact(movement) {
    const amount = getMovementBaseAmount(movement);
    const settled = getMovementSettledBaseAmount(movement);
    const status = getEffectiveMovementStatus(movement);

    switch (movement.type) {
        case 'customer_paid_unreceived':
            return settled;
        case 'customer_received_undelivered':
            // Earmarked customer money is intentionally excluded from spendable cash
            // until the delivery obligation is completed.
            return status === 'settled' ? amount : 0;
        case 'loan_given':
            return -amount + settled;
        case 'receivable':
            return settled;
        case 'payable':
            return -settled;
        case 'other_income':
            return settled || (status === 'settled' ? amount : 0);
        case 'cash_expense':
            return -(settled || (status === 'settled' ? amount : 0));
        default:
            return 0;
    }
}

function getMovementSummary() {
    const summary = {
        customerPending: 0,
        heldCustomerFunds: 0,
        loansOutstanding: 0,
        obligations: 0,
        cashImpact: 0
    };

    readMovements().forEach(movement => {
        const outstanding = getOutstandingAmount(movement);
        const status = getEffectiveMovementStatus(movement);
        if (movement.type === 'customer_paid_unreceived' || movement.type === 'receivable') {
            summary.customerPending += outstanding;
        }
        if (movement.type === 'customer_received_undelivered' && status !== 'settled' && status !== 'cancelled') {
            summary.heldCustomerFunds += outstanding;
        }
        if (movement.type === 'loan_given') summary.loansOutstanding += outstanding;
        if (movement.type === 'payable') summary.obligations += outstanding;
        summary.cashImpact += getMovementCashImpact(movement);
    });

    return summary;
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));
}

function movementAmountMarkup(movement, includeSettlement = true) {
    const currency = movement.currency === 'USD' ? 'USD' : HOME_CURRENCY;
    const gross = formatCurrency(movement.amount, currency);
    const base = formatMoney(getMovementBaseAmount(movement));
    const fee = movement.currency === 'USD' && Number(movement.transferFee || 0) > 0
        ? `<small class="movement-description fx-fee">Fee: ${formatCurrency(movement.transferFee, 'USD')}</small>`
        : '';
    const rate = movement.currency === 'USD'
        ? `<small class="movement-description fx-rate">Rate: 1 USD = ${formatMoney(movement.exchangeRate)}${movement.fxRateUpdatedAt ? ` · ${escapeHTML(new Date(movement.fxRateUpdatedAt).toLocaleDateString())}` : ''}</small>`
        : '';
    const settlement = includeSettlement && Number(movement.settledAmount || 0) > 0
        ? `<small class="settlement-note">Settled: ${formatCurrency(movement.settledAmount, currency)}</small>`
        : '';
    return `<strong>${gross}</strong><small class="movement-description">Net in EGP: ${base}</small>${fee}${rate}${settlement}`;
}

function updateMovementCurrencyUI() {
    const currency = document.getElementById('movement-currency')?.value || HOME_CURRENCY;
    const fxFields = document.getElementById('movement-fx-fields');
    const rateInput = document.getElementById('movement-exchange-rate');
    const feeInput = document.getElementById('movement-transfer-fee');
    const preview = document.getElementById('movement-fx-preview');
    const meta = document.getElementById('movement-rate-meta');
    const amount = Number(document.getElementById('movement-amount')?.value || 0);
    const fee = Number(feeInput?.value || 0);
    fxFields?.classList.toggle('hidden', currency !== 'USD');
    if (currency !== 'USD') return;
    if (rateInput?.value) {
        const rate = Number(rateInput.value);
        const netUsd = Math.max(0, amount - fee);
        if (preview) preview.textContent = `${formatCurrency(netUsd, 'USD')} net × ${formatMoney(rate)} = ${formatMoney(netUsd * rate)}`;
    }
    if (meta && liveUsdEgpRateMeta) meta.textContent = `Rate updated: ${liveUsdEgpRateMeta.lastUpdateUtc || 'just now'}`;
}

async function prepareUsdRate(force = false) {
    const rateInput = document.getElementById('movement-exchange-rate');
    const meta = document.getElementById('movement-rate-meta');
    if (!rateInput) return;
    rateInput.placeholder = 'Fetching live rate…';
    try {
        const result = await fetchUsdEgpRate(force);
        rateInput.value = Number(result.rate).toFixed(4);
        rateInput.readOnly = true;
        if (meta) meta.textContent = `Rate updated: ${result.lastUpdateUtc || 'just now'}`;
        updateMovementCurrencyUI();
    } catch (error) {
        rateInput.readOnly = false;
        rateInput.value = '';
        if (meta) meta.textContent = 'Could not fetch the rate. You may enter it manually.';
        alert('The live USD/EGP rate could not be loaded. Check your connection or enter the rate manually.');
    }
}

function loadMovements() {
    const movements = readMovements();
    const summary = getMovementSummary();
    const summaryTargets = {
        'movement-summary-customer': summary.customerPending,
        'movement-summary-held': summary.heldCustomerFunds,
        'movement-summary-loans': summary.loansOutstanding,
        'movement-summary-obligations': summary.obligations
    };

    Object.entries(summaryTargets).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = formatMoney(value);
    });

    const search = (document.getElementById('movement-search')?.value || '').trim().toLowerCase();
    const typeFilter = document.getElementById('movement-filter-type')?.value || 'all';
    const statusFilter = document.getElementById('movement-filter-status')?.value || 'all';
    const filtered = movements.filter(movement => {
        const haystack = `${movement.title} ${movement.person} ${movement.notes}`.toLowerCase();
        const typeMatches = typeFilter === 'all' || movement.type === typeFilter;
        const statusMatches = statusFilter === 'all' || getEffectiveMovementStatus(movement) === statusFilter;
        return (!search || haystack.includes(search)) && typeMatches && statusMatches;
    });

    const tbody = document.getElementById('movements-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No movements match the current filters. Add your first movement to start tracking it.</td></tr>`;
        return;
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(movement => {
        const effectiveStatus = getEffectiveMovementStatus(movement);
        const outstanding = getOutstandingAmount(movement);
        const settlementText = '';
        const dueText = movement.dueDate
            ? `<span class="${effectiveStatus === 'overdue' ? 'due-overdue' : ''}">${escapeHTML(movement.dueDate)}</span>`
            : '<span class="muted">—</span>';

        tbody.innerHTML += `
            <tr>
                <td><span class="movement-type-badge type-${escapeHTML(movement.type)}">${escapeHTML(movementTypeLabels[movement.type] || 'Movement')}</span></td>
                <td>
                    <strong>${escapeHTML(movement.person || movement.title)}</strong>
                    ${movement.person ? `<small class="movement-description">${escapeHTML(movement.title)}</small>` : ''}
                    ${movement.notes ? `<small class="movement-description">${escapeHTML(movement.notes)}</small>` : ''}
                </td>
                <td>${movementAmountMarkup(movement)}${outstanding > 0 && effectiveStatus !== 'settled' ? `<small class="settlement-note">Remaining: ${formatMoney(getMovementBaseAmount(movement) - getMovementSettledBaseAmount(movement))}</small>` : ''}</td>
                <td><span class="status-badge movement-status-${escapeHTML(effectiveStatus)}">${escapeHTML(movementStatusLabels[effectiveStatus] || effectiveStatus)}</span></td>
                <td>${dueText}</td>
                <td class="movement-actions">
                    ${effectiveStatus !== 'settled' && effectiveStatus !== 'cancelled' ? `<button class="btn btn-primary btn-sm" onclick="recordMovementSettlement('${escapeHTML(movement.id)}')">${movement.type === 'customer_received_undelivered' ? 'Mark Delivered' : 'Record Settlement'}</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="editMovement('${escapeHTML(movement.id)}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteMovement('${escapeHTML(movement.id)}')">Delete</button>
                </td>
            </tr>
        `;
    });
}

function resetMovementForm() {
    const form = document.getElementById('form-movement');
    if (form) form.reset();
    const id = document.getElementById('movement-id');
    if (id) id.value = '';
    const title = document.getElementById('modal-movement-title');
    if (title) title.textContent = 'Add Money Movement';
    const settledAmount = document.getElementById('movement-settled-amount');
    if (settledAmount) settledAmount.value = '0';
    const currency = document.getElementById('movement-currency');
    if (currency) currency.value = HOME_CURRENCY;
    const transferFee = document.getElementById('movement-transfer-fee');
    if (transferFee) transferFee.value = '0';
    const rateInput = document.getElementById('movement-exchange-rate');
    if (rateInput) { rateInput.value = ''; rateInput.readOnly = true; }
    const fxMeta = document.getElementById('movement-rate-meta');
    if (fxMeta) fxMeta.textContent = '';
    const fxPreview = document.getElementById('movement-fx-preview');
    if (fxPreview) fxPreview.textContent = 'Choose USD to fetch the current rate.';
    updateMovementTypeHelp();
    updateMovementCurrencyUI();
}

function openMovementForEdit(id) {
    const movement = getMovementById(id);
    if (!movement) return;
    document.getElementById('movement-id').value = movement.id;
    document.getElementById('movement-title').value = movement.title;
    document.getElementById('movement-person').value = movement.person;
    document.getElementById('movement-amount').value = movement.amount;
    document.getElementById('movement-settled-amount').value = movement.settledAmount || 0;
    document.getElementById('movement-currency').value = movement.currency || HOME_CURRENCY;
    document.getElementById('movement-transfer-fee').value = movement.transferFee || 0;
    document.getElementById('movement-exchange-rate').value = movement.currency === 'USD' ? (movement.exchangeRate || '') : '';
    document.getElementById('movement-date').value = movement.dueDate || '';
    document.getElementById('movement-type').value = movement.type;
    document.getElementById('movement-status').value = movement.status;
    document.getElementById('movement-notes').value = movement.notes || '';
    document.getElementById('modal-movement-title').textContent = 'Edit Money Movement';
    updateMovementTypeHelp();
    updateMovementCurrencyUI();
    document.getElementById('modal-movement').classList.remove('hidden');
}

function updateMovementTypeHelp() {
    const type = document.getElementById('movement-type')?.value;
    const help = document.getElementById('movement-type-help');
    if (!help) return;
    const messages = {
        customer_paid_unreceived: 'Tracked as money expected from a customer; it does not increase available cash until settled.',
        customer_received_undelivered: 'Tracked as held customer funds; it stays out of Available to Spend until delivery is completed.',
        loan_given: 'Reduces available cash now; repayments increase it again when recorded.',
        receivable: 'Tracks money someone owes you; only the amount marked as settled affects available cash.',
        payable: 'Tracks money you owe; the amount marked as settled reduces available cash.',
        other_income: 'Use for income outside salary and client budgets.',
        cash_expense: 'Use for one-off cash expenses outside fixed and daily expenses.'
    };
    help.textContent = messages[type] || '';
}

async function saveMovement(event) {
    event.preventDefault();
    const amount = Number(document.getElementById('movement-amount').value);
    const currency = document.getElementById('movement-currency').value || HOME_CURRENCY;
    const transferFee = Number(document.getElementById('movement-transfer-fee').value || 0);
    const exchangeRate = Number(document.getElementById('movement-exchange-rate').value || 0);
    const settledAmount = Number(document.getElementById('movement-settled-amount').value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return alert('Please enter a valid positive amount.');
    if (!Number.isFinite(settledAmount) || settledAmount < 0 || settledAmount > amount) return alert('Settled amount must be between zero and the total amount.');
    if (currency === 'USD' && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) return alert('A valid USD to EGP exchange rate is required.');
    if (currency === 'USD' && (!Number.isFinite(transferFee) || transferFee < 0 || transferFee > amount)) return alert('Transfer fee must be between zero and the USD amount.');

    const id = document.getElementById('movement-id').value;
    const existing = id ? getMovementById(id) : null;
    const movement = normalizeMovement({
        id: id || undefined,
        title: document.getElementById('movement-title').value,
        person: document.getElementById('movement-person').value,
        amount, settledAmount, currency, transferFee,
        exchangeRate: currency === 'USD' ? exchangeRate : 1,
        fxRateUpdatedAt: currency === 'USD' ? (liveUsdEgpRateMeta?.lastUpdateUtc || new Date().toISOString()) : '',
        dueDate: document.getElementById('movement-date').value,
        type: document.getElementById('movement-type').value,
        status: settledAmount >= amount ? 'settled' : document.getElementById('movement-status').value,
        notes: document.getElementById('movement-notes').value,
        createdAt: existing?.createdAt || new Date().toISOString()
    });
    try {
        await writeMovement(movement);
        closeModal('modal-movement');
        resetMovementForm();
        loadMovements();
        loadDashboardData();
    } catch (error) {
        console.error('Could not save movement:', error);
        alert('Could not save this movement to Supabase.');
    }
}

async function recordMovementSettlement(id) {
    const movement = getMovementById(id);
    if (!movement) return;
    const outstanding = getOutstandingAmount(movement);
    if (movement.type === 'customer_received_undelivered') {
        if (!confirm('Mark this customer order as delivered?')) return;
        movement.status = 'settled';
        movement.settledAmount = movement.amount;
    } else {
        const remainingLabel = movement.currency === 'USD' ? formatCurrency(outstanding, 'USD') : formatMoney(outstanding);
        const input = prompt(`Amount to settle (remaining: ${remainingLabel}):`, outstanding);
        if (input === null) return;
        const settlement = Number(input);
        if (!Number.isFinite(settlement) || settlement <= 0 || settlement > outstanding) {
            alert('Please enter a valid amount up to the remaining balance.');
            return;
        }
        movement.settledAmount = Number(movement.settledAmount || 0) + settlement;
        movement.status = movement.settledAmount >= movement.amount ? 'settled' : 'partial';
    }
    movement.updatedAt = new Date().toISOString();
    try {
        await writeMovement(movement);
        loadMovements();
        loadDashboardData();
    } catch (error) {
        console.error('Could not settle movement:', error);
        alert('Could not update this movement in Supabase.');
    }
}

function editMovement(id) {
    openMovementForEdit(id);
}

async function deleteMovement(id) {
    const movement = getMovementById(id);
    if (!movement) return;
    if (!confirm(`Delete "${movement.title}"?`)) return;
    try {
        await deleteMovementRow(id);
        loadMovements();
        loadDashboardData();
    } catch (error) {
        console.error('Could not delete movement:', error);
        alert('Could not delete this movement from Supabase.');
    }
}

function exportMovements() {
    const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        movements: readMovements()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `money-movements-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importMovements(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const parsed = JSON.parse(reader.result);
            const imported = Array.isArray(parsed) ? parsed : parsed.movements;
            if (!Array.isArray(imported)) throw new Error('Invalid movements file');
            const valid = imported.map(normalizeMovement).filter(movement => movement.title && movement.amount > 0);
            if (!valid.length) throw new Error('No valid movements found');
            for (const movement of valid) {
                const duplicate = readMovements().some(item => item.id === movement.id);
                await writeMovement(duplicate ? { ...movement, id: crypto.randomUUID() } : movement);
            }
            loadMovements();
            loadDashboardData();
            alert(`${valid.length} movement(s) imported successfully.`);
        } catch (error) {
            console.error('Could not import movements:', error);
            alert('Could not import this file. Please use a JSON export from this app.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

document.getElementById('form-movement')?.addEventListener('submit', saveMovement);
document.getElementById('movement-type')?.addEventListener('change', updateMovementTypeHelp);
document.getElementById('movement-currency')?.addEventListener('change', async (event) => {
    if (event.target.value === 'USD') await prepareUsdRate(false);
    else updateMovementCurrencyUI();
});
document.getElementById('movement-amount')?.addEventListener('input', updateMovementCurrencyUI);
document.getElementById('movement-transfer-fee')?.addEventListener('input', updateMovementCurrencyUI);
document.getElementById('movement-search')?.addEventListener('input', loadMovements);
document.getElementById('movement-filter-type')?.addEventListener('change', loadMovements);
document.getElementById('movement-filter-status')?.addEventListener('change', loadMovements);
document.getElementById('btn-export-movements')?.addEventListener('click', exportMovements);
document.getElementById('btn-import-movements')?.addEventListener('click', () => document.getElementById('movement-import-file')?.click());
document.getElementById('movement-import-file')?.addEventListener('change', importMovements);
document.getElementById('open-add-movement-modal')?.addEventListener('click', resetMovementForm);

window.initializeMovementStorage = initializeMovementStorage;
window.getMovementSummary = getMovementSummary;
window.loadMovements = loadMovements;
window.editMovement = editMovement;
window.deleteMovement = deleteMovement;
window.recordMovementSettlement = recordMovementSettlement;
