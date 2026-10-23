-- Empreinte de la structure du schéma public (tables, colonnes, contraintes, fonctions, vues,
-- index, triggers, policies, Realtime, droits des rôles d'API). Deux bases à la structure
-- identique donnent la même empreinte : sert à vérifier qu'une structure rejouée est complète
-- et que la copie de structure du kit de reconstruction est à jour. Clé secrète seulement.

create or replace function public.sauvegarde_empreinte()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
with parts(k, n, h) as (
  select 'tables', count(*), md5(coalesce(string_agg(c.relname, ',' order by c.relname), ''))
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'colonnes', count(*), md5(coalesce(string_agg(table_name||'.'||column_name||':'||data_type||':'||coalesce(column_default,'')||':'||is_nullable, ',' order by table_name, ordinal_position), ''))
    from information_schema.columns where table_schema = 'public'
  union all
  select 'contraintes', count(*), md5(coalesce(string_agg(conrelid::regclass::text||'.'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname), ''))
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'fonctions', count(*), md5(coalesce(string_agg(md5(replace(pg_get_functiondef(p.oid), chr(13), '')), ',' order by p.proname, pg_get_function_identity_arguments(p.oid)), ''))
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'vues', count(*), md5(coalesce(string_agg(c.relname||':'||pg_get_viewdef(c.oid), ',' order by c.relname), ''))
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  union all
  select 'index', count(*), md5(coalesce(string_agg(indexdef, ',' order by indexname), ''))
    from pg_indexes where schemaname = 'public'
  union all
  select 'triggers', count(*), md5(coalesce(string_agg(pg_get_triggerdef(t.oid), ',' order by c.relname, t.tgname), ''))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all
  select 'policies', count(*), md5(coalesce(string_agg(tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'')||':'||array_to_string(roles,','), ',' order by tablename, policyname), ''))
    from pg_policies where schemaname = 'public'
  union all
  select 'realtime', count(*), md5(coalesce(string_agg(tablename, ',' order by tablename), ''))
    from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  union all
  select 'droits_tables', count(*), md5(coalesce(string_agg(table_name||':'||grantee||':'||privilege_type, ',' order by table_name, grantee, privilege_type), ''))
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  union all
  select 'droits_colonnes', count(*), md5(coalesce(string_agg(table_name||'.'||column_name||':'||grantee||':'||privilege_type, ',' order by table_name, column_name, grantee, privilege_type), ''))
    from information_schema.column_privileges
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 'droits_fonctions', count(*), md5(coalesce(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||r.rolname||':'||has_function_privilege(r.oid, p.oid, 'EXECUTE')::text, ',' order by p.proname, pg_get_function_identity_arguments(p.oid), r.rolname), ''))
    from pg_proc p cross join pg_roles r
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and r.rolname in ('anon', 'authenticated', 'service_role')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'droits_sequences', count(*), md5(coalesce(string_agg(c.relname||':'||r.rolname||':'||has_sequence_privilege(r.oid, c.oid, 'USAGE')::text||has_sequence_privilege(r.oid, c.oid, 'SELECT')::text||has_sequence_privilege(r.oid, c.oid, 'UPDATE')::text, ',' order by c.relname, r.rolname), ''))
    from pg_class c cross join pg_roles r
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and r.rolname in ('anon', 'authenticated')
)
select jsonb_build_object(
  'empreinte', md5(string_agg(k||'='||n||':'||h, '|' order by k)),
  'detail', jsonb_object_agg(k, jsonb_build_object('n', n, 'h', h))
) from parts;
$function$;

revoke all on function public.sauvegarde_empreinte() from public, anon, authenticated;
grant execute on function public.sauvegarde_empreinte() to service_role;
