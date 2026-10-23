-- Sauvegarde / restauration des données (appelées par l'Apps Script masterfile, sauvegarde.js,
-- avec la clé secrète uniquement).
--
-- sauvegarde_export() : toutes les tables du schéma public en une seule photo cohérente, sauf
--   config_interne (à recréer à la main), + id/e-mail des comptes de connexion (sans mot de passe).
-- sauvegarde_restaurer(p) : recharge une sauvegarde dans un projet dont la structure a été
--   rejouée et dont les tables sont VIDES (refus sinon). Triggers coupés pendant le chargement,
--   tables chargées dans l'ordre des clés étrangères, comptes de connexion recréés retrouvés
--   par e-mail (auth_user_id remplacé), séquences recalées. Tout ou rien.

create or replace function public.sauvegarde_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t      record;
  lignes jsonb;
  res    jsonb := '{}'::jsonb;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'config_interne'
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t.relname)
      into lignes;
    res := res || jsonb_build_object(t.relname, lignes);
  end loop;
  return jsonb_build_object(
    'genere_le', now(),
    'tables', res,
    'auth_utilisateurs', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email)), '[]'::jsonb)
                          from auth.users u),
    'stockage_fichiers', (select count(*) from storage.objects)
  );
end;
$$;

create or replace function public.sauvegarde_restaurer(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t        text;
  n        bigint;
  lignes   jsonb;
  cols     text;
  restant  text[];
  ordre    text[] := '{}';
  pris     boolean;
  auth_map jsonb := '{}'::jsonb;
  manquant text;
  s        record;
  res      jsonb := '{}'::jsonb;
begin
  if p is null or p->'tables' is null then
    raise exception 'Sauvegarde illisible (pas de clé "tables")';
  end if;

  -- Garde-fous : toutes les tables existent et sont vides
  for t in select key from jsonb_each(p->'tables') loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'Table % absente : rejouer d''abord la structure', t;
    end if;
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'Table % non vide : restauration refusée', t;
    end if;
  end loop;

  -- Comptes de connexion : ancien id -> id du compte recréé (même e-mail)
  select coalesce(jsonb_object_agg(e->>'id', a.id::text), '{}'::jsonb)
    into auth_map
    from jsonb_array_elements(coalesce(p->'auth_utilisateurs', '[]'::jsonb)) e
    join auth.users a on lower(a.email) = lower(e->>'email');
  select string_agg(e->>'email', ', ')
    into manquant
    from jsonb_array_elements(coalesce(p->'auth_utilisateurs', '[]'::jsonb)) e
    where not exists (select 1 from auth.users a where lower(a.email) = lower(e->>'email'));
  if manquant is not null then
    raise exception 'Comptes de connexion à recréer d''abord (Authentication > Users) : %', manquant;
  end if;

  -- Ordre de chargement : parents avant enfants (clés étrangères internes au schéma public)
  select array_agg(key order by key) into restant from jsonb_each(p->'tables');
  while coalesce(array_length(restant, 1), 0) > 0 loop
    pris := false;
    foreach t in array restant loop
      if not exists (
        select 1 from pg_constraint c
        where c.contype = 'f'
          and c.conrelid = format('public.%I', t)::regclass
          and c.confrelid <> c.conrelid
          and c.confrelid::regclass::text = any (
                select format('public.%I', r)::regclass::text from unnest(restant) r)
      ) then
        ordre   := ordre || t;
        restant := array_remove(restant, t);
        pris    := true;
      end if;
    end loop;
    if not pris then
      raise exception 'Dépendances circulaires entre : %', restant;
    end if;
  end loop;

  foreach t in array ordre loop
    lignes := p->'tables'->t;
    if lignes is null or jsonb_array_length(lignes) = 0 then
      res := res || jsonb_build_object(t, 0);
      continue;
    end if;
    -- auth_user_id : remplacé par l'id du compte recréé
    select coalesce(jsonb_agg(
             case when r ? 'auth_user_id' and auth_map ? (r->>'auth_user_id')
                  then jsonb_set(r, '{auth_user_id}', to_jsonb(auth_map->>(r->>'auth_user_id')))
                  else r end), '[]'::jsonb)
      into lignes
      from jsonb_array_elements(lignes) r;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
      into cols
      from pg_attribute a
      where a.attrelid = format('public.%I', t)::regclass
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format('alter table public.%I disable trigger user', t);
    execute format(
      'insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)',
      t, cols) using lignes;
    execute format('alter table public.%I enable trigger user', t);
    execute format('select count(*) from public.%I', t) into n;
    res := res || jsonb_build_object(t, n);
  end loop;

  -- Séquences rattachées à une colonne : reprise après la plus grande valeur
  for s in
    select d.objid::regclass::text as seq, c.relname as tbl, a.attname as col
    from pg_depend d
    join pg_class c     on c.oid = d.refobjid
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
    where d.classid = 'pg_class'::regclass and d.deptype in ('a', 'i')
      and (select relkind from pg_class where oid = d.objid) = 'S'
  loop
    execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', s.seq, s.col, s.tbl);
  end loop;

  return jsonb_build_object('restaure_le', now(), 'lignes', res);
end;
$$;

revoke all on function public.sauvegarde_export() from public, anon, authenticated;
revoke all on function public.sauvegarde_restaurer(jsonb) from public, anon, authenticated;
grant execute on function public.sauvegarde_export() to service_role;
grant execute on function public.sauvegarde_restaurer(jsonb) to service_role;
