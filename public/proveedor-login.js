const formLoginProveedor = document.getElementById('form-login-proveedor');
const loginUsuario = document.getElementById('login-usuario');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const btnLoginProveedor = document.getElementById('btn-login-proveedor');

formLoginProveedor.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  btnLoginProveedor.disabled = true;

  const res = await fetch('/api/proveedor-portal/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: loginUsuario.value.trim(), password: loginPassword.value }),
  });

  btnLoginProveedor.disabled = false;

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    loginError.textContent = error.error || 'No se pudo iniciar sesión';
    loginError.hidden = false;
    return;
  }

  window.location.href = 'proveedor-portal.html';
});
