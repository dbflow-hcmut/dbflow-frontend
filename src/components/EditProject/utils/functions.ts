import React from "react";
import { Node } from "reactflow";
import type { EntityData, RelationshipData, AttributeData, NodeData } from "../index";
import type { RelationTableData } from "@/components/erds-notations/relation-table";

type ConstraintData = { symbol: 'd' | 'o' | 'u' };

const deselectAllNodes = <T extends NodeData>(nodes: Node<T>[]): Node<T>[] => {
    return nodes.map((n) => ({ ...n, selected: false }));
};

export const createNodeCreators = (setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>) => {
    const addRelationship = () => {
        setNodes((existingNodes) => {
            const id = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: { x: 1000 + existingNodes.length * 30, y: 1000 + existingNodes.length * 25 },
                data: { name: id, variant: 'single' },
                style: { width: 70, height: 40 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDoubleRelationship = () => {
        setNodes((existingNodes) => {
            const id = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: { x: 1000 + existingNodes.length * 30, y: 1000 + existingNodes.length * 25 },
                data: { name: id, variant: 'double' },
                style: { width: 70, height: 40 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addEntity = () => {
        setNodes((existingNodes) => {
            const id = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: { x: 1000 + existingNodes.length * 25, y: 1000 + existingNodes.length * 20 },
                data: { name: id, fields: [], variant: 'single' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDoubleEntity = () => {
        setNodes((existingNodes) => {
            const id = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: { x: 1000 + existingNodes.length * 25, y: 1000 + existingNodes.length * 20 },
                data: { name: id, fields: [], variant: 'double' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addAttribute = () => {
        setNodes((existingNodes) => {
            const id = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: { x: 1000 + existingNodes.length * 35, y: 1000 + existingNodes.length * 20 },
                data: { name: id, variant: 'single' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addMultivaluedAttribute = () => {
        setNodes((existingNodes) => {
            const id = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: { x: 1000 + existingNodes.length * 35, y: 1000 + existingNodes.length * 20 },
                data: { name: id, variant: 'double' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDashedAttribute = () => {
        setNodes((existingNodes) => {
            const id = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: { x: 1000 + existingNodes.length * 35, y: 1000 + existingNodes.length * 20 },
                data: { name: id, variant: 'dashed' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addConstraint = (symbol: 'd' | 'o' | 'u') => {
        setNodes((existingNodes) => {
            const id = `cst_${existingNodes.length + 1}`;
            const newNode: Node<ConstraintData> = {
                id,
                type: "constraint",
                position: { x: 1000 + existingNodes.length * 20, y: 1000 + existingNodes.length * 15 },
                data: { symbol },
                style: { width: 22, height: 22 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addRelationTable = () => {
        setNodes((existingNodes) => {
            const id = `tbl_${existingNodes.length + 1}`;
            const newNode: Node<RelationTableData> = {
                id,
                type: "relation",
                position: { x: 1000 + existingNodes.length * 25, y: 1000 + existingNodes.length * 20 },
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

