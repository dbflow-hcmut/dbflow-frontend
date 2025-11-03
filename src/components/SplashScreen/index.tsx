import React from "react";
import Image from "next/image";

export default function SplashScreen(): React.JSX.Element {
    return (
        <div className="fixed inset-0 z-[9999] bg-bg-light text-text-light">
            <div className="flex items-center justify-center h-screen">
                <Image src="/favicon.ico" alt="logo" width={90} height={90} />
            </div>
            <div className="flex flex-col items-center justify-center text-center absolute bottom-10 left-1/2 -translate-x-1/2">
                <div className="text-md text-gray-600 font-semibold">Database Design Tool</div>
                <div className="pt-1 text-primary-500 font-semibold">from HCMUT</div>
            </div>
        </div>
    );
}


