type OvalIconVariant = 'single' | 'double' | 'dashed';

const OvalIcon = (
    props: React.SVGProps<SVGSVGElement> & { doubleLine?: boolean; variant?: OvalIconVariant }
) => {
    const { 
        width = 20, 
        height = 20, 
        stroke = '#1F1F1F', 
        fill = 'transparent', 
        doubleLine = false,
        variant,
        ...rest 
    } = props;

    const w = Number(width);
    const h = Number(height);
    const cx = w / 2;
    const cy = h / 2;

    const resolvedVariant: OvalIconVariant = variant ?? (doubleLine ? 'double' : 'single');

    return (
        <svg
            width={width}
            height={height}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            {...rest}
        >
            <ellipse
                cx={cx}
                cy={cy}
                rx={w * 0.45}
                ry={h * 0.3}
                stroke={stroke}
                fill={fill}
                strokeWidth="1.5"
                strokeDasharray={resolvedVariant === 'dashed' ? '5 4' : undefined}
            />
            
            {resolvedVariant === 'double' && (
                <ellipse
                    cx={cx}
                    cy={cy}
                    rx={w * 0.38}
                    ry={h * 0.23}
                    stroke={stroke}
                    fill="none"
                    strokeWidth="1.5"
                />
            )}
        </svg>
    );
};

export default OvalIcon;
