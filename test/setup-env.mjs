// Unit fixtures must not inherit production connections or feature defaults.
// Individual feature tests opt in explicitly with their own mocks/temp storage.
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/tuti_unit_test";
process.env.HARUMADI_TOGETHER_ENABLED = "false";
process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
delete process.env.PRIVACY_REPLAY_LEDGER_PATH;
delete process.env.PRIVACY_REPLAY_HMAC_SECRET;
delete process.env.TUTI_PRIVACY_REPLAY_OFFLINE;
