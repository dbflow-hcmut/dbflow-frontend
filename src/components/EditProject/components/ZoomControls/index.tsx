import { Button } from "antd";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useReactFlow, useViewport } from "reactflow";

export default function ZoomControls() {
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