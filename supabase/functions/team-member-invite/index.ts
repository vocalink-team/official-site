import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }) }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Unauthorized' }, 401)
    const callerClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } })
    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token)
    if (callerError || !callerData.user) return json({ error: 'Unauthorized' }, 401)
    const body = await req.json().catch(() => ({}))

    if (body.action === 'activate') {
      const { data: member, error: findError } = await admin.from('team_members').select('id,status,user_id').eq('user_id', callerData.user.id).maybeSingle()
      if (findError) throw findError
      if (!member) return json({ error: 'チームメンバー情報が見つかりません。' }, 404)
      if (member.status !== 'invited') return json({ ok: true, status: member.status })
      const { error: updateError } = await admin.from('team_members').update({ status: 'active', last_seen_at: new Date().toISOString() }).eq('id', member.id)
      if (updateError) throw updateError
      return json({ ok: true, status: 'active' })
    }

    const { data: callerMember, error: memberError } = await admin.from('team_members').select('id, role_key, status').eq('user_id', callerData.user.id).maybeSingle()
    if (memberError) throw memberError
    if (!callerMember || callerMember.status !== 'active' || !['admin', 'super_admin'].includes(callerMember.role_key)) return json({ error: 'この操作を実行する権限がありません。' }, 403)

    const email = String(body.email ?? '').trim().toLowerCase()
    const displayName = String(body.display_name ?? '').trim()
    const roleKey = String(body.role_key ?? 'viewer').trim()
    const department = String(body.department ?? 'general').trim() || 'general'
    const notes = String(body.notes ?? '')
    const redirectTo = String(body.redirect_to ?? '').trim() || 'https://vocalink-team.github.io/official-site/auth-setup.html'
    if (!email || !displayName) return json({ error: 'メールアドレスと表示名は必須です。' }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'メールアドレスの形式が正しくありません。' }, 400)
    if (roleKey === 'super_admin' && callerMember.role_key !== 'super_admin') return json({ error: 'Super Adminへの招待はSuper Adminのみ実行できます。' }, 403)

    const { data: role, error: roleError } = await admin.from('team_roles').select('role_key').eq('role_key', roleKey).maybeSingle()
    if (roleError) throw roleError
    if (!role) return json({ error: '指定されたロールが存在しません。' }, 400)

    const { data: existing, error: existingError } = await admin.from('team_members').select('id, user_id, status, display_name, role_key, department').eq('email', email).maybeSingle()
    if (existingError) throw existingError
    if (existing?.status === 'inactive' || existing?.status === 'suspended') return json({ error: 'このメンバーは無効または停止状態です。先に状態を有効へ変更してください。' }, 409)
    // SEC-01: protect the current Super Admin, regardless of requested new role.
    // Perform this check before password-reset emails, account linking, or member updates.
    if (existing?.role_key === 'super_admin' && callerMember.role_key !== 'super_admin') {
      return json({ error: '既存のSuper Adminを変更できるのはSuper Adminのみです。' }, 403)
    }

    // Auth側に既にユーザーが存在する場合は新規招待を作らず、既存アカウントをチームへ紐付ける。
    // これにより、過去に招待済みのユーザーを再度招待した際の「既に登録済み」エラーを防ぐ。
    const { data: authList, error: authListError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authListError) throw authListError
    const authUser = authList.users.find((u) => (u.email ?? '').trim().toLowerCase() === email) ?? null

    if (existing?.user_id) {
      const { error: resetError } = await callerClient.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetError) return json({ error: `招待用メールの再送に失敗しました: ${resetError.message}` }, 200)
      const { error: updateError } = await admin.from('team_members').update({ display_name: displayName || existing.display_name, role_key: roleKey || existing.role_key, department: department || existing.department, notes }).eq('id', existing.id)
      if (updateError) throw updateError
      return json({ ok: true, mode: 'resend', user_id: existing.user_id, status: existing.status, message: `${email} は既存アカウントです。パスワード設定用メールを再送しました。` })
    }

    if (authUser) {
      if (existing && !existing.user_id) {
        const { error: linkError } = await admin.from('team_members').update({ user_id: authUser.id, display_name: displayName || existing.display_name, role_key: roleKey || existing.role_key, department: department || existing.department, notes }).eq('id', existing.id)
        if (linkError) throw linkError
      } else {
        const payload = { email, display_name: displayName, role_key: roleKey, department, status: 'active', notes, user_id: authUser.id, created_by: callerData.user.id }
        const { error: insertError } = await admin.from('team_members').insert(payload)
        if (insertError) throw insertError
      }
      const { error: resetError } = await callerClient.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetError) return json({ error: `既存アカウントは紐付けましたが、メール再送に失敗しました: ${resetError.message}` }, 200)
      return json({ ok: true, mode: 'link_existing', user_id: authUser.id, message: `${email} は既存のSupabase Authアカウントです。チームメンバーへ紐付け、パスワード設定用メールを再送しました。` })
    }

    const inviteOptions: Record<string, unknown> = { data: { display_name: displayName, role_key: roleKey, department }, redirectTo }
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, inviteOptions)
    if (inviteError) return json({ error: `招待メールの送信に失敗しました: ${inviteError.message}` }, 200)
    const userId = invited.user?.id ?? null
    if (!userId) return json({ error: '招待ユーザーIDを取得できませんでした。' }, 500)
    const payload = { email, display_name: displayName, role_key: roleKey, department, status: 'invited', notes, user_id: userId, created_by: callerData.user.id }
    const write = await admin.from('team_members').insert(payload)
    if (write.error) { await admin.auth.admin.deleteUser(userId); throw write.error }
    return json({ ok: true, mode: 'invite', user_id: userId, message: `${email} に招待メールを送信しました。` })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : '招待処理に失敗しました。' }, 500)
  }
})
