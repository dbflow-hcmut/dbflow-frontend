import type { StoredDiagramEdge, StoredDiagramNode } from "./conceptual-diagram.builder";
import { computeELKLayout, type LayoutItem, type LayoutEdge } from "./conceptual-elk-layout";

const generateCid = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `cid_${crypto.randomUUID()}`;
    }
    const randomSuffix = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `cid_${randomSuffix}`;
};

type AttributeKind = "simple" | "composite" | "multi_valued" | "complex" | "derived";

type ModelAttribute = {
    id: string;
    name: string;
    kind: AttributeKind;
    isKey: boolean;
    semantics?: string[];
    components?: ModelAttribute[];
    derivation?: string;
    notes?: string;
};

type ModelEntity = {
    id: string;
    name: string;
    kind: "strong" | "weak";
    attributes: ModelAttribute[];
    notes?: string;
};

type RelationshipEnd = {
    entityId: string;
    role?: string;
    cardinality?: string;
    optional?: boolean;
};

type ModelRelationship = {
    id: string;
    name: string;
    type: "association" | "identifying";
    arity?: number;
    ends: RelationshipEnd[];
    attributes?: ModelAttribute[];
    semantics?: string;
    notes?: string;
};

type ModelGeneralization = {
    id: string;
    parentEntityIds: string[];
    childEntityIds: string[];
    categoryBy?: string;
    constraints: {
        disjointness: "disjoint" | "overlap";
        completeness: "total" | "partial";
    };
};

type ModelCategory = {
    id: string;
    categoryEntityId?: string;
    superclassEntityIds: string[];
    completeness: "total" | "partial";
    notes?: string;
};

type NodeStyleMeta = {
    meta?: {
        entity?: {
            variant?: string;
        };
        relationship?: {
            variant?: string;
            cardinalities?: Record<string, string>;
        };
    };
};

export type ConceptualModelPayload = {
    model: {
        id: string;
        name: string;
        version: number;
        notes?: string;
    };
    entities: ModelEntity[];
    relationships: ModelRelationship[];
    generalizations?: ModelGeneralization[];
    categories?: ModelCategory[];
    constraints?: unknown[];
    notes?: string;
    tags?: string[];
};

type BuildConceptualModelParams = {
    storedNodes: StoredDiagramNode[];
    storedEdges: StoredDiagramEdge[];
    schemaId?: string;
    schemaName?: string;
    diagramName?: string;
};

const FALLBACK_MODEL_NAME = "Untitled model";

const buildAttributeKind = (
    node: StoredDiagramNode,
    hasChildren: boolean,
    childHasChildren: boolean,
    childCount: number
): AttributeKind => {
    if (hasChildren) {
        return childHasChildren || childCount > 1 ? "complex" : "composite";
    }
    if (node.attributeRender?.doubleEllipse) {
        return "multi_valued";
    }
    if (node.attributeRender?.dashed) {
        return "derived";
    }
    return "simple";
};

const getEntityKind = (node: StoredDiagramNode): "strong" | "weak" => {
    if (node.entityRender?.doubleStroke) {
        return "weak";
    }
    const metaVariant = (node.style as NodeStyleMeta | undefined)?.meta?.entity?.variant;
    return metaVariant === "double" ? "weak" : "strong";
};

const getRelationshipType = (node: StoredDiagramNode): "association" | "identifying" => {
    if (node.relationshipRender?.doubleStroke) {
        return "identifying";
    }
    const metaVariant = (node.style as NodeStyleMeta | undefined)?.meta?.relationship?.variant;
    return metaVariant === "double" ? "identifying" : "association";
};

const getRelationshipCardinalityMeta = (node: StoredDiagramNode): Record<string, string> | undefined => {
    return (node.style as NodeStyleMeta | undefined)?.meta?.relationship?.cardinalities;
};

const getAttributeId = (node: StoredDiagramNode) => node.attributeId ?? node.id;
const getEntityId = (node: StoredDiagramNode) => node.entityId ?? node.id;
const getRelationshipId = (node: StoredDiagramNode) => node.relationshipId ?? node.id;

const collectAttributeHierarchy = (
    edges: StoredDiagramEdge[],
    storedNodes: Map<string, StoredDiagramNode>
) => {
    const parentMap = new Map<string, string>();
    const childrenMap = new Map<string, string[]>();
    const attributeRoots = new Set<string>();
    const componentEdges: Array<[string, string]> = [];
    const componentAdjacency = new Map<string, string[]>();

    const isAttributeNode = (nodeId: string) => storedNodes.get(nodeId)?.type === "attribute";
    const isAttributeOwnerNode = (nodeId: string) => {
        const node = storedNodes.get(nodeId);
        return node?.type === "entity" || node?.type === "relationship";
    };

    const addAdjacent = (a: string, b: string) => {
        if (!componentAdjacency.has(a)) componentAdjacency.set(a, []);
        if (!componentAdjacency.get(a)!.includes(b)) componentAdjacency.get(a)!.push(b);
    };

    const addChild = (parentId: string, childId: string) => {
        if (parentId === childId || parentMap.has(childId)) return;

        parentMap.set(childId, parentId);
        if (!childrenMap.has(parentId)) {
            childrenMap.set(parentId, []);
        }
        const children = childrenMap.get(parentId)!;
        if (!children.includes(childId)) {
            children.push(childId);
        }
    };

    edges.forEach((edge) => {
        if (edge.type === "attrOf") {
            if (isAttributeNode(edge.from.nodeId) && isAttributeOwnerNode(edge.to.nodeId)) {
                attributeRoots.add(edge.from.nodeId);
            } else if (isAttributeNode(edge.to.nodeId) && isAttributeOwnerNode(edge.from.nodeId)) {
                attributeRoots.add(edge.to.nodeId);
            }
            return;
        }

        if (edge.type !== "componentOf") return;
        if (!isAttributeNode(edge.from.nodeId) || !isAttributeNode(edge.to.nodeId)) return;

        componentEdges.push([edge.from.nodeId, edge.to.nodeId]);
        addAdjacent(edge.from.nodeId, edge.to.nodeId);
        addAdjacent(edge.to.nodeId, edge.from.nodeId);
    });

    const visit = (parentId: string, seen: Set<string>) => {
        for (const childId of componentAdjacency.get(parentId) ?? []) {
            if (seen.has(childId)) continue;

            addChild(parentId, childId);
            visit(childId, new Set([...seen, childId]));
        }
    };

    attributeRoots.forEach((rootId) => {
        visit(rootId, new Set([rootId]));
    });

    // Fallback for detached component chains that have no owner-connected root:
    // preserve the stored edge direction.
    componentEdges.forEach(([fromId, toId]) => {
        if (!parentMap.has(fromId) && !parentMap.has(toId)) {
            addChild(fromId, toId);
            visit(toId, new Set([fromId, toId]));
        }
    });

    return { parentMap, childrenMap };
};

const buildAttributeFactory = (
    storedNodes: Map<string, StoredDiagramNode>,
    hierarchy: ReturnType<typeof collectAttributeHierarchy>
) => {
    const cache = new Map<string, ModelAttribute>();

    const buildAttribute = (nodeId: string): ModelAttribute | null => {
        if (cache.has(nodeId)) {
            return cache.get(nodeId)!;
        }

        const node = storedNodes.get(nodeId);
        if (!node || node.type !== "attribute") {
            return null;
        }

        // Cache a shell before recursing so malformed cyclic component edges
        // cannot recurse forever.
        const attribute: ModelAttribute = {
            id: getAttributeId(node),
            name: node.name ?? getAttributeId(node),
            kind: "simple",
            isKey: Boolean(node.attributeRender?.underline),
        };
        cache.set(nodeId, attribute);

        const childrenIds = hierarchy.childrenMap.get(nodeId) ?? [];
        const componentEntries = childrenIds
            .map((childId) => ({ childId, attribute: buildAttribute(childId) }))
            .filter((entry): entry is { childId: string; attribute: ModelAttribute } => Boolean(entry.attribute));
        const components = componentEntries.map((entry) => entry.attribute);

        const hasChildren = components.length > 0;
        const childHasChildren = componentEntries.some(({ childId }) => {
            const nestedChildren = hierarchy.childrenMap.get(childId);
            return nestedChildren && nestedChildren.length > 0;
        });

        attribute.kind = buildAttributeKind(node, hasChildren, childHasChildren, components.length);

        if (node.attributeRender?.dashed) {
            attribute.derivation = "derived";
        }

        if (components.length) {
            attribute.components = components;
        }

        cache.set(nodeId, attribute);
        return attribute;
    };

    const hasParent = (nodeId: string) => hierarchy.parentMap.has(nodeId);

    return { buildAttribute, hasParent };
};

const collectOwnerAttributes = (
    storedEdges: StoredDiagramEdge[],
    storedNodes: Map<string, StoredDiagramNode>,
    buildAttribute: (nodeId: string) => ModelAttribute | null,
    hasAttributeParent: (nodeId: string) => boolean
) => {
    const entityAttributes = new Map<string, ModelAttribute[]>();
    const relationshipAttributes = new Map<string, ModelAttribute[]>();

    const pushAttribute = (bucket: Map<string, ModelAttribute[]>, ownerId: string, attribute: ModelAttribute) => {
        if (!bucket.has(ownerId)) bucket.set(ownerId, []);
        const targetList = bucket.get(ownerId)!;
        if (!targetList.some((attr) => attr.id === attribute.id)) {
            targetList.push(attribute);
        }
    };

    storedEdges.forEach((edge) => {
        if (edge.type !== "attrOf") return;
        const fromNode = storedNodes.get(edge.from.nodeId);
        const toNode = storedNodes.get(edge.to.nodeId);
        if (!fromNode || !toNode) return;

        let attributeNode: StoredDiagramNode | null = null;
        let ownerNode: StoredDiagramNode | null = null;

        if (fromNode.type === "attribute") {
            attributeNode = fromNode;
            ownerNode = toNode;
        } else if (toNode.type === "attribute") {
            attributeNode = toNode;
            ownerNode = fromNode;
        }

        if (!attributeNode || !ownerNode) return;
        if (ownerNode.type !== "entity" && ownerNode.type !== "relationship") return;

        // Skip nested attributes – they are represented through their parents.
        if (hasAttributeParent(attributeNode.id)) {
            return;
        }

        const attribute = buildAttribute(attributeNode.id);
        if (!attribute) return;

        if (ownerNode.type === "entity") {
            pushAttribute(entityAttributes, getEntityId(ownerNode), attribute);
        } else if (ownerNode.type === "relationship") {
            pushAttribute(relationshipAttributes, getRelationshipId(ownerNode), attribute);
        }
    });

    return { entityAttributes, relationshipAttributes };
};

const buildRelationshipEnds = (
    relationshipId: string,
    relationshipNodeId: string,
    storedEdges: StoredDiagramEdge[],
    storedNodes: Map<string, StoredDiagramNode>,
    relationshipMetaCardinality?: Record<string, string>
): RelationshipEnd[] => {
    const ends: RelationshipEnd[] = [];

    const relevantEdges = storedEdges.filter((edge) => {
        if (edge.type !== "participation" && edge.type !== "identifying") return false;
        if (edge.relationshipId === relationshipId || edge.relationshipId === relationshipNodeId) {
            return true;
        }

        const fromNode = storedNodes.get(edge.from.nodeId);
        const toNode = storedNodes.get(edge.to.nodeId);
        const relationshipNode =
            fromNode?.type === "relationship" ? fromNode : toNode?.type === "relationship" ? toNode : null;

        return Boolean(
            relationshipNode &&
            (relationshipNode.id === relationshipNodeId || getRelationshipId(relationshipNode) === relationshipId)
        );
    });

    const entityTotalCounts = new Map<string, number>();
    relevantEdges.forEach((edge) => {
        const fromNode = storedNodes.get(edge.from.nodeId);
        const toNode = storedNodes.get(edge.to.nodeId);
        const entityNode = fromNode?.type === "entity" ? fromNode : toNode?.type === "entity" ? toNode : null;
        if (!entityNode) return;

        const entityId = getEntityId(entityNode);
        entityTotalCounts.set(entityId, (entityTotalCounts.get(entityId) ?? 0) + 1);
    });

    // Track per-entity occurrences so recursive/self-referencing ends get
    // stable, distinct role names when the edge has no explicit center label.
    const entityEndCounts = new Map<string, number>();

    relevantEdges.forEach((edge) => {
        const fromNode = storedNodes.get(edge.from.nodeId);
        const toNode = storedNodes.get(edge.to.nodeId);
        if (!fromNode || !toNode) return;

        const entityNode = fromNode.type === "entity" ? fromNode : toNode.type === "entity" ? toNode : null;
        if (!entityNode) return;

        const entityId = getEntityId(entityNode);
        const entityIsFrom = entityNode.id === edge.from.nodeId;

        const labels = edge.labels ?? {};
        const endStyle = edge.endStyle ?? {};

        const cardinality =
            (entityIsFrom ? labels.nearTo : labels.nearFrom) ??
            relationshipMetaCardinality?.[edge.id] ??
            relationshipMetaCardinality?.[entityId];

        const doubleLine = entityIsFrom ? endStyle.from?.doubleLine : endStyle.to?.doubleLine;

        // Read role from edge center label or generate for recursive
        const count = entityEndCounts.get(entityId) ?? 0;
        entityEndCounts.set(entityId, count + 1);
        const isRecursiveEnd = (entityTotalCounts.get(entityId) ?? 0) > 1;
        const role = labels.center || (isRecursiveEnd ? `role_${count + 1}` : undefined);

        ends.push({
            entityId,
            role,
            cardinality,
            optional: doubleLine ? false : true,
        });
    });

    return ends;
};

const buildGeneralizations = (
    storedNodes: StoredDiagramNode[],
    storedEdges: StoredDiagramEdge[],
    storedNodeMap: Map<string, StoredDiagramNode>
): ModelGeneralization[] => {
    const isaNodes = storedNodes.filter((node) => node.type === "isaCircle");
    const generalizations: ModelGeneralization[] = [];

    isaNodes.forEach((circle) => {
        const generalizationEdges = storedEdges.filter(
            (edge) =>
                (edge.type === "isaParent" || edge.type === "isaChild") &&
                edge.generalizationId === circle.id
        );

        const parentEntityIds: string[] = [];
        const childEntityIds: string[] = [];

        generalizationEdges.forEach((edge) => {
            const fromNode = storedNodeMap.get(edge.from.nodeId);
            const toNode = storedNodeMap.get(edge.to.nodeId);
            const entityNode = fromNode?.type === "entity" ? fromNode : toNode?.type === "entity" ? toNode : null;
            if (!entityNode || entityNode.type !== "entity") return;

            const entityId = getEntityId(entityNode);
            const hasBracket = Boolean(edge.endStyle?.from?.bracket || edge.endStyle?.to?.bracket);
            if (edge.type === "isaChild" || hasBracket) {
                if (!childEntityIds.includes(entityId)) childEntityIds.push(entityId);
            } else if (!parentEntityIds.includes(entityId)) {
                parentEntityIds.push(entityId);
            }
        });

        if (!parentEntityIds.length && !childEntityIds.length) return;

        const totalCompletenessEdge = generalizationEdges.find((edge) => {
            const hasBracket = Boolean(edge.endStyle?.from?.bracket || edge.endStyle?.to?.bracket);
            return edge.type === "isaParent" && !hasBracket;
        });

        const normalizedChildEntityIds = childEntityIds.filter((id) => !parentEntityIds.includes(id));
        const constraintSymbol = circle.isaCircle?.symbol === "o" ? "overlap" : "disjoint";
        const hasDoubleLine =
            totalCompletenessEdge?.endStyle?.from?.doubleLine ||
            totalCompletenessEdge?.endStyle?.to?.doubleLine;
        const completeness = hasDoubleLine ? "total" : "partial";

        generalizations.push({
            id: circle.id,
            parentEntityIds,
            childEntityIds: normalizedChildEntityIds,
            constraints: {
                disjointness: constraintSymbol,
                completeness,
            },
        });
    });

    storedEdges.forEach((edge) => {
        if (edge.type !== "isaChild") return;

        const fromNode = storedNodeMap.get(edge.from.nodeId);
        const toNode = storedNodeMap.get(edge.to.nodeId);
        if (fromNode?.type !== "entity" || toNode?.type !== "entity") return;

        const generalizationId = edge.generalizationId ?? edge.id;
        if (generalizations.some((gen) => gen.id === generalizationId)) return;

        const hasToBracket = Boolean(edge.endStyle?.to?.bracket);
        const parentNode = hasToBracket ? toNode : fromNode;
        const childNode = hasToBracket ? fromNode : toNode;

        generalizations.push({
            id: generalizationId,
            parentEntityIds: [getEntityId(parentNode)],
            childEntityIds: [getEntityId(childNode)],
            constraints: {
                disjointness: "disjoint",
                completeness: "partial",
            },
        });
    });

    return generalizations;
};

const buildCategories = (
    storedNodes: StoredDiagramNode[],
    storedEdges: StoredDiagramEdge[],
    storedNodeMap: Map<string, StoredDiagramNode>
): ModelCategory[] => {
    const unionNodes = storedNodes.filter((node) => node.type === "unionCircle");
    const categories: ModelCategory[] = [];

    unionNodes.forEach((unionNode) => {
        const categoryId = unionNode.unionCircle?.categoryId ?? unionNode.id;

        const categoryEdges = storedEdges.filter(
            (edge) =>
                (edge.type === "categoryLink" || edge.type === "categoryMember") &&
                edge.categoryId === categoryId
        );

        const categoryEntityIds: string[] = [];
        const superclassEntityIds: string[] = [];

        categoryEdges.forEach((edge) => {
            const fromNode = storedNodeMap.get(edge.from.nodeId);
            const toNode = storedNodeMap.get(edge.to.nodeId);
            const entityNode = fromNode?.type === "entity" ? fromNode : toNode?.type === "entity" ? toNode : null;
            if (!entityNode || entityNode.type !== "entity") return;

            const entityId = getEntityId(entityNode);
            const hasBracket = Boolean(edge.endStyle?.from?.bracket || edge.endStyle?.to?.bracket);
            if (edge.type === "categoryLink" || hasBracket) {
                if (!categoryEntityIds.includes(entityId)) categoryEntityIds.push(entityId);
            } else if (!superclassEntityIds.includes(entityId)) {
                superclassEntityIds.push(entityId);
            }
        });

        if (!categoryEntityIds.length && !superclassEntityIds.length) return;

        const categoryLinkEdge = categoryEdges.find((edge) => {
            const hasBracket = Boolean(edge.endStyle?.from?.bracket || edge.endStyle?.to?.bracket);
            return edge.type === "categoryLink" || hasBracket;
        });

        const hasDoubleLine =
            categoryLinkEdge?.endStyle?.from?.doubleLine ||
            categoryLinkEdge?.endStyle?.to?.doubleLine;
        const completeness = hasDoubleLine ? "total" : "partial";

        categories.push({
            id: categoryId,
            ...(categoryEntityIds[0] ? { categoryEntityId: categoryEntityIds[0] } : {}),
            superclassEntityIds: superclassEntityIds.filter((id) => !categoryEntityIds.includes(id)),
            completeness,
        });
    });

    return categories;
};

const getGeneralizationParentIds = (gen: ModelGeneralization): string[] => {
    if (gen.parentEntityIds?.length) return gen.parentEntityIds;
    const legacy = gen as ModelGeneralization & { parentEntityId?: string };
    return legacy.parentEntityId ? [legacy.parentEntityId] : [];
};

/**
 * Normalize a raw/legacy conceptual model JSON to the current `ConceptualModelPayload` format.
 *
 * Handles AI-generated models that may use old field names:
 * - `identifier: true` → `isKey: true`
 * - missing `kind` → defaults to `"simple"`
 * - `fromEntity`/`toEntity`/`fromCardinality`/`toCardinality` → `ends: [...]`
 */
export function normalizeConceptualModel(raw: Record<string, unknown>): ConceptualModelPayload {
    const normalizeAttribute = (a: Record<string, unknown>): ModelAttribute => ({
        id: a.id as string,
        name: a.name as string,
        kind: (a.kind ?? "simple") as ModelAttribute["kind"],
        isKey: Boolean((a.isKey as boolean | undefined) ?? (a.identifier as boolean | undefined) ?? false),
        ...(Array.isArray(a.semantics) ? { semantics: a.semantics as string[] } : {}),
        ...(Array.isArray(a.components)
            ? { components: (a.components as Record<string, unknown>[]).map(normalizeAttribute) }
            : {}),
        ...(a.derivation ? { derivation: a.derivation as string } : {}),
        ...(a.notes ? { notes: a.notes as string } : {}),
    });

    const entities = (Array.isArray(raw.entities) ? raw.entities as Record<string, unknown>[] : []).map((e) => {
        const attributes = (Array.isArray(e.attributes) ? e.attributes as Record<string, unknown>[] : [])
            .map(normalizeAttribute);
        return {
            id: e.id as string,
            name: e.name as string,
            kind: ((e.kind ?? "strong") as "strong" | "weak"),
            attributes,
            ...(e.notes ? { notes: e.notes as string } : {}),
        } as ModelEntity;
    });

    const relationships = (Array.isArray(raw.relationships) ? raw.relationships as Record<string, unknown>[] : []).map((r) => {
        let ends: RelationshipEnd[];
        if (Array.isArray(r.ends)) {
            ends = r.ends as RelationshipEnd[];
        } else {
            // Legacy flat format: fromEntity/fromCardinality + toEntity/toCardinality
            ends = [
                ...(r.fromEntity ? [{ entityId: r.fromEntity as string, ...(r.fromCardinality ? { cardinality: r.fromCardinality as string } : {}) }] : []),
                ...(r.toEntity ? [{ entityId: r.toEntity as string, ...(r.toCardinality ? { cardinality: r.toCardinality as string } : {}) }] : []),
            ] as RelationshipEnd[];
        }
        return {
            id: r.id as string,
            name: r.name as string,
            type: ((r.type ?? "association") as "association" | "identifying"),
            ends,
            ...(Array.isArray(r.attributes)
                ? { attributes: (r.attributes as Record<string, unknown>[]).map(normalizeAttribute) }
                : {}),
            ...(r.arity ? { arity: r.arity as number } : {}),
            ...(r.semantics ? { semantics: r.semantics as string } : {}),
            ...(r.notes ? { notes: r.notes as string } : {}),
        } as ModelRelationship;
    });

    return {
        model: (raw.model as ConceptualModelPayload["model"]) ?? { id: generateCid(), name: "Imported model", version: 1 },
        entities,
        relationships,
        ...(Array.isArray(raw.generalizations)
            ? {
                  generalizations: (raw.generalizations as Record<string, unknown>[]).map((gen) => ({
                      ...(gen as ModelGeneralization),
                      parentEntityIds: Array.isArray(gen.parentEntityIds)
                          ? (gen.parentEntityIds as string[])
                          : (gen.parentEntityId as string | undefined)
                            ? [gen.parentEntityId as string]
                            : [],
                  })),
              }
            : {}),
        ...(Array.isArray(raw.categories) ? { categories: raw.categories as ModelCategory[] } : {}),
        ...(raw.notes ? { notes: raw.notes as string } : {}),
        ...(Array.isArray(raw.tags) ? { tags: raw.tags as string[] } : {}),
    };
}

export const createEmptyConceptualModel = (modelId?: string, modelName?: string): ConceptualModelPayload => ({
    model: {
        id: modelId ?? generateCid(),
        name: modelName ?? FALLBACK_MODEL_NAME,
        version: 1,
    },
    entities: [],
    relationships: [],
    generalizations: [],
    categories: [],
    constraints: [],
});

export const buildConceptualModel = ({
    storedNodes,
    storedEdges,
    schemaId,
    schemaName,
    diagramName,
}: BuildConceptualModelParams): ConceptualModelPayload => {
    const modelId = schemaId ?? generateCid();
    const modelName = schemaName ?? diagramName ?? FALLBACK_MODEL_NAME;

    if (!storedNodes.length) {
        return createEmptyConceptualModel(modelId, modelName);
    }

    const storedNodeMap = new Map(storedNodes.map((node) => [node.id, node]));
    const hierarchy = collectAttributeHierarchy(storedEdges, storedNodeMap);
    const { buildAttribute, hasParent } = buildAttributeFactory(storedNodeMap, hierarchy);
    const { entityAttributes, relationshipAttributes } = collectOwnerAttributes(
        storedEdges,
        storedNodeMap,
        buildAttribute,
        hasParent
    );

    const entities: ModelEntity[] = storedNodes
        .filter((node) => node.type === "entity")
        .map((node) => ({
            id: getEntityId(node),
            name: node.name ?? getEntityId(node),
            kind: getEntityKind(node),
            attributes: entityAttributes.get(getEntityId(node)) ?? [],
        }));

    const relationships: ModelRelationship[] = storedNodes
        .filter((node) => node.type === "relationship")
        .map((node) => {
            const relationshipId = getRelationshipId(node);
            const relationshipMetaCardinality = getRelationshipCardinalityMeta(node);
            const ends = buildRelationshipEnds(
                relationshipId,
                node.id,
                storedEdges,
                storedNodeMap,
                relationshipMetaCardinality
            );
            return {
                id: relationshipId,
                name: node.name ?? relationshipId,
                type: getRelationshipType(node),
                arity: ends.length || undefined,
                ends,
                attributes: relationshipAttributes.get(relationshipId),
            };
        });

    const generalizations = buildGeneralizations(storedNodes, storedEdges, storedNodeMap);
    const categories = buildCategories(storedNodes, storedEdges, storedNodeMap);

    return {
        model: {
            id: modelId,
            name: modelName,
            version: 1,
        },
        entities,
        relationships,
        generalizations: generalizations.length ? generalizations : undefined,
        categories: categories.length ? categories : undefined,
        constraints: [],
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Reverse builder: ConceptualModelPayload → StoredDiagramNode[] + StoredDiagramEdge[]
// ═══════════════════════════════════════════════════════════════════════════════

// ── Layout constants ─────────────────────────────────────────────────────────

const LAYOUT = {
    // Node sizes
    entitySize:       { w: 120, h: 50 },
    relationshipSize: { w: 110, h: 50 },
    attributeSize:    { w: 90,  h: 36 },
    constraintSize:   { w: 32,  h: 32 },

    // Attribute fan layout (fallback when ELK doesn't place attrs)
    attrRadius:        120,   // from owner center
    attrMinGap:        50,    // minimum gap between attribute nodes
    compRadius:        80,    // composite child radius from parent attr
    compMinGap:        45,

    // Attribute base angle (fallback fan direction)
    attrBaseAngle:     -Math.PI / 2,   // top-center

    // ISA / Category
    isaGapY:           180,
    categoryGapY:      180,
} as const;

// ── Text-width estimation (server-safe, no DOM required) ─────────────────────

const CHAR_AVG_PX   = 7;
const CHAR_NARROW   = 4;
const CHAR_WIDE     = 9;
const NARROW = new Set('iljI|:;.,!\''.split(''));
const WIDE   = new Set('mwMW@'.split(''));

/** Estimate pixel width of text (handles multi-line → returns widest line). */
const estimateTextWidth = (text: string): number => {
    let maxW = 0;
    for (const line of text.split('\n')) {
        let w = 0;
        for (const ch of line) {
            if (NARROW.has(ch)) w += CHAR_NARROW;
            else if (WIDE.has(ch)) w += CHAR_WIDE;
            else w += CHAR_AVG_PX;
        }
        maxW = Math.max(maxW, w);
    }
    return maxW;
};

/** Compute size for an attribute node based on name length. */
const attrNodeSize = (name: string): { w: number; h: number } => {
    const textW = estimateTextWidth(name);
    const needed = Math.ceil(textW / 0.65) + 16;
    const w = Math.max(LAYOUT.attributeSize.w, needed);
    return { w, h: LAYOUT.attributeSize.h };
};

/** Compute size for an entity node based on name length. */
const entityNodeSize = (name: string): { w: number; h: number } => {
    const textW = estimateTextWidth(name);
    const needed = Math.ceil(textW / 0.85) + 16;
    const w = Math.max(LAYOUT.entitySize.w, needed);
    const lines = name.split('\n').length;
    const LINE_H = 16;
    const h = lines > 1
        ? Math.max(LAYOUT.entitySize.h, Math.ceil(lines * LINE_H / 0.80) + 8)
        : LAYOUT.entitySize.h;
    return { w, h };
};

/** Compute size for a relationship node based on name length. */
const relationshipNodeSize = (name: string): { w: number; h: number } => {
    const textW = estimateTextWidth(name);
    const needed = Math.ceil(textW / 0.65) + 16;
    const w = Math.max(LAYOUT.relationshipSize.w, needed);
    const lines = name.split('\n').length;
    const LINE_H = 16;
    const h = lines > 1
        ? Math.max(LAYOUT.relationshipSize.h, Math.ceil(lines * LINE_H / 0.55) + 8)
        : LAYOUT.relationshipSize.h;
    return { w, h };
};

type PositionMap = Map<string, { x: number; y: number }>;
type SizeMap = Map<string, { w: number; h: number }>;

const buildPositionLookup = (nodes?: StoredDiagramNode[]): PositionMap => {
    const lookup: PositionMap = new Map();
    if (!nodes) return lookup;
    for (const n of nodes) {
        if (!n.position) continue;
        lookup.set(n.id, n.position);
        if (n.entityId && n.entityId !== n.id) lookup.set(n.entityId, n.position);
        if (n.attributeId && n.attributeId !== n.id) lookup.set(n.attributeId, n.position);
        if (n.relationshipId && n.relationshipId !== n.id) lookup.set(n.relationshipId, n.position);
    }
    return lookup;
};

/** Build a lookup of existing node sizes so the builder preserves user-resized nodes. */
const buildSizeLookup = (nodes?: StoredDiagramNode[]): SizeMap => {
    const lookup: SizeMap = new Map();
    if (!nodes) return lookup;
    for (const n of nodes) {
        if (!n.size) continue;
        const key = n.entityId ?? n.relationshipId ?? n.attributeId ?? n.id;
        lookup.set(key, n.size);
    }
    return lookup;
};

/** If a node already exists on the diagram, preserve its exact size. */
const mergeSize = (
    computed: { w: number; h: number },
    existing: { w: number; h: number } | undefined,
): { w: number; h: number } => {
    if (existing) return existing;
    return computed;
};

/**
 * Spread `count` items evenly around an arc.
 * Returns the angle for item at index `i`.
 */
const arcAngle = (i: number, count: number, baseAngle: number, arcSpan: number): number => {
    if (count <= 1) return baseAngle;
    return baseAngle - arcSpan / 2 + (i / (count - 1)) * arcSpan;
};

/**
 * Compute a good arc span so that nodes of `nodeWidth` at `radius`
 * don't overlap each other.  The arc is at least `minSpan` and at most
 * `maxSpan` radians.
 */
const autoArcSpan = (
    count: number,
    radius: number,
    nodeWidth: number,
    minGap: number,
    minSpan = Math.PI * 0.3,
    maxSpan = Math.PI * 1.6,
): number => {
    if (count <= 1) return 0;
    // chord length needed between adjacent items
    const chordNeeded = nodeWidth + minGap;
    // angle between adjacent = 2 * arcsin(chord / (2 * radius))
    const angleStep = 2 * Math.asin(Math.min(1, chordNeeded / (2 * radius)));
    const needed = angleStep * (count - 1);
    return Math.max(minSpan, Math.min(maxSpan, needed));
};

const polarPos = (
    cx: number, cy: number,
    angle: number, radius: number,
): { x: number; y: number } => ({
    x: Math.round(cx + Math.cos(angle) * radius),
    y: Math.round(cy + Math.sin(angle) * radius),
});

const toAttrRender = (
    attr: ModelAttribute,
    underlineStyle: "solid" | "dashed" = "solid",
): StoredDiagramNode["attributeRender"] | undefined => {
    const r: NonNullable<StoredDiagramNode["attributeRender"]> = {};
    if (attr.kind === "multi_valued") r.doubleEllipse = true;
    if (attr.kind === "derived" || attr.derivation) r.dashed = true;
    if (attr.isKey) {
        r.underline = true;
        r.underlineStyle = underlineStyle;
    }
    return Object.keys(r).length ? r : undefined;
};

// ── Public API ───────────────────────────────────────────────────────────────

export type BuildDiagramFromModelParams = {
    model: ConceptualModelPayload;
    existingNodes?: StoredDiagramNode[];
    existingEdges?: StoredDiagramEdge[];
    /** When true, nodes present in the existing diagram but absent from the
     *  model (e.g. floating attributes not yet connected) are kept. */
    preserveUnmodeledNodes?: boolean;
};

/**
 * Converts a `ConceptualModelPayload` back into stored diagram nodes & edges.
 *
 * When `existingNodes` is provided the function reuses positions of nodes
 * whose IDs match, so incremental AI edits preserve the user's layout.
 *
 * Uses **ELK (Eclipse Layout Kernel)** — a production-grade graph layout
 * library — to compute optimal positions for skeleton nodes (entities,
 * relationships, ISA/union circles).  Attributes are placed compactly
 * around their parent using a fan-arc layout AFTER ELK positions the
 * skeleton, keeping the diagram tight and readable.
 *
 * The function is **async** because ELK's layout engine returns a Promise.
 */
export const buildDiagramFromModel = async ({
    model,
    existingNodes,
    existingEdges,
    preserveUnmodeledNodes = false,
}: BuildDiagramFromModelParams): Promise<{
    nodes: StoredDiagramNode[];
    edges: StoredDiagramEdge[];
}> => {
    const nodes: StoredDiagramNode[] = [];
    const edges: StoredDiagramEdge[] = [];
    const lookup = buildPositionLookup(existingNodes);
    const sizeLookup = buildSizeLookup(existingNodes);

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 1 — Collect SKELETON layout items & edges for ELK
    //  (entities, relationships, ISA/union circles — NOT attributes)
    // ══════════════════════════════════════════════════════════════════════

    const layoutItems: LayoutItem[] = [];
    const layoutEdges: LayoutEdge[] = [];

    // Track which node IDs need new positions (not in lookup)
    const needsLayout = new Set<string>();

    // ── 1a. Entity items ────────────────────────────────────────────────

    for (const entity of model.entities ?? []) {
        const fixed = lookup.get(entity.id);
        layoutItems.push({
            id: entity.id,
            width: LAYOUT.entitySize.w,
            height: LAYOUT.entitySize.h,
            fixed,
        });
        if (!fixed) needsLayout.add(entity.id);
    }

    // ── 1b. Relationship items ──────────────────────────────────────────

    for (const rel of model.relationships ?? []) {
        const fixed = lookup.get(rel.id);
        layoutItems.push({
            id: rel.id,
            width: LAYOUT.relationshipSize.w,
            height: LAYOUT.relationshipSize.h,
            fixed,
        });
        if (!fixed) needsLayout.add(rel.id);

        // Edges: relationship → connected entities
        for (const end of rel.ends) {
            layoutEdges.push({
                id: `le_${rel.id}_${end.entityId}`,
                sourceId: rel.id,
                targetId: end.entityId,
            });
        }
    }

    // ── 1c. ISA circle items ────────────────────────────────────────────

    for (const gen of model.generalizations ?? []) {
        const fixed = lookup.get(gen.id);
        layoutItems.push({
            id: gen.id,
            width: LAYOUT.constraintSize.w,
            height: LAYOUT.constraintSize.h,
            fixed,
        });
        if (!fixed) needsLayout.add(gen.id);

        for (const parentId of getGeneralizationParentIds(gen)) {
            layoutEdges.push({
                id: `le_isa_p_${gen.id}_${parentId}`,
                sourceId: parentId,
                targetId: gen.id,
            });
        }
        // ISA circle → children
        for (const childId of gen.childEntityIds) {
            layoutEdges.push({
                id: `le_isa_c_${gen.id}_${childId}`,
                sourceId: gen.id,
                targetId: childId,
            });
        }
    }

    // ── 1d. Category (union) circle items ───────────────────────────────

    for (const cat of model.categories ?? []) {
        const fixed = lookup.get(cat.id);
        layoutItems.push({
            id: cat.id,
            width: LAYOUT.constraintSize.w,
            height: LAYOUT.constraintSize.h,
            fixed,
        });
        if (!fixed) needsLayout.add(cat.id);

        if (cat.categoryEntityId) {
            layoutEdges.push({
                id: `le_catl_${cat.id}`,
                sourceId: cat.categoryEntityId,
                targetId: cat.id,
            });
        }
        // union circle → superclass entities
        for (const sid of cat.superclassEntityIds) {
            layoutEdges.push({
                id: `le_catm_${cat.id}_${sid}`,
                sourceId: sid,
                targetId: cat.id,
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 2 — Run ELK layout on skeleton only
    // ══════════════════════════════════════════════════════════════════════

    let elkPositions: Map<string, { x: number; y: number }> = new Map();

    if (needsLayout.size > 0 && layoutItems.length > 0) {
        elkPositions = await computeELKLayout(layoutItems, layoutEdges);
    }

    // Helper to get the best position for a skeleton node:
    // 1. User-placed (lookup) takes priority
    // 2. ELK-computed position
    // 3. Fallback
    const getPos = (id: string, fallback: { x: number; y: number } = { x: 0, y: 0 }) =>
        lookup.get(id) ?? elkPositions.get(id) ?? fallback;

    // Build a map of skeleton positions for smart attribute angle selection
    const skeletonPositions: Map<string, { x: number; y: number }> = new Map();

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 3 — Emit stored nodes & edges; fan-arc attributes around parents
    // ══════════════════════════════════════════════════════════════════════

    const entityPos: PositionMap = new Map();

    // ── 3a. Entities ────────────────────────────────────────────────────

    for (const entity of model.entities ?? []) {
        const pos = getPos(entity.id);
        entityPos.set(entity.id, pos);
        skeletonPositions.set(entity.id, pos);

        nodes.push({
            id: entity.id,
            type: "entity",
            position: pos,
            size: mergeSize(entityNodeSize(entity.name), sizeLookup.get(entity.id)),
            name: entity.name,
            entityId: entity.id,
            entityRender: entity.kind === "weak" ? { doubleStroke: true } : undefined,
        });
    }

    // ── 3b. Relationships ───────────────────────────────────────────────

    for (const rel of model.relationships ?? []) {
        const pos = getPos(rel.id);
        skeletonPositions.set(rel.id, pos);

        // Build cardinalities map keyed by edge ID so PropertiesPanel can read it
        // (edge IDs are `e_${rel.id}_${end.entityId}_${endIdx}`)
        const cardinalities: Record<string, string> = {};
        rel.ends.forEach((end, endIdx) => {
            if (end.cardinality) {
                const edgeId = `e_${rel.id}_${end.entityId}_${endIdx}`;
                cardinalities[edgeId] = end.cardinality;
            }
        });
        const hasCardinalities = Object.keys(cardinalities).length > 0;

        const relationshipMeta: Record<string, unknown> = {};
        if (hasCardinalities) {
            relationshipMeta.cardinalities = cardinalities;
        }
        if (rel.type === "identifying") {
            relationshipMeta.variant = "double";
        }
        const styleMeta = Object.keys(relationshipMeta).length
            ? { meta: { relationship: relationshipMeta } }
            : undefined;

        nodes.push({
            id: rel.id,
            type: "relationship",
            position: pos,
            size: mergeSize(relationshipNodeSize(rel.name), sizeLookup.get(rel.id)),
            name: rel.name,
            relationshipId: rel.id,
            relationshipRender: rel.type === "identifying" ? { doubleStroke: true } : undefined,
            ...(styleMeta ? { style: styleMeta } : {}),
        });

        // Participation edges
        const isRecursive =
            rel.ends.length >= 2 &&
            rel.ends[0].entityId === rel.ends[1].entityId;

        const recursiveEntityPorts: (string | undefined)[] = isRecursive
            ? ['left', 'right']
            : [];

        rel.ends.forEach((end, endIdx) => {
            const isTotalParticipation = end.optional === false;
            const edgeLabels: Record<string, string> = {};
            if (end.cardinality) edgeLabels.nearFrom = end.cardinality;
            if (isRecursive && end.role) edgeLabels.center = end.role;
            edges.push({
                id: `e_${rel.id}_${end.entityId}_${endIdx}`,
                type: "participation",
                from: { nodeId: rel.id },
                to: {
                    nodeId: end.entityId,
                    ...(recursiveEntityPorts[endIdx]
                        ? { portId: recursiveEntityPorts[endIdx] }
                        : {}),
                },
                relationshipId: rel.id,
                labels: Object.keys(edgeLabels).length ? edgeLabels : undefined,
                endStyle: isTotalParticipation ? { to: { doubleLine: true } } : undefined,
            });
        });
    }

    // ── 3c. Attribute fan-arc placement (AFTER skeleton is positioned) ──
    //
    // For each entity / relationship, compute a smart base angle that
    // points AWAY from neighbouring skeleton nodes, then fan attributes
    // around that angle.  This keeps attributes compact and prevents them
    // from overlapping edges to other skeleton nodes.

    // Build neighbour map: id → set of connected skeleton ids
    const neighborMap = new Map<string, Set<string>>();
    for (const edge of layoutEdges) {
        if (!neighborMap.has(edge.sourceId)) neighborMap.set(edge.sourceId, new Set());
        if (!neighborMap.has(edge.targetId)) neighborMap.set(edge.targetId, new Set());
        neighborMap.get(edge.sourceId)!.add(edge.targetId);
        neighborMap.get(edge.targetId)!.add(edge.sourceId);
    }

    const emitAttrsForOwner = (
        attrs: ModelAttribute[] | undefined,
        ownerPos: { x: number; y: number },
        ownerId: string,
        defaultAngle: number,
        keyUnderlineStyle: "solid" | "dashed" = "solid",
    ) => {
        if (!attrs?.length) return;

        // Compute smart base angle — point AWAY from skeleton neighbours
        const neighbours = neighborMap.get(ownerId);
        let baseAngle = defaultAngle;
        if (neighbours && neighbours.size > 0) {
            let sumDx = 0;
            let sumDy = 0;
            for (const nid of neighbours) {
                const nPos = skeletonPositions.get(nid);
                if (!nPos) continue;
                const dx = nPos.x - ownerPos.x;
                const dy = nPos.y - ownerPos.y;
                const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
                sumDx += dx / d;
                sumDy += dy / d;
            }
            if (Math.abs(sumDx) > 0.001 || Math.abs(sumDy) > 0.001) {
                // Point AWAY from average neighbour direction
                baseAngle = Math.atan2(-sumDy, -sumDx);
            }
        }

        emitAttributeNodes(attrs, ownerPos, ownerId, lookup, sizeLookup, nodes, edges, baseAngle, keyUnderlineStyle);
    };

    // Entity attributes
    for (const entity of model.entities ?? []) {
        const pos = entityPos.get(entity.id)!;
        emitAttrsForOwner(
            entity.attributes,
            pos,
            entity.id,
            LAYOUT.attrBaseAngle,
            entity.kind === "weak" ? "dashed" : "solid"
        );
    }

    // Relationship attributes
    for (const rel of model.relationships ?? []) {
        const pos = skeletonPositions.get(rel.id)!;
        emitAttrsForOwner(rel.attributes, pos, rel.id, Math.PI / 2);
    }

    // ── 3d. Generalizations (ISA) ───────────────────────────────────────

    for (const gen of model.generalizations ?? []) {
        const parentEntityIds = getGeneralizationParentIds(gen);
        const anchorParentId = parentEntityIds[0];
        const pPos = anchorParentId ? entityPos.get(anchorParentId) : undefined;
        if (!pPos) continue;

        const cPos = getPos(gen.id, {
            x: pPos.x + LAYOUT.entitySize.w / 2 - LAYOUT.constraintSize.w / 2,
            y: pPos.y + LAYOUT.entitySize.h + LAYOUT.isaGapY,
        });

        nodes.push({
            id: gen.id,
            type: "isaCircle",
            position: cPos,
            size: LAYOUT.constraintSize,
            isaCircle: {
                symbol: gen.constraints.disjointness === "overlap" ? "o" : "d",
            },
        });

        const isTotal = gen.constraints.completeness === "total";
        parentEntityIds.forEach((parentId) => {
            edges.push({
                id: `e_isa_p_${gen.id}_${parentId}`,
                type: "isaParent",
                from: { nodeId: parentId },
                to: { nodeId: gen.id },
                generalizationId: gen.id,
                endStyle: isTotal ? { from: { doubleLine: true } } : undefined,
            });
        });

        gen.childEntityIds.forEach((childId) => {
            edges.push({
                id: `e_isa_c_${gen.id}_${childId}`,
                type: "isaChild",
                from: { nodeId: gen.id },
                to: { nodeId: childId },
                generalizationId: gen.id,
                endStyle: { from: { bracket: true } },
            });
        });
    }

    // ── 3e. Categories (Union) ──────────────────────────────────────────

    for (const cat of model.categories ?? []) {
        const categoryEntityId = cat.categoryEntityId;
        const anchorEntityId = categoryEntityId ?? cat.superclassEntityIds[0];
        const cePos = anchorEntityId ? entityPos.get(anchorEntityId) : undefined;
        if (!cePos) continue;

        const cPos = getPos(cat.id, {
            x: cePos.x + LAYOUT.entitySize.w / 2 - LAYOUT.constraintSize.w / 2,
            y: cePos.y - LAYOUT.categoryGapY,
        });

        nodes.push({
            id: cat.id,
            type: "unionCircle",
            position: cPos,
            size: LAYOUT.constraintSize,
            unionCircle: { symbol: "U", categoryId: cat.id },
        });

        const isTotal = cat.completeness === "total";
        if (categoryEntityId) {
            const categoryLinkEndStyle: Record<string, Record<string, boolean>> = {
                to: { bracket: true },
            };
            if (isTotal) {
                categoryLinkEndStyle.from = { doubleLine: true };
            }
            edges.push({
                id: `e_catl_${cat.id}`,
                type: "categoryLink",
                from: { nodeId: categoryEntityId },
                to: { nodeId: cat.id },
                categoryId: cat.id,
                endStyle: categoryLinkEndStyle,
            });
        }

        cat.superclassEntityIds.forEach((sid) => {
            edges.push({
                id: `e_catm_${cat.id}_${sid}`,
                type: "categoryMember",
                from: { nodeId: sid },
                to: { nodeId: cat.id },
                categoryId: cat.id,
            });
        });
    }

    // ── 3f. Preserve unmodeled diagram nodes (e.g. floating attributes) ─

    if (preserveUnmodeledNodes && existingNodes) {
        const modelNodeIds = new Set(nodes.map((n) => n.id));
        const unmodeledNodes = existingNodes.filter((n) => !modelNodeIds.has(n.id));
        nodes.push(...unmodeledNodes);

        if (existingEdges) {
            const unmodeledNodeIds = new Set(unmodeledNodes.map((n) => n.id));
            const modelEdgeIds = new Set(edges.map((e) => e.id));
            const preservedEdges = existingEdges.filter(
                (e) =>
                    !modelEdgeIds.has(e.id) &&
                    (unmodeledNodeIds.has(e.from.nodeId) || unmodeledNodeIds.has(e.to.nodeId)),
            );
            edges.push(...preservedEdges);
        }
    }

    return { nodes, edges };
};

/**
 * Emit attribute nodes arranged in a compact fan-arc around their owner.
 *
 * @param baseAngle  The pre-computed angle pointing AWAY from neighbouring
 *                   skeleton nodes — attributes will be centred on this
 *                   direction so they don't overlap edges.
 */
const emitAttributeNodes = (
    attrs: ModelAttribute[],
    ownerPos: { x: number; y: number },
    ownerId: string,
    lookup: PositionMap,
    sizes: SizeMap,
    nodes: StoredDiagramNode[],
    edges: StoredDiagramEdge[],
    baseAngle: number,
    keyUnderlineStyle: "solid" | "dashed" = "solid",
) => {
    const emitComponentNodes = (
        parent: ModelAttribute,
        parentPos: { x: number; y: number },
        parentAngle: number,
        path: Set<string>,
    ) => {
        if (!parent.components?.length) return;

        const compSizes = parent.components.map(c => attrNodeSize(c.name));
        const maxCompW = Math.max(...compSizes.map(s => s.w));

        const compArc = autoArcSpan(
            parent.components.length,
            LAYOUT.compRadius,
            maxCompW,
            LAYOUT.compMinGap,
        );

        parent.components.forEach((comp, ci) => {
            if (path.has(comp.id)) return;

            const compSize = compSizes[ci];
            const cAngle = arcAngle(ci, parent.components!.length, parentAngle, compArc);
            const cFanPos = polarPos(parentPos.x, parentPos.y, cAngle, LAYOUT.compRadius);
            const cPos = lookup.get(comp.id) ?? cFanPos;

            nodes.push({
                id: comp.id,
                type: "attribute",
                position: cPos,
                size: mergeSize(compSize, sizes.get(comp.id)),
                name: comp.name,
                attributeId: comp.id,
                attributeRender: toAttrRender(comp, keyUnderlineStyle),
            });

            edges.push({
                id: `e_comp_${parent.id}_${comp.id}`,
                type: "componentOf",
                from: { nodeId: parent.id },
                to: { nodeId: comp.id },
            });

            emitComponentNodes(comp, cPos, cAngle, new Set([...path, comp.id]));
        });
    };

    const attrSizes = attrs.map(a => attrNodeSize(a.name));
    const maxW = attrSizes.length > 0
        ? Math.max(...attrSizes.map(s => s.w))
        : LAYOUT.attributeSize.w;

    const arcSpan = autoArcSpan(
        attrs.length,
        LAYOUT.attrRadius,
        maxW,
        LAYOUT.attrMinGap,
    );

    attrs.forEach((attr, i) => {
        const size = attrSizes[i];
        const angle = arcAngle(i, attrs.length, baseAngle, arcSpan);
        const fanPos = polarPos(ownerPos.x, ownerPos.y, angle, LAYOUT.attrRadius);

        // User-placed position takes priority, then fan layout
        const pos = lookup.get(attr.id) ?? fanPos;

        nodes.push({
            id: attr.id,
            type: "attribute",
            position: pos,
            size: mergeSize(size, sizes.get(attr.id)),
            name: attr.name,
            attributeId: attr.id,
            attributeRender: toAttrRender(attr, keyUnderlineStyle),
        });

        edges.push({
            id: `e_${attr.id}_${ownerId}`,
            type: "attrOf",
            from: { nodeId: attr.id },
            to: { nodeId: ownerId },
        });

        // Composite/complex children — smaller recursive fans around attributes.
        emitComponentNodes(attr, pos, angle, new Set([attr.id]));
    });
};
