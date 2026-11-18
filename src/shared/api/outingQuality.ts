export type OutingQuality = {
  asOf: string; registered: number; ready: number; destinations: number;
  regions: Array<{ name: string; ready: number; destinations: number }>;
  types: Array<{ name: string; count: number }>;
  issues: Array<{ kind: string; count: number; samples: Array<{ id: string; name: string; region: string }> }>;
};
