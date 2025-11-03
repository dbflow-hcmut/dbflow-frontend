import React from "react";
import { Button, Collapse } from "antd";
import { Plus, Table2 } from "lucide-react";
import RectangleIcon from "@/components/Icons/rectangleIcon";
import OvalIcon from "@/components/Icons/oval";
import PolygonIcon from "@/components/Icons/polygon";

type NotationsSidebarProps = {
    isOpen: boolean;
    onAddEntity: () => void;
    onAddDoubleEntity: () => void;
    onAddAttribute: () => void;
    onAddMultivaluedAttribute: () => void;
    onAddDashedAttribute: () => void;
    onAddRelationship: () => void;
    onAddDoubleRelationship: () => void;
    onAddConstraint: (symbol: 'd' | 'o' | 'u') => void;
    onAddRelationTable: () => void;
};

const NotationsSidebar: React.FC<NotationsSidebarProps> = ({
    isOpen,
    onAddEntity,
    onAddDoubleEntity,
    onAddAttribute,
    onAddMultivaluedAttribute,
    onAddDashedAttribute,
    onAddRelationship,
    onAddDoubleRelationship,
    onAddConstraint,
    onAddRelationTable,
}) => {
    return (
        <div 
            className={`absolute h-[calc(100vh-160px)] top-1/2 -translate-y-1/2 left-4 flex flex-col items-center gap-2 bg-white z-10 rounded-lg shadow-md transition-all duration-300 ease-in-out ${
                isOpen 
                    ? 'opacity-100 translate-x-0 pointer-events-auto' 
                    : 'opacity-0 -translate-x-full pointer-events-none'
            }`}
        >
            <div className="w-64">
                <div className="border-b border-gray-200 my-auto flex items-center justify-between py-2 px-4">
                    <div className="text-lg font-semibold">Pages</div>
                    <Plus className="cursor-pointer" size={18} />
                </div>

                <div className="border-b border-gray-200 py-2 min-h-10 flex flex-col gap-2">
                    <div className="text-sm mx-2 bg-gray-100 rounded-md p-2 cursor-pointer hover:bg-gray-100">
                        Page 1
                    </div>
                    <div className="text-sm mx-2 rounded-md p-2 cursor-pointer hover:bg-gray-100">
                        Page 2
                    </div>
                </div>

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

