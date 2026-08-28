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

    const totalFixedExpenses =
        expenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

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
        document.getElementById('dash-salary').textContent = `$${salaryIncome.toLocaleString()}`;

    if (document.getElementById('dash-clients-income'))
        document.getElementById('dash-clients-income').textContent = `$${clientsIncome.toLocaleString()}`;
    if (document.getElementById('dash-pending-income'))
        document.getElementById('dash-pending-income').textContent = `$${clientPendingIncome.toLocaleString()}`;

    if (document.getElementById('dash-expenses'))
        document.getElementById('dash-expenses').textContent = `$${totalFixedExpenses.toLocaleString()}`;

    if (document.getElementById('dash-daily-expenses'))
        document.getElementById('dash-daily-expenses').textContent = `$${totalDailyExpenses.toLocaleString()}`;

    if (document.getElementById('dash-available'))
        document.getElementById('dash-available').textContent = `$${availableToSpend.toLocaleString()}`;

    if (document.getElementById('dash-customer-payments-pending'))
        document.getElementById('dash-customer-payments-pending').textContent = `$${(clientPendingIncome + movementSummary.customerPending).toLocaleString()}`;
    if (document.getElementById('dash-held-funds'))
        document.getElementById('dash-held-funds').textContent = `$${movementSummary.heldCustomerFunds.toLocaleString()}`;
    if (document.getElementById('dash-loans-outstanding'))
        document.getElementById('dash-loans-outstanding').textContent = `$${movementSummary.loansOutstanding.toLocaleString()}`;
    if (document.getElementById('dash-obligations'))
        document.getElementById('dash-obligations').textContent = `$${movementSummary.obligations.toLocaleString()}`;

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
                <td style="color: var(--danger); font-weight: bold;">$${Number(item.amount).toLocaleString()}</td>
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
                    <td>$${Number(client.total_budget).toLocaleString()}</td>
                    <td><strong>$${remaining.toLocaleString()}</strong></td>
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
        pendingIncomeEl.textContent = `$${pendingTotal.toLocaleString()}`;
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
    const input = prompt(`Enter amount to collect (Remaining: $${currentRemaining}):`, currentRemaining);
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
                <td>$${Number(task.cost).toLocaleString()}</td>
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

// 6. Fixed Salary Module
async function loadSalaryForm() {
    const currentMonth = getCurrentMonthYear();
    const monthInput = document.getElementById('salary-month');
    if (!monthInput) return;

    monthInput.value = currentMonth;

    const { data: salary } = await supabaseClient
        .from('salaries')
        .select('*')
        .eq('month_year', currentMonth)
        .maybeSingle();

    if (salary) {
        document.getElementById('salary-amount').value = salary.amount;
        document.getElementById('salary-received').checked = salary.is_received;
    } else {
        document.getElementById('salary-amount').value = '';
        document.getElementById('salary-received').checked = false;
    }
}

document.getElementById('salary-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const monthYear = document.getElementById('salary-month').value;
    const amount = Number(document.getElementById('salary-amount').value);
    const isReceived = document.getElementById('salary-received').checked;

    const { data: existing } = await supabaseClient
        .from('salaries')
        .select('id')
        .eq('month_year', monthYear)
        .maybeSingle();

    if (existing) {
        await supabaseClient.from('salaries').update({ amount, is_received: isReceived }).eq('id', existing.id);
    } else {
        await supabaseClient.from('salaries').insert([{ month_year: monthYear, amount, is_received: isReceived }]);
    }

    alert('Salary settings updated successfully!');
    loadDashboardData();
});

// 7. Fixed Expenses Module
async function loadExpenses() {
    const currentMonth = getCurrentMonthYear();
    const { data: expenses } = await supabaseClient.from('expenses').select('*').eq('month_year', currentMonth).order('id', { ascending: false });

    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    expenses?.forEach(exp => {
        tbody.innerHTML += `
            <tr>
                <td>${exp.title}</td>
                <td>$${Number(exp.amount).toLocaleString()}</td>
                <td>${exp.due_date || '-'}</td>
                <td>
                    <input type="checkbox" ${exp.is_paid ? 'checked' : ''} onchange="toggleExpensePaid(${exp.id}, this.checked)">
                    <span style="color: ${exp.is_paid ? 'var(--accent)' : 'var(--danger)'}">${exp.is_paid ? 'Paid' : 'Unpaid'}</span>
                </td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; width: auto;" onclick="deleteExpense(${exp.id})">Delete</button>
                </td>
            </tr>
        `;
    });
}

document.getElementById('form-expense')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('expense-title').value;
    const amount = Number(document.getElementById('expense-amount').value);
    const dueDate = document.getElementById('expense-date').value;
    const currentMonth = getCurrentMonthYear();

    await supabaseClient.from('expenses').insert([{
        title,
        amount,
        due_date: dueDate,
        is_paid: false,
        month_year: currentMonth
    }]);

    document.getElementById('form-expense').reset();
    if (typeof closeModal === 'function') closeModal('modal-expense');
    loadDashboardData();
});

async function toggleExpensePaid(id, isPaid) {
    await supabaseClient.from('expenses').update({ is_paid: isPaid }).eq('id', id);
    loadDashboardData();
}

async function deleteExpense(id) {
    if (confirm('Delete expense?')) {
        await supabaseClient.from('expenses').delete().eq('id', id);
        loadDashboardData();
    }
}

document.getElementById('btn-copy-expenses')?.addEventListener('click', async () => {
    const currentMonth = getCurrentMonthYear();
    
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const { data: currentExpenses } = await supabaseClient.from('expenses').select('*').eq('month_year', currentMonth);

    if (!currentExpenses || currentExpenses.length === 0) {
        return alert('No expenses found for the current month to copy.');
    }

    const newExpenses = currentExpenses.map(exp => ({
        title: exp.title,
        amount: exp.amount,
        due_date: exp.due_date,
        is_paid: false,
        month_year: nextMonth
    }));

    const { error } = await supabaseClient.from('expenses').insert(newExpenses);
    if (!error) alert(`Expenses successfully copied to ${nextMonth}!`);
});

// 8. Monthly Reporting Engine & Exporting
async function generateReport() {
    const monthInput = document.getElementById('report-month');
    if (!monthInput) return;
    if (!monthInput.value) monthInput.value = getCurrentMonthYear();
    const month = monthInput.value;

    const { data: salary } = await supabaseClient.from('salaries').select('amount').eq('month_year', month).eq('is_received', true);
    const { data: expenses } = await supabaseClient.from('expenses').select('amount').eq('month_year', month).eq('is_paid', true);
    const { data: daily } = await supabaseClient.from('daily_expenses').select('amount').gte('created_at', `${month}-01`);
    const { data: clients } = await supabaseClient.from('clients').select('total_budget, remaining_budget');
    const { data: balanceAdjustments } = await supabaseClient.from('balance_adjustments').select('amount').eq('month_year', month).order('created_at', { ascending: false }).limit(1);

    const totalSalary = salary?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
    const totalExpenses = expenses?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
    const totalDaily = daily?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
    
    const totalClients = clients?.reduce((sum, i) => {
        const total = Number(i.total_budget || 0);
        const remaining = Number(i.remaining_budget || 0);
        return sum + (total - remaining);
    }, 0) || 0;

    const balanceAdjustment = balanceAdjustments?.[0] ? Number(balanceAdjustments[0].amount) : 0;
    const movementSummary = getMovementSummary();

    const netProfit = (totalSalary + totalClients + balanceAdjustment + movementSummary.cashImpact) - (totalExpenses + totalDaily);

    document.getElementById('report-results').innerHTML = `
        <p><strong>Total Income (Salary + Collected Clients):</strong> $${(totalSalary + totalClients).toLocaleString()}</p>
        <p><strong>Balance Adjustment:</strong> $${balanceAdjustment.toLocaleString()}</p>
        <p><strong>Fixed Paid Expenses:</strong> $${totalExpenses.toLocaleString()}</p>
        <p><strong>Total Daily Expenses:</strong> $${totalDaily.toLocaleString()}</p>
        <p><strong>Customer Payments Pending:</strong> ${movementSummary.customerPending.toLocaleString()}</p>
        <p><strong>Held Customer Funds:</strong> ${movementSummary.heldCustomerFunds.toLocaleString()}</p>
        <p><strong>Loans Outstanding:</strong> ${movementSummary.loansOutstanding.toLocaleString()}</p>
        <p><strong>My Obligations:</strong> ${movementSummary.obligations.toLocaleString()}</p>
        <p><strong>Cash Impact from Movements:</strong> ${movementSummary.cashImpact.toLocaleString()}</p>
        <hr style="margin: 10px 0; border-color: var(--border-color);">
        <p style="font-size: 18px; color: var(--accent);"><strong>Net Available Balance: $${netProfit.toLocaleString()}</strong></p>
    `;
}

document.getElementById('report-month')?.addEventListener('change', generateReport);

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
// The existing Supabase schema does not include a generic transactions table, so
// this module stores the new movement records locally and namespaces them per user.
const MOVEMENT_STORAGE_PREFIX = 'e_wallet_manager_movements_v1';
let movementUserKey = 'local';

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
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        movementUserKey = user?.id || 'local';
    } catch (error) {
        movementUserKey = 'local';
    }
}

function movementStorageKey() {
    return `${MOVEMENT_STORAGE_PREFIX}:${movementUserKey}`;
}

function readMovements() {
    try {
        const parsed = JSON.parse(localStorage.getItem(movementStorageKey()) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Could not read money movements:', error);
        return [];
    }
}

function writeMovements(movements) {
    localStorage.setItem(movementStorageKey(), JSON.stringify(movements));
}

function normalizeMovement(movement) {
    const amount = Math.max(0, Number(movement.amount) || 0);
    const settledAmount = Math.min(amount, Math.max(0, Number(movement.settledAmount) || 0));
    return {
        id: movement.id || `movement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: String(movement.title || '').trim(),
        person: String(movement.person || '').trim(),
        amount,
        settledAmount,
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
    const amount = Number(movement.amount || 0);
    const settled = Math.min(amount, Math.max(0, Number(movement.settledAmount || 0)));
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

function formatMoney(amount) {
    return `$${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
        const settlementText = Number(movement.settledAmount || 0) > 0 && effectiveStatus !== 'settled'
            ? `<small class="settlement-note">${formatMoney(movement.settledAmount)} settled</small>`
            : '';
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
                <td><strong>${formatMoney(movement.amount)}</strong>${settlementText}${outstanding > 0 && effectiveStatus !== 'settled' ? `<small class="settlement-note">${formatMoney(outstanding)} remaining</small>` : ''}</td>
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
    updateMovementTypeHelp();
}

function openMovementForEdit(id) {
    const movement = getMovementById(id);
    if (!movement) return;
    document.getElementById('movement-id').value = movement.id;
    document.getElementById('movement-title').value = movement.title;
    document.getElementById('movement-person').value = movement.person;
    document.getElementById('movement-amount').value = movement.amount;
    document.getElementById('movement-settled-amount').value = movement.settledAmount || 0;
    document.getElementById('movement-date').value = movement.dueDate || '';
    document.getElementById('movement-type').value = movement.type;
    document.getElementById('movement-status').value = movement.status;
    document.getElementById('movement-notes').value = movement.notes || '';
    document.getElementById('modal-movement-title').textContent = 'Edit Money Movement';
    updateMovementTypeHelp();
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

function saveMovement(event) {
    event.preventDefault();
    const amount = Number(document.getElementById('movement-amount').value);
    let settledAmount = Number(document.getElementById('movement-settled-amount').value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        alert('Please enter a valid positive amount.');
        return;
    }
    if (!Number.isFinite(settledAmount) || settledAmount < 0 || settledAmount > amount) {
        alert('Settled amount must be between zero and the total amount.');
        return;
    }

    const id = document.getElementById('movement-id').value;
    const existing = id ? getMovementById(id) : null;
    const status = document.getElementById('movement-status').value;
    const movement = normalizeMovement({
        id: id || undefined,
        title: document.getElementById('movement-title').value,
        person: document.getElementById('movement-person').value,
        amount,
        settledAmount,
        dueDate: document.getElementById('movement-date').value,
        type: document.getElementById('movement-type').value,
        status: settledAmount >= amount ? 'settled' : status,
        notes: document.getElementById('movement-notes').value,
        createdAt: existing?.createdAt || new Date().toISOString()
    });

    const movements = readMovements();
    const nextMovements = existing
        ? movements.map(item => item.id === movement.id ? movement : item)
        : [movement, ...movements];
    writeMovements(nextMovements);
    closeModal('modal-movement');
    resetMovementForm();
    loadMovements();
    loadDashboardData();
}

function recordMovementSettlement(id) {
    const movement = getMovementById(id);
    if (!movement) return;
    const outstanding = getOutstandingAmount(movement);
    if (movement.type === 'customer_received_undelivered') {
        if (!confirm('Mark this customer order as delivered?')) return;
        movement.status = 'settled';
        movement.settledAmount = movement.amount;
    } else {
        const input = prompt(`Amount to settle (remaining: ${formatMoney(outstanding)}):`, outstanding);
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
    writeMovements(readMovements().map(item => item.id === movement.id ? movement : item));
    loadMovements();
    loadDashboardData();
}

function editMovement(id) {
    openMovementForEdit(id);
}

function deleteMovement(id) {
    const movement = getMovementById(id);
    if (!movement) return;
    if (!confirm(`Delete "${movement.title}"?`)) return;
    writeMovements(readMovements().filter(item => item.id !== id));
    loadMovements();
    loadDashboardData();
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
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const imported = Array.isArray(parsed) ? parsed : parsed.movements;
            if (!Array.isArray(imported)) throw new Error('Invalid movements file');
            const valid = imported
                .map(normalizeMovement)
                .filter(movement => movement.title && movement.amount > 0);
            if (!valid.length) throw new Error('No valid movements found');
            const current = readMovements();
            const existingIds = new Set(current.map(item => item.id));
            const deduped = valid.map(item => existingIds.has(item.id)
                ? { ...item, id: `${item.id}-imported-${Date.now()}` }
                : item);
            writeMovements([...deduped, ...current]);
            loadMovements();
            loadDashboardData();
            alert(`${deduped.length} movement(s) imported successfully.`);
        } catch (error) {
            alert('Could not import this file. Please use a JSON export from this app.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

document.getElementById('form-movement')?.addEventListener('submit', saveMovement);
document.getElementById('movement-type')?.addEventListener('change', updateMovementTypeHelp);
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
