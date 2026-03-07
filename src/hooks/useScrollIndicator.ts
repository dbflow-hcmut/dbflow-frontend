import { useEffect, useRef, useState } from "react";

export const useScrollIndicator = (threshold = 5, dependency: unknown[] = []) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [showScrollDown, setShowScrollDown] = useState(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleScroll = () => {
            const isAtBottom =
                el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;

            setShowScrollDown(!isAtBottom);
        };

        handleScroll();
        el.addEventListener("scroll", handleScroll);

        return () => el.removeEventListener("scroll", handleScroll);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threshold, ...dependency]);

    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    };

    return {
        containerRef,
        showScrollDown,
        scrollToBottom,
    };
};
