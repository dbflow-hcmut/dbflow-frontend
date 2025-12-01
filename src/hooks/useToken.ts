import { useCallback, useEffect, useState } from "react";
import { getToken } from "@/utils/functions";

type UseTokenState = {
    token: string | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
};

export const useToken = (): UseTokenState => {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchToken = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const freshToken = await getToken();
            setToken(freshToken || null);
        } catch (err) {
            setToken(null);
            setError(err instanceof Error ? err.message : "Unable to fetch token");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchToken();
    }, [fetchToken]);

    return {
        token,
        loading,
        error,
        refresh: fetchToken,
    };
};

export default useToken;
