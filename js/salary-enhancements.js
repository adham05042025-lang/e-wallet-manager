(()=>{
  const $=id=>document.getElementById(id);
  const nextMonth=()=>{const d=new Date();d.setMonth(d.getMonth()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  function init(){
    const btn=$('btn-edit-next-salary');
    if(!btn||btn.dataset.bound)return;
    btn.dataset.bound='1';
    btn.addEventListener('click',()=>{
      const month=nextMonth();
      const monthInput=$('salary-month');
      const amountInput=$('salary-amount');
      if(monthInput) monthInput.value=month;
      if(amountInput) amountInput.focus();
      const section=$('sec-salary');
      if(section){document.querySelectorAll('.content-section').forEach(s=>s.classList.add('hidden'));section.classList.remove('hidden');}
      document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.target==='sec-salary'));
      if($('page-title'))$('page-title').textContent='Salary';
      document.querySelector('.salary-card')?.scrollIntoView({behavior:'smooth',block:'start'});
      setTimeout(()=>monthInput?.focus(),150);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
