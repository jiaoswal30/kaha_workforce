// Supabase Edge Function: sends web push notifications for follow-ups.
//
// Two modes:
//  1. Called with { record: <followup row> } (from the DB trigger on insert):
//     instantly notifies the assigned employee about the new follow-up.
//  2. Called with an empty body (from the daily pg_cron job): notifies every
//     employee who has pending follow-ups due today or overdue.
//
// Secrets required (Edge Functions → notify-followups → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, FN_SECRET
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Deploy with "Verify JWT" turned OFF — callers authenticate with the
// x-fn-secret header instead.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

type Sub = { id: string; employee_id: string; endpoint: string; subscription: unknown }

const TYPE_LABELS: Record<string, string> = { order: 'Order', conversion: 'Conversion', query: 'Query' }

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.headers.get('x-fn-secret') !== Deno.env.get('FN_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  webpush.setVapidDetails(
    'mailto:store@kaha.local',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  )

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const body = await req.json().catch(() => ({}))
  const messages: { employee_id: string; title: string; text: string }[] = []

  if (body?.record?.employee_id) {
    // Mode 1: a follow-up was just assigned.
    const r = body.record
    messages.push({
      employee_id: r.employee_id,
      title: 'New follow-up assigned ✦',
      text: `${r.customer_name} — ${TYPE_LABELS[r.type] ?? r.type} follow-up, due ${r.due_date}`,
    })
  } else {
    // Mode 2: daily due/overdue summary.
    const today = istToday()
    const { data: due } = await supabase
      .from('followups')
      .select('employee_id, customer_name, due_date')
      .eq('status', 'pending')
      .lte('due_date', today)
    const byEmployee = new Map<string, { total: number; overdue: number }>()
    for (const f of due ?? []) {
      const agg = byEmployee.get(f.employee_id) ?? { total: 0, overdue: 0 }
      agg.total++
      if (f.due_date < today) agg.overdue++
      byEmployee.set(f.employee_id, agg)
    }
    for (const [employee_id, agg] of byEmployee) {
      messages.push({
        employee_id,
        title: 'Kaha ✦ Follow-ups due',
        text:
          agg.overdue > 0
            ? `${agg.total} follow-up(s) need attention — ${agg.overdue} overdue.`
            : `${agg.total} follow-up(s) due today.`,
      })
    }
  }

  let sent = 0
  for (const msg of messages) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('employee_id', msg.employee_id)
    for (const sub of (subs ?? []) as Sub[]) {
      try {
        await webpush.sendNotification(
          sub.subscription as webpush.PushSubscription,
          JSON.stringify({ title: msg.title, body: msg.text, url: '/followups', tag: 'kaha-followups' })
        )
        sent++
      } catch (err) {
        // 404/410 = the device unsubscribed; clean it up.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
