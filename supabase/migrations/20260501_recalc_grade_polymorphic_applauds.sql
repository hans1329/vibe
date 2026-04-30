-- Fix recalculate_creator_grade() to use polymorphic applauds (§1-A ③).
-- The function was written for v1 schema where applauds had a project_id
-- column. v2 (2026-04-24) replaced that with target_type/target_id, but
-- this function was never updated · every analysis_snapshots INSERT has
-- been silently rolling back since because the on_snapshot_recalc_grade
-- trigger raises "column a.project_id does not exist" inside the txn.
--
-- Symptom: edge fn returns ok:true but snapshot_id:null · projects.lh_*
-- gets stamped (separate UPDATE statement runs first), but the snapshot
-- row never lands. Caught while bulk-re-auditing 4 active projects after
-- new detector deploy · all 4 came back with snapshot_id:null.

CREATE OR REPLACE FUNCTION public.recalculate_creator_grade(p_creator_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_graduated_count    integer;
  v_avg_score          numeric;
  v_tech_diversity     integer;
  v_applauds_received  integer;
  v_md_verified        integer;
  v_current_grade      text;
  v_new_grade          text;
begin
  if p_creator_id is null then
    return null;
  end if;

  select
    count(*)                                                          as graduated_count,
    coalesce(avg(p.score_total) filter (where p.status in ('graduated','valedictorian')), 0) as avg_score
  into v_graduated_count, v_avg_score
  from projects p
  where p.creator_id = p_creator_id
    and p.status in ('graduated','valedictorian');

  select count(distinct layer)
    into v_tech_diversity
    from projects p,
         unnest(p.tech_layers) as layer
   where p.creator_id = p_creator_id
     and p.status in ('graduated','valedictorian');

  -- v2 polymorphic applauds · target_type='product' + target_id is project.id
  select count(*)
    into v_applauds_received
    from applauds a
    join projects p on p.id = a.target_id
   where a.target_type = 'product'
     and p.creator_id  = p_creator_id;

  select count(*)
    into v_md_verified
    from md_library m
   where m.creator_id = p_creator_id
     and m.verified_badge = true
     and m.status = 'published';

  select creator_grade into v_current_grade from members where id = p_creator_id;

  if v_graduated_count >= 10 then
    v_new_grade := 'Legend';
  elsif v_graduated_count >= 5 and v_applauds_received >= 20 and v_avg_score >= 80 then
    v_new_grade := 'Vibe Engineer';
  elsif v_graduated_count >= 3 and v_avg_score >= 75 and (v_tech_diversity >= 3 or v_md_verified >= 2) then
    v_new_grade := 'Architect';
  elsif v_graduated_count >= 2 and v_avg_score >= 70 then
    v_new_grade := 'Maker';
  elsif v_graduated_count >= 1 and v_avg_score >= 60 then
    v_new_grade := 'Builder';
  else
    v_new_grade := 'Rookie';
  end if;

  update members
     set creator_grade    = v_new_grade,
         total_graduated  = v_graduated_count,
         avg_auto_score   = v_avg_score,
         grade_recalc_at  = now()
   where id = p_creator_id
     and (
       creator_grade is distinct from v_new_grade
       or total_graduated is distinct from v_graduated_count
       or round(avg_auto_score, 2) is distinct from round(v_avg_score, 2)
     );

  if v_current_grade is distinct from v_new_grade then
    insert into members_grade_history (member_id, previous_grade, new_grade, triggered_by, context)
    values (p_creator_id, v_current_grade, v_new_grade, 'analysis_snapshot',
      jsonb_build_object(
        'graduated_count', v_graduated_count,
        'avg_score', v_avg_score,
        'tech_diversity', v_tech_diversity,
        'applauds_received', v_applauds_received,
        'md_verified', v_md_verified
      ));
  end if;

  return v_new_grade;
end;
$function$;
