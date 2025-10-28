import * as React from 'react';
const SuccessIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={14}
    height={14}
    viewBox="0 0 14 14"
    fill="none"
    {...props}
  >
    <path
      d="M7 0a7 7 0 1 0 .001 14.001A7 7 0 0 0 7 0Zm3.023 4.714-3.29 4.563a.497.497 0 0 1-.808 0l-1.948-2.7a.125.125 0 0 1 .101-.199h.733a.5.5 0 0 1 .405.208L6.328 8.13l2.456-3.407a.5.5 0 0 1 .405-.207h.733c.101 0 .16.115.101.198Z"
      fill="#4B721D"
    />
  </svg>
);
export default SuccessIcon;
