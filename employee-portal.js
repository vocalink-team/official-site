const byId = id => document.getElementById(id);
const status = byId('portal-status');
const loginForm = byId('login-form');
const expenseForm = byId('expense-form');
const dateInJapan = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo'}).format(new Date());
const currency = new Intl.NumberFormat('ja-JP', {style: 'currency', currency: 'JPY'});
let memberId = null;
let pending = null;

if (window.supabase) {
  const client = window.supabase.createClient(
    'https://qvxoxrzvxyyribqjnpkb.supabase.co',
    'sb_publishable_1zOA0YpTtJkNYsmm4zXxsA_wSJpdHKe'
  );
  const requests = () => client.from('employee_expense_requests');

  function clearWorkspace() {
    memberId = null;
    pending = null;
    byId('workspace').hidden = true;
    byId('account').textContent = '';
    byId('history-list').replaceChildren();
    byId('history-status').textContent = '';
    byId('submit-status').textContent = '';
    expenseForm.reset();
  }

  async function loadHistory(owner) {
    const {data, error} = await requests()
      .select('id,spent_on,category,amount_yen,payee')
      .order('submitted_at', {ascending: false}).order('id', {ascending: false}).limit(20);
    if (memberId !== owner) return;
    const list = byId('history-list');
    list.replaceChildren();
    byId('history-status').textContent = error ? '申請履歴を取得できませんでした。' :
      data.length ? '直近20件まで表示しています。' : '申請履歴はありません。';
    if (error) return;
    const labels = new Map([...byId('category').options].map(option => [option.value, option.textContent]));
    for (const row of data) {
      const item = document.createElement('li');
      item.textContent = [row.spent_on, labels.get(row.category), row.payee, currency.format(row.amount_yen)].join(' ／ ');
      list.append(item);
    }
  }

  async function refresh() {
    byId('retry').hidden = true;
    byId('login').hidden = true;
    clearWorkspace();
    const {data, error} = await client.auth.getUser();
    if (error || !data.user) {
      status.textContent = '公式サイトのアカウントでログインしてください。';
      byId('login').hidden = false;
      return;
    }
    const access = await client.rpc('is_active_employee');
    if (access.error) {
      status.textContent = '在籍状況を確認できませんでした。時間をおいて再確認してください。';
      byId('retry').hidden = false;
      return;
    }
    if (access.data !== true) {
      await client.auth.signOut({scope: 'local'});
      status.textContent = 'このアカウントには従業員ポータルの利用権限がありません。';
      byId('login').hidden = false;
      return;
    }
    memberId = data.user.id;
    byId('account').textContent = data.user.email || 'ログイン中';
    byId('spent-on').max = dateInJapan();
    status.textContent = '';
    byId('workspace').hidden = false;
    await loadHistory(memberId);
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = loginForm.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const {error} = await client.auth.signInWithPassword({
        email: byId('email').value.trim(), password: byId('password').value
      });
      byId('password').value = '';
      if (error) status.textContent = 'ログインできませんでした。入力内容を確認してください。';
      else await refresh();
    } finally {
      button.disabled = false;
    }
  });

  byId('retry').addEventListener('click', refresh);
  byId('logout').addEventListener('click', async () => {
    clearWorkspace();
    const {error} = await client.auth.signOut({scope: 'local'});
    status.textContent = error ? 'ログアウトを完了できませんでした。' : 'ログアウトしました。';
    byId(error ? 'retry' : 'login').hidden = false;
  });
  client.auth.onAuthStateChange(event => {
    if (event !== 'SIGNED_OUT' || !memberId) return;
    clearWorkspace();
    byId('login').hidden = false;
    status.textContent = 'もう一度ログインしてください。';
  });

  expenseForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = expenseForm.querySelector('button');
    const message = byId('submit-status');
    const owner = memberId;
    if (!owner || button.disabled) return;
    const values = new FormData(expenseForm);
    const payload = {
      spent_on: values.get('spent_on'),
      category: values.get('category'),
      amount_yen: Number(values.get('amount_yen')),
      payee: values.get('payee').trim(),
      purpose: values.get('purpose').trim(),
      evidence_reference: values.get('evidence_reference').trim() || null
    };
    if (!payload.payee || !payload.purpose || payload.spent_on > dateInJapan()) {
      message.textContent = '支払先・用途・支払日を確認してください。';
      return;
    }
    const signature = JSON.stringify(payload);
    button.disabled = true;
    try {
      if (pending && pending.signature !== signature) {
        const check = await requests().select('id').eq('id', pending.id).maybeSingle();
        if (memberId !== owner) return;
        if (check.error || check.data) {
          message.textContent = '前回の送信結果を確認するため、入力を元に戻して再送してください。';
          return;
        }
      }
      if (!pending || pending.signature !== signature) pending = {id: crypto.randomUUID(), signature};
      const requestId = pending.id;
      message.textContent = '申請を送信しています。';
      const {error} = await requests().insert({id: requestId, ...payload});
      if (memberId !== owner) return;
      if (error) {
        const check = await requests().select('id').eq('id', requestId).maybeSingle();
        if (memberId !== owner) return;
        if (check.error || !check.data) {
          message.textContent = '申請を確認できませんでした。このまま再送できます。';
          return;
        }
      }
      pending = null;
      expenseForm.reset();
      message.textContent = '申請を受け付けました。';
      await loadHistory(owner);
    } finally {
      button.disabled = false;
    }
  });
  await refresh();
} else {
  status.textContent = 'ログイン画面を読み込めませんでした。ページを再読み込みしてください。';
}
