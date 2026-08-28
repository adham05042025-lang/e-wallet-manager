// ==========================================
// إدارة الواجهة (UI Navigation & Modals)
// ==========================================

// 1. التنقل بين الأقسام عبر Sidebar
const navItems = document.querySelectorAll('.nav-item');
const contentSections = document.querySelectorAll('.content-section');
const appSidebar = document.getElementById('app-sidebar');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileNavOverlay = document.getElementById('mobile-nav-overlay');

function setMobileMenu(open) {
    if (!appSidebar || !mobileMenuToggle) return;
    appSidebar.classList.toggle('mobile-menu-open', open);
    mobileMenuToggle.setAttribute('aria-expanded', String(open));
    mobileMenuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-bars', !open);
        icon.classList.toggle('fa-xmark', open);
    }
    if (mobileNavOverlay) mobileNavOverlay.classList.toggle('hidden', !open);
    document.body.classList.toggle('mobile-nav-is-open', open);
}

mobileMenuToggle?.addEventListener('click', () => {
    setMobileMenu(!appSidebar?.classList.contains('mobile-menu-open'));
});
mobileNavOverlay?.addEventListener('click', () => setMobileMenu(false));

navItems.forEach(item => {
    item.addEventListener('click', () => {
        // إزالة التنشيط من جميع الأزرار
        navItems.forEach(nav => nav.classList.remove('active'));
        // إضافة التنشيط للزر الحالي
        item.classList.add('active');

        // إخفاء جميع الأقسام
        contentSections.forEach(sec => sec.classList.add('hidden'));

        // إظهار القسم المطلوب
        const targetId = item.getAttribute('data-target');
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }

        // إعادة تحميل البيانات الخاصة بالقسم المحدد
        if (typeof refreshSectionData === 'function') {
            refreshSectionData(targetId);
        }
        setMobileMenu(false);
    });
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 768) setMobileMenu(false);
});

// 2. إدارة النوافذ المنبثقة (Modals)
function setupModal(openBtnId, modalId) {
    const openBtn = document.getElementById(openBtnId);
    const modal = document.getElementById(modalId);
    
    if (!openBtn || !modal) return;

    // فتح المودال
    openBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    // إغلاق المودال عند الضغط على زر الإلغاء أو أزرار close-modal
    const closeBtns = modal.querySelectorAll('.close-modal');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    });

    // إغلاق المودال عند الضغط خارجه
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// تفعيل المودالات للنماذج المختلفة
setupModal('open-add-client-modal', 'modal-client');
setupModal('open-add-task-modal', 'modal-task');
setupModal('open-add-expense-modal', 'modal-expense');
setupModal('open-add-movement-modal', 'modal-movement');

// دالة إغلاق المودال برمجياً بعد الحفظ
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}