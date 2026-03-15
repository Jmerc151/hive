import nodemailer from 'nodemailer'
import db from '../db.js'

// ── Transporter (Gmail) ──────────────────────────
let transporter = null

function getTransporter() {
  if (transporter) return transporter
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    console.log('📧 Email disabled — GMAIL_USER or GMAIL_APP_PASSWORD not set')
    return null
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  })
  console.log(`📧 Email enabled — sending from ${user}`)
  return transporter
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value || null
}

function getRecipient() {
  return getSetting('notification_email') || process.env.GMAIL_USER
}

// ── Base send ────────────────────────────────────
export async function sendEmail({ to, subject, html }) {
  if (getSetting('email_enabled') === 'false') return
  const t = getTransporter()
  if (!t) return
  const recipient = to || getRecipient()
  if (!recipient) return
  await t.sendMail({
    from: `"Hive Agents" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject,
    html: wrapHtml(subject, html)
  })
}

// ── Rate limiting — prevent email spam ───────────
const emailCooldowns = new Map() // key → timestamp
const EMAIL_COOLDOWN_MS = 30 * 60 * 1000 // 30 min cooldown per unique subject

function isRateLimited(key) {
  const lastSent = emailCooldowns.get(key)
  if (lastSent && Date.now() - lastSent < EMAIL_COOLDOWN_MS) return true
  emailCooldowns.set(key, Date.now())
  // Clean old entries every 100 inserts
  if (emailCooldowns.size > 200) {
    const cutoff = Date.now() - EMAIL_COOLDOWN_MS
    for (const [k, v] of emailCooldowns) { if (v < cutoff) emailCooldowns.delete(k) }
  }
  return false
}

// ── Approval needed ──────────────────────────────
export async function sendApprovalEmail(task, agent) {
  if (getSetting('email_on_approval') === 'false') return
  if (isRateLimited(`approval:${task.title.slice(0, 50)}`)) return
  await sendEmail({
    subject: `⏸️ Approval Required — ${task.title}`,
    html: `
      <div style="margin-bottom:16px">
        <span style="font-size:24px">${agent.avatar}</span>
        <span style="font-size:18px;font-weight:600;color:#f59e0b"> ${agent.name}</span>
        <span style="color:#9ca3af"> needs your approval</span>
      </div>
      <div style="background:#1e1e3a;border:1px solid #374151;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-weight:600;color:#e5e7eb;margin-bottom:8px">${task.title}</div>
        <div style="color:#9ca3af;font-size:14px">${(task.description || '').slice(0, 500)}</div>
      </div>
      <div style="color:#9ca3af;font-size:13px">
        Priority: <strong style="color:#e5e7eb">${task.priority}</strong> ·
        Estimated cost: <strong style="color:#e5e7eb">$${(task.estimated_cost || 0).toFixed(4)}</strong>
      </div>
      <div style="margin-top:16px">
        <a href="${getDashboardUrl()}" style="background:#f59e0b;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Open Hive Dashboard</a>
      </div>`
  })
}

// ── New proposal ─────────────────────────────────
export async function sendProposalEmail(proposal) {
  if (getSetting('email_on_proposal') === 'false') return
  if (isRateLimited(`proposal:${proposal.title.slice(0, 50)}`)) return
  const typeIcons = { feature: '✨', design: '🎨', code: '💻', prompt: '📝', workflow: '⚙️' }
  await sendEmail({
    subject: `💡 New Proposal — ${proposal.title}`,
    html: `
      <div style="margin-bottom:16px">
        <span style="font-size:24px">${typeIcons[proposal.type] || '💡'}</span>
        <span style="font-size:18px;font-weight:600;color:#f59e0b"> ${proposal.title}</span>
      </div>
      <div style="background:#1e1e3a;border:1px solid #374151;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="color:#9ca3af;font-size:12px;margin-bottom:8px">
          Type: <strong style="color:#e5e7eb">${proposal.type}</strong> ·
          Priority: <strong style="color:#e5e7eb">${proposal.priority || 'medium'}</strong> ·
          Effort: <strong style="color:#e5e7eb">${proposal.effort || 'medium'}</strong> ·
          Proposed by: <strong style="color:#e5e7eb">${proposal.proposed_by}</strong>
        </div>
        <div style="color:#d1d5db;font-size:14px;white-space:pre-wrap">${(proposal.description || '').slice(0, 1000)}</div>
      </div>
      ${proposal.code_diff ? `<div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:16px;font-family:monospace;font-size:12px;color:#c9d1d9;white-space:pre-wrap;overflow-x:auto">${proposal.code_diff.slice(0, 2000)}</div>` : ''}
      <div style="margin-top:16px">
        <a href="${getDashboardUrl()}" style="background:#f59e0b;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Review in Hive</a>
      </div>`
  })
}

// ── Task completed ───────────────────────────────
export async function sendTaskCompletedEmail(task, agent) {
  if (getSetting('email_on_completion') === 'false') return
  await sendEmail({
    subject: `✅ ${agent.name} finished — ${task.title}`,
    html: `
      <div style="margin-bottom:16px">
        <span style="font-size:24px">${agent.avatar}</span>
        <span style="font-size:18px;font-weight:600;color:#22c55e"> ${agent.name} completed a task</span>
      </div>
      <div style="background:#1e1e3a;border:1px solid #374151;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-weight:600;color:#e5e7eb;margin-bottom:8px">${task.title}</div>
        <div style="color:#9ca3af;font-size:14px">${(task.output || '').slice(0, 800)}</div>
      </div>
      <div style="color:#9ca3af;font-size:13px">
        Tokens: ${task.tokens_used?.toLocaleString() || 0} ·
        Cost: $${(task.estimated_cost || 0).toFixed(4)}
      </div>`
  })
}

// ── Weekly summary ───────────────────────────────
export async function sendWeeklySummaryEmail(data) {
  if (getSetting('email_weekly_summary') === 'false') return
  await sendEmail({
    subject: `📊 Hive Weekly Summary — ${new Date().toLocaleDateString()}`,
    html: `
      <div style="margin-bottom:20px">
        <span style="font-size:24px">🐝</span>
        <span style="font-size:20px;font-weight:700;color:#f59e0b"> Hive Weekly Summary</span>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        ${statCard('Tasks Completed', data.completedTasks, '#22c55e')}
        ${statCard('Tasks Failed', data.failedTasks, '#ef4444')}
        ${statCard('Total Spend', '$' + (data.totalSpend || 0).toFixed(2), '#f59e0b')}
        ${statCard('Pending Proposals', data.pendingProposals, '#8b5cf6')}
      </div>

      ${data.nexusAnalysis ? `
      <div style="background:#1e1e3a;border:1px solid #374151;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-weight:600;color:#e5e7eb;margin-bottom:8px">Nexus Analysis</div>
        <div style="color:#d1d5db;font-size:14px;white-space:pre-wrap">${data.nexusAnalysis.slice(0, 2000)}</div>
      </div>` : ''}

      <div style="margin-top:16px">
        <a href="${getDashboardUrl()}" style="background:#f59e0b;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Open Hive Dashboard</a>
      </div>`
  })
}

// ── HTML wrapper ─────────────────────────────────
function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:24px;color:#e5e7eb">
      ${body}
    </div>
    <div style="text-align:center;margin-top:16px;color:#6b7280;font-size:12px">
      🐝 Hive Autonomous Agent Team · <a href="${getDashboardUrl()}" style="color:#f59e0b">Dashboard</a>
    </div>
  </div>
</body></html>`
}

export async function sendCustomEmail(to, subject, body) {
  await sendEmail({ to, subject, html: `<div style="color:#e5e7eb;font-size:14px;line-height:1.6">${body}</div>` })
}

function statCard(label, value, color) {
  return `<div style="background:#1e1e3a;border:1px solid #374151;border-radius:8px;padding:12px 16px;min-width:120px;flex:1">
    <div style="color:#9ca3af;font-size:12px">${label}</div>
    <div style="font-size:20px;font-weight:700;color:${color}">${value}</div>
  </div>`
}

function getDashboardUrl() {
  return process.env.HIVE_URL || ''
}
