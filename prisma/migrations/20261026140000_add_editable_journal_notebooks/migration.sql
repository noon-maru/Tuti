CREATE TABLE journal_notebooks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  cover_style TEXT NOT NULL CHECK (cover_style IN ('white-plain','green-plain','white-image','green-image')),
  inner_style TEXT NOT NULL CHECK (inner_style IN ('photo','text')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);
CREATE INDEX journal_notebooks_owner_id_created_at_idx ON journal_notebooks(owner_id, created_at);
CREATE TABLE journal_notebook_entries (
  notebook_id TEXT NOT NULL REFERENCES journal_notebooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (notebook_id, entry_id)
);
CREATE INDEX journal_notebook_entries_entry_id_idx ON journal_notebook_entries(entry_id);
