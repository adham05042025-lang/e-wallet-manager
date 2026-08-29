const SUPABASE_URL = 'https://cvhgwtjfpwnaergxjldl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Lo0SsmalFrf-srccTMig_q4ryBu2K';
window.formatMoney = function(amount){const n=Number(amount);return `ج.م ${Number.isFinite(n)?n.toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00'}`;};
window.getMovementSummary = function(){return {cashImpact:0,customerPending:0,heldCustomerFunds:0,loansOutstanding:0,obligations:0};};
window.loadExpenses = async function(){return;};
window.loadMovements = async function(){return;};
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
document.addEventListener('DOMContentLoaded',()=>{
 const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`${src}?v=20260829-0415`;script.onload=resolve;script.onerror=reject;document.body.appendChild(script);});
 load('js/finance-fixes.js').then(()=>load('js/finance-fixes-patch.js')).then(()=>load('js/finance-dashboard-fix.js')).catch(error=>console.error('Finance fixes failed to load:',error));
});
