const RectangleIcon = (
    props: React.SVGProps<SVGSVGElement> & { variant?: 'single' | 'double' }
  ) => {
    const {
      width = 30,
      height = 30,
      stroke = '#1F1F1F',
      fill = 'transparent',
      strokeWidth = 1,
      variant = 'single',
      ...rest
    } = props;
  
    const w = Number(width);
    const h = Number(height);
    const rectW = w * 0.8;
    const rectH = h * 0.6;
    const centerX = w / 2;
    const centerY = h / 2;
  
    return (
      <svg
        width={width}
        height={height}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        {...rest}
      >
        <rect
          x={centerX - rectW / 2}
          y={centerY - rectH / 2}
          width={rectW}
          height={rectH}
          rx={rectW * 0.1}
          ry={rectW * 0.1}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
  
        {variant === 'double' && (
          <rect
            x={centerX - rectW * 0.4}
            y={centerY - rectH * 0.4}
            width={rectW * 0.8}
            height={rectH * 0.8}
            rx={rectW * 0.08}
            ry={rectW * 0.08}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
      </svg>
    );
  };
  
  export default RectangleIcon;
  