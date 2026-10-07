# Auth email templates

Paste each file into Supabase -> Authentication -> Emails -> Templates and click Save.
Site URL (Authentication -> URL Configuration) must be `https://hira.ge`.
Edit `build.py` and re-run `python3 supabase/templates/build.py` to change them.

| Supabase template   | File                    | Subject                              |
| ------------------- | ----------------------- | ------------------------------------ |
| Confirm signup      | `confirm-signup.html`   | დაადასტურე ელფოსტა - Hira            |
| Invite user         | `invite-user.html`      | მოგიწვიეს ჰირაზე - Hira              |
| Magic link or OTP   | `magic-link.html`       | შესვლა ჰირაზე - Hira                 |
| Change email address| `change-email.html`     | დაადასტურე ახალი ელფოსტა - Hira      |
| Reset password      | `reset-password.html`   | პაროლის აღდგენა - Hira               |
| Reauthentication    | `reauthentication.html` | დადასტურების კოდი - Hira             |
