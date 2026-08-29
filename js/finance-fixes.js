/* Finance/task balance fix v3 */
(function () {
    'use strict';

    const M = value => `ج.م ${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
    const C = (value, currency) => currency === 'USD'
        ? `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        : M(value);
    const month = () => new Date().toISOString().slice(0, 7);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));

    function clientRate(client) {
        return client.currency === 'USD' ? Number(client.exchange_rate || 0) : 1;
    }

    function clientNetBudgetEGP(client) {
        if (client.currency === 'USD') {
            const stored = Number(client.total_budget_egp);
            if (Number.isFinite(stored) && stored > 0) return stored;
            return Math.max(0, Number(client.total_budget || 0) * clientRate(client) - Number(client.transfer_fee_egp || 0));
        }
        return Number(client.total_budget_egp ?? client.total_budget ?? 0);
    }

    function taskEGP(task) {
        const stored = Number(task.amount_egp);
        if (Number.isFinite(stored) && stored >= 0) return stored;
        return task.currency === 'USD'
            ? Number(task.cost || 0) * Number(task.exchange_rate || 0)
            : Number(task.cost || 0);
    }

    function legacyCollectedNetEGP(client) {
        const grossCollected = Math.max(0, Number(client.collected_amount || 0));
        if (!grossCollected) return 0;
        if (client.currency !== 'USD') return grossCollected;
        const grossBudget = Number(client.total_budget || 0);
        const rate = clientRate(client);
        const fee = Number(client.transfer_fee_egp || 0);
        const feeShare = grossBudget > 0 ? fee * Math.min(1, grossCollected / grossBudget) : 0;
        return Math.max(0, grossCollected * rate - feeShare);
    }

    async function getClient(id) {
        const { data, error } = await supabaseClient.from('clients').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    }

    async function getClientPayments(clientIds) {
        if (!clientIds.length) return {};
        const { data, error } = await supabaseClient
            .from('client_payments')
            .select('client_id,amount,currency,exchange_rate,amount_egp,month_year,collected_at')
            .in('client_id', clientIds);
        if (error) throw error;
        return (data || []).reduce((map, payment) => {
            const id = payment.client_id;
            map[id] ||= { netEgp: 0, grossByCurrency: 0, count: 0 };
            map[id].netEgp += Number(payment.amount_egp || 0);
            map[id].grossByCurrency += Number(payment.amount || 0);
            map[id].count++;
            return map;
        }, {});
    }

    async function getTasksByClient(clientIds) {
        if (!clientIds.length) return {};
        const { data, error } = await supabaseClient
            .from('tasks')
            .select('client_id,cost,currency,exchange_rate,amount_egp')
            .in('client_id', clientIds);
        if (error) throw error;
        return (data || []).reduce((map, task) => {
            const id = task.client_id;
            map[id] ||= { egp: 0, count: 0 };
            map[id].egp += taskEGP(task);
            map[id].count++;
            return map;
        }, {});
    }

    async function syncClientRemaining(client) {
        const { data: tasks, error } = await supabaseClient
            .from('tasks')
            .select('cost,currency,exchange_rate,amount_egp')
            .eq('client_id', client.id);
        if (error) throw error;

        const usedEgp = (tasks || []).reduce((sum, task) => sum + taskEGP(task), 0);
        const budgetEgp = clientNetBudgetEGP(client);
        const remainingEgp = Math.max(0, budgetEgp - usedEgp);
        const rate = clientRate(client);
        const remainingForeign = client.currency === 'USD' && rate > 0 ? remainingEgp / rate : remainingEgp;

        const { error: updateError } = await supabaseClient.from('clients').update({
            remaining_budget: remainingForeign,
            remaining_budget_egp: remainingEgp
        }).eq('id', client.id);
        if (updateError) throw updateError;
        return { usedEgp, budgetEgp, remainingEgp, remainingForeign };
    }

    async function currentMonthClientCash() {
        const m = month();
        const { data, error } = await supabaseClient
            .from('client_payments')
            .select('amount_egp')
            .eq('month_year', m);
        if (error) return 0;
        return (data || []).reduce((sum, row) => sum + Number(row.amount_egp || 0), 0);
    }

    async function legacyClientCashFallback() {
        const { data: clients, error } = await supabaseClient.from('clients').select('*');
        if (error) return 0;
        const { data: payments } = await supabaseClient.from('client_payments').select('client_id').limit(1);
        if (payments?.length) return 0;
        return (clients || []).reduce((sum, client) => sum + legacyCollectedNetEGP(client), 0);
    }

    async function loadClientsFix() {
        const { data: clients, error } = await supabaseClient.from('clients').select('*').order('id', { ascending: false });
        if (error) return console.error(error);

        const ids = (clients || []).map(client => client.id);
        const [tasks, payments] = await Promise.all([getTasksByClient(ids), getClientPayments(ids)]);
        const tbody = document.getElementById('clients-table-body');
        const select = document.getElementById('task-client-id');
        const pendingEl = document.getElementById('total-pending-income');
        if (tbody) tbody.innerHTML = '';
        if (select) select.innerHTML = '<option value="">Select Client...</option>';

        let pendingReceivables = 0;

        (clients || []).forEach(client => {
            const currency = client.currency === 'USD' ? 'USD' : 'EGP';
            const rate = clientRate(client);
            const budgetEgp = clientNetBudgetEGP(client);
            const used = tasks[client.id]?.egp || 0;
            const workRemainingEgp = Math.max(0, budgetEgp - used);
            const workRemaining = currency === 'USD' && rate > 0 ? workRemainingEgp / rate : workRemainingEgp;
            const paymentNetEgp = payments[client.id]?.netEgp || legacyCollectedNetEGP(client);
            const receivableEgp = Math.max(0, budgetEgp - paymentNetEgp);
            pendingReceivables += receivableEgp;
            const collectedGross = Number(client.collected_amount || 0);

            if (tbody) tbody.innerHTML += `
                <tr>
                    <td>${esc(client.name)}</td>
                    <td><strong>${C(client.total_budget, currency)}</strong><small class="movement-description">Net: ${M(budgetEgp)}</small></td>
                    <td><strong>${C(collectedGross, currency)}</strong><small class="movement-description">Received net: ${M(paymentNetEgp)}</small></td>
                    <td><strong>${C(workRemaining, currency)}</strong><small class="movement-description">After ${tasks[client.id]?.count || 0} task(s): ${M(workRemainingEgp)}</small></td>
                    <td><strong>${C(currency === 'USD' && rate > 0 ? used / rate : used, currency)}</strong><small class="movement-description">${M(used)} work value</small></td>
                    <td><span class="status-badge ${client.delivery_status === 'delivered' ? 'collected' : 'pending'}">${esc(client.delivery_status || 'not_started')}</span></td>
                    <td>
                        ${receivableEgp > 0 ? `<button class="btn btn-primary btn-sm" onclick="collectClientIncome(${client.id})">Collect</button>` : '<span style="color:var(--text-secondary);font-size:12px">Fully collected</span>'}
                        <button class="btn btn-secondary btn-sm" style="width:auto" onclick="deleteClient(${client.id})">Delete</button>
                    </td>
                </tr>`;
            if (select) select.innerHTML += `<option value="${client.id}">${esc(client.name)} — ${C(workRemaining, currency)} work left</option>`;
        });

        if (pendingEl) pendingEl.textContent = M(pendingReceivables);
        const dashboardPending = document.getElementById('dash-pending-income');
        if (dashboardPending) dashboardPending.textContent = M(pendingReceivables);
    }

    async function loadTasksFix() {
        const { data: tasks, error } = await supabaseClient
            .from('tasks')
            .select('*,clients(name,total_budget,total_budget_egp,currency,exchange_rate,transfer_fee_egp)')
            .order('id', { ascending: false });
        if (error) return console.error(error);
        const byClient = {};
        (tasks || []).forEach(task => byClient[task.client_id] = (byClient[task.client_id] || 0) + taskEGP(task));
        const tbody = document.getElementById('tasks-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        (tasks || []).forEach(task => {
            const client = task.clients || {};
            const currency = client.currency === 'USD' ? 'USD' : 'EGP';
            const rate = client.currency === 'USD' ? Number(client.exchange_rate || 0) : 1;
            const budgetEgp = Number(client.total_budget_egp ?? Number(client.total_budget || 0) * rate);
            const usedEgp = byClient[task.client_id] || 0;
            const remainingEgp = Math.max(0, budgetEgp - usedEgp);
            const remaining = currency === 'USD' && rate > 0 ? remainingEgp / rate : remainingEgp;
            tbody.innerHTML += `
                <tr>
                    <td>${esc(task.title)}</td>
                    <td>${esc(client.name || 'N/A')}</td>
                    <td><strong>${C(task.cost, task.currency === 'USD' ? 'USD' : 'EGP')}</strong><small class="movement-description">${M(taskEGP(task))} EGP</small></td>
                    <td><span style="color:${task.status === 'completed' ? 'var(--accent)' : 'orange'}">${task.status === 'completed' ? 'Completed' : 'Pending'}</span></td>
                    <td><small class="movement-description">Client balance: ${C(remaining, currency)}</small>${task.status !== 'completed' ? `<button class="btn btn-primary btn-sm" onclick="completeTask('${task.id}')">Complete</button>` : ''}<button class="btn btn-secondary btn-sm" onclick="deleteTask('${task.id}')">Delete</button></td>
                </tr>`;
        });
    }

    function taskUI() {
        const form = document.getElementById('form-task');
        if (!form || document.getElementById('task-currency')) return;
        const row = document.createElement('div');
        row.className = 'form-row';
        row.innerHTML = '<div class="form-group"><label>Currency</label><select id="task-currency"><option value="EGP">جنيه مصري (EGP)</option><option value="USD">دولار أمريكي (USD)</option></select></div><div class="form-group" id="task-rate-wrap" style="display:none"><label>USD → EGP rate</label><input id="task-exchange-rate" type="number" step="0.0001" min="0"></div>';
        form.insertBefore(row, form.querySelector('.modal-actions'));
        document.getElementById('task-currency').addEventListener('change', async event => {
            const usd = event.target.value === 'USD';
            document.getElementById('task-rate-wrap').style.display = usd ? '' : 'none';
            if (usd && typeof fetchUsdEgpRate === 'function') {
                try {
                    const result = await fetchUsdEgpRate(false);
                    document.getElementById('task-exchange-rate').value = Number(result.rate).toFixed(4);
                } catch (_) {}
            }
        });
    }

    async function saveTaskFix(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const clientId = document.getElementById('task-client-id')?.value;
        const title = document.getElementById('task-title')?.value.trim();
        const cost = Number(document.getElementById('task-cost')?.value);
        const currency = document.getElementById('task-currency')?.value || 'EGP';
        let rate = Number(document.getElementById('task-exchange-rate')?.value || 0);
        if (!clientId || !title || !Number.isFinite(cost) || cost <= 0) return alert('Enter a valid client, title and task value.');
        const client = await getClient(clientId);
        if (currency === 'USD') {
            if (!rate && client.currency === 'USD') rate = Number(client.exchange_rate || 0);
            if (!rate && typeof fetchUsdEgpRate === 'function') {
                try { rate = Number((await fetchUsdEgpRate(false)).rate); } catch (_) {}
            }
            if (!rate) return alert('A valid USD → EGP rate is required.');
        } else rate = 1;

        const before = await syncClientRemaining(client);
        const amountEgp = cost * rate;
        if (before.usedEgp + amountEgp > before.budgetEgp + 0.000001) {
            return alert(`Task exceeds client work balance. Remaining: ${M(before.remainingEgp)}`);
        }

        const user = (await supabaseClient.auth.getUser()).data?.user;
        const row = { client_id: clientId, title, cost, currency, exchange_rate: rate, amount_egp: amountEgp, status: 'pending' };
        if (user?.id) row.user_id = user.id;
        const { error } = await supabaseClient.from('tasks').insert([row]);
        if (error) return alert(error.message);
        await syncClientRemaining(client);
        document.getElementById('form-task')?.reset();
        if (document.getElementById('task-rate-wrap')) document.getElementById('task-rate-wrap').style.display = 'none';
        if (typeof closeModal === 'function') closeModal('modal-task');
        await loadTasksFix();
        await loadClientsFix();
        if (typeof loadDashboardData === 'function') await loadDashboardData();
    }

    async function completeTaskFix(id) {
        const { data: task, error } = await supabaseClient.from('tasks').select('id,status,client_id').eq('id', id).single();
        if (error || !task || task.status === 'completed') return;
        const { error: updateError } = await supabaseClient.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
        if (updateError) return alert(updateError.message);
        const client = await getClient(task.client_id);
        await syncClientRemaining(client);
        await loadTasksFix();
        await loadClientsFix();
        if (typeof loadDashboardData === 'function') await loadDashboardData();
    }

    async function deleteTaskFix(id) {
        if (!confirm('Delete task? Its value will immediately return to the client work balance.')) return;
        const { data: task, error: getError } = await supabaseClient.from('tasks').select('client_id').eq('id', id).single();
        if (getError) return alert(getError.message);
        const { error } = await supabaseClient.from('tasks').delete().eq('id', id);
        if (error) return alert(error.message);
        await syncClientRemaining(await getClient(task.client_id));
        await loadTasksFix();
        await loadClientsFix();
        if (typeof loadDashboardData === 'function') await loadDashboardData();
    }

    async function collectFix(clientId) {
        const client = await getClient(clientId);
        const currency = client.currency === 'USD' ? 'USD' : 'EGP';
        const rate = clientRate(client);
        const budgetGross = Number(client.total_budget || 0);
        const alreadyCollected = Number(client.collected_amount || 0);
        const grossRemaining = Math.max(0, budgetGross - alreadyCollected);
        if (grossRemaining <= 0) return;
        const input = prompt(`Amount to collect (remaining: ${C(grossRemaining, currency)})`, grossRemaining);
        if (input === null) return;
        const amount = Number(input);
        if (!Number.isFinite(amount) || amount <= 0 || amount > grossRemaining) return alert('Enter a valid amount within the remaining client balance.');

        let netEgp = amount;
        if (currency === 'USD') {
            const fee = Number(client.transfer_fee_egp || 0);
            const feeShare = budgetGross > 0 ? fee * (amount / budgetGross) : 0;
            netEgp = Math.max(0, amount * rate - feeShare);
        }

        const user = (await supabaseClient.auth.getUser()).data?.user;
        const payment = {
            client_id: clientId,
            user_id: user?.id || null,
            amount,
            currency,
            exchange_rate: rate,
            amount_egp: netEgp,
            month_year: month(),
            collected_at: new Date().toISOString()
        };
        const { error: paymentError } = await supabaseClient.from('client_payments').insert([payment]);
        if (paymentError) return alert(paymentError.message);

        const newCollected = alreadyCollected + amount;
        const { error } = await supabaseClient.from('clients').update({
            collected_amount: newCollected,
            is_collected: newCollected >= budgetGross - 0.000001,
            collection_status: newCollected >= budgetGross - 0.000001 ? 'collected' : 'partially_collected'
        }).eq('id', clientId);
        if (error) return alert(error.message);
        await loadClientsFix();
        if (typeof loadDashboardData === 'function') await loadDashboardData();
    }

    async function deleteClientFix(id) {
        if (!confirm('Are you sure you want to delete this client and all associated tasks?')) return;
        const { error } = await supabaseClient.from('clients').delete().eq('id', id);
        if (error) return alert(error.message);
        await loadClientsFix();
        await loadTasksFix();
        if (typeof loadDashboardData === 'function') await loadDashboardData();
    }

    async function dashboardFix() {
        const m = month();
        const [{ data: salaries }, clientCash, legacyCash, { data: expenses }, { data: daily }, { data: adjustments }] = await Promise.all([
            supabaseClient.from('salaries').select('amount').eq('month_year', m).eq('is_received', true),
            currentMonthClientCash(),
            legacyClientCashFallback(),
            supabaseClient.from('expenses').select('amount').eq('month_year', m).eq('is_paid', true),
            supabaseClient.from('daily_expenses').select('amount').gte('created_at', `${m}-01`).lt('created_at', `${m}-32`),
            supabaseClient.from('balance_adjustments').select('amount').eq('month_year', m).order('created_at', { ascending: false }).limit(1)
        ]);
        const salary = (salaries || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const clientIncome = clientCash + legacyCash;
        const fixed = (expenses || []).reduce((s, x) => s + Number(x.amount || 0), 0) + (typeof recurringPaidExpensesTotal === 'function' ? recurringPaidExpensesTotal(m) : 0);
        const dailyTotal = (daily || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const adjustment = adjustments?.[0] ? Number(adjustments[0].amount || 0) : 0;
        const movements = typeof getMovementSummary === 'function' ? getMovementSummary() : { cashImpact: 0, customerPending: 0, heldCustomerFunds: 0, loansOutstanding: 0, obligations: 0 };
        const available = salary + clientIncome + adjustment + Number(movements.cashImpact || 0) - fixed - dailyTotal;
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = M(value); };
        set('dash-salary', salary);
        set('dash-clients-income', clientIncome);
        set('dash-expenses', fixed);
        set('dash-daily-expenses', dailyTotal);
        set('dash-available', available);
        set('dash-held-funds', movements.heldCustomerFunds || 0);
        set('dash-loans-outstanding', movements.loansOutstanding || 0);
        set('dash-obligations', movements.obligations || 0);
        await loadClientsFix();
        await loadTasksFix();
    }

    function intercept() {
        document.addEventListener('submit', event => {
            if (event.target?.id === 'form-task') saveTaskFix(event);
        }, true);
    }

    function init() {
        taskUI();
        intercept();
        window.loadClients = loadClientsFix;
        window.loadTasks = loadTasksFix;
        window.completeTask = completeTaskFix;
        window.deleteTask = deleteTaskFix;
        window.collectClientIncome = collectFix;
        window.deleteClient = deleteClientFix;
        window.setAvailableBalance = window.setAvailableBalance || (async value => {
            const n = Number(value);
            if (!Number.isFinite(n)) return;
            const { error } = await supabaseClient.from('balance_adjustments').insert([{ amount: n, month_year: month(), created_at: new Date().toISOString() }]);
            if (error) alert(error.message); else dashboardFix();
        });
        const originalDashboard = window.loadDashboardData;
        if (typeof originalDashboard === 'function' && !originalDashboard.__financeFixV3) {
            const wrapped = async function () {
                const result = await originalDashboard.apply(this, arguments);
                await dashboardFix();
                return result;
            };
            wrapped.__financeFixV3 = true;
            window.loadDashboardData = wrapped;
        }
        dashboardFix().catch(console.error);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();