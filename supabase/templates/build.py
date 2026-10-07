"""Generates the Supabase auth email templates in this folder.

Paste each .html file into Supabase -> Authentication -> Emails -> Templates.
Subjects are listed in README.md. Run: python3 supabase/templates/build.py
"""
from pathlib import Path

HERE = Path(__file__).parent


def page(title, intro, footer_ka, footer_en, button=None, url=None, code=False):
    action = ""
    if button and url:
        action += f'''
                <p style="margin:0 0 24px;">
                  <a href="{url}" style="display:inline-block;background:#0088FF;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:8px;">{button}</a>
                </p>'''
    if code:
        action += '''
                <p style="margin:0 0 24px;font-size:28px;font-weight:bold;letter-spacing:6px;color:#1B2B4B;background:#F1F5F9;border-radius:8px;padding:12px 16px;text-align:center;">{{ .Token }}</p>'''
    return f'''<!doctype html>
<html lang="ka">
  <body style="margin:0;padding:0;background:#F8F9FC;font-family:Arial,Helvetica,sans-serif;color:#1B2B4B;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FC;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E2E8F0;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 24px;font-size:24px;font-weight:bold;color:#0088FF;">Hira</p>
                <h1 style="margin:0 0 12px;font-size:20px;">{title}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">{intro}</p>{action}
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748B;">{footer_ka}</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748B;">{footer_en}</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">Hira · hira.ge</p>
        </td>
      </tr>
    </table>
  </body>
</html>
'''


TEMPLATES = {
    "confirm-signup.html": page(
        "დაადასტურე ელფოსტა",
        "გამარჯობა! მადლობა, რომ დარეგისტრირდი ჰირაზე. ანგარიშის გასააქტიურებლად დააჭირე ღილაკს.",
        "თუ ჰირაზე არ დარეგისტრირებულხარ, უბრალოდ უგულებელყავი ეს წერილი.",
        "Confirm your email to activate your Hira account. If you did not sign up, ignore this email.",
        button="ელფოსტის დადასტურება",
        url="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email",
    ),
    "reset-password.html": page(
        "პაროლის აღდგენა",
        "მივიღეთ მოთხოვნა შენი ჰირას ანგარიშის პაროლის შესაცვლელად. ახალი პაროლის დასაყენებლად დააჭირე ღილაკს.",
        "თუ პაროლის შეცვლა არ მოგითხოვია, უგულებელყავი ეს წერილი - შენი პაროლი არ შეიცვლება.",
        "Use the button to set a new password for your Hira account. If you did not request this, ignore this email.",
        button="ახალი პაროლის დაყენება",
        url="{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery",
    ),
    "magic-link.html": page(
        "შესვლა ჰირაზე",
        "ანგარიშში შესასვლელად დააჭირე ღილაკს ან შეიყვანე ეს კოდი:",
        "თუ შესვლა არ გიცდია, უგულებელყავი ეს წერილი.",
        "Use the button or the code above to log in to Hira. If you did not try to log in, ignore this email.",
        button="შესვლა",
        url="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink",
        code=True,
    ),
    "invite-user.html": page(
        "მოგიწვიეს ჰირაზე",
        "შენ მოგიწვიეს ჰირაზე - პლატფორმაზე, სადაც ფრილანსერები და დამქირავებლები ერთმანეთს პოულობენ. მოწვევის მისაღებად და ანგარიშის შესაქმნელად დააჭირე ღილაკს.",
        "თუ ამ მოწვევას არ ელოდი, უბრალოდ უგულებელყავი ეს წერილი.",
        "You have been invited to join Hira. Use the button to accept the invite. If you were not expecting it, ignore this email.",
        button="მოწვევის მიღება",
        url="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite",
    ),
    "change-email.html": page(
        "დაადასტურე ახალი ელფოსტა",
        "მივიღეთ მოთხოვნა შენი ჰირას ანგარიშის ელფოსტის შესაცვლელად: <strong>{{ .Email }}</strong> → <strong>{{ .NewEmail }}</strong>. ცვლილების დასადასტურებლად დააჭირე ღილაკს.",
        "თუ ელფოსტის შეცვლა არ მოგითხოვია, არ დააჭირო ღილაკს და შეცვალე პაროლი.",
        "Confirm the change of your Hira account email. If you did not request this, do not click the button and change your password.",
        button="ცვლილების დადასტურება",
        url="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change",
    ),
    "reauthentication.html": page(
        "დაადასტურე, რომ ეს შენ ხარ",
        "მოქმედების დასასრულებლად შეიყვანე ეს კოდი ჰირაზე:",
        "თუ ეს მოქმედება არ დაგიწყია, არავის გაუზიარო კოდი და შეცვალე პაროლი.",
        "Enter this code on Hira to confirm it's you. If you did not start this, do not share the code and change your password.",
        code=True,
    ),
}

for name, html in TEMPLATES.items():
    (HERE / name).write_text(html)
    print("wrote", name)
