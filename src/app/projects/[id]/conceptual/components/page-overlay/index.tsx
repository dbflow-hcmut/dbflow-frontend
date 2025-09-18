import { PAGE_HEIGHT, PAGE_WIDTH } from "@/utils/constants";
import { useViewport } from "reactflow";

export interface IPagesOverlayProps {
    minPageX: number;
    minPageY: number;
    maxPageX: number;
    maxPageY: number;
}

const PagesOverlay: React.FC<IPagesOverlayProps> = (props) => {
    const { minPageX, minPageY, maxPageX, maxPageY } = props;
    
    const { x, y, zoom } = useViewport();

    const cols = Array.from({ length: maxPageX - minPageX + 1 }, (_, i) => i + minPageX);
    const rows = Array.from({ length: maxPageY - minPageY + 1 }, (_, i) => i + minPageY);

    return (
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
          {rows.map((ry) => (
            cols.map((cx) => (
              <g key={`${cx},${ry}`}>
                <rect
                  x={cx * PAGE_WIDTH}
                  y={ry * PAGE_HEIGHT}
                  width={PAGE_WIDTH}
                  height={PAGE_HEIGHT}
                  fill="none"
                  stroke="#E0E0E0"
                  opacity={0.8}
                  strokeWidth={1}
                />
              </g>
            ))
          ))}
        </g>
      </svg>
    );
  };

  export default PagesOverlay;