type InventoryGroup = { id: string; models: string[]; items: string; retention: string; sources: string[] };
type ExternalFlow = { id: string; role: string; items: string; sources: string[]; openReview: string };
export type ProcessingInventory = {
  reference: string; reviewedAt: string; scope: string; legalApproval: false;
  groups: InventoryGroup[]; externalFlows: ExternalFlow[]; openReviews: string[];
};

export function auditProcessingInventory(inventory: ProcessingInventory, schema: string) {
  if (inventory.legalApproval !== false || !inventory.scope || !inventory.reference ||
      !inventory.groups?.length || !inventory.externalFlows?.length || !inventory.openReviews?.length) throw new Error("INVENTORY_SCOPE_REQUIRED");
  const schemaModels = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(match => match[1]);
  if (!schemaModels.length) throw new Error("INVENTORY_SCHEMA_REQUIRED");
  const assigned = inventory.groups.flatMap(group => {
    if (!group.id || !group.models?.length || group.models.some(model => typeof model !== "string" || !/^[A-Z]\w*$/.test(model)) || !group.items || !group.retention || !group.sources?.length) throw new Error("INVENTORY_GROUP_INVALID");
    return group.models;
  });
  for (const flow of inventory.externalFlows) if (!flow.id || !flow.role || !flow.items || !flow.openReview || !flow.sources?.length) throw new Error("INVENTORY_EXTERNAL_FLOW_INVALID");
  const sources = [...new Set([...inventory.groups, ...inventory.externalFlows].flatMap(item => item.sources))];
  if (sources.some(source => !/^[\w./-]+$/.test(source) || !/^(?:src\/|scripts\/|prisma\/|docker-compose[\w.-]*\.ya?ml$)/.test(source) || source.split("/").includes(".."))) throw new Error("INVENTORY_SOURCE_PATH_INVALID");
  const unclassifiedModels = schemaModels.filter(model => !assigned.includes(model));
  const staleModels = assigned.filter(model => !schemaModels.includes(model));
  const duplicateModels = [...new Set(assigned.filter((model, index) => assigned.indexOf(model) !== index))];
  const ids = [...inventory.groups, ...inventory.externalFlows].map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("INVENTORY_DUPLICATE_ID");
  return {
    scope: "static-prisma-model-classification-and-source-references-only" as const,
    reference: inventory.reference, models: schemaModels.length, groups: inventory.groups.length,
    externalFlows: inventory.externalFlows.length, unclassifiedModels, staleModels, duplicateModels,
    sourceCoverageComplete: !unclassifiedModels.length && !staleModels.length && !duplicateModels.length,
    sources, openReviews: inventory.openReviews,
    publicationReady: false, legalApproval: false, liveDataInspected: false,
  };
}
