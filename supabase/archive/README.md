# Archived edge functions

Source of functions removed from the Supabase project on 2026-10-06. Kept for reference only; nothing here is deployed.

- `paypal-capture`, `activate-vip`: PayPal VIP checkout. The site no longer has a VIP purchase flow, both
  functions verified orders against the PayPal sandbox (no `PAYPAL_API_BASE` set), and `activate-vip`
  wrote a non-existent `vip_payments.tier` column (the table has `vip_tier`), so every activation failed.
  Before restoring: write `vip_tier`, check the order's `reference_id` matches the listing, and set
  `PAYPAL_API_BASE` to the live API.
