/*!
 * Sidebar Menu Toggle Script for Chirpy Theme
 * Handles collapsible menu functionality for custom navigation
 */

(function() {
  'use strict';
  
  function initSidebarMenu() {
    const techToggles = document.querySelectorAll('.tech-toggle');
    
    if (techToggles.length === 0) {
      return;
    }
    
    function checkAndOpenMenu() {
      const currentPath = window.location.pathname;
      const categoryMatch = currentPath.match(/\/categories\/([^\/]+)/);
      
      if (categoryMatch) {
        const currentCategory = categoryMatch[1];
        const techCategories = ['python', 'django', 'nodejs', 'articles', 'database'];
        
        if (techCategories.includes(currentCategory)) {
          const articlesSubmenu = document.getElementById('submenu-articles');
          const articlesChevron = document.querySelector('[data-menu="articles"] .chevron');
          
          if (articlesSubmenu && articlesChevron) {
            articlesSubmenu.classList.add('show');
            articlesChevron.style.transform = 'rotate(180deg)';
          }
        }
      }
    }
    
    techToggles.forEach(function(toggle) {
      toggle.addEventListener('click', function(e) {
        e.preventDefault();
        
        const menuId = this.dataset.menu;
        const submenu = document.getElementById('submenu-' + menuId);
        const chevron = this.querySelector('.chevron');
        
        if (!submenu || !chevron) return;
        
        if (submenu.classList.contains('show')) {
          submenu.classList.remove('show');
          chevron.style.transform = 'rotate(0deg)';
        } else {
          // Close other submenus
          document.querySelectorAll('.tech-submenu.show').forEach(function(otherSubmenu) {
            otherSubmenu.classList.remove('show');
          });
          document.querySelectorAll('.chevron').forEach(function(otherChevron) {
            otherChevron.style.transform = 'rotate(0deg)';
          });
          
          // Open current submenu
          submenu.classList.add('show');
          chevron.style.transform = 'rotate(180deg)';
        }
      });
    });
    
    // Prevent submenu item clicks from bubbling
    document.querySelectorAll('.submenu-item').forEach(function(submenuItem) {
      submenuItem.addEventListener('click', function(e) {
        e.stopPropagation();
      });
    });
    
    checkAndOpenMenu();
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarMenu);
  } else {
    // DOM is already loaded
    initSidebarMenu();
  }
  
})();