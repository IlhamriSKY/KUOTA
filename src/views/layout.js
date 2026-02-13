import { icon } from "./icons.js";
import { escapeHtml } from "../utils.js";

export function layout(title, body, extraHead = "") {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - KUOTA</title>

  <!-- PWA Meta Tags -->
  <meta name="description" content="Monitor GitHub Copilot and Claude Code usage across multiple accounts">
  <meta name="theme-color" content="#6d9eff">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="KUOTA">
  <meta name="mobile-web-app-capable" content="yes">

  <!-- Icons -->
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236d9eff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cg transform='rotate(-25 12 12)'%3E%3Ccircle cx='12' cy='12' r='9.5' stroke-width='1.8'/%3E%3Ccircle cx='12' cy='12' r='6.5' stroke-width='1.8'/%3E%3Ccircle cx='12' cy='12' r='3.2' stroke-width='1.8'/%3E%3Ccircle cx='12' cy='4' r='1.5' fill='%236d9eff' stroke='none'/%3E%3Cpath d='M12 5.5v3.3' stroke-width='1.8'/%3E%3C/g%3E%3C/svg%3E">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">

  <link rel="stylesheet" href="/css/styles.css">
  <script src="/js/htmx.min.js"></script>
  ${extraHead}
  <script>
    (function(){
      var t = localStorage.getItem('theme');
      if (t === 'light') document.documentElement.classList.remove('dark');
      else document.documentElement.classList.add('dark');
    })();
    function toggleTheme() {
      var h = document.documentElement;
      h.classList.toggle('dark');
      localStorage.setItem('theme', h.classList.contains('dark') ? 'dark' : 'light');
    }

    // Censor / Privacy toggle
    function applyCensorIcons() {
      var active = document.body.hasAttribute('data-censored');
      var btns = document.querySelectorAll('#censor-btn');
      btns.forEach(function(btn) {
        var vis = btn.querySelector('.censor-icon-visible');
        var hid = btn.querySelector('.censor-icon-hidden');
        if (vis && hid) {
          vis.classList.toggle('hidden', active);
          hid.classList.toggle('hidden', !active);
        }
      });
    }
    function toggleCensor() {
      var active = document.body.hasAttribute('data-censored');
      if (active) {
        document.body.removeAttribute('data-censored');
        localStorage.setItem('censor', '0');
      } else {
        document.body.setAttribute('data-censored', '');
        localStorage.setItem('censor', '1');
      }
      applyCensorIcons();
    }
  </script>
</head>
<body class="min-h-screen flex flex-col">

  <script>
    // Restore censor state before paint
    (function(){
      if (localStorage.getItem('censor') === '1') document.body.setAttribute('data-censored', '');
    })();
  </script>

  <!-- Header -->
  <header class="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <span class="text-primary">${icon("kuota", 24)}</span>
        <span class="font-semibold hidden sm:inline">KUOTA</span>
      </a>
      <nav class="flex items-center gap-0.5">
        <a href="/" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded transition-colors ${title === "Dashboard" ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"}">
          ${icon("dashboard", 16)}
          <span class="hidden sm:inline">Dashboard</span>
        </a>
        <a href="/add" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded transition-colors ${title === "Add Account" ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"}">
          ${icon("plus-circle", 16)}
          <span class="hidden sm:inline">Add</span>
        </a>
        <a href="/settings" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded transition-colors ${title === "Settings" ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"}">
          ${icon("settings", 16)}
          <span class="hidden sm:inline">Settings</span>
        </a>
        <a href="https://github.com/IlhamriSKY/KUOTA" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" aria-label="GitHub">
          ${icon("github", 16)}
          <span class="hidden sm:inline">GitHub</span>
        </a>
        <span class="w-px h-5 bg-border mx-1"></span>
        <button onclick="toggleTheme()" class="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-accent transition-colors text-muted-foreground">
          <span class="hidden dark:block">${icon("sun", 16)}</span>
          <span class="block dark:hidden">${icon("moon", 16)}</span>
        </button>
      </nav>
    </div>
  </header>

  <!-- Main -->
  <main class="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-6 fade-in w-full">
    ${body}
  </main>

  <!-- Footer -->
  <footer class="border-t mt-auto">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>Built by <a href="https://ilhamriski.com" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">IlhamRiski</a></span>
      <span id="realtime-clock"></span>
    </div>
  </footer>

  <!-- Toast Container -->
  <div id="toast-container" class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"></div>

  <!-- Delete Confirm Modal -->
  <div id="delete-modal" class="fixed inset-0 z-[90] hidden items-center justify-center">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closeDeleteModal()"></div>
    <div class="relative bg-card border rounded-md shadow-lg w-full max-w-sm mx-4 p-5 fade-in">
      <h3 class="text-sm font-semibold mb-1">Delete Account</h3>
      <p class="text-xs text-muted-foreground mb-4" id="delete-modal-msg">Are you sure?</p>
      <div class="flex gap-2 justify-end">
        <button onclick="closeDeleteModal()" class="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors">Cancel</button>
        <button id="delete-modal-confirm" class="px-3 py-1.5 text-xs bg-red-500 text-white rounded-md hover:bg-red-400 transition-colors">Delete</button>
      </div>
    </div>
  </div>

  <script>
    // Realtime clock
    function updateClock() {
      var now = new Date();
      var dd = String(now.getDate()).padStart(2, '0');
      var mm = String(now.getMonth() + 1).padStart(2, '0');
      var yyyy = now.getFullYear();
      var h = String(now.getHours()).padStart(2, '0');
      var m = String(now.getMinutes()).padStart(2, '0');
      var s = String(now.getSeconds()).padStart(2, '0');
      var el = document.getElementById('realtime-clock');
      if (el) el.textContent = dd + '-' + mm + '-' + yyyy + ' ' + h + ':' + m + ':' + s;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Toast system
    function showToast(message, type) {
      type = type || 'info';
      var colors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-red-600 text-white',
        warning: 'bg-amber-500 text-white',
        info: 'bg-foreground text-background'
      };
      var icons = {
        success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
      };
      var el = document.createElement('div');
      el.className = 'pointer-events-auto px-4 py-2.5 rounded-md shadow-lg text-xs font-medium fade-in flex items-center gap-2 ' + (colors[type] || colors.info);
      el.innerHTML = (icons[type] || icons.info) + '<span>' + message + '</span>';
      var container = document.getElementById('toast-container');
      // Limit to max 5 toasts
      while (container.children.length >= 5) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(el);
      setTimeout(function() {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(function() { el.remove(); }, 300);
      }, 3000);
    }

    // Delete modal
    var pendingDeleteTarget = null;
    function openDeleteModal(username, accountId) {
      document.getElementById('delete-modal-msg').textContent = 'Remove @' + username + '? This cannot be undone.';
      document.getElementById('delete-modal').style.display = 'flex';
      var btn = document.getElementById('delete-modal-confirm');
      btn.setAttribute('hx-delete', '/api/account/' + accountId);
      btn.setAttribute('hx-target', '#account-' + accountId);
      btn.setAttribute('hx-swap', 'outerHTML');
      htmx.process(btn);
      pendingDeleteTarget = accountId;
    }
    function closeDeleteModal() {
      document.getElementById('delete-modal').style.display = 'none';
      pendingDeleteTarget = null;
    }

    // Listen for HTMX events to show toasts & close modal
    document.body.addEventListener('htmx:afterRequest', function(e) {
      var path = (e.detail.pathInfo && e.detail.pathInfo.requestPath) || e.detail.requestConfig.path || '';
      var ok = e.detail.successful;
      var verb = (e.detail.requestConfig.verb || '').toLowerCase();
      // Close modal on delete
      if (path.indexOf('/api/account/') === 0 && verb === 'delete' && path.split('/').length === 4) {
        closeDeleteModal();
        if (ok) {
          showToast('Account removed', 'success');
          // Delete animation is handled in htmx:beforeSwap
        } else {
          showToast('Failed to remove account', 'error');
        }
      }
      // Refresh single
      else if (path.indexOf('/api/refresh/') === 0) {
        if (ok) showToast('Usage refreshed', 'success');
        else showToast('Failed to refresh', 'error');
      }
      // Refresh all
      else if (path === '/api/refresh-all') {
        if (ok) showToast('All accounts refreshed', 'success');
        else showToast('Failed to refresh all', 'error');
      }
      // Add account
      else if (path === '/api/account/add-pat' && ok) {
        showToast('Account added', 'success');
      }
      // Settings
      else if (path.indexOf('/api/settings/') === 0 && ok) {
        showToast('Settings saved', 'success');
      }
      // Sync
      else if (path === '/api/sync' && ok) {
        showToast('Synced to MySQL', 'success');
      }
      // Edit (PUT)
      else if (path.indexOf('/api/account/') === 0 && verb === 'put' && ok) {
        showToast('Account updated', 'success');
        // Maintain card position after edit
        handleCardEdit(e);
      }
      // Pause/Resume toggle
      else if (path.indexOf('/api/account/') === 0 && path.indexOf('/pause') > 0 && ok) {
        showToast('Status updated', 'success');
        // Styling will be handled in htmx:afterSwap instead
        // Section transition will be triggered after DOM swap completes
      }
      // Favorite toggle
      else if (path.indexOf('/api/account/') === 0 && path.indexOf('/favorite') > 0 && ok) {
        showToast('Pin updated', 'success');
        // Styling will be handled in htmx:afterSwap instead
        // Animation will be triggered after DOM swap completes
      }
    });

    // Handle delete animation BEFORE swap removes the card from DOM
    document.body.addEventListener('htmx:beforeSwap', function(e) {
      var bsPath = (e.detail.pathInfo && e.detail.pathInfo.requestPath) || (e.detail.requestConfig && e.detail.requestConfig.path) || '';
      var bsVerb = (e.detail.requestConfig && e.detail.requestConfig.verb || '').toLowerCase();
      if (bsPath.indexOf('/api/account/') === 0 && bsVerb === 'delete' && bsPath.split('/').length === 4) {
        var delTarget = e.detail.target;
        if (delTarget && delTarget.classList && delTarget.classList.contains('account-card')) {
          // Prevent HTMX's immediate swap (which would remove the card instantly)
          e.detail.shouldSwap = false;
          // Remove from position tracking
          cardOriginalPositions.delete(delTarget.id);
          // Animate fade out
          delTarget.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
          delTarget.style.transform = 'scale(0.95)';
          delTarget.style.opacity = '0';
          delTarget.style.pointerEvents = 'none';
          // Remove from DOM after animation completes
          setTimeout(function() {
            delTarget.remove();
            updateSectionVisibility();
          }, 300);
        }
      }
    });

    // Listen for HTMX afterSwap to handle animations AFTER DOM swap completes
    document.body.addEventListener('htmx:afterSwap', function(e) {
      var path = (e.detail.pathInfo && e.detail.pathInfo.requestPath) || e.detail.requestConfig.path || '';

      // Handle favorite toggle animation AFTER swap (styling already correct from server)
      if (path.indexOf('/api/account/') === 0 && path.indexOf('/favorite') > 0) {
        handleFavoriteToggle(e);
      }

      // Handle pause/resume animation AFTER swap (styling already correct from server)
      else if (path.indexOf('/api/account/') === 0 && path.indexOf('/pause') > 0) {
        handlePauseToggle(e);
      }
    });

    // Copy token - reads from custom header for security
    function copyToken(accountId) {
      fetch('/api/account/' + accountId + '/token', { method: 'POST' })
        .then(function(r) {
          // Read token from custom header instead of JSON body
          var token = r.headers.get('X-Token-Value');
          if (token) {
            return { token: token };
          }
          return r.json();
        })
        .then(function(data) {
          if (data.token) {
            navigator.clipboard.writeText(data.token).then(function() {
              showToast('Token copied to clipboard', 'success');
            }, function() {
              showToast('Failed to copy token', 'error');
            });
          } else {
            showToast(data.error || 'No token available', 'warning');
          }
        })
        .catch(function() {
          showToast('Failed to get token', 'error');
        });
    }

    // Refresh All — concurrent batch refresh with loading animation
    var refreshAllRunning = false;

    // Clear App Cache
    function clearAppCache(btn) {
      btn.disabled = true;
      btn.innerHTML = '<svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Clearing...';
      var cleared = [];

      // 1. Unregister service workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          registrations.forEach(function(r) { r.unregister(); });
          if (registrations.length > 0) cleared.push(registrations.length + ' service worker(s)');
        }).catch(function() {});
      }

      // 2. Clear Cache Storage API
      if ('caches' in window) {
        caches.keys().then(function(names) {
          names.forEach(function(name) { caches.delete(name); });
          if (names.length > 0) cleared.push(names.length + ' cache(s)');
        }).catch(function() {});
      }

      // 3. Clear localStorage (except theme preference)
      var theme = localStorage.getItem('theme');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      cleared.push('localStorage');

      // Reload after a short delay
      setTimeout(function() {
        var result = document.getElementById('clear-cache-result');
        if (result) {
          result.innerHTML = '<div class="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3"><div class="flex items-start gap-2 text-emerald-500"><span class="text-xs">Cleared: ' + cleared.join(', ') + '. Reloading...</span></div></div>';
        }
        setTimeout(function() { location.reload(true); }, 800);
      }, 500);
    }

    function refreshAll(btn) {
      if (refreshAllRunning) return;
      refreshAllRunning = true;
      btn.disabled = true;
      btn.classList.add('htmx-request');
      var label = btn.querySelector('.refresh-label');
      var originalLabel = label ? label.textContent : 'Refresh All';

      fetch('/api/refresh-all', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var ids = data.ids || [];
          if (ids.length === 0) {
            refreshAllRunning = false;
            btn.disabled = false;
            btn.classList.remove('htmx-request');
            return;
          }
          var completed = 0;
          if (label) label.textContent = '0 / ' + ids.length;

          // Add spinners to all cards
          ids.forEach(function(id) {
            var card = document.getElementById('account-' + id);
            if (card) {
              card.classList.add('card-refreshing');
              var refreshBtn = card.querySelector('.refresh-btn');
              if (refreshBtn) refreshBtn.classList.add('htmx-request');
              var overlay = document.createElement('div');
              overlay.className = 'refresh-overlay';
              overlay.innerHTML = '<div class="animate-spin text-primary">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>' +
                '</div>';
              card.appendChild(overlay);
            }
          });

          // Concurrent refresh with concurrency limit
          var CONCURRENCY = 5;
          var queue = ids.slice();
          var active = 0;

          function onDone() {
            completed++;
            active--;
            if (label) label.textContent = completed + ' / ' + ids.length;
            if (completed >= ids.length) {
              refreshAllRunning = false;
              btn.disabled = false;
              btn.classList.remove('htmx-request');
              if (label) label.textContent = originalLabel;
              showToast('All accounts refreshed', 'success');
              return;
            }
            runNext();
          }

          function refreshOne(id) {
            active++;
            var card = document.getElementById('account-' + id);
            fetch('/api/refresh/' + id, { method: 'POST' })
              .then(function(r) { return r.text(); })
              .then(function(html) {
                if (card) {
                  var temp = document.createElement('div');
                  temp.innerHTML = html;
                  var newCard = temp.firstElementChild;
                  if (newCard) {
                    newCard.classList.add('card-refreshed');
                    card.replaceWith(newCard);
                    htmx.process(newCard);
                    setTimeout(function() { newCard.classList.remove('card-refreshed'); }, 1500);
                  }
                }
                onDone();
              })
              .catch(function() {
                if (card) {
                  card.classList.remove('card-refreshing');
                  var ov = card.querySelector('.refresh-overlay');
                  if (ov) ov.remove();
                  var rb = card.querySelector('.refresh-btn');
                  if (rb) rb.classList.remove('htmx-request');
                }
                onDone();
              });
          }

          function runNext() {
            while (active < CONCURRENCY && queue.length > 0) {
              refreshOne(queue.shift());
            }
          }

          runNext();
        })
        .catch(function() {
          refreshAllRunning = false;
          btn.disabled = false;
          btn.classList.remove('htmx-request');
          showToast('Refresh failed', 'error');
        });
    }

    // Client-side search + login method + status filter
    var activeLoginFilter = null;
    var activeStatusFilter = null;

    function applyFilters() {
      var q = (document.getElementById('account-search')?.value || '').toLowerCase().trim();
      var cards = document.querySelectorAll('.account-card');
      var noResults = document.getElementById('no-results');
      var visible = 0;
      var visibleActiveCount = 0;
      var visibleInactiveCount = 0;

      cards.forEach(function(card) {
        var uname = (card.getAttribute('data-username') || '').toLowerCase();
        var dname = (card.getAttribute('data-displayname') || '').toLowerCase();
        var lm = card.getAttribute('data-loginmethod') || '';
        var st = card.getAttribute('data-status') || '';
        var matchSearch = !q || uname.indexOf(q) !== -1 || dname.indexOf(q) !== -1;
        var matchLogin = !activeLoginFilter || lm === activeLoginFilter;
        var matchStatus = !activeStatusFilter || st === activeStatusFilter;
        if (matchSearch && matchLogin && matchStatus) {
          card.style.display = '';
          visible++;
          // Track visibility per section
          if (st === 'active') visibleActiveCount++;
          else visibleInactiveCount++;
        } else {
          card.style.display = 'none';
        }
      });

      // Show/hide sections and divider based on visibility
      var activeSection = document.querySelector('.active-accounts-section');
      var inactiveSection = document.querySelector('.inactive-accounts-section');
      var divider = document.getElementById('accounts-divider');

      if (activeSection) {
        activeSection.style.display = visibleActiveCount > 0 ? '' : 'none';
      }
      if (inactiveSection) {
        inactiveSection.style.display = visibleInactiveCount > 0 ? '' : 'none';
      }
      if (divider) {
        divider.style.display = (visibleActiveCount > 0 && visibleInactiveCount > 0) ? '' : 'none';
      }

      if (noResults) {
        var hasFilter = q || activeLoginFilter || activeStatusFilter;
        noResults.style.display = (visible === 0 && hasFilter) ? 'flex' : 'none';
        noResults.classList.toggle('hidden', visible > 0 || !hasFilter);
      }
      // Show/hide reset button
      var resetBtn = document.getElementById('filter-reset-btn');
      if (resetBtn) {
        if (q || activeLoginFilter || activeStatusFilter) {
          resetBtn.classList.remove('hidden');
        } else {
          resetBtn.classList.add('hidden');
        }
      }
    }

    function filterAccounts(query) {
      applyFilters();
    }

    function filterByLogin(method) {
      if (activeLoginFilter === method) {
        activeLoginFilter = null;
      } else {
        activeLoginFilter = method;
      }
      document.querySelectorAll('.login-filter-badge').forEach(function(btn) {
        var method = btn.getAttribute('data-method');
        var span = btn.querySelector('span');
        if (method === activeLoginFilter) {
          if (method === 'pat' || method === 'oauth') {
            btn.style.backgroundColor = 'rgb(59 130 246)';
            btn.style.borderColor = 'rgb(59 130 246)';
            btn.style.color = 'white';
            btn.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.3)';
            if (span) { span.style.backgroundColor = 'rgba(255,255,255,0.25)'; span.style.color = 'white'; }
          } else if (method === 'claude_cli' || method === 'claude_api') {
            btn.style.backgroundColor = '#D97757';
            btn.style.borderColor = '#D97757';
            btn.style.color = 'white';
            btn.style.boxShadow = '0 0 10px rgba(217, 119, 87, 0.3)';
            if (span) { span.style.backgroundColor = 'rgba(255,255,255,0.25)'; span.style.color = 'white'; }
          }
        } else {
          btn.style.backgroundColor = '';
          btn.style.borderColor = '';
          btn.style.color = '';
          btn.style.boxShadow = '';
          if (span) { span.style.backgroundColor = ''; span.style.color = ''; }
        }
      });
      applyFilters();
    }

    function filterByStatus(status) {
      if (activeStatusFilter === status) {
        activeStatusFilter = null;
      } else {
        activeStatusFilter = status;
      }
      document.querySelectorAll('.status-filter-badge').forEach(function(btn) {
        var btnStatus = btn.getAttribute('data-status');
        var span = btn.querySelector('span');
        if (btnStatus === activeStatusFilter) {
          if (btnStatus === 'active') {
            btn.style.backgroundColor = 'rgb(16 185 129)';
            btn.style.borderColor = 'rgb(16 185 129)';
            btn.style.color = 'white';
            btn.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.3)';
            if (span) { span.style.backgroundColor = 'rgba(255,255,255,0.25)'; span.style.color = 'white'; }
          } else if (btnStatus === 'paused') {
            btn.style.backgroundColor = 'rgb(107 114 128)';
            btn.style.borderColor = 'rgb(107 114 128)';
            btn.style.color = 'white';
            btn.style.boxShadow = '0 0 10px rgba(107, 114, 128, 0.3)';
            if (span) { span.style.backgroundColor = 'rgba(255,255,255,0.25)'; span.style.color = 'white'; }
          } else if (btnStatus === 'inactive') {
            btn.style.backgroundColor = 'rgb(245 158 11)';
            btn.style.borderColor = 'rgb(245 158 11)';
            btn.style.color = 'white';
            btn.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.3)';
            if (span) { span.style.backgroundColor = 'rgba(255,255,255,0.25)'; span.style.color = 'white'; }
          }
        } else {
          btn.style.backgroundColor = '';
          btn.style.borderColor = '';
          btn.style.color = '';
          btn.style.boxShadow = '';
          if (span) { span.style.backgroundColor = ''; span.style.color = ''; }
        }
      });
      applyFilters();
    }

    function resetAllFilters() {
      activeLoginFilter = null;
      activeStatusFilter = null;
      document.querySelectorAll('.login-filter-badge').forEach(function(btn) {
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.boxShadow = '';
        var span = btn.querySelector('span');
        if (span) { span.style.backgroundColor = ''; span.style.color = ''; }
      });
      document.querySelectorAll('.status-filter-badge').forEach(function(btn) {
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.boxShadow = '';
        var span = btn.querySelector('span');
        if (span) { span.style.backgroundColor = ''; span.style.color = ''; }
      });
      var resetBtn = document.getElementById('filter-reset-btn');
      if (resetBtn) resetBtn.classList.add('hidden');
      var searchInput = document.getElementById('account-search');
      if (searchInput) searchInput.value = '';
      applyFilters();
    }

    // Store original positions for unfavorite restoration
    var cardOriginalPositions = new Map();

    function handleFavoriteToggle(e) {
      // Find the card by ID from the DOM (robust for outerHTML swap)
      var favPath = (e.detail.pathInfo && e.detail.pathInfo.requestPath) || e.detail.requestConfig.path || '';
      var favAccountId = favPath.split('/')[3];
      if (!favAccountId) return;

      var newCard = document.getElementById('account-' + favAccountId);
      if (!newCard) return;

      var cardId = newCard.id;
      var isFavorite = newCard.getAttribute('data-favorite') === '1';
      var status = newCard.getAttribute('data-status') || 'active';

      // Determine which section this card belongs to
      var targetSection;
      if (status === 'active') {
        targetSection = document.querySelector('.active-accounts-section');
      } else {
        targetSection = document.querySelector('.inactive-accounts-section');
      }

      if (!targetSection) return;

      // Server already rendered correct styling (ring border, star icon, colors)
      // No need to update styling here - just handle animation

      if (isFavorite) {
        // Store original position before moving
        var allCards = Array.from(targetSection.querySelectorAll('.account-card'));
        var originalIndex = allCards.indexOf(newCard);

        // Store the card IDs that were before this card
        var siblingsBefore = [];
        for (var i = 0; i < originalIndex; i++) {
          if (allCards[i] && allCards[i].id) {
            siblingsBefore.push(allCards[i].id);
          }
        }

        cardOriginalPositions.set(cardId, {
          siblings: siblingsBefore,
          section: status
        });

        // Move to end of favorites list (rightmost favorite position)
        newCard.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        newCard.style.transform = 'translateY(-20px)';
        newCard.style.opacity = '0.5';

        setTimeout(function() {
          // Find the first non-favorite card to insert before it
          var firstNonFav = null;
          var sectionCards = targetSection.querySelectorAll('.account-card');
          for (var j = 0; j < sectionCards.length; j++) {
            if (sectionCards[j].getAttribute('data-favorite') !== '1' && sectionCards[j] !== newCard) {
              firstNonFav = sectionCards[j];
              break;
            }
          }
          if (firstNonFav) {
            targetSection.insertBefore(newCard, firstNonFav);
          } else {
            targetSection.appendChild(newCard);
          }
          newCard.style.transform = '';
          newCard.style.opacity = '';

          // Remove inline styles after animation
          setTimeout(function() {
            newCard.style.transition = '';
          }, 300);
        }, 50);
      } else {
        // Restore to original position
        var originalPos = cardOriginalPositions.get(cardId);

        if (originalPos && originalPos.siblings && originalPos.siblings.length > 0) {
          // Find the last sibling that still exists
          var insertAfter = null;
          for (var i = originalPos.siblings.length - 1; i >= 0; i--) {
            var siblingId = originalPos.siblings[i];
            var siblingCard = document.getElementById(siblingId);
            if (siblingCard && siblingCard.parentElement === targetSection) {
              insertAfter = siblingCard;
              break;
            }
          }

          // Animate before moving
          newCard.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
          newCard.style.transform = 'translateY(20px)';
          newCard.style.opacity = '0.5';

          setTimeout(function() {
            if (insertAfter && insertAfter.nextSibling) {
              targetSection.insertBefore(newCard, insertAfter.nextSibling);
            } else if (insertAfter) {
              targetSection.appendChild(newCard);
            } else {
              // If no valid sibling found, place at top
              targetSection.insertBefore(newCard, targetSection.firstChild);
            }

            newCard.style.transform = '';
            newCard.style.opacity = '';

            // Remove inline styles after animation
            setTimeout(function() {
              newCard.style.transition = '';
            }, 300);
          }, 50);

          cardOriginalPositions.delete(cardId);
        } else {
          // No stored position, just move to bottom of favorites
          var firstNonFavorite = null;
          var cards = targetSection.querySelectorAll('.account-card');
          for (var i = 0; i < cards.length; i++) {
            if (cards[i].getAttribute('data-favorite') !== '1' && cards[i] !== newCard) {
              firstNonFavorite = cards[i];
              break;
            }
          }

          if (firstNonFavorite) {
            targetSection.insertBefore(newCard, firstNonFavorite);
          }
        }
      }
    }

    // Handle card delete with smooth fade-out animation
    function handleCardDelete(e) {
      var target = e.detail.target;
      if (!target) return;

      // The target should be empty after delete, but card might still be in DOM briefly
      // Find the card that was deleted by looking for cards being removed
      var cardId = e.detail.pathInfo.requestPath.split('/').pop();
      var card = document.getElementById('account-' + cardId);

      if (card) {
        // Animate fade out and scale down
        card.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        card.style.transform = 'scale(0.95)';
        card.style.opacity = '0';

        // Remove from DOM after animation
        setTimeout(function() {
          card.remove();

          // Check if sections are now empty and update visibility
          updateSectionVisibility();
        }, 300);

        // Remove from position tracking if it was favorited
        cardOriginalPositions.delete('account-' + cardId);
      }
    }

    // Handle card edit - maintain position
    function handleCardEdit(e) {
      // Find the card by ID from the DOM (robust for outerHTML swap)
      var editPath = (e.detail.pathInfo && e.detail.pathInfo.requestPath) || e.detail.requestConfig.path || '';
      var editAccountId = editPath.split('/')[3];
      if (!editAccountId) return;

      var newCard = document.getElementById('account-' + editAccountId);
      if (!newCard) return;

      // Add a brief highlight effect to show the card was updated
      newCard.style.transition = 'box-shadow 0.3s ease-out';
      newCard.style.boxShadow = '0 0 0 2px rgba(109, 158, 255, 0.5)';

      setTimeout(function() {
        newCard.style.boxShadow = '';
        setTimeout(function() {
          newCard.style.transition = '';
        }, 300);
      }, 600);
    }

    // Refresh Overall Usage summary via API
    function refreshSummary() {
      var el = document.getElementById('usage-summary');
      if (!el) return;
      fetch('/api/summary')
        .then(function(r) { return r.text(); })
        .then(function(html) {
          el.innerHTML = html;
        })
        .catch(function() {});
    }

    // Handle pause/resume toggle - move between sections if needed
    function handlePauseToggle(e) {
      // Refresh Overall Usage summary
      refreshSummary();
      
      // Find the card by ID from the DOM (robust for outerHTML swap)
      var pausePath = (e.detail.pathInfo && e.detail.pathInfo.requestPath) || e.detail.requestConfig.path || '';
      var pauseAccountId = pausePath.split('/')[3];
      if (!pauseAccountId) return;

      var newCard = document.getElementById('account-' + pauseAccountId);
      if (!newCard) return;

      var cardId = newCard.id;
      var isPaused = newCard.getAttribute('data-paused') === '1';
      var status = newCard.getAttribute('data-status') || 'active';
      var isFavorite = newCard.getAttribute('data-favorite') === '1';

      // Determine target section based on new status
      var targetSection;
      var targetSectionClass;
      if (status === 'paused' || status === 'inactive') {
        targetSectionClass = 'inactive-accounts-section';
        targetSection = document.querySelector('.inactive-accounts-section');
      } else {
        targetSectionClass = 'active-accounts-section';
        targetSection = document.querySelector('.active-accounts-section');
      }

      // Create section if it doesn't exist
      if (!targetSection) {
        var cardsGrid = document.getElementById('cards-grid');
        if (!cardsGrid) return;

        targetSection = document.createElement('div');
        targetSection.className = 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 ' + targetSectionClass;

        // Insert section in the right position
        if (targetSectionClass === 'active-accounts-section') {
          // Insert at the beginning
          cardsGrid.insertBefore(targetSection, cardsGrid.firstChild);
        } else {
          // Insert after divider or at the end
          var divider = document.getElementById('accounts-divider');
          if (divider) {
            cardsGrid.insertBefore(targetSection, divider.nextSibling);
          } else {
            cardsGrid.appendChild(targetSection);
          }
        }

        // Create divider if it doesn't exist and we have both sections
        var activeSection = document.querySelector('.active-accounts-section');
        var inactiveSection = document.querySelector('.inactive-accounts-section');
        if (activeSection && inactiveSection && !document.getElementById('accounts-divider')) {
          var divider = document.createElement('div');
          divider.id = 'accounts-divider';
          divider.className = 'relative my-8';
          divider.innerHTML = '<div class="absolute inset-0 flex items-center">' +
            '<div class="w-full border-t-2 border-dashed border-muted-foreground/20"></div>' +
            '</div>' +
            '<div class="relative flex justify-center">' +
            '<span class="bg-background px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">' +
            'Paused/Inactive Accounts' +
            '</span>' +
            '</div>';
          // Insert divider between sections
          if (targetSectionClass === 'inactive-accounts-section') {
            cardsGrid.insertBefore(divider, targetSection);
          } else {
            cardsGrid.insertBefore(divider, inactiveSection);
          }
        }
      }

      // Check if card needs to move to different section
      var currentSection = newCard.parentElement;
      if (currentSection !== targetSection) {
        // Animate move to new section
        newCard.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        newCard.style.transform = 'translateY(-20px)';
        newCard.style.opacity = '0.5';

        setTimeout(function() {
          // Insert based on favorite status
          if (isFavorite) {
            targetSection.insertBefore(newCard, targetSection.firstChild);
          } else {
            // Find first non-favorite position
            var firstNonFavorite = null;
            var cards = targetSection.querySelectorAll('.account-card');
            for (var i = 0; i < cards.length; i++) {
              if (cards[i].getAttribute('data-favorite') !== '1') {
                firstNonFavorite = cards[i];
                break;
              }
            }
            if (firstNonFavorite) {
              targetSection.insertBefore(newCard, firstNonFavorite);
            } else {
              targetSection.appendChild(newCard);
            }
          }

          newCard.style.transform = '';
          newCard.style.opacity = '';

          setTimeout(function() {
            newCard.style.transition = '';
          }, 300);

          // Update section visibility
          updateSectionVisibility();
        }, 50);
      } else {
        // Just add a brief highlight effect
        newCard.style.transition = 'box-shadow 0.3s ease-out';
        newCard.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.5)';

        setTimeout(function() {
          newCard.style.boxShadow = '';
          setTimeout(function() {
            newCard.style.transition = '';
          }, 300);
        }, 600);
      }
    }

    // Update section visibility after card operations
    function updateSectionVisibility() {
      var activeSection = document.querySelector('.active-accounts-section');
      var inactiveSection = document.querySelector('.inactive-accounts-section');
      var divider = document.getElementById('accounts-divider');

      if (activeSection) {
        var activeCards = activeSection.querySelectorAll('.account-card');
        var hasActiveCards = activeCards.length > 0;
        activeSection.style.display = hasActiveCards ? '' : 'none';
      }

      if (inactiveSection) {
        var inactiveCards = inactiveSection.querySelectorAll('.account-card');
        var hasInactiveCards = inactiveCards.length > 0;
        inactiveSection.style.display = hasInactiveCards ? '' : 'none';
      }

      if (divider) {
        var hasActive = activeSection && activeSection.querySelectorAll('.account-card').length > 0;
        var hasInactive = inactiveSection && inactiveSection.querySelectorAll('.account-card').length > 0;
        divider.style.display = (hasActive && hasInactive) ? '' : 'none';
      }
    }

    // Apply censor icon state on page load
    applyCensorIcons();
    // Re-apply after HTMX swaps (e.g. refresh-all replaces main content)
    document.body.addEventListener('htmx:afterSettle', function() {
      applyCensorIcons();
    });

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
          .then(function(registration) {
            console.log('[PWA] Service Worker registered:', registration.scope);

            // Check for updates periodically
            setInterval(function() {
              registration.update();
            }, 60000); // Check every minute

            // Listen for updates
            registration.addEventListener('updatefound', function() {
              var newWorker = registration.installing;
              newWorker.addEventListener('statechange', function() {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available, show update notification
                  if (confirm('A new version is available. Reload to update?')) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    window.location.reload();
                  }
                }
              });
            });
          })
          .catch(function(err) {
            console.error('[PWA] Service Worker registration failed:', err);
          });

        // Reload on controller change
        navigator.serviceWorker.addEventListener('controllerchange', function() {
          window.location.reload();
        });
      });
    }

    // PWA Install Prompt
    var deferredPrompt;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
      console.log('[PWA] Install prompt available');
    });

    // Optional: Add install button functionality
    window.installPWA = function() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choiceResult) {
          if (choiceResult.outcome === 'accepted') {
            console.log('[PWA] User accepted install');
            showToast('App installed successfully!', 'success');
          }
          deferredPrompt = null;
        });
      }
    };

    // Account menu dropdown
    window.toggleAccountMenu = function(accountId) {
      var menu = document.getElementById('menu-' + accountId);
      if (!menu) return;

      var isHidden = menu.classList.contains('hidden');

      // Close all other menus first
      document.querySelectorAll('.account-menu-dropdown').forEach(function(m) {
        if (m !== menu) m.classList.add('hidden');
      });

      // Toggle current menu
      if (isHidden) {
        menu.classList.remove('hidden');
      } else {
        menu.classList.add('hidden');
      }
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
      // If click is not on a menu button or inside a menu
      if (!e.target.closest('.account-menu')) {
        document.querySelectorAll('.account-menu-dropdown').forEach(function(menu) {
          menu.classList.add('hidden');
        });
      }
    });
  </script>

</body>
</html>`;
}

export function formatDate(dateStr) {
  if (!dateStr || dateStr === "Never") return "Never";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${h}:${m}:${s}`;
}

export function formatDateNow() {
  return formatDate(new Date().toISOString());
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}
