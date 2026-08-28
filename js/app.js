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
    const todayDate = new Date().toISOString().split('T')[0];

    // Fixed Salary
    const { data: salaries } = await supabaseClient
        .from('salaries')
        .select('amount')
        .eq('month_year', currentMonth)
        .eq('is_received', true);

    const salaryIncome =
        salaries?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    // Clients Revenue
    const { data: clients } = await supabaseClient
        .from('clients')
        .select('total_budget');

    const clientsIncome =
        clients?.reduce((sum, item) => sum + Number(item.total_budget), 0) || 0;

    // Paid Fixed Expenses
    const { data: expenses } = await supabaseClient
        .from('expenses')
        .select('amount')
        .eq('month_year', currentMonth)
        .eq('is_paid', true);

    const totalFixedExpenses =
        expenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    // Daily Expenses Total
    const { data: dailyExpenses } = await supabaseClient
        .from('daily_expenses')
        .select('*')
        .gte('created_at', `${currentMonth}-01`);

    const totalDailyExpenses =
        dailyExpenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    // Manual Balance Adjustment
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

    // Final Calculation Formula
    const availableToSpend =
        (salaryIncome + clientsIncome) -
        (totalFixedExpenses + totalDailyExpenses) +
        balanceAdjustment;

    // Update Dashboard UI Cards
    document.getElementById('dash-salary').textContent =
        `$${salaryIncome.toLocaleString()}`;

    document.getElementById('dash-clients-income').textContent =
        `$${clientsIncome.toLocaleString()}`;

    document.getElementById('dash-expenses').textContent =
        `$${totalFixedExpenses.toLocaleString()}`;

    document.getElementById('dash-daily-expenses').textContent =
        `$${totalDailyExpenses.toLocaleString()}`;

    document.getElementById('dash-available').textContent =
        `$${availableToSpend.toLocaleString()}`;

    // Load Tabular Views
    loadDailyExpenses();
    loadClients();
    loadTasks();
    loadExpenses();
    loadSalaryForm();
}
function refreshSectionData(sectionId) {
    if (sectionId === 'sec-dashboard') loadDashboardData();
    if (sectionId === 'sec-clients') loadClients();
    if (sectionId === 'sec-tasks') loadTasks();
    if (sectionId === 'sec-expenses') loadExpenses();
    if (sectionId === 'sec-salary') loadSalaryForm();
    if (sectionId === 'sec-reports') generateReport();
}

// 2. Dynamic Available Balance Manual Adjustment
// تعديل المتاح للصرف يدوياً وتأثيره المزدوج

async function setAvailableBalance(targetAmount) {
    const currentMonth = getCurrentMonthYear();
    const target = Number(targetAmount);

    if (isNaN(target)) return;

    // A. Total Income
    const { data: salaries } = await supabaseClient
        .from('salaries')
        .select('amount')
        .eq('month_year', currentMonth)
        .eq('is_received', true);

    const salaryIncome =
        salaries?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    const { data: clients } = await supabaseClient
        .from('clients')
        .select('total_budget');

    const clientsIncome =
        clients?.reduce((sum, item) => sum + Number(item.total_budget), 0) || 0;

    const totalIncome = salaryIncome + clientsIncome;

    // B. Fixed Expenses
    const { data: expenses } = await supabaseClient
        .from('expenses')
        .select('amount')
        .eq('month_year', currentMonth)
        .eq('is_paid', true);

    const totalFixedExpenses =
        expenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    // C. Daily Expenses
    const { data: dailyExpenses } = await supabaseClient
        .from('daily_expenses')
        .select('amount')
        .gte('created_at', `${currentMonth}-01`);

    const currentDailyTotal =
        dailyExpenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    // Balance Difference Calculation
    const currentAvailable =
        totalIncome - (totalFixedExpenses + currentDailyTotal);

const adjustmentAmount = target;

    if (adjustmentAmount === 0) return;

    // Save adjustment separately from daily expenses
    const { error } = await supabaseClient
        .from('balance_adjustments')
        .insert([{
            amount: adjustmentAmount,
            created_at: new Date().toISOString()
        }]);

    if (!error) {
        loadDashboardData();
    } else {
        console.error('Error adjusting balance:', error);
    }
}

// Event listener for manual balance form
document.getElementById('form-adjust-available')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const targetValue =
        document.getElementById('custom-available-input').value;

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

// 4. Clients Module
async function loadClients() {
    const { data: clients, error } = await supabaseClient.from('clients').select('*').order('id', { ascending: false });
    if (error) return console.error(error);

    const tbody = document.getElementById('clients-table-body');
    const selectClient = document.getElementById('task-client-id');
    if (!tbody || !selectClient) return;

    tbody.innerHTML = '';
    selectClient.innerHTML = '<option value="">Select Client...</option>';

    clients.forEach(client => {
        tbody.innerHTML += `
            <tr>
                <td>${client.name}</td>
                <td>$${Number(client.total_budget).toLocaleString()}</td>
                <td><strong>$${Number(client.remaining_budget).toLocaleString()}</strong></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 8px; width: auto;" onclick="deleteClient(${client.id})">Delete</button>
                </td>
            </tr>
        `;
        selectClient.innerHTML += `<option value="${client.id}">${client.name}</option>`;
    });
}

document.getElementById('form-client')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('client-name').value;
    const budget = Number(document.getElementById('client-budget').value);

    const { error } = await supabaseClient.from('clients').insert([{
        name: name,
        total_budget: budget,
        remaining_budget: budget
    }]);

    if (!error) {
        document.getElementById('form-client').reset();
        closeModal('modal-client');
        loadDashboardData();
    }
});

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

    tasks.forEach(task => {
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
        closeModal('modal-task');
        loadTasks();
    }
});

async function completeTask(taskId, clientId, taskCost) {
    await supabaseClient.from('tasks').update({ status: 'completed' }).eq('id', taskId);

    const { data: client } = await supabaseClient.from('clients').select('remaining_budget').eq('id', clientId).single();
    if (client) {
        const newRemaining = client.remaining_budget - taskCost;
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
    closeModal('modal-expense');
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
    const { data: clients } = await supabaseClient.from('clients').select('total_budget');

    const totalSalary = salary?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
    const totalExpenses = expenses?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
    const totalDaily = daily?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
    const totalClients = clients?.reduce((sum, i) => sum + Number(i.total_budget), 0) || 0;

    const netProfit = (totalSalary + totalClients) - (totalExpenses + totalDaily);

    document.getElementById('report-results').innerHTML = `
        <p><strong>Total Income (Salary + Clients):</strong> $${(totalSalary + totalClients).toLocaleString()}</p>
        <p><strong>Fixed Paid Expenses:</strong> $${totalExpenses.toLocaleString()}</p>
        <p><strong>Total Daily Expenses:</strong> $${totalDaily.toLocaleString()}</p>
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

// Make function global
window.setAvailableBalance = setAvailableBalance;