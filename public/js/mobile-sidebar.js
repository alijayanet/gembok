/**
 * Mobile Sidebar Enhancement Script
 * Ensures proper scrolling and functionality on mobile devices
 */

class MobileSidebar {
    constructor() {
        this.sidebars = document.querySelectorAll('.sidebar, #sidebar, #adminSidebar, #technicianSidebar');
        this.overlays = document.querySelectorAll('.sidebar-overlay');
        this.toggleButtons = document.querySelectorAll('[id*="sidebarToggle"], [id*="hamburger"], .mobile-menu-toggle');
        this.closeButtons = document.querySelectorAll('[id*="sidebarClose"], .sidebar-close');
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.enableTouchScrolling();
        this.preventBodyScroll();
        this.setupResizeHandler();
    }
    
    setupEventListeners() {
        // Toggle buttons
        this.toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleSidebar();
            });
        });
        
        // Close buttons
        this.closeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeAllSidebars();
            });
        });
        
        // Overlay clicks
        this.overlays.forEach(overlay => {
            overlay.addEventListener('click', () => {
                this.closeAllSidebars();
            });
        });
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllSidebars();
            }
        });
        
        // Touch events for better mobile experience
        this.setupTouchEvents();
    }
    
    toggleSidebar() {
        const activeSidebar = this.getActiveSidebar();
        if (activeSidebar) {
            if (activeSidebar.classList.contains('show')) {
                this.closeAllSidebars();
            } else {
                this.openSidebar(activeSidebar);
            }
        }
    }
    
    openSidebar(sidebar) {
        // Close all sidebars first
        this.closeAllSidebars();
        
        // Open the target sidebar
        sidebar.classList.add('show');
        
        // Show overlay
        this.overlays.forEach(overlay => overlay.classList.add('show'));
        
        // Add body class to prevent scrolling
        document.body.classList.add('sidebar-open');
        
        // Focus management for accessibility
        this.focusSidebar(sidebar);
        
        // Ensure sidebar is scrollable
        this.enableSidebarScrolling(sidebar);
    }
    
    closeAllSidebars() {
        this.sidebars.forEach(sidebar => {
            sidebar.classList.remove('show');
        });
        
        this.overlays.forEach(overlay => {
            overlay.classList.remove('show');
        });
        
        // Remove body class
        document.body.classList.remove('sidebar-open');
        
        // Restore focus
        this.restoreFocus();
    }
    
    getActiveSidebar() {
        // Find the first visible sidebar or the one that should be active
        return Array.from(this.sidebars).find(sidebar => {
            return sidebar.offsetParent !== null || 
                   sidebar.classList.contains('show') ||
                   sidebar.style.display !== 'none';
        }) || this.sidebars[0];
    }
    
    enableSidebarScrolling(sidebar) {
        // Ensure sidebar content is scrollable
        const scrollableContent = sidebar.querySelector('.position-sticky, .sidebar-content, .nav');
        
        if (scrollableContent) {
            scrollableContent.style.overflowY = 'auto';
            scrollableContent.style.overflowX = 'hidden';
            scrollableContent.style.webkitOverflowScrolling = 'touch';
            scrollableContent.style.maxHeight = 'calc(100vh - 120px)'; // Account for header
        }
        
        // Enable scrolling on the sidebar itself
        sidebar.style.overflowY = 'auto';
        sidebar.style.overflowX = 'hidden';
        sidebar.style.webkitOverflowScrolling = 'touch';
    }
    
    enableTouchScrolling() {
        this.sidebars.forEach(sidebar => {
            // Enable touch scrolling
            sidebar.style.webkitOverflowScrolling = 'touch';
            sidebar.style.overflowScrolling = 'touch';
            
            // Prevent horizontal scrolling
            sidebar.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    const scrollable = this.isScrollable(e.target);
                    
                    if (!scrollable) {
                        e.preventDefault();
                    }
                }
            }, { passive: false });
        });
    }
    
    isScrollable(element) {
        const style = window.getComputedStyle(element);
        return style.overflow === 'auto' || 
               style.overflow === 'scroll' || 
               style.overflowY === 'auto' || 
               style.overflowY === 'scroll';
    }
    
    setupTouchEvents() {
        this.sidebars.forEach(sidebar => {
            let startY = 0;
            let startScrollTop = 0;
            
            sidebar.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    startY = e.touches[0].clientY;
                    startScrollTop = sidebar.scrollTop;
                }
            }, { passive: true });
            
            sidebar.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1) {
                    const currentY = e.touches[0].clientY;
                    const diffY = startY - currentY;
                    
                    // Allow vertical scrolling
                    if (Math.abs(diffY) > 10) {
                        sidebar.scrollTop = startScrollTop + diffY;
                    }
                }
            }, { passive: true });
        });
    }
    
    preventBodyScroll() {
        // Prevent body scroll when sidebar is open
        document.addEventListener('touchmove', (e) => {
            if (document.body.classList.contains('sidebar-open')) {
                e.preventDefault();
            }
        }, { passive: false });
    }
    
    focusSidebar(sidebar) {
        // Focus the first focusable element in the sidebar
        const focusableElements = sidebar.querySelectorAll(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }
    
    restoreFocus() {
        // Restore focus to the toggle button
        const toggleButton = this.toggleButtons[0];
        if (toggleButton) {
            toggleButton.focus();
        }
    }
    
    setupResizeHandler() {
        let resizeTimer;
        
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
    }
    
    handleResize() {
        const isMobile = window.innerWidth <= 991.98;
        
        if (!isMobile) {
            // On desktop, ensure sidebars are visible and scrollable
            this.sidebars.forEach(sidebar => {
                sidebar.classList.remove('show');
                sidebar.style.overflowY = 'auto';
                sidebar.style.overflowX = 'hidden';
            });
            
            this.overlays.forEach(overlay => {
                overlay.classList.remove('show');
            });
            
            document.body.classList.remove('sidebar-open');
        }
    }
    
    // Public method to check if any sidebar is open
    isAnySidebarOpen() {
        return Array.from(this.sidebars).some(sidebar => 
            sidebar.classList.contains('show')
        );
    }
    
    // Public method to close all sidebars
    close() {
        this.closeAllSidebars();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.mobileSidebar = new MobileSidebar();
    
    // Add global methods for external use
    window.toggleSidebar = () => window.mobileSidebar.toggleSidebar();
    window.closeSidebar = () => window.mobileSidebar.close();
    
    // Log initialization
    console.log('🚀 Mobile Sidebar Enhanced - Ready for mobile devices!');
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobileSidebar;
}
