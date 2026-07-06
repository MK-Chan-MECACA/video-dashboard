-- Human-friendly unique video number so scenes can be referenced as V4-S2.
-- Backfilled in created_at order; new videos take the next number automatically.
alter table videos add column video_no integer;

with ordered as (
  select id, row_number() over (order by created_at) as rn from videos
)
update videos v set video_no = o.rn from ordered o where v.id = o.id;

create sequence videos_video_no_seq;
select setval('videos_video_no_seq', greatest(coalesce((select max(video_no) from videos), 1), 1), (select count(*) > 0 from videos));

alter table videos alter column video_no set not null;
alter table videos alter column video_no set default nextval('videos_video_no_seq');
alter table videos add constraint videos_video_no_unique unique (video_no);
alter sequence videos_video_no_seq owned by videos.video_no;
