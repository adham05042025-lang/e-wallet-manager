(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const num = v => Number(v || 0);
  const monthNow = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const nextMonth = m => { const [y,mo]=m.split('-').map(Number); const d=new Date(y,mo,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const uid = async () => (await supabaseClient.auth.getUser()).data?.user?.id;
  const refresh = async () => {
    if (typeof loadAll === 'function') return loadAll();
    await Promise.all([
      typeof loadDashboardData==='function' ? loadDashboardData() : Promise.resolve(),
      typeof loadClients==='function' ? loadClients() : Promise.resolve(),
      typeof loadTasks==='function' ? loadTasks() : Promise.resolve(),
      typeof loadSalary==='function' ? loadSalary() : Promise.resolve(),
      typeof loadExpenses==='function' ? loadExpenses() : Promise.resolve(),
      typeof loadMovements==='function' ? loadMovements() : Promise.resolve(),
      typeof loadObligations==='function' ? loadObligations() : Promise.resolve(),
      typeof loadReports==='function' ? loadReports() : Promise.resolve()
    ]);
  };
  const open = () => $('modal')?.classList.remove('hidden');
  const close = () => $('modal')?.classList.add('hidden');

  async function addFixedExpense() {
    const box=$('modal-content'); if(!box)return;
    box.innerHTML=`<h2>Add Fixed Expense</h2><form id="fixed-expense-form">
      <label>Expense name<input id="fx-title" required></label>
      <div class="form-grid"><label>Amount<input id="fx-amount" type="number" min="0.01" step="0.01" required></label>
      <label>Month<input id="fx-month" type="month" value="${monthNow()}" required></label></div>
      <label>Due date<input id="fx-due" type="date"></label>
      <label class="check-row"><input id="fx-paid" type="checkbox"> Paid now</label>
      <button class="btn primary" type="submit">Save Expense</button>
    </form>`;
    open();
    $('fixed-expense-form').onsubmit=async e=>{
      e.preventDefault();
      const user=await uid();
      const {error}=await supabaseClient.from('expenses').insert([{
        user_id:user,title:$('fx-title').value.trim(),amount:num($('fx-amount').value),
        month_year:$('fx-month').value,due_date:$('fx-due').value||null,is_paid:$('fx-paid').checked
      }]);
      if(error){alert(error.message);return;}
      close(); await refresh();
    };
  }

  async function addDailyExpense(e) {
    e.preventDefault();
    const title=$('daily-title')?.value.trim(), amount=num($('daily-amount')?.value);
    if(!title || amount<=0){alert('Enter a valid daily expense.');return;}
    const {error}=await supabaseClient.from('daily_expenses').insert([{user_id:await uid(),title,amount}]);
    if(error){alert(error.message);return;}
    e.target.reset(); await refresh();
  }

  function wire() {
    const fx=$('open-add-expense-modal'); if(fx) fx.onclick=addFixedExpense;
    const daily=$('form-daily-expense'); if(daily){ daily.onsubmit=addDailyExpense; }
    const mc=$('modal-close'); if(mc) mc.onclick=close;
    const modal=$('modal'); if(modal) modal.onclick=e=>{if(e.target===modal)close();};
  }
  document.addEventListener('DOMContentLoaded',wire);
  window.financeActionsWire=wire;
})();
