'use strict';

// A path is eligible when exactly one distinct catalogue import is Open and
// every Formalpedia import resolves. External modules have no catalogue status.
function updateResearchQueue(db, baseline = false) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_routes(
      solution TEXT PRIMARY KEY, lemma TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS research_routes_lemma ON research_routes(lemma,solution);
    CREATE TABLE IF NOT EXISTS research_changes(
      lemma TEXT PRIMARY KEY, name TEXT NOT NULL, toolchain TEXT NOT NULL, status TEXT NOT NULL,
      previous INTEGER NOT NULL, current INTEGER NOT NULL, gained INTEGER NOT NULL, lost INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE TEMP TABLE next_research_routes(
      solution TEXT PRIMARY KEY, lemma TEXT NOT NULL
    ) WITHOUT ROWID;

    INSERT INTO next_research_routes
    SELECT p.path, min(CASE WHEN e.status='Open' THEN e.id END)
    FROM proof_imports p
    LEFT JOIN module_records m ON m.path=p.target_path
    LEFT JOIN entries e ON e.id=m.id
    WHERE p.target_path IS NOT NULL
    GROUP BY p.path
    HAVING count(DISTINCT CASE WHEN e.status='Open' THEN e.id END)=1
       AND count(*)=count(e.id);
  `);
  const hadChanges = db.prepare('SELECT 1 FROM research_changes LIMIT 1').get();
  db.exec('DELETE FROM research_changes');
  if (!baseline) db.exec(`
    WITH differences AS (
      SELECT lemma, 1 AS gained, 0 AS lost FROM (
        SELECT solution, lemma FROM next_research_routes
        EXCEPT SELECT solution, lemma FROM research_routes
      )
      UNION ALL
      SELECT lemma, 0, 1 FROM (
        SELECT solution, lemma FROM research_routes
        EXCEPT SELECT solution, lemma FROM next_research_routes
      )
    ), counts AS (
      SELECT lemma, sum(gained) AS gained, sum(lost) AS lost FROM differences GROUP BY lemma
    )
    INSERT INTO research_changes
    SELECT c.lemma, coalesce(e.name,b.name,c.lemma), coalesce(e.toolchain,b.toolchain,''),
      coalesce(e.status,'Removed'), b.paths, b.paths+c.gained-c.lost, c.gained,c.lost
    FROM counts c LEFT JOIN entries e ON e.id=c.lemma
    JOIN temp.research_before b ON b.lemma=c.lemma
    UNION ALL
    SELECT c.lemma,e.name,e.toolchain,e.status,0,c.gained,c.gained,0
    FROM counts c JOIN entries e ON e.id=c.lemma
    WHERE NOT EXISTS (SELECT 1 FROM temp.research_before b WHERE b.lemma=c.lemma);
  `);
  const stats = db.prepare(`
    SELECT count(*) AS changedLemmas, coalesce(sum(gained),0) AS gainedPaths,
      coalesce(sum(lost),0) AS lostPaths FROM research_changes
  `).get();
  db.exec(`
    DELETE FROM research_routes WHERE NOT EXISTS (
      SELECT 1 FROM next_research_routes n WHERE n.solution=research_routes.solution AND n.lemma=research_routes.lemma
    );
    INSERT OR IGNORE INTO research_routes SELECT solution,lemma FROM next_research_routes;
    DROP TABLE next_research_routes;
  `);
  const totals = db.prepare('SELECT count(DISTINCT lemma) AS lemmas,count(*) AS paths FROM research_routes').get();
  return { summary: { ...totals, ...stats }, indexChanged: Boolean(baseline || hadChanges || stats.changedLemmas) };
}

function captureResearchQueue(db) {
  db.exec(`
    CREATE TEMP TABLE research_before AS
    SELECT r.lemma,e.name,e.toolchain,count(*) AS paths
    FROM research_routes r JOIN entries e ON e.id=r.lemma GROUP BY r.lemma;
    CREATE UNIQUE INDEX temp.research_before_id ON research_before(lemma);
  `);
}

module.exports = { captureResearchQueue, updateResearchQueue };
