(function(){'use strict';
 const month=()=>new Date().toISOString().slice(0,7);
 const add=(m,n)=>{const[y,x]=m.split('-').map(Number),d=new Date(y,x-1+n,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
 const M=a=>`ج.م ${Number(a||0).toLocaleString('ar-EG',{maximumFractionDigits:2})}`;
 async function cashForMonth(m){
   const {data:payments}=await supabaseClient.from('client_payments').select('client_id,amount_egp').eq('month_year',m);
   const rows=payments||[];
   const paidByClient={};
   rows.forEach(p=>{paidByClient[p.client_id]=(paidByClient[p.client_id]||0)+Number(p.amount_egp||0)});
   const {data:clients}=await supabaseClient.from('clients').select('id,total_budget,collected_amount,currency,exchange_rate,transfer_fee_egp');
   return (clients||[]).reduce((sum,c)=>{
     if(Object.prototype.hasOwnProperty.call(paidByClient,c.id)) return sum+paidByClient[c.id];
     const gross=Number(c.collected_amount||0);
     if(!gross) return sum;
     if(c.currency!=='USD') return sum+gross;
     const budget=Number(c.total_budget||0),rate=Number(c.exchange_rate||0),fee=Number(c.transfer_fee_egp||0);
     const feeShare=budget>0?fee*Math.min(1,gross/budget):0;
     return sum+Math.max(0,gross*rate-feeShare);
   },0);
 }
 async function refresh(){
   const m=month();
   const next=add(m,1);
   const [{data:salaries},{data:expenses},{data:daily},{data:adjustments},clientIncome]=await Promise.all([
     supabaseClient.from('salaries').select('amount').eq('month_year',m).eq('is_received',true),
     supabaseClient.from('expenses').select('amount').eq('month_year',m).eq('is_paid',true),
     supabaseClient.from('daily_expenses').select('amount').gte('created_at',`${m}-01`).lt('created_at',`${next}-01`),
     supabaseClient.from('balance_adjustments').select('amount').eq('month_year',m).order('created_at',{ascending:false}).limit(1),
     cashForMonth(m)
   ]);
   const salary=(salaries||[]).reduce((s,x)=>s+Number(x.amount||0),0);
   const fixed=(expenses||[]).reduce((s,x)=>s+Number(x.amount||0),0)+(typeof recurringPaidExpensesTotal==='function'?recurringPaidExpensesTotal(m):0);
   const dailyTotal=(daily||[]).reduce((s,x)=>s+Number(x.amount||0),0);
   const adjustment=adjustments?.[0]?Number(adjustments[0].amount||0):0;
   const movements=typeof getMovementSummary==='function'?getMovementSummary():{cashImpact:0,heldCustomerFunds:0,loansOutstanding:0,obligations:0};
   const available=salary+clientIncome+adjustment+Number(movements.cashImpact||0)-fixed-dailyTotal;
   const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=M(v)};
   set('dash-salary',salary);set('dash-clients-income',clientIncome);set('dash-expenses',fixed);set('dash-daily-expenses',dailyTotal);set('dash-available',available);set('dash-held-funds',movements.heldCustomerFunds||0);set('dash-loans-outstanding',movements.loansOutstanding||0);set('dash-obligations',movements.obligations||0);
 }
 window.financeConsistencyRefresh=refresh;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(refresh,0));else setTimeout(refresh,0);
})();