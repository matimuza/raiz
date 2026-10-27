-- Cierra el agujero de seguridad: las policies actuales dicen
-- "using (true)" / "with check (true)" para el rol "public", es decir,
-- permiten leer y escribir CUALQUIER fila con la clave anónima (expuesta
-- en el frontend), sin filtrar por tenant. Esto reemplaza esas policies
-- por "deny all": nadie puede acceder directo con la clave anónima.
-- El acceso legítimo pasa por la Edge Function raiz-api, que debe usar
-- la service_role key (esa key ignora RLS por diseño de Postgres/Supabase).

alter policy "tenant_isolation" on "public"."occs"
  to public using (false) with check (false);

alter policy "tenant_isolation" on "public"."users"
  to public using (false) with check (false);

alter policy "tenant_isolation" on "public"."tenants"
  to public using (false) with check (false);

alter policy "tenant_isolation" on "public"."notifs"
  to public using (false) with check (false);

alter policy "public_all" on "public"."amfes"
  to public using (false) with check (false);
