-- Admin preference: task comments / review. When off (default), tasks are a
-- plain shared to-do system — admins assign and view tasks but there is no
-- comment box or saving step anywhere.

alter table store_config add column task_comments_enabled boolean not null default false;
