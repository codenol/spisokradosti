'use strict';

const Auth = (() => {

  let _user          = null;  // {id, username, email, list_id}
  let _mode          = 'guest'; // 'guest' | 'auth'
  let _viewingListId = null;  // null = own list
  let _resolveModal  = null;

  // ── Init ────────────────────────────────────────────────────────────────────

  /**
   * Must be awaited before Storage.init().
   * Returns the user object if authenticated, null if guest or login cancelled.
   */
  async function init() {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res   = await fetch('api/ping.php', { signal: ctrl.signal, credentials: 'include' });
      clearTimeout(timer);

      if (!res.ok) { _mode = 'guest'; return null; }
      const data = await res.json();
      if (!data.ok) { _mode = 'guest'; return null; }

      _mode = 'auth';               // backend is available

      if (data.user) {
        _user = data.user;
        return _user;
      }

      // Backend reachable but no session → show login modal, wait for it
      return await _showModal();
    } catch {
      _mode = 'guest';
      return null;
    }
  }

  // ── State accessors ──────────────────────────────────────────────────────────

  const getUser         = ()  => _user;
  const getMode         = ()  => _mode;
  const isGuest         = ()  => _mode === 'guest';
  const isAuthed        = ()  => _mode === 'auth' && !!_user;
  const currentListId   = ()  => _viewingListId || (_user ? _user.list_id : null);
  const isViewingOwn    = ()  => !_viewingListId || (_user && _viewingListId === _user.list_id);

  function setViewingList(listId) { _viewingListId = listId; }
  function resetViewingList()     { _viewingListId = null; }

  // ── API calls ────────────────────────────────────────────────────────────────

  async function login(email, password) {
    const res  = await fetch('api/auth.php?action=login', _post({ email, password }));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка входа');
    _user = data.user;
    return _user;
  }

  async function register(username, email, password) {
    const res  = await fetch('api/auth.php?action=register', _post({ username, email, password }));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
    _user = data.user;
    return _user;
  }

  async function logout() {
    await fetch('api/auth.php?action=logout', _post({})).catch(() => {});
    _user          = null;
    _viewingListId = null;
    // Wipe cached data
    Object.keys(localStorage)
      .filter(k => k.startsWith('wishlist_'))
      .forEach(k => localStorage.removeItem(k));
    // Reload to show login screen
    location.reload();
  }

  function _post(body) {
    return {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify(body),
    };
  }

  // ── Modal ────────────────────────────────────────────────────────────────────

  function _showModal() {
    return new Promise(resolve => {
      _resolveModal = resolve;
      const modal = document.getElementById('auth-modal');
      if (modal) modal.classList.remove('hidden');
    });
  }

  function _hideModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
    if (_resolveModal) { _resolveModal(_user); _resolveModal = null; }
  }

  function skipAuth() {
    _hideModal();
  }

  /** Wire up modal form events — call once after DOMContentLoaded */
  function initUI() {
    const modal        = document.getElementById('auth-modal');
    if (!modal) return;

    const loginForm    = document.getElementById('auth-login-form');
    const regForm      = document.getElementById('auth-register-form');
    const loginErr     = document.getElementById('auth-login-error');
    const regErr       = document.getElementById('auth-register-error');

    document.getElementById('auth-tab-login')
      ?.addEventListener('click', () => _switchTab('login'));
    document.getElementById('auth-tab-register')
      ?.addEventListener('click', () => _switchTab('register'));

    loginForm?.addEventListener('submit', async e => {
      e.preventDefault();
      loginErr.textContent = '';
      const btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await login(
          loginForm.querySelector('[name=email]').value,
          loginForm.querySelector('[name=password]').value,
        );
        _hideModal();
      } catch (err) {
        loginErr.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });

    regForm?.addEventListener('submit', async e => {
      e.preventDefault();
      regErr.textContent = '';
      const btn = regForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await register(
          regForm.querySelector('[name=username]').value,
          regForm.querySelector('[name=email]').value,
          regForm.querySelector('[name=password]').value,
        );
        _hideModal();
      } catch (err) {
        regErr.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function _switchTab(tab) {
    document.getElementById('auth-login-form')
      ?.classList.toggle('hidden', tab !== 'login');
    document.getElementById('auth-register-form')
      ?.classList.toggle('hidden', tab !== 'register');
    document.getElementById('auth-tab-login')
      ?.classList.toggle('active', tab === 'login');
    document.getElementById('auth-tab-register')
      ?.classList.toggle('active', tab !== 'login');
  }

  return {
    init, initUI, skipAuth,
    getUser, getMode, isGuest, isAuthed,
    currentListId, isViewingOwn, setViewingList, resetViewingList,
    login, register, logout,
  };

})();
