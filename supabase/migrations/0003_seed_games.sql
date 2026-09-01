-- Catálogo inicial (RF-7, D5). Penalizaciones por defecto: 20 / 40 / 45 min.
-- Mapeo a La Nación en specs/02-design.md §9.2 — sudoku/hard queda a confirmar
-- con un link real (T3.11).
insert into public.games (slug, name, default_penalty_seconds, ln_game, ln_level, sort_order) values
  ('crucigrama',      'Crucigrama',      1200, 'crossword', 'daily',  1),
  ('cruci-experto',   'Cruci Experto',   2400, 'crossword', 'expert', 2),
  ('sudoku-avanzado', 'Sudoku Avanzado', 2700, 'sudoku',     'hard',  3);
