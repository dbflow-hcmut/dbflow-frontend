"use client";

import { API_AVATAR, PAGE_HEIGHT, PAGE_WIDTH } from "@/utils/constants";
import React, { useCallback, useMemo, useRef, useState } from "react";
import ReactFlow, {
    Background,
    BackgroundVariant,
    addEdge,
    Connection,
    Edge,
    Node,
    OnConnect,
    EdgeTypes,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    ConnectionLineType,
    NodeDragHandler,
    OnMove,
} from "reactflow";
import "reactflow/dist/style.css";
import ErdEdge from "./components/erd-edge";
import { Button, Collapse, Tooltip } from "antd";
import { Blocks, CloudCheck, RectangleHorizontal } from "lucide-react";
import classNames from "classnames";
import OvalIcon from "@/components/Icons/oval";
import PolygonIcon from "@/components/Icons/polygon";
import RelationshipNode from "./components/erds-notations/relationship";
import EntityNode from "./components/erds-notations/entity";
import PagesOverlay from "./components/page-overlay";
import AttributeNode from "./components/erds-notations/attribute";
import Image from "next/image";

type EntityField = {
    id: string;
    name: string;
    type: string;
    isPrimary?: boolean;
    isNullable?: boolean;
};

type EntityData = {
    name: string;
    fields: EntityField[];
};

type RelationshipData = {
    name: string;
};

type AttributeData = {
    name: string;
};

type NodeData = EntityData | RelationshipData | AttributeData;

const initialNodes: Node<NodeData>[] = [];

const initialEdges: Edge[] = [];

const ConceptualPage: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [isOpenSidebar, setIsOpenSidebar] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(224);
    const [isResizing, setIsResizing] = useState(false);

    const [minPageX, setMinPageX] = useState(0);
    const [maxPageX, setMaxPageX] = useState(1);
    const [minPageY, setMinPageY] = useState(0);
    const [maxPageY, setMaxPageY] = useState(1);
    const flowWrapperRef = useRef<HTMLDivElement | null>(null);

    const nodeTypes = useMemo(
        () => ({
            relationship: RelationshipNode,
            attribute: AttributeNode,
            entity: EntityNode,
        }),
        []
    );

    const edgeTypes = useMemo<EdgeTypes>(
        () => ({
            "erd-edge": ErdEdge,
        }),
        []
    );

    const onConnect = useCallback<OnConnect>((connection: Connection) => {
        setEdges((eds) => addEdge({ ...connection, type: "erd-edge", animated: false }, eds));
    }, [setEdges]);

    const addRelationship = useCallback(() => {
        setNodes((existingNodes) => {
            const id = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: { x: 1000 + existingNodes.length * 30, y: 1000 + existingNodes.length * 25 },
                data: { name: id },
                style: { width: 100, height: 80 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addEntity = useCallback(() => {
        setNodes((existingNodes) => {
            const id = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: { x: 1000 + existingNodes.length * 25, y: 1000 + existingNodes.length * 20 },
                data: { name: id, fields: [] },
                style: { width: 100, height: 50 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addAttribute = useCallback(() => {
        setNodes((existingNodes) => {
            const id = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: { x: 1000 + existingNodes.length * 35, y: 1000 + existingNodes.length * 20 },
                data: { name: id },
                style: { width: 100, height: 50 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const handleNodeDragStop = useCallback<NodeDragHandler>((_, node) => {
        const px = Math.floor(node.position.x / PAGE_WIDTH);
        const py = Math.floor(node.position.y / PAGE_HEIGHT);

        if (px < minPageX) setMinPageX(px);
        if (py < minPageY) setMinPageY(py);
        if (px > maxPageX) setMaxPageX(px);
        if (py > maxPageY) setMaxPageY(py);
    }, [minPageX, minPageY, maxPageX, maxPageY]);

    const handleNodeDrag = useCallback<NodeDragHandler>((_, node) => {
        const px = Math.floor(node.position.x / PAGE_WIDTH);
        const py = Math.floor(node.position.y / PAGE_HEIGHT);

        if (px < minPageX) setMinPageX(px);
        if (py < minPageY) setMinPageY(py);
        if (px > maxPageX) setMaxPageX(px);
        if (py > maxPageY) setMaxPageY(py);
    }, [minPageX, minPageY, maxPageX, maxPageY]);



    const handleMoveEnd = useCallback<OnMove>((_, viewport) => {
        const wrapper = flowWrapperRef.current;
        if (!wrapper) return;

        const { clientWidth, clientHeight } = wrapper;
        const leftWorld = -viewport.x / viewport.zoom;
        const topWorld = -viewport.y / viewport.zoom;
        const rightWorld = leftWorld + clientWidth / viewport.zoom;
        const bottomWorld = topWorld + clientHeight / viewport.zoom;

        const minPx = Math.floor(leftWorld / PAGE_WIDTH);
        const minPy = Math.floor(topWorld / PAGE_HEIGHT);
        const maxPx = Math.floor((rightWorld - 1) / PAGE_WIDTH);
        const maxPy = Math.floor((bottomWorld - 1) / PAGE_HEIGHT);

        if (minPx < minPageX) setMinPageX(minPx);
        if (minPy < minPageY) setMinPageY(minPy);
        if (maxPx > maxPageX) setMaxPageX(maxPx);
        if (maxPy > maxPageY) setMaxPageY(maxPy);
    }, [minPageX, minPageY, maxPageX, maxPageY]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        
        const newWidth = e.clientX - 40;
        const minWidth = 200;
        const maxWidth = 400;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
            setSidebarWidth(newWidth);
        }
    }, [isResizing]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    const handlePaneClick = useCallback(() => {
        setNodes((existingNodes) => existingNodes.map((node) => ({ ...node, selected: false })));
    }, [setNodes]);

    React.useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
        <ReactFlowProvider>
            <div className="h-screen w-full">
                <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <Image width={32} height={32} src="/dbflow.png" alt="Logo" />
                        </div>
                        <div className="flex flex-col">
                            <div className="font-bold text-lg leading-none pt-2">
                                Blank diagram
                            </div>
                            <div className="flex gap-4 items-center">
                                <span className="text-sm text-gray-700 cursor-pointer">File</span>
                                <span className="text-sm text-gray-700 cursor-pointer">Edit</span>
                                <span className="text-sm text-gray-700 cursor-pointer">Select</span>
                                <span className="text-sm text-gray-700 cursor-pointer">View</span>
                                <span className="text-sm text-gray-700 cursor-pointer">Insert</span>
                                <span className="text-sm text-gray-700 cursor-pointer">Arrange</span>
                                <span className="text-sm text-gray-700 cursor-pointer">Share</span>
                                <span className="text-sm text-gray-700 cursor-pointer">Help</span>
                                <Tooltip 
                                    title="Changes saved"
                                    placement="bottom"
                                >
                                    <Button
                                        type="text"
                                        icon={<CloudCheck size={18} />}
                                    />
                                </Tooltip>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="cursor-pointer">
                            <Image 
                                src={`${API_AVATAR}/?name=Thành+Tài&background=random&size=512`} 
                                alt="User Avatar" 
                                className="rounded-full" 
                                width={32}
                                height={32}
                                unoptimized
                            />
                        </div>
                    </div>
                </div>
                <div className="flex h-[calc(100vh-4rem)] relative">
                    <div className="w-10 border-r border-gray-200 flex flex-col items-center py-2 gap-2">
                        <Tooltip
                            title="Shapes"
                            placement="right"
                        >
                            <Button
                                icon={
                                    <Blocks 
                                        size={20} 
                                        strokeWidth={1} 
                                        stroke={isOpenSidebar ? 'var(--color-primary-dark)' : "#6b7280"}
                                    />
                                }
                                type="text"
                                onClick={() => setIsOpenSidebar(!isOpenSidebar)}
                                className={classNames({ 
                                    '!bg-primary-light': isOpenSidebar 
                                })}
                            />
                        </Tooltip>
                    </div>
                    <div 
                        className="absolute h-full top-0 left-10 flex flex-col items-center gap-2 bg-white z-10"
                        style={{ width: `${sidebarWidth}px` }}
                        hidden={!isOpenSidebar}
                    >
                        <div className="w-full">
                            <div className="border-b border-gray-200 my-auto">
                                <h2 className="text-lg font-semibold py-2 px-4">Shapes</h2>
                            </div>
                            <div className="py-2">
                                <div className="border-b border-gray-200 pb-2 mb-2">
                                    <div className="px-2">
                                        <Collapse
                                            bordered={false}
                                            defaultActiveKey={['1']}
                                            expandIconPosition="end"
                                            className="!bg-transparent"
                                            items={[
                                                {
                                                    key: '1',
                                                    label: <div className="font-bold">Entity Relation</div>,
                                                    children: (
                                                        <div className="grid grid-cols-5 gap-2">
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <RectangleHorizontal
                                                                            strokeWidth={1}
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addEntity}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <OvalIcon
                                                                            width={30}
                                                                            height={30}
                                                                            strokeWidth={1}
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addAttribute}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        {/* <Diamond
                                                                            strokeWidth={1}
                                                                        /> */}
                                                                        <PolygonIcon
                                                                            width={25}
                                                                            height={25}
                                                                            strokeWidth={1}
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addRelationship}
                                                            />
                                                        </div>
                                                    ),
                                                },
                                            ]}  
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div
                            className="absolute top-0 right-0 w-1 h-full cursor-col-resize border-r border-gray-200"
                            onMouseDown={handleMouseDown}
                        />
                    </div>
                    <div ref={flowWrapperRef} className="flex-1 h-full">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            connectionLineType={ConnectionLineType.Straight}
                            connectionLineStyle={{ stroke: 'var(--color-gray-700)', strokeWidth: 2 }}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeDrag={handleNodeDrag}
                            onNodeDragStop={handleNodeDragStop}
                            onMoveEnd={handleMoveEnd}
                            onPaneClick={handlePaneClick}
                            translateExtent={[
                                [minPageX * PAGE_WIDTH, minPageY * PAGE_HEIGHT],
                                [(maxPageX + 1) * PAGE_WIDTH, (maxPageY + 1) * PAGE_HEIGHT],
                            ]}
                            autoPanOnNodeDrag
                            fitView
                            proOptions={{ hideAttribution: true }}
                        >
                            <PagesOverlay
                                minPageX={minPageX}
                                minPageY={minPageY}
                                maxPageX={maxPageX}
                                maxPageY={maxPageY}
                            />
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={16}
                                size={1}
                            />

                            <div style={{ position: "absolute", top: 8, right: 8, padding: "4px 8px", background: "#ffffffcc", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12 }}>
                                Pages: {(maxPageX - minPageX + 1)} x {(maxPageY - minPageY + 1)}
                            </div>
                        </ReactFlow>
                    </div>
                </div>
            </div>
        </ReactFlowProvider>
    );
};

export default ConceptualPage;
