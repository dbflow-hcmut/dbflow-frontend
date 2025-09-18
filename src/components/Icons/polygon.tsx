const PolygonIcon = (props: React.SVGProps<SVGSVGElement>) => {
    const { width = 20, height = 20, stroke = '#1F1F1F', fill = 'transparent', strokeWidth = 1, ...rest } = props;
    const w = Number(width);
    const h = Number(height);
    const size = Math.min(w, h);
    const rectSize = size * 0.6;
    const centerX = w / 2;
    const centerY = h / 2;
    
    return (
        <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg" {...rest}>
            <rect 
                x={centerX - rectSize / 2} 
                y={centerY - rectSize / 2} 
                width={rectSize} 
                height={rectSize}
                rx={rectSize * 0.1} 
                ry={rectSize * 0.1}
                fill={fill} 
                stroke={stroke} 
                strokeWidth={strokeWidth}
                transform={`rotate(45 ${centerX} ${centerY})`} 
            />
        </svg>
    );
};

export default PolygonIcon;