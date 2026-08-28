const SUPABASE_URL = 'https://cvhgwtjfpwnaergxjldl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Lo0SsmalFrf-fssrccTMig_q4ryBu2K';

// تغيير اسم المتغير لمنع التضارب مع المكتبة الأصلية
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);