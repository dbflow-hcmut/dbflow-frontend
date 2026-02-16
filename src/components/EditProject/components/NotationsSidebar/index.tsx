import React, { useState } from "react";
import { Button, Collapse, Dropdown } from "antd";
import { Plus, Table2, MoreVertical, Edit, Trash2 } from "lucide-react";
import type { MenuProps } from "antd";
import RectangleIcon from "@/components/Icons/rectangleIcon";
import OvalIcon from "@/components/Icons/oval";
import PolygonIcon from "@/components/Icons/polygon";
import { ProjectSchemasResponse } from "@/types/projects.type";
import classNames from "classnames";
import { SchemaType } from "@/utils/constants";
import DeleteSchemaModal from "../DeleteSchemaModal";
import RenameSchemaModal from "../RenameSchemaModal";

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
}) => {
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [schemaToDelete, setSchemaToDelete] = useState<ProjectSchemasResponse | null>(null);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [schemaToRename, setSchemaToRename] = useState<ProjectSchemasResponse | null>(null);

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
            <div className="w-64">
                <div className="border-b border-gray-200 my-auto flex items-center justify-between py-2 px-4">
                    <div className="text-lg font-semibold">Pages</div>
                    <Plus className="cursor-pointer" size={18} onClick={onAddPage} />
                </div>

                <div className="border-b border-gray-200 py-2 min-h-40 flex flex-col gap-2">
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
                    <div className="text-lg font-semibold py-2 px-4">Notations</div>
                </div>
                <div className="py-2">
                    <div className="border-b border-gray-200 pb-2 mb-2" hidden={selectedSchema?.type !== SchemaType.CONCEPTUAL}>
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

                    <div className="border-b border-gray-200 pb-2 mb-2" hidden={selectedSchema?.type !== SchemaType.LOGICAL && selectedSchema?.type !== SchemaType.PHYSICAL}>
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
            </div>
        </div>
    );
};

export default NotationsSidebar;

