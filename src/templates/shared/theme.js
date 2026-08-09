/*
 * AI Backends shared theme toggle.
 *
 * Load this synchronously in <head> (after the theme.css link) so the saved
 * theme is applied before first paint, avoiding a flash of the wrong theme.
 * Injects a floating light/dark toggle button once the DOM is ready.
 */
;(function () {
  var STORAGE_KEY = 'aib-theme'

  function preferredTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'light' || saved === 'dark') return saved
    } catch (_) { /* storage unavailable */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }

  applyTheme(preferredTheme())

  function createToggle() {
    if (document.querySelector('.theme-toggle')) return
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'theme-toggle'
    btn.setAttribute('aria-label', 'Toggle light/dark theme')
    btn.title = 'Toggle light/dark theme'
    btn.innerHTML =
      '<svg class="icon-moon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>' +
      '<svg class="icon-sun" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1.5m0 15V21m9-9h-1.5M4.5 12H3m15.364 6.364l-1.06-1.06M6.697 6.697l-1.061-1.06m12.728 0l-1.061 1.06M6.697 17.303l-1.061 1.061M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/></svg>'
    btn.addEventListener('click', function () {
      var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
      applyTheme(next)
      try { localStorage.setItem(STORAGE_KEY, next) } catch (_) { /* ignore */ }
    })
    document.body.appendChild(btn)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggle)
  } else {
    createToggle()
  }
})()
