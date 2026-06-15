-- Planner — boards carry a Flows line style.
--
-- line_style is the stroke pattern (solid / dotted / dashed / dashdot / longdash
-- / faded / wavy) used to draw this board's task trunks in the Flows timeline, so
-- each board reads with its own line personality. Mirrors boards.color (no CHECK;
-- the app's zod layer guards writes). Default covers existing boards.

alter table boards add column line_style text not null default 'solid';
