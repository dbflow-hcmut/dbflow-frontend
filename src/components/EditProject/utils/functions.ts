import React from "react";
import { Node } from "reactflow";
import type { EntityData, RelationshipData, AttributeData, NodeData } from "../index";
import type { RelationTableData } from "@/components/erds-notations/relation-table";

export type ConstraintData = { symbol: 'd' | 'o' | 'u' };
export type ErdEdgeData = {
    label?: string;
    fromMult?: string;
    toMult?: string;
    lineStyle?: 'single' | 'double' | 'bracket';
    bracketDirection?: 'from' | 'to';
};
export const RELATION_NOTE_PREFIX = '__RELATION__::';

export const generateDiagramId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `cid_${crypto.randomUUID()}`;
    }
    const randomSuffix = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `cid_${randomSuffix}`;
};

const deselectAllNodes = <T extends NodeData>(nodes: Node<T>[]): Node<T>[] => {
    return nodes.map((n) => ({ ...n, selected: false }));
};

type NodeCreatorOptions = {
    getViewportCenter?: () => { x: number; y: number } | null;
};

const getSpawnPosition = (
    existingNodes: Node<NodeData>[],
    getViewportCenter?: () => { x: number; y: number } | null
) => {
    const center = getViewportCenter?.();
    if (!center) {
        const fallback = existingNodes.at(-1)?.position ?? { x: 0, y: 0 };
        return {
            x: fallback.x + 60,
            y: fallback.y + 60,
        };
    }

    const index = existingNodes.length;
    const angleStep = (2 * Math.PI) / 6;
    const angle = (index % 6) * angleStep;
    const radius = 40 + Math.floor(index / 6) * 30;

    return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
    };
};

export const createNodeCreators = (
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    options?: NodeCreatorOptions
) => {
    const resolvePosition = (existingNodes: Node<NodeData>[]) =>
        getSpawnPosition(existingNodes, options?.getViewportCenter);

    const addRelationship = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'single' },
                style: { width: 70, height: 40 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDoubleRelationship = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'double' },
                style: { width: 70, height: 40 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addEntity = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: resolvePosition(existingNodes),
                data: { name: name, fields: [], variant: 'single' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDoubleEntity = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: resolvePosition(existingNodes),
                data: { name: name, fields: [], variant: 'double' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addAttribute = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'single' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addMultivaluedAttribute = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'double' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDashedAttribute = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'dashed' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addConstraint = (symbol: 'd' | 'o' | 'u') => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const newNode: Node<ConstraintData> = {
                id,
                type: "constraint",
                position: resolvePosition(existingNodes),
                data: { symbol },
                style: { width: 22, height: 22 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addRelationTable = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const newNode: Node<RelationTableData> = {
                id,
                type: "relation",
                position: resolvePosition(existingNodes),
                data: { name: id, columns: [] },
                style: { width: 160, height: 120 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    return {
        addRelationship,
        addDoubleRelationship,
        addEntity,
        addDoubleEntity,
        addAttribute,
        addMultivaluedAttribute,
        addDashedAttribute,
        addConstraint,
        addRelationTable,
    };
};

export const createUpdateFunctions = (
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    selectedNode: Node<NodeData> | undefined
) => {
    const updateNodeName = (newName: string) => {
        if (!selectedNode) return;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? { ...n, data: { ...n.data, name: newName } }
                    : n
            )
        );
    };

    const updateAttributeKey = (checked: boolean) => {
        if (!selectedNode || selectedNode.type !== 'attribute') return;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? { ...n, data: { ...(n.data as AttributeData), isKey: checked } }
                    : n
            )
        );
    };

    return {
        updateNodeName,
        updateAttributeKey,
    };
};