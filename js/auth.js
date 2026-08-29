(() => {
  const $=id=>document.getElementById(id);
  const msg=(id,text,type='')=>{const e=$(id);if(e){e.textContent=text;e.className=`message ${type}`;}};
  function show(screen){$('login-screen').classList.toggle('hidden',screen!=='login');$('register-screen').classList.toggle('hidden',screen!=='register');}
  window.showAuth=()=>{$('app-container').classList.add('hidden');$('auth-container').classList.remove('hidden');show('login');};
  window.showApp=async()=>{$('auth-container').classList.add('hidden');$('app-container').classList.remove('hidden');try{await loadDashboardData();await loadClients();await loadTasks();await loadSalaryForm();await loadExpenses();await loadMovements();await loadObligations();}catch(e){console.error(e);alert(e.message||'Could not load wallet data.');}};
  document.addEventListener('DOMContentLoaded',async()=>{
    $('show-register').onclick=()=>show('register');$('show-login').onclick=()=>show('login');$('btn-logout').onclick=async()=>{await supabaseClient.auth.signOut();showAuth();};
    $('login-form').onsubmit=async e=>{e.preventDefault();const b=$('btn-login');b.disabled=true;b.textContent='Signing in…';msg('login-message','');const r=await supabaseClient.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});b.disabled=false;b.textContent='Sign In';if(r.error)msg('login-message',r.error.message,'error');};
    $('register-form').onsubmit=async e=>{e.preventDefault();const p=$('register-password').value;if(p!==$('register-confirm-password').value)return msg('register-message','Passwords do not match.','error');const r=await supabaseClient.auth.signUp({email:$('register-email').value.trim(),password:p});if(r.error)return msg('register-message',r.error.message,'error');if(r.data.session)showApp();else{show('login');msg('login-message','Account created. Check your email if confirmation is enabled.','success');}};
    const {data:{session}}=await supabaseClient.auth.getSession();if(session)showApp();else showAuth();
    supabaseClient.auth.onAuthStateChange((event,session)=>{if(session)showApp();else showAuth();});
  });
})();