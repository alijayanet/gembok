/**
 * GEMBOK-BILLING Mobile Utilities
 * Mobile-First Responsive JavaScript Functions
 * ===========================================
 */

class MobileUtils {
    constructor() {
        this.isMobile = this.detectMobile();
        this.isTouch = this.detectTouch();
        this.sidebarOpen = false;
        this.init();
    }

    /**
     * Initialize mobile utilities
     */
    init() {
        this.setupMobileSidebar();
        this.setupTouchGestures();
        this.setupOrientationHandling();
        this.setupResponsiveTables();
        this.setupMobileForms();
        this.setupMobileModals();
        this.setupMobileNavigation();
        this.setupMobileSearch();
        this.setupMobileFilters();
        this.setupMobileActions();
        this.setupMobileTooltips();
        this.setupMobileBreadcrumbs();
        this.setupMobileTabs();
        this.setupMobileAccordion();
        this.setupMobileProgress();
        this.setupMobileAlerts();
        this.setupMobileBadges();
        this.setupMobileIcons();
        this.setupMobileSpacing();
        this.setupMobileText();
        this.setupMobileVisibility();
        this.setupPerformanceOptimizations();
        this.setupAccessibility();
        this.setupDarkMode();
        this.setupPrintOptimizations();
        
        // Add mobile-specific classes to body
        if (this.isMobile) {
            document.body.classList.add('mobile-device');
        }
        if (this.isTouch) {
            document.body.classList.add('touch-device');
        }
        
        console.log('Mobile Utils initialized:', {
            isMobile: this.isMobile,
            isTouch: this.isTouch,
            userAgent: navigator.userAgent
        });
    }

    /**
     * Detect mobile device
     */
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Detect touch device
     */
    detectTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    /**
     * Setup mobile sidebar
     */
    setupMobileSidebar() {
        if (!this.isMobile) return;

        // Create mobile menu toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'mobile-menu-toggle d-block-mobile';
        toggleBtn.innerHTML = '<i class="bx bx-menu"></i>';
        toggleBtn.setAttribute('aria-label', 'Toggle mobile menu');
        toggleBtn.onclick = () => this.toggleSidebar();
        document.body.appendChild(toggleBtn);

        // Create sidebar overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.onclick = () => this.closeSidebar();
        document.body.appendChild(overlay);

        // Find existing sidebar and make it mobile-friendly
        const sidebar = document.querySelector('.sidebar, .col-md-3, .col-lg-2');
        if (sidebar) {
            sidebar.classList.add('sidebar');
            sidebar.classList.add('mobile-sidebar');
        }

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (!sidebar?.contains(e.target) && !toggleBtn.contains(e.target)) {
                this.closeSidebar();
            }
        });
    }

    /**
     * Toggle mobile sidebar
     */
    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        
        if (sidebar && overlay) {
            this.sidebarOpen = !this.sidebarOpen;
            
            if (this.sidebarOpen) {
                sidebar.classList.add('show');
                overlay.classList.add('show');
                document.body.style.overflow = 'hidden';
            } else {
                sidebar.classList.remove('show');
                overlay.classList.remove('show');
                document.body.style.overflow = '';
            }
        }
    }

    /**
     * Close mobile sidebar
     */
    closeSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        
        if (sidebar && overlay) {
            sidebar.classList.remove('show');
            overlay.classList.remove('show');
            document.body.style.overflow = '';
            this.sidebarOpen = false;
        }
    }

    /**
     * Setup touch gestures
     */
    setupTouchGestures() {
        if (!this.isTouch) return;

        // Long press detection
        let pressTimer = null;
        let startPos = null;

        document.addEventListener('touchstart', (e) => {
            startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            pressTimer = setTimeout(() => {
                this.handleLongPress(e, startPos);
            }, 500);
        });

        document.addEventListener('touchend', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });

        document.addEventListener('touchmove', (e) => {
            if (startPos) {
                const currentPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                const distance = Math.sqrt(
                    Math.pow(currentPos.x - startPos.x, 2) + 
                    Math.pow(currentPos.y - startPos.y, 2)
                );
                
                if (distance > 10) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                }
            }
        });
    }

    /**
     * Handle long press
     */
    handleLongPress(e, startPos) {
        const target = e.target;
        
        // Add long press class for visual feedback
        target.classList.add('long-press');
        
        // Remove class after animation
        setTimeout(() => {
            target.classList.remove('long-press');
        }, 200);

        // Handle different types of long press
        if (target.classList.contains('mobile-tooltip')) {
            this.showMobileTooltip(target, startPos);
        } else if (target.classList.contains('mobile-actions')) {
            this.showMobileActions(target, startPos);
        }
    }

    /**
     * Setup orientation handling
     */
    setupOrientationHandling() {
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.handleOrientationChange();
            }, 100);
        });

        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    /**
     * Handle orientation change
     */
    handleOrientationChange() {
        // Close sidebar on orientation change
        this.closeSidebar();
        
        // Recalculate layouts
        this.updateLayouts();
        
        // Trigger resize event for other components
        window.dispatchEvent(new Event('resize'));
    }

    /**
     * Handle resize
     */
    handleResize() {
        this.updateLayouts();
        this.updateResponsiveElements();
    }

    /**
     * Setup responsive tables
     */
    setupResponsiveTables() {
        const tables = document.querySelectorAll('table');
        
        tables.forEach(table => {
            if (!table.parentElement.classList.contains('table-responsive')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-responsive mobile-table';
                table.parentElement.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
    }

    /**
     * Setup mobile forms
     */
    setupMobileForms() {
        const forms = document.querySelectorAll('form');
        
        forms.forEach(form => {
            // Add mobile-friendly classes
            form.classList.add('mobile-form');
            
            // Make form controls touch-friendly
            const controls = form.querySelectorAll('input, select, textarea, button');
            controls.forEach(control => {
                if (control.type !== 'hidden') {
                    control.classList.add('mobile-control');
                }
            });
            
            // Add mobile-specific validation
            this.setupMobileFormValidation(form);
        });
    }

    /**
     * Setup mobile form validation
     */
    setupMobileFormValidation(form) {
        form.addEventListener('submit', (e) => {
            if (!this.validateMobileForm(form)) {
                e.preventDefault();
                this.showMobileValidationError(form);
            }
        });
    }

    /**
     * Validate mobile form
     */
    validateMobileForm(form) {
        let isValid = true;
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                field.classList.add('is-invalid');
                isValid = false;
            } else {
                field.classList.remove('is-invalid');
            }
        });
        
        return isValid;
    }

    /**
     * Show mobile validation error
     */
    showMobileValidationError(form) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mobile-alert alert-danger';
        errorDiv.innerHTML = '<i class="bx bx-error-circle"></i> Mohon lengkapi semua field yang wajib diisi.';
        
        form.insertBefore(errorDiv, form.firstChild);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    /**
     * Setup mobile modals
     */
    setupMobileModals() {
        // Make modals mobile-friendly
        const modals = document.querySelectorAll('.modal');
        
        modals.forEach(modal => {
            modal.classList.add('mobile-modal');
            
            // Add mobile-specific event listeners
            const closeButtons = modal.querySelectorAll('[data-bs-dismiss="modal"], .btn-close');
            closeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.closeMobileModal(modal);
                });
            });
        });
    }

    /**
     * Close mobile modal
     */
    closeMobileModal(modal) {
        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) {
            modalInstance.hide();
        }
    }

    /**
     * Setup mobile navigation
     */
    setupMobileNavigation() {
        const navs = document.querySelectorAll('nav, .navbar');
        
        navs.forEach(nav => {
            nav.classList.add('mobile-nav');
            
            // Make navigation items touch-friendly
            const navItems = nav.querySelectorAll('.nav-link, .nav-item');
            navItems.forEach(item => {
                item.classList.add('mobile-nav-item');
            });
        });
    }

    /**
     * Setup mobile search
     */
    setupMobileSearch() {
        const searchInputs = document.querySelectorAll('input[type="search"], .search-input');
        
        searchInputs.forEach(input => {
            const wrapper = document.createElement('div');
            wrapper.className = 'mobile-search';
            
            const icon = document.createElement('i');
            icon.className = 'bx bx-search search-icon';
            
            input.parentElement.insertBefore(wrapper, input);
            wrapper.appendChild(icon);
            wrapper.appendChild(input);
            
            // Add mobile search functionality
            this.setupMobileSearchFunctionality(input);
        });
    }

    /**
     * Setup mobile search functionality
     */
    setupMobileSearchFunctionality(input) {
        let searchTimeout;
        
        input.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.performMobileSearch(e.target.value);
            }, 300);
        });
    }

    /**
     * Perform mobile search
     */
    performMobileSearch(query) {
        // Implement search functionality based on page context
        console.log('Performing mobile search for:', query);
        
        // Example: Search in tables
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            this.filterTableBySearch(table, query);
        });
    }

    /**
     * Filter table by search
     */
    filterTableBySearch(table, query) {
        const rows = table.querySelectorAll('tbody tr');
        const searchTerm = query.toLowerCase();
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /**
     * Setup mobile filters
     */
    setupMobileFilters() {
        const filterContainers = document.querySelectorAll('.filters, .filter-container');
        
        filterContainers.forEach(container => {
            container.classList.add('mobile-filters');
            
            // Make filter controls mobile-friendly
            const controls = container.querySelectorAll('select, input, button');
            controls.forEach(control => {
                control.classList.add('mobile-filter-control');
            });
        });
    }

    /**
     * Setup mobile actions
     */
    setupMobileActions() {
        const actionContainers = document.querySelectorAll('.actions, .action-container');
        
        actionContainers.forEach(container => {
            container.classList.add('mobile-actions');
            
            // Make action buttons mobile-friendly
            const buttons = container.querySelectorAll('.btn');
            buttons.forEach(button => {
                button.classList.add('mobile-action-btn');
            });
        });
    }

    /**
     * Setup mobile tooltips
     */
    setupMobileTooltips() {
        const tooltipElements = document.querySelectorAll('[data-tooltip], .mobile-tooltip');
        
        tooltipElements.forEach(element => {
            element.classList.add('mobile-tooltip');
            
            if (!element.getAttribute('data-tooltip')) {
                element.setAttribute('data-tooltip', element.title || 'Tooltip');
                element.removeAttribute('title');
            }
        });
    }

    /**
     * Show mobile tooltip
     */
    showMobileTooltip(element, position) {
        const tooltip = document.createElement('div');
        tooltip.className = 'mobile-tooltip-popup';
        tooltip.textContent = element.getAttribute('data-tooltip');
        
        document.body.appendChild(tooltip);
        
        // Position tooltip
        const rect = element.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
        tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
        
        // Auto-remove tooltip
        setTimeout(() => {
            tooltip.remove();
        }, 3000);
    }

    /**
     * Setup mobile breadcrumbs
     */
    setupMobileBreadcrumbs() {
        const breadcrumbContainers = document.querySelectorAll('.breadcrumb, .breadcrumb-container');
        
        breadcrumbContainers.forEach(container => {
            container.classList.add('mobile-breadcrumb');
            
            // Make breadcrumb items mobile-friendly
            const items = container.querySelectorAll('.breadcrumb-item');
            items.forEach(item => {
                item.classList.add('mobile-breadcrumb-item');
            });
        });
    }

    /**
     * Setup mobile tabs
     */
    setupMobileTabs() {
        const tabContainers = document.querySelectorAll('.nav-tabs, .tab-container');
        
        tabContainers.forEach(container => {
            container.classList.add('mobile-tabs');
            
            // Make tab items mobile-friendly
            const items = container.querySelectorAll('.nav-link');
            items.forEach(item => {
                item.classList.add('mobile-tab-item');
            });
        });
    }

    /**
     * Setup mobile accordion
     */
    setupMobileAccordion() {
        const accordionContainers = document.querySelectorAll('.accordion, .accordion-container');
        
        accordionContainers.forEach(container => {
            container.classList.add('mobile-accordion');
            
            // Make accordion items mobile-friendly
            const items = container.querySelectorAll('.accordion-item');
            items.forEach(item => {
                item.classList.add('mobile-accordion-item');
            });
        });
    }

    /**
     * Setup mobile progress
     */
    setupMobileProgress() {
        const progressContainers = document.querySelectorAll('.progress, .progress-container');
        
        progressContainers.forEach(container => {
            container.classList.add('mobile-progress');
            
            // Make progress bars mobile-friendly
            const bars = container.querySelectorAll('.progress-bar');
            bars.forEach(bar => {
                bar.classList.add('mobile-progress-bar');
            });
        });
    }

    /**
     * Setup mobile alerts
     */
    setupMobileAlerts() {
        const alertContainers = document.querySelectorAll('.alert, .alert-container');
        
        alertContainers.forEach(container => {
            container.classList.add('mobile-alert');
            
            // Add mobile-specific classes based on alert type
            if (container.classList.contains('alert-info')) {
                container.classList.add('mobile-alert-info');
            } else if (container.classList.contains('alert-success')) {
                container.classList.add('mobile-alert-success');
            } else if (container.classList.contains('alert-warning')) {
                container.classList.add('mobile-alert-warning');
            } else if (container.classList.contains('alert-danger')) {
                container.classList.add('mobile-alert-danger');
            }
        });
    }

    /**
     * Setup mobile badges
     */
    setupMobileBadges() {
        const badgeElements = document.querySelectorAll('.badge, .badge-container');
        
        badgeElements.forEach(element => {
            element.classList.add('mobile-badge');
            
            // Add mobile-specific classes based on badge type
            if (element.classList.contains('badge-primary')) {
                element.classList.add('mobile-badge-primary');
            } else if (element.classList.contains('badge-success')) {
                element.classList.add('mobile-badge-success');
            } else if (element.classList.contains('badge-warning')) {
                element.classList.add('mobile-badge-warning');
            } else if (element.classList.contains('badge-danger')) {
                element.classList.add('mobile-badge-danger');
            } else if (element.classList.contains('badge-info')) {
                element.classList.add('mobile-badge-info');
            } else if (element.classList.contains('badge-secondary')) {
                element.classList.add('mobile-badge-secondary');
            }
        });
    }

    /**
     * Setup mobile icons
     */
    setupMobileIcons() {
        const iconElements = document.querySelectorAll('i, .icon, .icon-container');
        
        iconElements.forEach(element => {
            element.classList.add('mobile-icon');
            
            // Add size classes if specified
            if (element.classList.contains('bx-sm')) {
                element.classList.add('icon-sm');
            } else if (element.classList.contains('bx-lg')) {
                element.classList.add('icon-lg');
            }
        });
    }

    /**
     * Setup mobile spacing
     */
    setupMobileSpacing() {
        // Add mobile spacing classes to common elements
        const spacingElements = document.querySelectorAll('.card, .panel, .section');
        
        spacingElements.forEach(element => {
            element.classList.add('mobile-spacing');
            
            // Add appropriate spacing classes
            if (element.classList.contains('card')) {
                element.classList.add('mb-mobile-3');
            } else if (element.classList.contains('panel')) {
                element.classList.add('p-mobile-3');
            } else if (element.classList.contains('section')) {
                element.classList.add('mb-mobile-4');
            }
        });
    }

    /**
     * Setup mobile text
     */
    setupMobileText() {
        // Add mobile text classes to common elements
        const textElements = document.querySelectorAll('p, .text, .description');
        
        textElements.forEach(element => {
            element.classList.add('mobile-text');
            
            // Add appropriate text classes
            if (element.classList.contains('truncate')) {
                element.classList.add('truncate');
            } else if (element.classList.contains('break-all')) {
                element.classList.add('break-all');
            } else if (element.classList.contains('break-word')) {
                element.classList.add('break-word');
            }
        });
    }

    /**
     * Setup mobile visibility
     */
    setupMobileVisibility() {
        // Add mobile visibility classes to common elements
        const visibilityElements = document.querySelectorAll('.hide-mobile, .show-mobile, .mobile-only, .desktop-only');
        
        visibilityElements.forEach(element => {
            if (element.classList.contains('hide-mobile')) {
                element.classList.add('mobile-hide');
            } else if (element.classList.contains('show-mobile')) {
                element.classList.add('mobile-show');
            } else if (element.classList.contains('mobile-only')) {
                element.classList.add('mobile-show', 'mobile-hide');
            } else if (element.classList.contains('desktop-only')) {
                element.classList.add('mobile-hide', 'mobile-show');
            }
        });
    }

    /**
     * Setup performance optimizations
     */
    setupPerformanceOptimizations() {
        // Reduce motion for users who prefer it
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.body.classList.add('reduced-motion');
        }
        
        // Optimize for high refresh rate displays
        if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
            document.body.classList.add('high-refresh');
        }
    }

    /**
     * Setup accessibility
     */
    setupAccessibility() {
        // Add ARIA labels to interactive elements
        const interactiveElements = document.querySelectorAll('button, a, input, select, textarea');
        
        interactiveElements.forEach(element => {
            if (!element.getAttribute('aria-label') && !element.textContent.trim()) {
                element.setAttribute('aria-label', element.getAttribute('title') || 'Interactive element');
            }
        });
        
        // Add focus indicators
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                document.body.classList.add('keyboard-navigation');
            }
        });
        
        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation');
        });
    }

    /**
     * Setup dark mode
     */
    setupDarkMode() {
        // Check for dark mode preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-mode');
        }
        
        // Listen for changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (e.matches) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        });
    }

    /**
     * Setup print optimizations
     */
    setupPrintOptimizations() {
        // Add print-specific classes
        window.addEventListener('beforeprint', () => {
            document.body.classList.add('printing');
        });
        
        window.addEventListener('afterprint', () => {
            document.body.classList.remove('printing');
        });
    }

    /**
     * Update layouts
     */
    updateLayouts() {
        // Update sidebar position
        if (this.sidebarOpen) {
            this.closeSidebar();
        }
        
        // Update table responsiveness
        this.setupResponsiveTables();
        
        // Update form layouts
        this.setupMobileForms();
    }

    /**
     * Update responsive elements
     */
    updateResponsiveElements() {
        // Update mobile-specific elements
        this.setupMobileNavigation();
        this.setupMobileSearch();
        this.setupMobileFilters();
        this.setupMobileActions();
    }

    /**
     * Show mobile toast notification
     */
    showMobileToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `mobile-toast mobile-toast-${type}`;
        toast.innerHTML = `
            <i class="bx bx-${this.getToastIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        
        // Show toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        // Hide toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }

    /**
     * Get toast icon based on type
     */
    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'error-circle',
            warning: 'warning',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * Show mobile loading spinner
     */
    showMobileLoading(element) {
        element.classList.add('loading');
    }

    /**
     * Hide mobile loading spinner
     */
    hideMobileLoading(element) {
        element.classList.remove('loading');
    }

    /**
     * Get device information
     */
    getDeviceInfo() {
        return {
            isMobile: this.isMobile,
            isTouch: this.isTouch,
            userAgent: navigator.userAgent,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            pixelRatio: window.devicePixelRatio,
            orientation: window.screen.orientation?.type || 'unknown'
        };
    }

    /**
     * Check if element is in viewport
     */
    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    /**
     * Smooth scroll to element
     */
    smoothScrollTo(element, offset = 0) {
        const targetPosition = element.offsetTop - offset;
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    }

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// Initialize mobile utilities when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mobileUtils = new MobileUtils();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobileUtils;
}
