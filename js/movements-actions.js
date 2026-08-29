(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const num = value => Number(value || 0);

  async function userId() {
    const result = await supabaseClient.auth.getUser();
    return result.data?.user?.id;
  }

  function closeModal() {
    $('modal')?.classList.add('hidden');
  }

  async function refresh() {
    if (typeof window.loadAll === 'function') await window.loadAll();
    window.dispatchEvent(new Event('finance:data-changed'));
  }

  function openForm(title, fields, save) {
    const modal = $('modal');
    const content = $('modal-content');
    if (!modal || !content) return;

    content.innerHTML = `<h2>${title}</h2><form id="movement-form">${fields}<div class="actions"><button class="btn primary" type="submit">Save</button><button class="btn secondary" type="button" id="movement-cancel">Cancel</button></div></form>`;
    modal.classList.remove('hidden');

    $('movement-cancel').onclick = closeModal;
    $('movement-form').onsubmit = async event => {
      event.preventDefault();
      try {
        await save();
        closeModal();
        await refresh();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Operation failed');
      }
    };
  }

  async function addMovement() {
    const uid = await userId();
    if (!uid) return alert('Please sign in first.');

    openForm('Add Money Movement', `
      <label>Type<select id="mv-type">
        <option value="deposit">Income / Deposit — فلوس دخلت</option>
        <option value="withdrawal">Expense / Withdrawal — فلوس خرجت</option>
        <option value="money_owed_to_me">Money Owed to Me — ليّا فلوس</option>
        <option value="money_i_owe">Money I Owe — عليّا فلوس</option>
        <option value="transfer">Transfer — تحويل</option>
        <option value="other">Other — أخرى</option>
      </select></label>
      <label>Description<input id="mv-title" required></label>
      <label>Amount<input id="mv-amount" type="number" min="0.01" step="0.01" required></label>
      <label>Currency<select id="mv-currency"><option>EGP</option><option>USD</option></select></label>
      <label>Exchange Rate<input id="mv-rate" type="number" min="0.0001" step="0.0001" value="1"></label>
      <label>Fee (EGP)<input id="mv-fee" type="number" min="0" step="0.01" value="0"></label>
      <label>Notes<textarea id="mv-notes"></textarea></label>
    `, async () => {
      const type = $('mv-type').value;
      const amount = num($('mv-amount').value);
      const currency = $('mv-currency').value;
      const rate = num($('mv-rate').value) || 1;
      const fee = num($('mv-fee').value);
      const row = {
        user_id: uid,
        type,
        title: $('mv-title').value.trim(),
        amount,
        currency,
        exchange_rate: rate,
        fee_egp: fee,
        status: ['money_owed_to_me', 'money_i_owe'].includes(type) ? 'pending' : 'completed',
        movement_date: new Date().toISOString(),
        notes: $('mv-notes').value.trim()
      };
      const result = await supabaseClient.from('movements').insert(row);
      if (result.error) throw result.error;
    });
  }

  async function editMovement(id) {
    const uid = await userId();
    const result = await supabaseClient.from('movements').select('*').eq('id', id).eq('user_id', uid).single();
    if (result.error) throw result.error;
    const m = result.data;

    openForm('Edit Money Movement', `
      <label>Type<select id="mv-type">
        <option value="deposit">Income / Deposit</option>
        <option value="withdrawal">Expense / Withdrawal</option>
        <option value="money_owed_to_me">Money Owed to Me — ليّا فلوس</option>
        <option value="money_i_owe">Money I Owe — عليّا فلوس</option>
        <option value="transfer">Transfer</option>
        <option value="other">Other</option>
      </select></label>
      <label>Description<input id="mv-title" required></label>
      <label>Amount<input id="mv-amount" type="number" min="0" step="0.01" required></label>
      <label>Currency<select id="mv-currency"><option>EGP</option><option>USD</option></select></label>
      <label>Exchange Rate<input id="mv-rate" type="number" min="0.0001" step="0.0001"></label>
      <label>Fee (EGP)<input id="mv-fee" type="number" min="0" step="0.01"></label>
      <label>Notes<textarea id="mv-notes"></textarea></label>
    `, async () => {
      const type = $('mv-type').value;
      const update = {
        type,
        title: $('mv-title').value.trim(),
        amount: num($('mv-amount').value),
        currency: $('mv-currency').value,
        exchange_rate: num($('mv-rate').value) || 1,
        fee_egp: num($('mv-fee').value),
        notes: $('mv-notes').value.trim()
      };
      const saved = await supabaseClient.from('movements').update(update).eq('id', id).eq('user_id', uid);
      if (saved.error) throw saved.error;
    });

    $('mv-type').value = m.type || 'other';
    $('mv-title').value = m.title || '';
    $('mv-amount').value = m.amount || 0;
    $('mv-currency').value = m.currency || 'EGP';
    $('mv-rate').value = m.exchange_rate || 1;
    $('mv-fee').value = m.fee_egp || 0;
    $('mv-notes').value = m.notes || '';
  }

  async function deleteMovement(id) {
    if (!confirm('Delete this movement?')) return;
    const result = await supabaseClient.from('movements').delete().eq('id', id).eq('user_id', await userId());
    if (result.error) return alert(result.error.message);
    await refresh();
  }

  async function settleMovement(id) {
    const uid = await userId();
    const result = await supabaseClient.from('movements').select('*').eq('id', id).eq('user_id', uid).single();
    if (result.error) throw result.error;
    const movement = result.data;

    if (!['money_owed_to_me', 'money_i_owe'].includes(movement.type)) {
      return alert('Settlement is only available for Money Owed to Me / Money I Owe.');
    }

    const total = num(movement.amount);
    const already = num(movement.settled_amount);
    const remaining = Math.max(0, total - already);
    if (remaining <= 0) return alert('This movement is already fully settled.');

    openForm(movement.type === 'money_owed_to_me' ? 'Receive Payment' : 'Make Payment', `
      <p>Original: <strong>${total.toLocaleString()}</strong></p>
      <p>Settled: <strong>${already.toLocaleString()}</strong></p>
      <p>Remaining: <strong>${remaining.toLocaleString()}</strong></p>
      <label>Amount<input id="settle-amount" type="number" min="0.01" max="${remaining}" step="0.01" value="${remaining}" required></label>
    `, async () => {
      const payment = num($('settle-amount').value);
      if (payment <= 0 || payment > remaining) throw new Error('Invalid settlement amount.');
      const newSettled = already + payment;
      const update = {
        settled_amount: newSettled,
        status: newSettled >= total ? 'completed' : 'pending'
      };
      const saved = await supabaseClient.from('movements').update(update).eq('id', id).eq('user_id', uid);
      if (saved.error) throw saved.error;
    });
  }

  function wire() {
    if (window.__movementsWire) return;
    window.__movementsWire = true;

    $('open-add-movement-modal')?.addEventListener('click', event => {
      event.preventDefault();
      addMovement().catch(error => alert(error.message || error));
    });
    $('modal-close')?.addEventListener('click', closeModal);

    document.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      const id = button.dataset.id;

      if (action === 'edit-movement') editMovement(id).catch(error => alert(error.message || error));
      else if (action === 'delete-movement') deleteMovement(id);
      else if (action === 'settle-movement') settleMovement(id).catch(error => alert(error.message || error));
      else if (action === 'report-movement') {
        event.preventDefault();
        if (typeof window.openMovementReport === 'function') window.openMovementReport(id);
        else alert('Movement report is not loaded yet.');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();