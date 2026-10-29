-- Recuperación de contraseña: token de un solo uso con vencimiento, guardado
-- como HMAC (no el token crudo) para que ni un volcado de la tabla alcance
-- para forjar un reset. Aplicado a producción el 2026-10-29.

alter table users add column if not exists reset_token_hash text;
alter table users add column if not exists reset_token_expires timestamptz;

create index if not exists users_reset_token_hash_idx on users (reset_token_hash);
