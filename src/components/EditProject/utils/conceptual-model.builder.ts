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

type ModelAttributeComponent = {
    id: string;
    name: string;
    kind: "simple";
};

type ModelAttribute = {
    id: string;
    name: string;
    kind: AttributeKind;
    isKey: boolean;
    semantics?: string[];
    components?: ModelAttributeComponent[];
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
    parentEntityId: string;
    childEntityIds: string[];
    categoryBy?: string;
    constraints: {
        disjointness: "disjoint" | "overlap";
        completeness: "total" | "partial";
    };
};

type ModelCategory = {
    id: string;
    categoryEntityId: string;
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
    childHasChildren: boolean
): AttributeKind => {
    if (hasChildren) {
        return childHasChildren ? "complex" : "composite";
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

const collectAttributeHierarchy = (edges: StoredDiagramEdge[]) => {
    const parentMap = new Map<string, string>();
    const childrenMap = new Map<string, string[]>();

    edges.forEach((edge) => {
        if (edge.type !== "componentOf") return;
        const parentId = edge.from.nodeId;
        const childId = edge.to.nodeId;
        parentMap.set(childId, parentId);
        if (!childrenMap.has(parentId)) {
            childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)?.push(childId);
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

        const childrenIds = hierarchy.childrenMap.get(nodeId) ?? [];
        const components: ModelAttributeComponent[] = childrenIds
            .map((childId) => {
                const childNode = storedNodes.get(childId);
                if (!childNode || childNode.type !== "attribute") return null;
                return {
                    id: getAttributeId(childNode),
                    name: childNode.name ?? getAttributeId(childNode),
                    kind: "simple",
                };
            })
            .filter((item): item is ModelAttributeComponent => Boolean(item));

        const hasChildren = components.length > 0;
        const childHasChildren = childrenIds.some((childId) => {
            const nestedChildren = hierarchy.childrenMap.get(childId);
            return nestedChildren && nestedChildren.length > 0;
        });

        const attribute: ModelAttribute = {
            id: getAttributeId(node),
            name: node.name ?? getAttributeId(node),
            kind: buildAttributeKind(node, hasChildren, childHasChildren),
            isKey: Boolean(node.attributeRender?.underline),
        };

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
    storedEdges: StoredDiagramEdge[],
    storedNodes: Map<string, StoredDiagramNode>,
    relationshipMetaCardinality?: Record<string, string>
): RelationshipEnd[] => {
    const ends: RelationshipEnd[] = [];

    const relevantEdges = storedEdges.filter(
        (edge) =>
            (edge.type === "participation" || edge.type === "identifying") &&
            edge.relationshipId === relationshipId
    );

    // Track how many times each entity appears so we can generate
    // distinct role names for recursive (self-referencing) ends.
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
            (entityIsFrom ? labels.nearFrom : labels.nearTo) ??
            relationshipMetaCardinality?.[entityId];

        const doubleLine = entityIsFrom ? endStyle.from?.doubleLine : endStyle.to?.doubleLine;

        // Generate role hint for recursive relationships
        const count = entityEndCounts.get(entityId) ?? 0;
        entityEndCounts.set(entityId, count + 1);
        const role = count > 0 ? `role_${count}` : undefined;

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
        const parentEdge = storedEdges.find(
            (edge) => edge.type === "isaParent" && edge.generalizationId === circle.id
        );
        const childEdges = storedEdges.filter(
            (edge) => edge.type === "isaChild" && edge.generalizationId === circle.id
        );

        if (!parentEdge || childEdges.length === 0) return;

        // For isaParent: entity -> isaCircle, so parent is the entity (from)
        // For isaChild: isaCircle -> entity, so child is the entity (to)
        const fromNode = storedNodeMap.get(parentEdge.from.nodeId);
        const toNode = storedNodeMap.get(parentEdge.to.nodeId);
        
        // Parent should be the entity (not the isaCircle)
        const parentNode = fromNode?.type === "entity" ? fromNode : toNode?.type === "entity" ? toNode : null;
        if (!parentNode || parentNode.type !== "entity") return;

        const childEntityIds = childEdges
            .map((edge) => {
                // For isaChild: isaCircle -> entity, so child is the entity (to)
                const childFromNode = storedNodeMap.get(edge.from.nodeId);
                const childToNode = storedNodeMap.get(edge.to.nodeId);
                const childNode = childToNode?.type === "entity" ? childToNode : childFromNode?.type === "entity" ? childFromNode : null;
                if (!childNode || childNode.type !== "entity") return null;
                return getEntityId(childNode);
            })
            .filter((id): id is string => Boolean(id));

        if (!childEntityIds.length) return;

        const constraintSymbol = circle.isaCircle?.symbol === "o" ? "overlap" : "disjoint";
        
        // Double line from parent entity to isaCircle indicates total completeness
        // (all instances of parent must belong to at least one child)
        const hasDoubleLine = parentEdge.endStyle?.from?.doubleLine || parentEdge.endStyle?.to?.doubleLine;
        const completeness = hasDoubleLine ? "total" : "partial";

        generalizations.push({
            id: circle.id,
            parentEntityId: getEntityId(parentNode),
            childEntityIds,
            constraints: {
                disjointness: constraintSymbol,
                completeness,
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

        const categoryLinkEdge = storedEdges.find(
            (edge) => edge.type === "categoryLink" && edge.categoryId === categoryId
        );

        if (!categoryLinkEdge) return;

        // For categoryLink: categoryEntity -> unionCircle, so categoryEntity is the entity (from)
        const linkFromNode = storedNodeMap.get(categoryLinkEdge.from.nodeId);
        const linkToNode = storedNodeMap.get(categoryLinkEdge.to.nodeId);
        const categoryEntityNode = linkFromNode?.type === "entity" ? linkFromNode : linkToNode?.type === "entity" ? linkToNode : null;

        if (!categoryEntityNode || categoryEntityNode.type !== "entity") return;

        const memberEdges = storedEdges.filter(
            (edge) => edge.type === "categoryMember" && edge.categoryId === categoryId
        );

        // For categoryMember: unionCircle -> superclassEntity, so superclassEntity is the entity (to)
        const superclassEntityIds = memberEdges
            .map((edge) => {
                const memberFromNode = storedNodeMap.get(edge.from.nodeId);
                const memberToNode = storedNodeMap.get(edge.to.nodeId);
                const superclassNode = memberToNode?.type === "entity" ? memberToNode : memberFromNode?.type === "entity" ? memberFromNode : null;
                if (!superclassNode || superclassNode.type !== "entity") return null;
                return getEntityId(superclassNode);
            })
            .filter((id): id is string => Boolean(id));

        if (!superclassEntityIds.length) return;

        // Double line from categoryEntity to unionCircle indicates total completeness
        const hasDoubleLine = categoryLinkEdge.endStyle?.from?.doubleLine || categoryLinkEdge.endStyle?.to?.doubleLine;
        const completeness = hasDoubleLine ? "total" : "partial";

        categories.push({
            id: categoryId,
            categoryEntityId: getEntityId(categoryEntityNode),
            superclassEntityIds,
            completeness,
        });
    });

    return categories;
};

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
    const hierarchy = collectAttributeHierarchy(storedEdges);
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

type PositionMap = Map<string, { x: number; y: number }>;

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
): StoredDiagramNode["attributeRender"] | undefined => {
    const r: NonNullable<StoredDiagramNode["attributeRender"]> = {};
    if (attr.kind === "multi_valued") r.doubleEllipse = true;
    if (attr.kind === "derived" || attr.derivation) r.dashed = true;
    if (attr.isKey) {
        r.underline = true;
        r.underlineStyle = "solid";
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

        // parent → ISA circle
        layoutEdges.push({
            id: `le_isa_p_${gen.id}`,
            sourceId: gen.parentEntityId,
            targetId: gen.id,
        });
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

        // category entity → union circle
        layoutEdges.push({
            id: `le_catl_${cat.id}`,
            sourceId: cat.categoryEntityId,
            targetId: cat.id,
        });
        // union circle → superclass entities
        for (const sid of cat.superclassEntityIds) {
            layoutEdges.push({
                id: `le_catm_${cat.id}_${sid}`,
                sourceId: cat.id,
                targetId: sid,
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
            size: LAYOUT.entitySize,
            name: entity.name,
            entityId: entity.id,
            entityRender: entity.kind === "weak" ? { doubleStroke: true } : undefined,
        });
    }

    // ── 3b. Relationships ───────────────────────────────────────────────

    for (const rel of model.relationships ?? []) {
        const pos = getPos(rel.id);
        skeletonPositions.set(rel.id, pos);

        nodes.push({
            id: rel.id,
            type: "relationship",
            position: pos,
            size: LAYOUT.relationshipSize,
            name: rel.name,
            relationshipId: rel.id,
            relationshipRender: rel.type === "identifying" ? { doubleStroke: true } : undefined,
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
                labels: end.cardinality ? { nearTo: end.cardinality } : undefined,
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

        emitAttributeNodes(attrs, ownerPos, ownerId, lookup, nodes, edges, baseAngle);
    };

    // Entity attributes
    for (const entity of model.entities ?? []) {
        const pos = entityPos.get(entity.id)!;
        emitAttrsForOwner(entity.attributes, pos, entity.id, LAYOUT.attrBaseAngle);
    }

    // Relationship attributes
    for (const rel of model.relationships ?? []) {
        const pos = skeletonPositions.get(rel.id)!;
        emitAttrsForOwner(rel.attributes, pos, rel.id, Math.PI / 2);
    }

    // ── 3d. Generalizations (ISA) ───────────────────────────────────────

    for (const gen of model.generalizations ?? []) {
        const pPos = entityPos.get(gen.parentEntityId);
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
        edges.push({
            id: `e_isa_p_${gen.id}`,
            type: "isaParent",
            from: { nodeId: gen.parentEntityId },
            to: { nodeId: gen.id },
            generalizationId: gen.id,
            endStyle: isTotal ? { from: { doubleLine: true } } : undefined,
        });

        gen.childEntityIds.forEach((childId) => {
            edges.push({
                id: `e_isa_c_${gen.id}_${childId}`,
                type: "isaChild",
                from: { nodeId: gen.id },
                to: { nodeId: childId },
                generalizationId: gen.id,
            });
        });
    }

    // ── 3e. Categories (Union) ──────────────────────────────────────────

    for (const cat of model.categories ?? []) {
        const cePos = entityPos.get(cat.categoryEntityId);
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
        edges.push({
            id: `e_catl_${cat.id}`,
            type: "categoryLink",
            from: { nodeId: cat.categoryEntityId },
            to: { nodeId: cat.id },
            categoryId: cat.id,
            endStyle: isTotal ? { from: { doubleLine: true } } : undefined,
        });

        cat.superclassEntityIds.forEach((sid) => {
            edges.push({
                id: `e_catm_${cat.id}_${sid}`,
                type: "categoryMember",
                from: { nodeId: cat.id },
                to: { nodeId: sid },
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
    nodes: StoredDiagramNode[],
    edges: StoredDiagramEdge[],
    baseAngle: number,
) => {
    const arcSpan = autoArcSpan(
        attrs.length,
        LAYOUT.attrRadius,
        LAYOUT.attributeSize.w,
        LAYOUT.attrMinGap,
    );

    attrs.forEach((attr, i) => {
        const angle = arcAngle(i, attrs.length, baseAngle, arcSpan);
        const fanPos = polarPos(ownerPos.x, ownerPos.y, angle, LAYOUT.attrRadius);

        // User-placed position takes priority, then fan layout
        const pos = lookup.get(attr.id) ?? fanPos;

        nodes.push({
            id: attr.id,
            type: "attribute",
            position: pos,
            size: LAYOUT.attributeSize,
            name: attr.name,
            attributeId: attr.id,
            attributeRender: toAttrRender(attr),
        });

        edges.push({
            id: `e_${attr.id}_${ownerId}`,
            type: "attrOf",
            from: { nodeId: attr.id },
            to: { nodeId: ownerId },
        });

        // Composite children — smaller fan around the attribute node
        if (attr.components?.length) {
            const compArc = autoArcSpan(
                attr.components.length,
                LAYOUT.compRadius,
                LAYOUT.attributeSize.w,
                LAYOUT.compMinGap,
            );

            attr.components.forEach((comp, ci) => {
                const cAngle = arcAngle(ci, attr.components!.length, angle, compArc);
                const cFanPos = polarPos(pos.x, pos.y, cAngle, LAYOUT.compRadius);
                const cPos = lookup.get(comp.id) ?? cFanPos;

                nodes.push({
                    id: comp.id,
                    type: "attribute",
                    position: cPos,
                    size: LAYOUT.attributeSize,
                    name: comp.name,
                    attributeId: comp.id,
                });

                edges.push({
                    id: `e_comp_${attr.id}_${comp.id}`,
                    type: "componentOf",
                    from: { nodeId: attr.id },
                    to: { nodeId: comp.id },
                });
            });
        }
    });
};
