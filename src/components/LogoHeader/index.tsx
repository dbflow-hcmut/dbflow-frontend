"use client";

import classNames from 'classnames';
import { useRouter } from "next/navigation";
import Image from "next/image";

type LogoHeaderProps = {
    size?: 'medium' | 'large' | 'extra-large';
    hiddenText?: boolean;
}

const LogoHeader = ({ size = 'medium', hiddenText = false }: LogoHeaderProps) => {
    const router = useRouter();

    return (
        <div className='cursor-pointer' onClick={() => router.push('/')}>
            <div className="flex items-center gap-2">
                <Image priority src="/favicon.ico" alt="logo" height={size === 'extra-large' ? 64 : size === 'large' ? 43 : 24} width={size === 'extra-large' ? 64 : size === 'large' ? 43 : 24} />
                <div hidden={hiddenText} className={classNames("font-bold text-primary-500", { 'text-3xl': size === 'extra-large', 'text-2xl': size === 'large', 'text-lg': size === 'medium' })}>DB Flow</div>
            </div>
        </div>
    )
}

export default LogoHeader;