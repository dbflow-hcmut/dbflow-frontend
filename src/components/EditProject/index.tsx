"use client";

import { API_AVATAR } from "@/utils/constants";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
    addEdge,
    Connection,
    Edge,
    Node,
    OnConnect,
    EdgeTypes,
    ReactFlowProvider,
    useReactFlow,
    useViewport,
    useEdgesState,
    useNodesState,
    ConnectionLineType,
    Background,
    BackgroundVariant,
    SelectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import { Avatar, Button, Collapse, Tooltip } from "antd";
import { Blocks, CloudCheck, Download, EllipsisVertical, MessageCircle, History, Search, Send, Share, TvMinimal, MousePointer2, Hand, StickyNote, Type, ArrowUpRight, PenTool, MessageCircleMore, Sparkles, Plus, Minus, Maximize2, Smile, ThumbsUp, PartyPopper, MessageCircleQuestionMark, Redo, Undo, RectangleHorizontal, Table2 } from "lucide-react";
import classNames from "classnames";
import OvalIcon from "@/components/Icons/oval";
import PolygonIcon from "@/components/Icons/polygon";
import Image from "next/image";
import RelationshipNode from "@/components/erds-notations/relationship";
import AttributeNode from "@/components/erds-notations/attribute";
import EntityNode from "@/components/erds-notations/entity";
import ConstraintNode from "@/components/erds-notations/constraint";
import RelationTableNode, { type RelationTableData } from "@/components/erds-notations/relation-table";
import ErdEdge from "@/components/erd-edge";
import SearchModal from "./components/SearchModal";
import RectangleIcon from "../Icons/rectangleIcon";

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
    variant?: 'single' | 'double' | 'dashed';
};

type RelationshipData = {
    name: string;
    variant?: 'single' | 'double' | 'dashed';
};

type AttributeData = {
    name: string;
    isKey?: boolean;
    variant?: 'single' | 'double' | 'dashed';
};

type ConstraintData = { symbol: 'd' | 'o' | 'u' };

type NodeData = EntityData | RelationshipData | AttributeData | ConstraintData | RelationTableData;

const initialNodes: Node<NodeData>[] = [];

const initialEdges: Edge[] = [];

const ZoomControls: React.FC = () => {
    const { zoomIn, zoomOut, fitView } = useReactFlow();
    const { zoom } = useViewport();
    const percentage = Math.round(zoom * 100);

    return (
        <>
            <Button
                type="text"
                className="!px-2"
                onClick={() => zoomIn()}
            >
                <Plus size={18} />
            </Button>
            <div className="px-1 text-sm font-semibold w-12 text-center">
                {percentage}%
            </div>
            <Button
                type="text"
                className="!px-2"
                onClick={() => zoomOut()}
            >
                <Minus size={18} />
            </Button>
            <Button
                type="text"
                className="!px-2"
                onClick={() => fitView({ padding: 0.2 })}
            >
                <Maximize2 size={18} />
            </Button>
        </>
    );
};

const EditProject: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [isOpenSidebar, setIsOpenSidebar] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(224);
    const [isResizing, setIsResizing] = useState(false);
    const [diagramName, setDiagramName] = useState("Blank diagram");
    const [isEditingDiagramName, setIsEditingDiagramName] = useState(false);
    const inputRef = useRef(null);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isAddingNode, setIsAddingNode] = useState(false);

    useEffect(() => {
        if (isEditingDiagramName && inputRef.current) {
            (inputRef.current as HTMLInputElement).focus();
        }
    }, [isEditingDiagramName]);




    const nodeTypes = useMemo(
        () => ({
            relationship: RelationshipNode,
            attribute: AttributeNode,
            entity: EntityNode,
            constraint: ConstraintNode,
            relation: RelationTableNode,
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
                data: { name: id, variant: 'single' },
                style: { width: 100, height: 80 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addDoubleRelationship = useCallback(() => {
        setNodes((existingNodes) => {
            const id = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: { x: 1000 + existingNodes.length * 30, y: 1000 + existingNodes.length * 25 },
                data: { name: id, variant: 'double' },
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
                data: { name: id, fields: [], variant: 'single' },
                style: { width: 100, height: 50 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addDoubleEntity = useCallback(() => {
        setNodes((existingNodes) => {
            const id = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: { x: 1000 + existingNodes.length * 25, y: 1000 + existingNodes.length * 20 },
                data: { name: id, fields: [], variant: 'double' },
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
                data: { name: id, variant: 'single' },
                style: { width: 100, height: 50 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addMultivaluedAttribute = useCallback(() => {
        setNodes((existingNodes) => {
            const id = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: { x: 1000 + existingNodes.length * 35, y: 1000 + existingNodes.length * 20 },
                data: { name: id, variant: 'double' },
                style: { width: 100, height: 50 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addDashedAttribute = useCallback(() => {
        setNodes((existingNodes) => {
            const id = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: { x: 1000 + existingNodes.length * 35, y: 1000 + existingNodes.length * 20 },
                data: { name: id, variant: 'dashed' },
                style: { width: 100, height: 50 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addConstraint = useCallback((symbol: 'd' | 'o' | 'u') => {
        setNodes((existingNodes) => {
            const id = `cst_${existingNodes.length + 1}`;
            const newNode: Node<ConstraintData> = {
                id,
                type: "constraint",
                position: { x: 1000 + existingNodes.length * 20, y: 1000 + existingNodes.length * 15 },
                data: { symbol },
                style: { width: 36, height: 36 },
                selected: true,
            };
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);

    const addRelationTable = useCallback(() => {
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
            return [...existingNodes.map((n) => ({ ...n, selected: false })), newNode];
        });
    }, [setNodes]);



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

    useEffect(() => {
        const handleGlobalFindShortcut = (event: KeyboardEvent) => {
            const isFindShortcut = (event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F');
            if (!isFindShortcut) return;
            event.preventDefault();
            setIsSearchModalOpen(true);
        };

        window.addEventListener('keydown', handleGlobalFindShortcut);
        return () => window.removeEventListener('keydown', handleGlobalFindShortcut);
    }, []);

    return (
        <ReactFlowProvider>
            <div className="h-screen w-full">
                <div className="pt-4 bg-transparent flex items-center justify-between px-4 fixed top-0 z-10 w-full">
                    <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                        <div className="cursor-pointer mx-2">
                            <Image width={26} height={26} src="/dbflow.png" alt="Logo" />
                        </div>
                        {!isEditingDiagramName ? (
                            <div
                                className="text-md leading-none font-semibold px-2 py-1 bg-transparent hover:bg-gray-100 rounded-md cursor-pointer max-w-[300px] truncate"
                                onClick={() => setIsEditingDiagramName(true)}
                                title={diagramName}
                            >
                                {diagramName}
                            </div>
                        ) : (
                            <input
                                ref={inputRef}
                                className="text-md leading-none font-semibold px-2 py-1 bg-transparent border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[300px]"
                                value={diagramName}
                                onChange={(e) => setDiagramName(e.target.value)}
                                onBlur={() => setIsEditingDiagramName(false)}
                                style={{
                                    width: `${Math.min(diagramName.length * 9 + 16, 300)}px`,
                                }}
                            />
                        )}
                        <Button
                            type="text"
                            className="!px-2"
                            onClick={() => setIsSearchModalOpen(true)}
                        >
                            <Search size={18} />
                        </Button>
                        <Button
                            type="text"
                            className="!px-2"
                        >
                            <EllipsisVertical size={18} />
                        </Button>
                        <Button
                            type="text"
                            className="!px-2"
                        >
                            <Download size={18} />
                        </Button>
                        <Button
                            type="primary"
                            className="!px-3 gap-2 flex items-center"
                        >
                            <Send className="text-white" size={18} />
                            <span className="font-semibold">Share</span>
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                        <Button
                            type="text"
                            className="!px-2"
                        >
                            <div className="flex items-center">
                                <Smile size={18} />
                                <ThumbsUp size={18} />
                                <PartyPopper size={18} />
                            </div>
                        </Button>
                        <Button
                            type="text"
                            className="!px-2"
                        >
                            <History size={18} />
                        </Button>
                        <Button
                            type="text"
                            className="!px-2"
                        >
                            <MessageCircle size={18} />
                        </Button>
                        <div className="rounded-xl py-1 h-10 flex items-center">
                            <Avatar.Group
                            max={{
                                count: 2,
                                style: { color: '#f56a00', backgroundColor: '#fde3cf', width: 24, height: 24 },
                            }}
                            >
                                <Avatar size={24} src={`${API_AVATAR}/?name=Thành+Tài&background=random&size=512`} />
                                <Avatar size={24} src={`${API_AVATAR}/?name=Thành+Tài&background=random&size=512`} />
                                <Avatar size={24} src={`${API_AVATAR}/?name=Thành+Tài&background=random&size=512`} />
                            </Avatar.Group>
                        </div>
                        <Button
                            type="primary"
                            className="!px-3 gap-2 flex items-center"
                        >
                            <TvMinimal className="text-white" size={18} />
                            <span className="font-semibold">Present</span>
                        </Button>
                    </div>
                </div>
                <div className="flex h-full">

                    <div 
                        className="absolute h-[calc(100vh-160px)] top-1/2 -translate-y-1/2 left-4 flex flex-col items-center gap-2 bg-white z-10 rounded-lg shadow-md"
                        hidden={!isOpenSidebar}
                    >
                        <div className="w-64">
                            <div className="border-b border-gray-200 my-auto">
                                <div className="text-lg font-semibold py-2 px-4">Notations</div>
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
                                                    label: <div className="font-bold">Conceptual Schema</div>,
                                                    children: (
                                                        <div className="grid grid-cols-5 gap-2">
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <RectangleIcon
                                                                            strokeWidth={1}
                                                                            variant="single"
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addEntity}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <RectangleIcon
                                                                            strokeWidth={1}
                                                                            variant="double"
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addDoubleEntity}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <OvalIcon
                                                                            width={30}
                                                                            height={30}
                                                                            strokeWidth={1}
                                                                            variant="single"
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addAttribute}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <OvalIcon
                                                                            width={30}
                                                                            height={30}
                                                                            strokeWidth={1}
                                                                            variant="double"
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addMultivaluedAttribute}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <OvalIcon
                                                                            width={30}
                                                                            height={30}
                                                                            strokeWidth={1}
                                                                            variant="dashed"
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addDashedAttribute}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <PolygonIcon
                                                                            width={25}
                                                                            height={25}
                                                                            strokeWidth={1}
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addRelationship}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <PolygonIcon
                                                                            width={25}
                                                                            height={25}
                                                                            strokeWidth={1}
                                                                            variant="double"
                                                                        />
                                                                    </div>
                                                                }
                                                                onClick={addDoubleRelationship}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={<div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-[12px] font-bold">d</div>}
                                                                onClick={() => addConstraint('d')}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={<div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-[12px] font-bold">o</div>}
                                                                onClick={() => addConstraint('o')}
                                                            />
                                                            <Button
                                                                type="text"
                                                                icon={<div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-[12px] font-bold">u</div>}
                                                                onClick={() => addConstraint('u')}
                                                            />
                                                        </div>
                                                    ),
                                                },
                                            ]}  
                                        />
                                    </div>
                                </div>

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
                                                    label: <div className="font-bold">Logical & Physical Schema</div>,
                                                    children: (
                                                        <div className="grid grid-cols-5 gap-2">
                                                            <Button
                                                                type="text"
                                                                icon={
                                                                    <div className="flex flex-col items-center">
                                                                        <Table2 strokeWidth={1} />
                                                                    </div>
                                                                }
                                                                                    onClick={addRelationTable}
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
                    </div>
                    <div className="flex-1 h-full">
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
                            onPaneClick={handlePaneClick}
                            selectionOnDrag
                            selectionMode={SelectionMode.Partial}
                            multiSelectionKeyCode={["Shift", "Meta"]}
                            autoPanOnNodeDrag
                            fitView
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={16}
                                size={1}
                            />
                        </ReactFlow>
                    </div>
                </div>

                <div className="pb-4 bg-transparent flex items-center justify-between px-4 fixed bottom-0 z-10 w-full">
                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center justify-center">
                            <div className="bg-primary-700 h-16 w-16 rounded-full absolute left-0 z-20 flex items-center justify-center cursor-pointer">
                                <Plus size={24} className="text-white" />
                            </div>
                            <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 pl-8 py-2 h-12 ml-10">                        
                                <Button
                                    type="primary"
                                    className="!px-2"
                                >
                                    <MousePointer2 size={18} />
                                </Button>
                                <Button
                                    type="text"
                                    className="!px-2"
                                >
                                    <Hand size={18} />
                                </Button>
                                <Button
                                    type="text"
                                    className="!px-2"
                                >
                                    <StickyNote size={18} />
                                </Button>
                                <Button
                                    type="text"
                                    className="!px-2"
                                >
                                    <Type size={18} />
                                </Button>
                                <Button
                                    type="text"
                                    className="!px-2"
                                >
                                    <ArrowUpRight size={18} />
                                </Button>
                                <Button
                                    type="text"
                                    className="!px-2"
                                >
                                    <PenTool size={18} />
                                </Button>
                                <Button
                                    type="text"
                                    className="!px-2"
                                >
                                    <MessageCircleMore size={18} />
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12 w-12 justify-center cursor-pointer">                        
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="url(#spark-gradient)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lucide lucide-sparkles"
                                >
                                <defs>
                                    <linearGradient id="spark-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="var(--color-primary)" />
                                    <stop offset="100%" stopColor="var(--color-yellow-500)" />
                                    </linearGradient>
                                </defs>

                                <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                                <path d="M20 2v4" />
                                <path d="M22 4h-4" />
                                <circle cx="4" cy="20" r="2" />
                            </svg>
                        </div>
                        
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12 w-12 justify-center cursor-pointer">                        
                            <Undo size={24} />
                        </div>
                        <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12 w-12 justify-center cursor-pointer">                        
                            <Redo size={24} />
                        </div>
                        <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                            <ZoomControls />
                            <Button
                                type="text"
                                className="!px-2"
                            >
                                <MessageCircleQuestionMark size={18} />
                            </Button>
                        </div>
                    </div>
                </div>

                <SearchModal open={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />
            </div>
        </ReactFlowProvider>
    );
};

export default EditProject;
