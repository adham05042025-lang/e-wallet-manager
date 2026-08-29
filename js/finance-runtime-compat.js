/* Finance runtime compatibility helpers */
(function () {
    'use strict';

    if (typeof window.formatMoney !== 'function') {
        window.formatMoney = value => `ج.م ${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
    }

    if (typeof window.getMovementSummary !== 'function') {
        window.getMovementSummary = () => ({
            cashImpact: 0,
            customerPending: 0,
            heldCustomerFunds: 0,
            loansOutstanding: 0,
            obligations: 0
        });
    }
})();
