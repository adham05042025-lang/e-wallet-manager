(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = value => `ج.م ${Number(value || 0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  async function renderDailyExpenses() {
    const list = $('daily-expenses-list');
    if (!list || !window.supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { list.innerHTML = ''; return; }
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+1);
    const { data, error } = await supabaseClient
      .from('daily_expenses')
      .select('id,title,amount,created_at')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending:false });
    if (error) { console.error('Daily expenses:', error); list.innerHTML='<div class="empty">Could not load daily expenses.</div>'; return; }
    if (!data?.length) { list.innerHTML='<div class="empty">No daily expenses today.</div>'; return; }
    list.innerHTML = data.map(x => `<div class="daily-expense-item"><div><strong>${escapeHtml(x.title)}</strong><small>${new Date(x.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</small></div><strong>${money(x.amount)}</strong></div>`).join('');
  }

  function install() {
    const original = window.loadDashboardData;
    if (typeof original === 'function' && !original.__dailyWrapped) {
      const wrapped = async function(...args) {
        const result = await original.apply(this,args);
        await renderDailyExpenses();
        return result;
      };
      wrapped.__dailyWrapped = true;
      window.loadDashboardData = wrapped;
    }
    renderDailyExpenses();
  }

  document.addEventListener('DOMContentLoaded', install);
  if (window.supabaseClient) supabaseClient.auth.onAuthStateChange(() => setTimeout(renderDailyExpenses,150));
  window.renderDailyExpenses = renderDailyExpenses;
})();
