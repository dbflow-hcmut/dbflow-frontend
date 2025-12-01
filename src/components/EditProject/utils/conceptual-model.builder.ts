import type { StoredDiagramEdge, StoredDiagramNode } from "./conceptual-diagram.builder";

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

        ends.push({
            entityId,
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

