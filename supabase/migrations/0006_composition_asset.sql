-- Editable HyperFrames composition (videos/{id}/composition.html) tracked as an asset.
-- meta: { assets: {basename: r2_key}, width, height, main_duration_s, outro_duration_s,
--         total_duration_s, edited_at? }
alter table assets drop constraint assets_kind_check;
alter table assets add constraint assets_kind_check check (kind in
  ('voiceover','avatar_video','scene_clip','subtitle_ass','final_video','thumbnail','composition_html'));
