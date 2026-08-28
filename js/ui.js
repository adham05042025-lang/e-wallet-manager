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
    const shouldOpen = Boolean(open);
    appSidebar.classList.toggle('mobile-menu-open', shouldOpen);
    appSidebar.setAttribute('aria-hidden', String(!shouldOpen));
    mobileMenuToggle.setAttribute('aria-expanded', String(shouldOpen));
    mobileMenuToggle.setAttribute('aria-label', shouldOpen ? 'Close navigation menu' : 'Open navigation menu');
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-bars', !shouldOpen);
        icon.classList.toggle('fa-xmark', shouldOpen);
    }
    if (mobileNavOverlay) {
        mobileNavOverlay.classList.toggle('hidden', !shouldOpen);
        mobileNavOverlay.setAttribute('aria-hidden', String(!shouldOpen));
    }
    document.body.classList.toggle('mobile-nav-is-open', shouldOpen);
}

setMobileMenu(false);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && appSidebar?.classList.contains('mobile-menu-open')) {
        setMobileMenu(false);
        mobileMenuToggle?.focus();
    }
});

mobileMenuToggle?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMobileMenu(!appSidebar?.classList.contains('mobile-menu-open'));
});
mobileNavOverlay?.addEventListener('click', () => setMobileMenu(false));

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        contentSections.forEach(sec => sec.classList.add('hidden'));
        const targetId = item.getAttribute('data-target');
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.classList.remove('hidden');
        if (typeof refreshSectionData === 'function') refreshSectionData(targetId);
        setMobileMenu(false);
    });
});

window.addEventListener('resize', () => { if (window.innerWidth > 768) setMobileMenu(false); });
window.setMobileMenu = setMobileMenu;

// 2. إدارة النوافذ المنبثقة (Modals)
function setupModal(openBtnId, modalId) {
    const openBtn = document.getElementById(openBtnId);
    const modal = document.getElementById(modalId);
    if (!openBtn || !modal) return;
    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => modal.classList.add('hidden')));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}
setupModal('open-add-client-modal', 'modal-client');
setupModal('open-add-task-modal', 'modal-task');
setupModal('open-add-expense-modal', 'modal-expense');
setupModal('open-add-movement-modal', 'modal-movement');
function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.classList.add('hidden'); }

// Finance fixes are loaded after app.js so they can safely replace only the broken accounting flows.
const financeFixScript = document.createElement('script');
financeFixScript.src = 'js/finance-fixes.js?v=20260829-1';
financeFixScript.defer = false;
document.body.appendChild(financeFixScript);