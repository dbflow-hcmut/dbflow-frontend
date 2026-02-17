import React, { useEffect, useRef, useState } from "react";
import { Button, Collapse, Dropdown, theme } from "antd";
import { Plus, Table2, MoreVertical, Edit, Trash2, ChevronDown } from "lucide-react";
import type { MenuProps } from "antd";
import RectangleIcon from "@/components/Icons/rectangleIcon";
import OvalIcon from "@/components/Icons/oval";
import PolygonIcon from "@/components/Icons/polygon";
import { ProjectSchemasResponse } from "@/types/projects.type";
import classNames from "classnames";
import { SchemaType } from "@/utils/constants";
import DeleteSchemaModal from "../DeleteSchemaModal";
import RenameSchemaModal from "../RenameSchemaModal";
import { Node } from "reactflow";
import { NodeData } from "../../index";
import { useScrollIndicator } from "@/hooks/useScrollIndicator";

type NotationsSidebarProps = {
    isOpen: boolean;
    onAddPage: () => void;
    onAddEntity: () => void;
    onAddDoubleEntity: () => void;
    onAddAttribute: () => void;
    onAddMultivaluedAttribute: () => void;
    onAddDashedAttribute: () => void;
    onAddRelationship: () => void;
    onAddDoubleRelationship: () => void;
    onAddConstraint: (symbol: 'd' | 'o' | 'u') => void;
    onAddRelationTable: () => void;
    projectSchemasData: ProjectSchemasResponse[] | null;
    selectedSchema: ProjectSchemasResponse | null;
    setSelectedSchema: (schema: ProjectSchemasResponse) => void;
    projectId: string | null;
    onSchemaDeleted?: () => void;
    nodes: Node<NodeData>[];
    onNodeClick: (nodeId: string) => void;
};

const NotationsSidebar: React.FC<NotationsSidebarProps> = ({
    isOpen,
    onAddPage,
    onAddEntity,
    onAddDoubleEntity,
    onAddAttribute,
    onAddMultivaluedAttribute,
    onAddDashedAttribute,
    onAddRelationship,
    onAddDoubleRelationship,
    onAddConstraint,
    onAddRelationTable,
    projectSchemasData,
    selectedSchema,
    setSelectedSchema,
    projectId,
    onSchemaDeleted,
    nodes,
    onNodeClick,
}) => {
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [schemaToDelete, setSchemaToDelete] = useState<ProjectSchemasResponse | null>(null);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [schemaToRename, setSchemaToRename] = useState<ProjectSchemasResponse | null>(null);
    
    
    const {
        containerRef,
        showScrollDown,
        scrollToBottom
    } = useScrollIndicator(5, [projectSchemasData]);

    const {
        containerRef: structureContainerRef,
        showScrollDown: showStructureScrollDown,
        scrollToBottom: scrollToStructureBottom
    } = useScrollIndicator(5, [nodes, selectedSchema]);

    const handleDeleteClick = (schema: ProjectSchemasResponse, e: React.MouseEvent | React.KeyboardEvent) => {
        if (e?.stopPropagation && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        setSchemaToDelete(schema);
        setDeleteModalOpen(true);
    };

    const handleRenameClick = (schema: ProjectSchemasResponse, e: React.MouseEvent | React.KeyboardEvent) => {
        if (e?.stopPropagation && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        setSchemaToRename(schema);
        setRenameModalOpen(true);
    };

    const handleDeleteSuccess = () => {
        // If deleted schema was selected, select first available schema
        if (schemaToDelete && selectedSchema?.id === schemaToDelete.id) {
            const remainingSchemas = projectSchemasData?.filter(s => s.id !== schemaToDelete.id) || [];
            if (remainingSchemas.length > 0) {
                setSelectedSchema(remainingSchemas[0]);
            }
        }
        // Call callback to refresh schemas
        if (onSchemaDeleted) {
            onSchemaDeleted();
        }
        setSchemaToDelete(null);
    };

    const handleRenameSuccess = () => {
        // Call callback to refresh schemas
        if (onSchemaDeleted) {
            onSchemaDeleted();
        }
        setSchemaToRename(null);
    };

    const getMenuItems = (schema: ProjectSchemasResponse): MenuProps['items'] => [
        {
            key: 'rename',
            label: (
                <div className="flex items-center gap-2">
                    <Edit size={14} />
                    <span>Rename</span>
                </div>
            ),
            onClick: ({ domEvent }) => handleRenameClick(schema, domEvent),
        },
        {
            key: 'delete',
            label: (
                <div className="flex items-center gap-2">
                    <Trash2 size={14} />
                    <span>Delete</span>
                </div>
            ),
            onClick: ({ domEvent }) => handleDeleteClick(schema, domEvent),
            danger: true,
        },
    ];
    return (
        <div
            className={`absolute h-[calc(100vh-160px)] top-1/2 -translate-y-1/2 left-4 flex flex-col items-center gap-2 bg-white z-10 rounded-lg shadow-md transition-all duration-300 ease-in-out ${isOpen
                ? 'opacity-100 translate-x-0 pointer-events-auto'
                : 'opacity-0 -translate-x-full pointer-events-none'
                }`}
        >
            <div className="w-64 h-full flex flex-col py-2">
                <div className="border-b border-gray-200 my-auto flex items-center justify-between py-2 px-4">
                    <div className="text-base font-semibold">Pages</div>
                    <Plus className="cursor-pointer" size={18} onClick={onAddPage} />
                </div>

                <div ref={containerRef} className="border-b border-gray-200 py-2 min-h-40 flex flex-col gap-2 max-h-[160px] overflow-y-auto relative">
                    {projectSchemasData?.map((schema) => (
                        <div
                            key={schema.id}
                            className={classNames("text-sm mx-2 rounded-md p-2 cursor-pointer hover:bg-gray-100", {
                                "bg-gray-100": selectedSchema?.id === schema.id,
                            })}
                            onClick={() => setSelectedSchema(schema)}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs flex-1 truncate">
                                    {schema.name}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={classNames(
                                        "px-2 py-0.5 text-xs font-medium rounded",
                                        {
                                            "bg-green-50 text-green-600": schema.type === SchemaType.CONCEPTUAL,
                                            "bg-amber-50 text-amber-600": schema.type === SchemaType.LOGICAL,
                                            "bg-cyan-50 text-cyan-600": schema.type === SchemaType.PHYSICAL,
                                        }
                                    )}>
                                        {schema.type}
                                    </span>
                                    <Dropdown
                                        menu={{ items: getMenuItems(schema) }}
                                        trigger={['click']}
                                        placement="bottomRight"
                                    >
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                            }}
                                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                                        >
                                            <MoreVertical size={14} className="text-gray-600" />
                                        </button>
                                    </Dropdown>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div
                        onClick={scrollToBottom}
                        className={classNames(
                            "absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur rounded-full p-1 shadow hover:bg-gray-100 transition-all duration-300 cursor-pointer z-10",
                            showScrollDown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
                        )}
                    >
                        <ChevronDown size={16} className="text-gray-600" />
                    </div>
                </div>

                <DeleteSchemaModal
                    open={deleteModalOpen}
                    schema={schemaToDelete}
                    projectId={projectId}
                    onClose={() => {
                        setDeleteModalOpen(false);
                        setSchemaToDelete(null);
                    }}
                    onSuccess={handleDeleteSuccess}
                />

                <RenameSchemaModal
                    open={renameModalOpen}
                    schema={schemaToRename}
                    projectId={projectId}
                    onClose={() => {
                        setRenameModalOpen(false);
                        setSchemaToRename(null);
                    }}
                    onSuccess={handleRenameSuccess}
                />

                <div className="border-b border-gray-200 my-auto">
                    <div className="text-base font-semibold py-2 px-4">Notations</div>
                </div>
                <div className="py-2">
                    <div hidden={selectedSchema?.type !== SchemaType.CONCEPTUAL}>
                        <div className="px-2">
                            <Collapse
                                bordered={false}
                                defaultActiveKey={['1']}
                                expandIconPosition="end"
                                className="!bg-transparent notations-collapse"
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
                                                    onClick={onAddEntity}
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
                                                    onClick={onAddDoubleEntity}
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
                                                    onClick={onAddAttribute}
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
                                                    onClick={onAddMultivaluedAttribute}
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
                                                    onClick={onAddDashedAttribute}
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
                                                    onClick={onAddRelationship}
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
                                                    onClick={onAddDoubleRelationship}
                                                />
                                                <Button
                                                    type="text"
                                                    icon={<div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-[12px] font-bold">d</div>}
                                                    onClick={() => onAddConstraint('d')}
                                                />
                                                <Button
                                                    type="text"
                                                    icon={<div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-[12px] font-bold">o</div>}
                                                    onClick={() => onAddConstraint('o')}
                                                />
                                                <Button
                                                    type="text"
                                                    icon={<div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-[12px] font-bold">u</div>}
                                                    onClick={() => onAddConstraint('u')}
                                                />
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>

                    <div hidden={selectedSchema?.type !== SchemaType.LOGICAL && selectedSchema?.type !== SchemaType.PHYSICAL}>
                        <div className="px-2">
                            <Collapse
                                bordered={false}
                                defaultActiveKey={['1']}
                                expandIconPosition="end"
                                className="!bg-transparent notations-collapse"
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
                                                    onClick={onAddRelationTable}
                                                />
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>
                </div>

                {/* Diagram Structure */}
                <div className="border-y border-gray-200 my-auto">
                    <div className="text-base font-semibold py-2 px-4">Diagram Structure</div>
                </div>
                <div ref={structureContainerRef} className="py-2 flex-1 overflow-y-auto min-h-0 relative">
                    <div hidden={selectedSchema?.type !== SchemaType.CONCEPTUAL}>
                        <div className="px-2">
                            <Collapse
                                bordered={false}
                                defaultActiveKey={['1']}
                                expandIconPosition="end"
                                className="!bg-transparent notations-collapse"
                                items={[
                                    {
                                        key: '1',
                                        label: <div className="font-bold">Entities</div>,
                                        children: (
                                            <div className="flex flex-col gap-1">
                                                {nodes.filter(node => node.type === 'entity').map(node => (
                                                    <div
                                                        key={node.id}
                                                        className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer group"
                                                        onClick={() => onNodeClick(node.id)}
                                                    >
                                                        <div className="flex flex-col items-center">
                                                            <RectangleIcon
                                                                width={20}
                                                                height={14}
                                                                strokeWidth={1.5}
                                                                variant="single"
                                                            />
                                                        </div>
                                                        <span className="text-sm truncate flex-1">{(node.data as { name: string }).name}</span>
                                                    </div>
                                                ))}
                                                {nodes.filter(node => node.type === 'entity').length === 0 && (
                                                    <div className="text-xs text-gray-400 text-center py-2">No entities</div>
                                                )}
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>

                    <div hidden={selectedSchema?.type !== SchemaType.CONCEPTUAL}>
                        <div className="px-2">
                            <Collapse
                                bordered={false}
                                defaultActiveKey={['1']}
                                expandIconPosition="end"
                                className="!bg-transparent notations-collapse"
                                items={[
                                    {
                                        key: '1',
                                        label: <div className="font-bold">Relationships</div>,
                                        children: (
                                            <div className="flex flex-col gap-1">
                                                {nodes.filter(node => node.type === 'relationship').map(node => (
                                                    <div
                                                        key={node.id}
                                                        className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer group"
                                                        onClick={() => onNodeClick(node.id)}
                                                    >
                                                        <div className="flex flex-col items-center">
                                                            <PolygonIcon
                                                                width={20}
                                                                height={14}
                                                                strokeWidth={1.5}
                                                                variant="single"
                                                            />
                                                        </div>
                                                        <span className="text-sm truncate flex-1">{(node.data as { name: string }).name}</span>
                                                    </div>
                                                ))}
                                                {nodes.filter(node => node.type === 'relationship').length === 0 && (
                                                    <div className="text-xs text-gray-400 text-center py-2">No relationships</div>
                                                )}
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>

                    <div hidden={selectedSchema?.type !== SchemaType.LOGICAL && selectedSchema?.type !== SchemaType.PHYSICAL}>
                        <div className="px-2">
                            <Collapse
                                bordered={false}
                                defaultActiveKey={['1']}
                                expandIconPosition="end"
                                className="!bg-transparent notations-collapse"
                                items={[
                                    {
                                        key: '1',
                                        label: <div className="font-bold">Tables</div>,
                                        children: (
                                            <div className="flex flex-col gap-1">
                                                {nodes.filter(node => node.type === 'relation').map(node => (
                                                    <div
                                                        key={node.id}
                                                        className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer group"
                                                        onClick={() => onNodeClick(node.id)}
                                                    >
                                                        <div className="flex flex-col items-center">
                                                            <Table2 size={16} strokeWidth={1.5} />
                                                        </div>
                                                        <span className="text-sm truncate flex-1">{(node.data as { name: string }).name}</span>
                                                    </div>
                                                ))}
                                                {nodes.filter(node => node.type === 'relation').length === 0 && (
                                                    <div className="text-xs text-gray-400 text-center py-2">No tables</div>
                                                )}
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>

                    <div
                        onClick={scrollToStructureBottom}
                        className={classNames(
                            "absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur rounded-full p-1 shadow hover:bg-gray-100 transition-all duration-300 cursor-pointer z-10",
                            showStructureScrollDown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
                        )}
                    >
                        <ChevronDown size={16} className="text-gray-600" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotationsSidebar;

