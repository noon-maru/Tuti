type Snapshot = { retained: Array<{ table: string; rows: number; fingerprint: string }>; omitted: Array<{ table: string; rows: number }> };

export function compareCoreRestore(source: Snapshot, restored: Snapshot, excluded: readonly string[]) {
  const valid = (snapshot: Snapshot) => {
    if (!Array.isArray(snapshot.retained) || !Array.isArray(snapshot.omitted) || snapshot.retained.length === 0) throw new Error("CORE_SNAPSHOT_INVALID");
    const seen = new Set<string>();
    for (const item of [...snapshot.retained, ...snapshot.omitted]) {
      if (typeof item.table !== "string" || seen.has(item.table) || !Number.isSafeInteger(item.rows) || item.rows < 0) throw new Error("CORE_SNAPSHOT_INVALID");
      seen.add(item.table);
    }
    for (const item of snapshot.retained) if (!/^[a-f0-9]{32}$/.test(item.fingerprint)) throw new Error("CORE_SNAPSHOT_INVALID");
  };
  valid(source); valid(restored);
  const expected = new Set(excluded.map(table => `public.${table}`));
  if (expected.size !== excluded.length || !excluded.length || excluded.some(table => !/^[a-z_]+$/.test(table))) throw new Error("CORE_POLICY_INVALID");
  for (const snapshot of [source, restored]) {
    if (snapshot.omitted.length !== expected.size || snapshot.omitted.some(item => !expected.has(item.table)) || snapshot.retained.some(item => expected.has(item.table))) throw new Error("CORE_POLICY_MISMATCH");
  }
  if (source.retained.length !== restored.retained.length || source.retained.some(before => {
    const after = restored.retained.find(item => item.table === before.table);
    return !after || before.rows !== after.rows || before.fingerprint !== after.fingerprint;
  })) throw new Error("CORE_RETAINED_DATA_MISMATCH");
  if (restored.omitted.some(item => item.rows !== 0)) throw new Error("CORE_EXCLUDED_DATA_PRESENT");
  return { scope: "isolated-core-backup-round-trip", retainedTablesCompared: source.retained.length,
    retainedRowsCompared: restored.retained.reduce((sum, item) => sum + item.rows, 0), rowCountAndFingerprintMatch: true,
    excludedTablesEmpty: restored.omitted.length, productionDatabaseTouched: false, productionObjectStorageTouched: false,
    artifactRetention: "test-only-artifact-removed-during-sandbox-cleanup" };
}
