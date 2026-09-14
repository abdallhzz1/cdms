# Confidential financial vault

## Decision record — 2026-09-14

College leadership requested a highly confidential financial file channel that can be distributed through a QR code printed in a fixed design. The QR URL must remain permanent, while access can be disabled or protected with a changed password without reprinting the code.

## Access model

- `confidential_finance.manage` is granted to the `DEAN` role during migration. Additional management access must be granted explicitly through the permission matrix.
- The QR route is public only as an entry point. Before password verification it returns no vault title, description, file name, or file metadata.
- Passwords are hashed and never returned, logged, or encoded in the QR URL.
- Successful verification creates a random 30-minute access session in an encrypted, `HttpOnly`, `SameSite=Strict` cookie. The server stores only its SHA-256 hash and binds it to the requesting IP address and user agent.
- Five unlock attempts per minute are allowed per IP and per vault/IP combination.
- Changing the password or disabling the QR deletes all active access sessions immediately.
- The QR token is generated once, stored encrypted with a separate lookup hash, and has no rotation or expiration operation.

## Files and audit

- Files remain on Laravel's private `local` storage disk. Both internal and public downloads pass through permission/session checks.
- Allowed types are PDF, Word, Excel, PNG, JPEG, WebP, and ZIP; each file is limited to 20 MB and each vault to 10 files.
- Responses use `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`.
- Vault creation and changes, upload/removal, failed unlocks, successful unlocks, and public file access are written to the audit log without raw passwords or access tokens.
