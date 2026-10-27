-- La columna occs.id no tenía valor por defecto (no era autoincremental).
-- Causaba "null value in column id violates not-null constraint" en todo
-- insert hecho por la raiz-api reconstruida. Se descubrió al probar
-- occ.insert contra producción después de reconstruir el backend.
-- Ya se corrió en producción (2026-10-27); este archivo queda como
-- documentación y para poder reaplicarlo en otro entorno si hiciera falta.

create sequence if not exists occs_id_seq owned by occs.id;
select setval('occs_id_seq', (select coalesce(max(id), 0) from occs));
alter table occs alter column id set default nextval('occs_id_seq');
