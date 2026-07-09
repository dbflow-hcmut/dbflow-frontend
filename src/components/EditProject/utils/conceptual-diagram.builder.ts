import { Node, Viewport, Edge } from "reactflow";
import type { EntityData, RelationshipData, AttributeData, NodeData } from "../index";
import type { RelationTableData } from "@/components/erds-notations/relation-table";
import type { ConstraintData, ErdEdgeData } from "./functions";
import { RELATION_NOTE_PREFIX, generateDiagramId } from "./functions";

export const getViewportStorageKey = (schemaId?: string | null) =>
    schemaId ? `diagramViewport:${schemaId}` : null;

export const loadViewportFromStorage = (schemaId?: string | null) => {
    if (typeof window === "undefined") return null;
    const key = getViewportStorageKey(schemaId);
    if (!key) return null;
    try {
        const stored = window.localStorage.getItem(key);
        return stored ? (JSON.parse(stored) as Viewport) : null;
    } catch (error) {
        console.error("Failed to parse stored viewport:", error);
        return null;
    }
}

export const saveViewportToStorage = (nextViewport: Viewport, schemaId?: string | null) => {
    if (typeof window === "undefined") return;
    const key = getViewportStorageKey(schemaId);
    if (!key) return;
    try {
        window.localStorage.setItem(key, JSON.stringify(nextViewport));
    } catch (error) {
        console.error("Failed to store viewport:", error);
    }
};

type NodeStyleMeta = {
    entity?: {
        variant?: EntityData["variant"];
        fields?: EntityData["fields"];
    };
    relationship?: {
        variant?: RelationshipData["variant"];
        cardinalities?: RelationshipData["cardinalities"];
    };
    attribute?: {
        variant?: AttributeData["variant"];
        isKey?: boolean;
    };
};

type DiagramNodeStyle = {
    class?: string;
    stroke?: string | null;
    fill?: string | null;
    meta?: NodeStyleMeta;
    [key: string]: unknown;
};

type SchemaStoredDiagramNode = {
    id: string;
    type: Node<NodeData>["type"];
    position: { x: number; y: number };
    size: { w: number; h: number };
    zIndex?: number;
    style?: DiagramNodeStyle;
    name?: string;
    entityId?: string;
    entityRender?: { doubleStroke?: boolean };
    relationshipId?: string;
    relationshipRender?: { doubleStroke?: boolean };
    attributeId?: string;
    attributeRender?: {
        doubleEllipse?: boolean;
        dashed?: boolean;
        underline?: boolean;
        underlineStyle?: "solid" | "dashed";
    };
    isaCircle?: {
        symbol: "d" | "o";
    };
    unionCircle?: {
        symbol: "U";
        categoryId?: string;
    };
    text?: string;
};

type LegacyStoredDiagramNode = {
    data?: NodeData;
    fields?: EntityData["fields"];
    columns?: RelationTableData["columns"];
};

export type StoredDiagramNode = SchemaStoredDiagramNode & LegacyStoredDiagramNode;

type SchemaEdgeType =
    | "participation"
    | "attrOf"
    | "componentOf"
    | "identifying"
    | "isaParent"
    | "isaChild"
    | "categoryLink"
    | "categoryMember";

type SchemaEdgeMarker = "none" | "one" | "many";

type SchemaEdgeEndStyle = {
    from?: {
        doubleLine?: boolean;
        marker?: SchemaEdgeMarker;
        bracket?: boolean;
    };
    to?: {
        doubleLine?: boolean;
        marker?: SchemaEdgeMarker;
        bracket?: boolean;
    };
};

type SchemaEdgeLabels = {
    nearFrom?: string;
    center?: string;
    nearTo?: string;
};

export type StoredDiagramEdge = {
    id: string;
    type: SchemaEdgeType;
    from: { nodeId: string; portId?: string };
    to: { nodeId: string; portId?: string };
    relationshipId?: string;
    generalizationId?: string;
    categoryId?: string;
    labels?: SchemaEdgeLabels;
    endStyle?: SchemaEdgeEndStyle;
};

type LegacyStoredEdge = Edge<ErdEdgeData>;

const ensurePosition = (node: StoredDiagramNode) => node.position ?? { x: 0, y: 0 };

const ensureStyle = (node: StoredDiagramNode) =>
    node.size ? { width: node.size.w, height: node.size.h } : undefined;

const NODE_SIZE_FALLBACKS: Record<string, { w: number; h: number }> = {
    entity: { w: 120, h: 60 },
    relationship: { w: 110, h: 50 },
    attribute: { w: 90, h: 40 },
    isaCircle: { w: 32, h: 32 },
    unionCircle: { w: 32, h: 32 },
    note: { w: 140, h: 90 },
    constraint: { w: 22, h: 22 },
    relation: { w: 160, h: 120 },
    default: { w: 100, h: 50 },
};

const getStoredNodeSize = (node: Node<NodeData>) => {
    const parsedSize = getNodeSize(node.style);
    if (parsedSize) return parsedSize;
    const nodeType = node.type ?? "default";
    return NODE_SIZE_FALLBACKS[nodeType] ?? NODE_SIZE_FALLBACKS.default;
};

const sanitizeStyleForStorage = (
    style: Node<NodeData>["style"],
    meta?: NodeStyleMeta
): DiagramNodeStyle | undefined => {
    const cleanedStyle = style ? { ...(style as Record<string, unknown>) } : {};

    if ("width" in cleanedStyle) delete cleanedStyle.width;
    if ("height" in cleanedStyle) delete cleanedStyle.height;

    if (meta && Object.keys(meta).length > 0) {
        (cleanedStyle as DiagramNodeStyle).meta = meta;
    }

    return Object.keys(cleanedStyle).length > 0 ? (cleanedStyle as DiagramNodeStyle) : meta ? { meta } : undefined;
};

const getStyleMeta = (node: StoredDiagramNode): NodeStyleMeta | undefined => node.style?.meta;

const mapEntityNode = (node: StoredDiagramNode): Node<EntityData> => {
    const dataSource = node.data as EntityData | undefined;
    const meta = getStyleMeta(node)?.entity;
    const variant =
        meta?.variant ??
        (node.entityRender?.doubleStroke ? "double" : dataSource?.variant ?? "single");

    return {
        id: node.entityId ?? node.id,
        type: "entity",
        position: ensurePosition(node),
        data: {
            name: node.name ?? dataSource?.name ?? node.entityId ?? node.id,
            fields: meta?.fields ?? node.fields ?? dataSource?.fields ?? [],
            variant,
        },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const mapRelationshipNode = (node: StoredDiagramNode): Node<RelationshipData> => {
    const dataSource = node.data as RelationshipData | undefined;
    const meta = getStyleMeta(node)?.relationship;
    const variant =
        meta?.variant ??
        (node.relationshipRender?.doubleStroke ? "double" : dataSource?.variant ?? "single");

    return {
        id: node.relationshipId ?? node.id,
        type: "relationship",
        position: ensurePosition(node),
        data: {
            name: node.name ?? dataSource?.name ?? node.relationshipId ?? node.id,
            variant,
            cardinalities: meta?.cardinalities ?? dataSource?.cardinalities,
        },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const mapAttributeNode = (node: StoredDiagramNode): Node<AttributeData> => {
    const dataSource = node.data as AttributeData | undefined;
    const meta = getStyleMeta(node)?.attribute;
    const variant =
        meta?.variant ??
        (node.attributeRender?.doubleEllipse
            ? "double"
            : node.attributeRender?.dashed
            ? "dashed"
            : dataSource?.variant ?? "single");

    const isKey =
        meta?.isKey ??
        dataSource?.isKey ??
        (node.attributeRender?.underline ? true : undefined);
    const underlineStyle =
        dataSource?.underlineStyle ??
        node.attributeRender?.underlineStyle;

    return {
        id: node.attributeId ?? node.id,
        type: "attribute",
        position: ensurePosition(node),
        data: {
            name: node.name ?? dataSource?.name ?? node.attributeId ?? node.id,
            variant,
            isKey,
            underlineStyle,
        },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const mapConstraintNode = (node: StoredDiagramNode): Node<ConstraintData> => {
    const symbol =
        node.type === "unionCircle"
            ? "u"
            : node.isaCircle?.symbol === "o"
            ? "o"
            : "d";

    return {
        id: node.id,
        type: "constraint",
        position: ensurePosition(node),
        data: { symbol },
        style: ensureStyle(node) ?? { width: 22, height: 22 },
        zIndex: node.zIndex,
    };
};

const parseRelationFromNote = (node: StoredDiagramNode) => {
    if (typeof node.text !== "string") return null;
    if (!node.text.startsWith(RELATION_NOTE_PREFIX)) return null;
    try {
        const payload = JSON.parse(node.text.slice(RELATION_NOTE_PREFIX.length));
        if (payload && typeof payload === "object" && "name" in payload && "columns" in payload) {
            return payload as RelationTableData;
        }
    } catch {
        return null;
    }
    return null;
};

const mapRelationNode = (node: StoredDiagramNode): Node<RelationTableData> => {
    const parsed = parseRelationFromNote(node);
    return {
        id: node.id,
        type: "relation",
        position: ensurePosition(node),
        data: {
            name: parsed?.name ?? node.name ?? node.id,
            columns: parsed?.columns ?? [],
        },
        style: ensureStyle(node) ?? { width: 160, height: 120 },
        zIndex: node.zIndex,
    };
};

const ANNOTATION_NODE_TYPES = new Set(["sticky-note", "text-label", "drawing-path"]);

const mapFallbackNode = (node: StoredDiagramNode): Node<NodeData> => {
    // Annotation nodes: preserve type and data as-is
    if (ANNOTATION_NODE_TYPES.has(node.type!)) {
        return {
            id: node.id,
            type: node.type!,
            position: ensurePosition(node),
            data: (node.data ?? {}) as NodeData,
            style: ensureStyle(node),
            zIndex: node.zIndex,
        };
    }
    return {
        id: node.id,
        type: "entity",
        position: ensurePosition(node),
        data: { name: node.name ?? node.id, fields: [] },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const mapStoredNodeToReactNode = (node: StoredDiagramNode): Node<NodeData> => {
    console.log("mapStoredNodeToReactNode", node);
    
    // If node has attributeId but no type, it's an attribute
    if (!node.type && node.attributeId) {
        return mapAttributeNode(node);
    }
    // If node has entityId but no type, it's an entity
    if (!node.type && node.entityId) {
        return mapEntityNode(node);
    }
    // If node has relationshipId but no type, it's a relationship
    if (!node.type && node.relationshipId) {
        return mapRelationshipNode(node);
    }
    
    switch (node.type) {
        case "entity":
            return mapEntityNode(node);
        case "relationship":
            return mapRelationshipNode(node);
        case "attribute":
            return mapAttributeNode(node);
        case "isaCircle":
        case "unionCircle":
            return mapConstraintNode(node);
        case "note": {
            const parsedRelation = parseRelationFromNote(node);
            if (parsedRelation) {
                return mapRelationNode(node);
            }
            return {
                id: node.id,
                type: "entity",
                position: ensurePosition(node),
                data: { name: node.name ?? node.id, fields: [] },
                style: ensureStyle(node),
                zIndex: node.zIndex,
            };
        }
        default:
            return mapFallbackNode(node);
    }
};

export const mapStoredNodesToReactNodes = (storedNodes: StoredDiagramNode[] = []): Node<NodeData>[] => {
    return storedNodes.map((node) => ({
        ...mapStoredNodeToReactNode(node),
        selected: false,
    }));
};

const parseSizeValue = (value: number | string | undefined): number | undefined => {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
};

const getNodeSize = (style: Node<NodeData>["style"]) => {
    if (!style) return undefined;
    const width = parseSizeValue(style.width as number | string | undefined);
    const height = parseSizeValue(style.height as number | string | undefined);
    if (typeof width === "number" && typeof height === "number") {
        return { w: width, h: height };
    }
    return undefined;
};

const mapReactEntityNode = (node: Node<EntityData>): StoredDiagramNode => {
    const { name, fields, variant = "single" } = node.data;
    const entityMeta: NodeStyleMeta["entity"] = {};
    if (fields?.length) {
        entityMeta.fields = fields;
    }
    if (variant === "dashed") {
        entityMeta.variant = variant;
    }

    const meta = Object.keys(entityMeta).length ? { entity: entityMeta } : undefined;

    return {
        id: node.id,
        type: node.type,
        position: node.position,
        size: getStoredNodeSize(node),
        zIndex: node.zIndex,
        name,
        entityId: node.id,
        entityRender: variant === "double" ? { doubleStroke: true } : undefined,
        style: sanitizeStyleForStorage(node.style, meta),
    };
};

const mapReactRelationshipNode = (node: Node<RelationshipData>): StoredDiagramNode => {
    const { name, variant = "single", cardinalities } = node.data;
    const relationshipMeta: NodeStyleMeta["relationship"] = {};
    if (variant === "dashed") {
        relationshipMeta.variant = variant;
    }
    if (cardinalities && Object.keys(cardinalities).length > 0) {
        relationshipMeta.cardinalities = cardinalities;
    }

    const meta = Object.keys(relationshipMeta).length ? { relationship: relationshipMeta } : undefined;

    return {
        id: node.id,
        type: node.type,
        position: node.position,
        size: getStoredNodeSize(node),
        zIndex: node.zIndex,
        name,
        relationshipId: node.id,
        relationshipRender: variant === "double" ? { doubleStroke: true } : undefined,
        style: sanitizeStyleForStorage(node.style, meta),
    };
};

const mapReactAttributeNode = (
    node: Node<AttributeData>,
    underlineStyleOverride?: AttributeData["underlineStyle"]
): StoredDiagramNode => {
    const { name, variant = "single", isKey, underlineStyle } = node.data;
    const attributeRender: NonNullable<StoredDiagramNode["attributeRender"]> = {};

    if (variant === "double") {
        attributeRender.doubleEllipse = true;
    }
    if (variant === "dashed") {
        attributeRender.dashed = true;
    }
    if (isKey) {
        attributeRender.underline = true;
        attributeRender.underlineStyle = underlineStyleOverride ?? underlineStyle ?? "solid";
    }

    return {
        id: node.id,
        type: node.type,
        position: node.position,
        size: getStoredNodeSize(node),
        zIndex: node.zIndex,
        name,
        attributeId: node.id,
        attributeRender: Object.keys(attributeRender).length ? attributeRender : undefined,
        style: sanitizeStyleForStorage(node.style),
    };
};

const mapReactConstraintNode = (node: Node<{ symbol: "d" | "o" | "u" }>): StoredDiagramNode => {
    const { symbol } = node.data;
    const isUnion = symbol === "u";
    return {
        id: node.id,
        type: isUnion ? "unionCircle" : "isaCircle",
        position: node.position,
        size: getStoredNodeSize(node),
        zIndex: node.zIndex,
        isaCircle: isUnion ? undefined : { symbol },
        unionCircle: isUnion ? { symbol: "U", categoryId: node.id } : undefined,
        style: sanitizeStyleForStorage(node.style),
    };
};

const mapReactRelationNode = (node: Node<RelationTableData>): StoredDiagramNode => {
    const { name, columns } = node.data;
    const relationPayload = JSON.stringify({ name, columns });
    return {
        id: node.id,
        type: "note",
        position: node.position,
        size: getStoredNodeSize(node),
        zIndex: node.zIndex,
        name,
        text: `${RELATION_NOTE_PREFIX}${relationPayload}`,
        style: sanitizeStyleForStorage(node.style),
    };
};

const isWeakEntityNode = (node?: Node<NodeData>) =>
    node?.type === "entity" && (node.data as EntityData | undefined)?.variant === "double";

const getWeakEntityPartialKeyAttributeIds = (
    reactNodes: Node<NodeData>[] = [],
    reactEdges: Edge<ErdEdgeData>[] = []
) => {
    const nodeMap = new Map(reactNodes.map((node) => [node.id, node]));
    const partialKeyAttributeIds = new Set<string>();

    reactEdges.forEach((edge) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        if (sourceNode?.type === "attribute" && isWeakEntityNode(targetNode)) {
            partialKeyAttributeIds.add(sourceNode.id);
        }
        if (targetNode?.type === "attribute" && isWeakEntityNode(sourceNode)) {
            partialKeyAttributeIds.add(targetNode.id);
        }
    });

    return partialKeyAttributeIds;
};

const mapReactNodeToStoredNode = (
    node: Node<NodeData>,
    partialKeyAttributeIds?: Set<string>
): StoredDiagramNode => {
    console.log("mapReactNodeToStoredNode", node);
    switch (node.type) {
        case "entity":
            return mapReactEntityNode(node as Node<EntityData>);
        case "relationship":
            return mapReactRelationshipNode(node as Node<RelationshipData>);
        case "attribute":
            return mapReactAttributeNode(
                node as Node<AttributeData>,
                partialKeyAttributeIds?.has(node.id) ? "dashed" : "solid"
            );
        case "constraint":
            return mapReactConstraintNode(node as Node<{ symbol: "d" | "o" | "u" }>);
        case "relation":
            return mapReactRelationNode(node as Node<RelationTableData>);
        default:
            return {
                id: node.id,
                type: node.type,
                position: node.position,
                size: getStoredNodeSize(node),
                zIndex: node.zIndex,
                data: node.data,
                style: sanitizeStyleForStorage(node.style),
            };
    }
};

export const mapReactNodesToStoredNodes = (
    reactNodes: Node<NodeData>[] = [],
    reactEdges: Edge<ErdEdgeData>[] = []
): StoredDiagramNode[] => {
    const partialKeyAttributeIds = getWeakEntityPartialKeyAttributeIds(reactNodes, reactEdges);
    return reactNodes.map((node) => mapReactNodeToStoredNode(node, partialKeyAttributeIds));
};

type EdgeClassification = {
    type: SchemaEdgeType;
    relationshipId?: string;
    generalizationId?: string;
    categoryId?: string;
};

const buildEdgeLabels = (edge: Edge<ErdEdgeData>): SchemaEdgeLabels | undefined => {
    const labels: SchemaEdgeLabels = {};
    if (edge.data?.fromMult) labels.nearFrom = edge.data.fromMult;
    if (edge.data?.toMult) labels.nearTo = edge.data.toMult;
    const centerLabel = edge.data?.label || (typeof edge.label === "string" ? edge.label : undefined);
    if (centerLabel && centerLabel.trim().length > 0) {
        labels.center = centerLabel;
    }
    return Object.keys(labels).length ? labels : undefined;
};

const buildEdgeEndStyle = (
    lineStyle: ErdEdgeData["lineStyle"],
    bracketDirection?: "from" | "to"
): SchemaEdgeEndStyle | undefined => {
    if (lineStyle === "double") {
        return {
            from: { doubleLine: true },
            to: { doubleLine: true },
        };
    }
    if (lineStyle === "bracket") {
        if (bracketDirection === "from") {
            return {
                from: { bracket: true },
            };
        }
        if (bracketDirection === "to") {
            return {
                to: { bracket: true },
            };
        }
        return {
            to: { bracket: true },
        };
    }
    return undefined;
};

const getConstraintSymbol = (node?: Node<NodeData>) => {
    if (node?.type !== "constraint") return undefined;
    return (node.data as ConstraintData)?.symbol;
};

const classifyEdge = (
    sourceNode: Node<NodeData>,
    targetNode: Node<NodeData>,
    edge: Edge<ErdEdgeData>
): EdgeClassification => {
    const isEntity = (node: Node<NodeData>) => node.type === "entity";
    const isRelationship = (node: Node<NodeData>) => node.type === "relationship";
    const isAttribute = (node: Node<NodeData>) => node.type === "attribute";
    const isConstraint = (node: Node<NodeData>) => node.type === "constraint";
    const isRelationTable = (node: Node<NodeData>) => node.type === "relation";

    if (isAttribute(sourceNode) && isAttribute(targetNode)) {
        return { type: "componentOf" };
    }

    if (
        isAttribute(sourceNode) ||
        isAttribute(targetNode) ||
        isRelationTable(sourceNode) ||
        isRelationTable(targetNode)
    ) {
        return { type: "attrOf" };
    }

    if (isConstraint(sourceNode) || isConstraint(targetNode)) {
        const constraintNode = isConstraint(sourceNode) ? sourceNode : targetNode;
        const otherNode = constraintNode === sourceNode ? targetNode : sourceNode;
        const symbol = getConstraintSymbol(constraintNode);
        const marksChild = edge.data?.lineStyle === "bracket";

        if (symbol === "u") {
            return {
                type: marksChild ? "categoryLink" : "categoryMember",
                categoryId: constraintNode.id,
            };
        }

        if (isEntity(otherNode)) {
            return {
                type: marksChild ? "isaChild" : "isaParent",
                generalizationId: constraintNode.id,
            };
        }
    }

    if (isEntity(sourceNode) && isEntity(targetNode)) {
        return {
            type: "isaChild",
            generalizationId: edge.id,
        };
    }

    if (isRelationship(sourceNode) && isEntity(targetNode)) {
        if (edge.data?.lineStyle === "bracket") {
            return {
                type: "identifying",
                relationshipId: sourceNode.id,
            };
        }
        return {
            type: "participation",
            relationshipId: sourceNode.id,
        };
    }

    if (isRelationship(targetNode) && isEntity(sourceNode)) {
        if (edge.data?.lineStyle === "bracket") {
            return {
                type: "identifying",
                relationshipId: targetNode.id,
            };
        }
        return {
            type: "participation",
            relationshipId: targetNode.id,
        };
    }

    return { type: "attrOf" };
};

const mapReactEdgeToStoredEdge = (
    edge: Edge<ErdEdgeData>,
    nodeMap: Map<string, Node<NodeData>>
): StoredDiagramEdge | null => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) {
        return null;
    }

    const classification = classifyEdge(sourceNode, targetNode, edge);
    if (!classification) return null;

    const labels = buildEdgeLabels(edge);
    const isDirectEntityGeneralization =
        classification.type === "isaChild" &&
        sourceNode.type === "entity" &&
        targetNode.type === "entity";
    const lineStyle = isDirectEntityGeneralization ? "bracket" : edge.data?.lineStyle;
    const bracketDirection = edge.data?.bracketDirection ?? (isDirectEntityGeneralization ? "from" : undefined);
    const endStyle = buildEdgeEndStyle(lineStyle, bracketDirection);

    const extractPortId = (handleId?: string | null): string | undefined => {
        if (!handleId) return undefined;
        const validPorts = ['top', 'bottom', 'left', 'right'];
        for (const port of validPorts) {
            if (handleId.startsWith(port)) {
                return port;
            }
        }
        return undefined;
    };

    const storedEdge: StoredDiagramEdge = {
        id: edge.id || generateDiagramId(),
        type: classification.type,
        from: {
            nodeId: edge.source,
            ...(edge.sourceHandle ? { portId: extractPortId(edge.sourceHandle) } : {}),
        },
        to: {
            nodeId: edge.target,
            ...(edge.targetHandle ? { portId: extractPortId(edge.targetHandle) } : {}),
        },
    };

    if (classification.relationshipId) {
        storedEdge.relationshipId = classification.relationshipId;
    }
    if (classification.generalizationId) {
        storedEdge.generalizationId = classification.generalizationId;
    }
    if (classification.categoryId) {
        storedEdge.categoryId = classification.categoryId;
    }
    if (labels) {
        storedEdge.labels = labels;
    }
    if (endStyle) {
        storedEdge.endStyle = endStyle;
    }

    // Constraint child/category edges always show the bracket at the circle end.
    if (classification.type === "categoryLink") {
        const bracketSide = sourceNode.type === "constraint" ? "from" : "to";
        const otherSide = bracketSide === "from" ? "to" : "from";
        storedEdge.endStyle = {
            ...storedEdge.endStyle,
            [otherSide]: storedEdge.endStyle?.[otherSide]
                ? { ...storedEdge.endStyle[otherSide], bracket: undefined }
                : undefined,
            [bracketSide]: { ...storedEdge.endStyle?.[bracketSide], bracket: true },
        };
    }

    if (classification.type === "isaChild") {
        const bracketSide = sourceNode.type === "constraint" ? "from" : "to";
        const otherSide = bracketSide === "from" ? "to" : "from";
        storedEdge.endStyle = {
            ...storedEdge.endStyle,
            [otherSide]: storedEdge.endStyle?.[otherSide]
                ? { ...storedEdge.endStyle[otherSide], bracket: undefined }
                : undefined,
            [bracketSide]: { ...storedEdge.endStyle?.[bracketSide], bracket: true },
        };
    }

    return storedEdge;
};

const isSchemaStoredEdge = (edge: unknown): edge is StoredDiagramEdge => {
    if (!edge || typeof edge !== "object") return false;
    const candidate = edge as StoredDiagramEdge;
    return (
        typeof candidate.id === "string" &&
        typeof candidate.type === "string" &&
        !!candidate.from &&
        !!candidate.to
    );
};

const mapSchemaEdgeToReactEdge = (
    edge: StoredDiagramEdge,
    nodeMap: Map<string, Node<NodeData>>
): Edge<ErdEdgeData> | null => {
    if (!nodeMap.has(edge.from.nodeId) || !nodeMap.has(edge.to.nodeId)) {
        return null;
    }

    const hasBracket = edge.endStyle?.from?.bracket || edge.endStyle?.to?.bracket;
    const bracketDirection = edge.endStyle?.from?.bracket ? "from" : edge.endStyle?.to?.bracket ? "to" : undefined;
    
    const data: ErdEdgeData = {
        lineStyle:
            hasBracket
                ? "bracket"
                : edge.endStyle?.from?.doubleLine || edge.endStyle?.to?.doubleLine
                ? "double"
                : "single",
        fromMult: edge.labels?.nearFrom,
        toMult: edge.labels?.nearTo,
        bracketDirection,
        storedType: edge.type,
        label: edge.labels?.center,
    };

    const reactEdge: Edge<ErdEdgeData> = {
        id: edge.id,
        source: edge.from.nodeId,
        target: edge.to.nodeId,
        type: "erd-edge",
        data,
        ...(edge.from.portId ? { sourceHandle: `${edge.from.portId}-source` } : {}),
        ...(edge.to.portId ? { targetHandle: `${edge.to.portId}-target` } : {}),
    };

    if (edge.labels?.center) {
        reactEdge.label = edge.labels.center;
    }

    return reactEdge;
};

export const mapReactEdgesToStoredEdges = (
    reactEdges: Edge<ErdEdgeData>[] = [],
    nodes: Node<NodeData>[] = []
): StoredDiagramEdge[] => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return reactEdges
        .map((edge) => mapReactEdgeToStoredEdge(edge, nodeMap))
        .filter((edge): edge is StoredDiagramEdge => Boolean(edge));
};

export const mapStoredEdgesToReactEdges = (
    storedEdges: (StoredDiagramEdge | LegacyStoredEdge)[] = [],
    nodes: Node<NodeData>[] = []
): Edge<ErdEdgeData>[] => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    // Dedup by edge ID — stale Yjs data from before the recursive-
    // relationship fix may contain two entries with the same id.
    const seen = new Set<string>();

    return storedEdges
        .map((edge) => {
            if (isSchemaStoredEdge(edge)) {
                return mapSchemaEdgeToReactEdge(edge, nodeMap);
            }

            const legacyEdge = edge as LegacyStoredEdge;
            if (!legacyEdge.source || !legacyEdge.target) return null;

            const legacyData: ErdEdgeData = {
                ...legacyEdge.data,
                lineStyle: legacyEdge.data?.lineStyle ?? "single",
            };

            return {
                ...legacyEdge,
                type: "erd-edge",
                data: legacyData,
            };
        })
        .filter((edge): edge is Edge<ErdEdgeData> => {
            if (!edge) return false;
            if (seen.has(edge.id)) return false;
            seen.add(edge.id);
            return true;
        });
};
