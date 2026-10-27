"""Build the branded Supabase Auth email templates.

Writes supabase/templates/auth/<name>.html from one shared layout, and
supabase/templates/auth/subjects.json. Run from the repo root:

    python3 scripts/auth-templates/build.py

The look follows the Publisense notification emails (v2_email_send): the system
font stack, #111 text, cobalt #0047AB button, quiet #777 footer. Table-based,
inline CSS, no VML or HTML comments (Supabase's Go templates strip comments).

Expiry copy matches production mailer_otp_exp = 3600 s (1 hour). If that
setting changes, change EXPIRY below and re-apply.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'supabase' / 'templates' / 'auth'
LOGO = 'https://publisense.app/apple-touch-icon.png'
EXPIRY = 'This link expires in 1 hour and can only be used once.'
IGNORE = 'If you didn’t request this, you can ignore this email.'
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

TEMPLATES = {
    'confirmation': dict(
        key='confirmation',
        subject='Confirm your email for Publisense',
        preheader='One click to finish setting up your Publisense account.',
        heading='Confirm your email',
        lines=['Thanks for joining Publisense. Confirm your email address to finish setting up your account.'],
        button='Confirm email',
        sent_to=True,
    ),
    'magic_link': dict(
        key='magic_link',
        subject='Your Publisense sign-in link',
        preheader='Sign in to Publisense with one click. No password needed.',
        heading='Sign in to Publisense',
        lines=['Use the button below to sign in. No password needed.'],
        button='Sign in',
        sent_to=True,
    ),
    'recovery': dict(
        key='recovery',
        subject='Reset your Publisense password',
        preheader='Choose a new password for your Publisense account.',
        heading='Reset your password',
        lines=['We got a request to reset the password for your Publisense account. Choose a new one below.'],
        button='Choose a new password',
        sent_to=True,
    ),
    'email_change': dict(
        key='email_change',
        subject='Confirm your new email for Publisense',
        preheader='Confirm the change to your Publisense email address.',
        heading='Confirm your new email',
        lines=[
            'You asked to change your Publisense email from {{ .Email }} to {{ .NewEmail }}.',
            'To keep your account safe, we’ve sent a link to both addresses. The change goes through once both are confirmed.',
        ],
        button='Confirm change',
        # Sent to both the old and new address, so no "sent to" line.
        sent_to=False,
    ),
    'invite': dict(
        key='invite',
        subject='You’re invited to Publisense',
        preheader='Accept your invite and set up your Publisense account.',
        heading='You’re invited to Publisense',
        lines=['You’ve been invited to join Publisense, where people share feedback on the products they use. Accept to set up your account.'],
        button='Accept invite',
        sent_to=True,
    ),
}


def render(t):
    lines = ''.join(
        f'<p style="margin:0 0 14px;font-family:{FONT};font-size:15px;line-height:1.55;color:#333333;" class="ps-text">{l}</p>'
        for l in t['lines'])
    sent_to = ('<br>This email was sent to {{ .Email }}.' if t['sent_to'] else '')
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{t['subject']}</title>
<style>
  body {{ margin:0; padding:0; }}
  a {{ color:#0047AB; }}
  @media (max-width:600px) {{
    .ps-card {{ border-radius:0 !important; border-left:0 !important; border-right:0 !important; }}
    .ps-pad {{ padding-left:22px !important; padding-right:22px !important; }}
  }}
  @media (prefers-color-scheme: dark) {{
    .ps-bg {{ background-color:#0f1115 !important; }}
    .ps-card {{ background-color:#181b21 !important; border-color:#2a2f38 !important; }}
    .ps-heading, .ps-brand {{ color:#f3f4f6 !important; }}
    .ps-text {{ color:#d1d5db !important; }}
    .ps-muted {{ color:#9ca3af !important; }}
    .ps-link {{ color:#7aa7ff !important; }}
    .ps-rule {{ border-color:#2a2f38 !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;" class="ps-bg">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">{t['preheader']}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f5f7" style="background-color:#f4f5f7;" class="ps-bg">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
  <tr><td bgcolor="#ffffff" class="ps-card" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td class="ps-pad" style="padding:28px 36px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><a href="https://publisense.app" style="text-decoration:none;"><img src="{LOGO}" width="32" height="32" alt="Publisense" style="display:block;width:32px;height:32px;border:0;border-radius:8px;"></a></td>
        <td style="vertical-align:middle;font-family:{FONT};font-size:17px;font-weight:700;letter-spacing:-0.2px;color:#111111;" class="ps-brand">Publisense</td>
      </tr></table>
    </td></tr>
    <tr><td class="ps-pad" style="padding:28px 36px 8px;">
      <h1 style="margin:0 0 14px;font-family:{FONT};font-size:22px;line-height:1.3;font-weight:700;color:#111111;" class="ps-heading">{t['heading']}</h1>
      {lines}
    </td></tr>
    <tr><td class="ps-pad" style="padding:8px 36px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#0047AB" style="background-color:#0047AB;border-radius:6px;">
          <a href="{{{{ .ConfirmationURL }}}}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:{FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:6px;border:1px solid #0047AB;">{t['button']}</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td class="ps-pad" style="padding:0 36px 8px;">
      <p style="margin:0 0 6px;font-family:{FONT};font-size:13px;line-height:1.5;color:#555555;" class="ps-muted">Or paste this link into your browser:</p>
      <p style="margin:0 0 18px;font-family:{FONT};font-size:13px;line-height:1.5;word-break:break-all;"><a href="{{{{ .ConfirmationURL }}}}" target="_blank" style="color:#0047AB;text-decoration:underline;" class="ps-link">{{{{ .ConfirmationURL }}}}</a></p>
    </td></tr>
    <tr><td class="ps-pad" style="padding:0 36px 28px;">
      <p style="margin:0;padding-top:16px;border-top:1px solid #eeeeee;font-family:{FONT};font-size:13px;line-height:1.55;color:#555555;" class="ps-muted ps-rule">{EXPIRY}<br>{IGNORE}</p>
    </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:20px 12px 0;font-family:{FONT};font-size:12px;line-height:1.6;color:#777777;" class="ps-muted">
    Publisense · Public feedback boards for the products you use<br><a href="https://publisense.app" style="color:#777777;text-decoration:underline;" class="ps-muted">publisense.app</a>{sent_to}
  </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    subjects = {}
    for name, t in TEMPLATES.items():
        (OUT / f'{name}.html').write_text(render(t), encoding='utf-8')
        subjects[name] = t['subject']
    (OUT / 'subjects.json').write_text(json.dumps(subjects, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('wrote', ', '.join(sorted(subjects)))


if __name__ == '__main__':
    main()
