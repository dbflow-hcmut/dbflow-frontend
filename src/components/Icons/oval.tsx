const OvalIcon = (props: React.SVGProps<SVGSVGElement>) => {
    const { width = 20, height = 20, stroke = '#1F1F1F', fill = 'transparent', ...rest } = props;
    const w = Number(width);
    const h = Number(height);
    return (
        <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg" {...rest}>
            <ellipse cx={w/2} cy={h/2} rx={w*0.4} ry={h*0.3} stroke={stroke} fill={fill} strokeWidth="1"/>
        </svg>
    );
};

export default OvalIcon;