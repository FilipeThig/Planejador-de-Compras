(async function () {
  const form = document.querySelector('#loginForm, #registerForm');
  const msg = document.getElementById('message');
  if (!form || !msg) return;

  const isRegister = form.id === 'registerForm';
  const button = form.querySelector('button[type="submit"]');
  function status(message, isError = false) {
    msg.textContent = message;
    msg.classList.toggle('erro', isError);
  }

  if (typeof supabaseClient === 'undefined') {
    status('Não foi possível carregar a conexão com o Supabase. Confira supabase.js, a conexão com a internet e o Console (F12).', true);
    button.disabled = true;
    return;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    button.disabled = true;
    status('Enviando dados ao Supabase...');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      let result;
      if (isRegister) {
        result = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL('index.html', location.href).href
          }
        });
      } else {
        result = await supabaseClient.auth.signInWithPassword({ email, password });
      }
      const { data, error } = result;
      if (error) throw error;
      if (isRegister && !data.session) {
        status('Solicitação recebida. Se a confirmação de e-mail estiver ativada, confira sua caixa de entrada e spam. Depois, faça login.');
      } else if (data.session) {
        location.replace('index.html');
      } else {
        status('Não foi criada uma sessão. Confira as configurações de autenticação do projeto.', true);
      }
    } catch (err) {
      console.error('Falha na autenticação:', err);
      const message = err && err.message ? err.message : String(err);
      status('Não foi possível ' + (isRegister ? 'cadastrar' : 'entrar') + ': ' + message, true);
    } finally {
      button.disabled = false;
    }
  });

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (!error && data.session) location.replace('index.html');
  } catch (err) {
    console.error('Falha ao consultar a sessão:', err);
    status('Não foi possível consultar a sessão: ' + (err.message || err), true);
  }
})();
