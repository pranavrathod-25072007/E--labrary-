/* Login & registration forms. */
'use strict';

function showError(msg) {
  const box = document.getElementById('form-error');
  box.textContent = msg;
  box.classList.remove('hidden');
}

function redirectAfterAuth(user) {
  if (user.role === 'admin') location.href = 'admin.html';
  else {
    const next = new URLSearchParams(location.search).get('next');
    location.href = next || 'index.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // NOTE: handlers are attached synchronously, before the session round-trip,
  // so a fast submit can never fall through to a native GET form submission.
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Logging in…';
      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: {
            email: loginForm.email.value.trim(),
            password: loginForm.password.value,
          },
        });
        toast(`Welcome back, ${data.user.name.split(' ')[0]}!`, 'ok');
        redirectAfterAuth(data.user);
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Log in';
      }
    });
  }

  const regForm = document.getElementById('register-form');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const password = regForm.password.value;
      if (password.length < 6) {
        showError('Password must be at least 6 characters long.');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Creating account…';
      try {
        const data = await api('/api/auth/register', {
          method: 'POST',
          body: {
            name: regForm.name.value.trim(),
            roll_no: regForm.roll_no.value.trim(),
            email: regForm.email.value.trim(),
            password,
            role: regForm.role.value,
          },
        });
        toast('Account created successfully.', 'ok');
        redirectAfterAuth(data.user);
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Create account';
      }
    });
  }

  // If a user who is already logged in opens these pages, skip the form.
  loadSession().then((me) => {
    if (me && loginForm) redirectAfterAuth(me);
  });
});
