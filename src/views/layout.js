import { icon } from "./icons.js";

/** Escape HTML entities in title strings */
function escapeTitle(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function layout(title, body, extraHead = "") {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeTitle(title)} - KUOTA</title>

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
        <a href="/" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
          ${icon("dashboard", 16)}
          <span class="hidden sm:inline">Dashboard</span>
        </a>
        <a href="/add" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
          ${icon("plus-circle", 16)}
          <span class="hidden sm:inline">Add</span>
        </a>
        <a href="/settings" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
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
        if (ok) showToast('Account removed', 'success');
        else showToast('Failed to remove account', 'error');
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
      }
      // Favorite toggle
      else if (path.indexOf('/api/account/') === 0 && path.indexOf('/favorite') > 0 && ok) {
        showToast('Pin updated', 'success');
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

    // Refresh All — sequential per-card refresh with loading animation
    var refreshAllRunning = false;
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
          function updateLabel() {
            completed++;
            if (label) label.textContent = completed + ' / ' + ids.length;
          }

          // Refresh cards sequentially
          function refreshNext(index) {
            if (index >= ids.length) {
              // All done
              refreshAllRunning = false;
              btn.disabled = false;
              btn.classList.remove('htmx-request');
              if (label) label.textContent = originalLabel;
              showToast('All accounts refreshed', 'success');
              return;
            }

            var id = ids[index];
            var card = document.getElementById('account-' + id);

            // Add refreshing class + spinner overlay
            if (card) {
              card.classList.add('card-refreshing');
              // Show spinner on the card's refresh button
              var refreshBtn = card.querySelector('.refresh-btn');
              if (refreshBtn) refreshBtn.classList.add('htmx-request');
              // Add spinner overlay
              var overlay = document.createElement('div');
              overlay.className = 'refresh-overlay';
              overlay.innerHTML = '<div class="animate-spin text-primary">' + 
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>' +
                '</div>';
              card.appendChild(overlay);
            }

            // Trigger refresh for this card
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
                    // Brief flash to indicate completion
                    setTimeout(function() { newCard.classList.remove('card-refreshed'); }, 1500);
                  }
                }
                updateLabel();
                refreshNext(index + 1);
              })
              .catch(function() {
                if (card) {
                  card.classList.remove('card-refreshing');
                  var ov = card.querySelector('.refresh-overlay');
                  if (ov) ov.remove();
                  var rb = card.querySelector('.refresh-btn');
                  if (rb) rb.classList.remove('htmx-request');
                }
                updateLabel();
                refreshNext(index + 1);
              });
          }

          if (label) label.textContent = '0 / ' + ids.length;
          refreshNext(0);
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
        activeSection.parentElement.style.display = visibleActiveCount > 0 ? '' : 'none';
      }
      if (inactiveSection) {
        inactiveSection.parentElement.style.display = visibleInactiveCount > 0 ? '' : 'none';
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
        if (btn.getAttribute('data-method') === activeLoginFilter) {
          btn.classList.add('border-current', 'font-semibold');
        } else {
          btn.classList.remove('border-current', 'font-semibold');
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
        if (btn.getAttribute('data-status') === activeStatusFilter) {
          btn.classList.add('border-current', 'font-semibold');
        } else {
          btn.classList.remove('border-current', 'font-semibold');
        }
      });
      applyFilters();
    }

    function resetAllFilters() {
      activeLoginFilter = null;
      activeStatusFilter = null;
      document.querySelectorAll('.login-filter-badge').forEach(function(btn) {
        btn.classList.remove('border-current', 'font-semibold');
      });
      document.querySelectorAll('.status-filter-badge').forEach(function(btn) {
        btn.classList.remove('border-current', 'font-semibold');
      });
      var resetBtn = document.getElementById('filter-reset-btn');
      if (resetBtn) resetBtn.classList.add('hidden');
      var searchInput = document.getElementById('account-search');
      if (searchInput) searchInput.value = '';
      applyFilters();
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
