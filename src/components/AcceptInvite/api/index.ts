import useSWRMutation from "swr/mutation";
import { apiPost } from "@/lib/clientFetch";
import { PROXY_PROJECTS } from "@/api";

export function useAcceptInvite() {
  const { trigger, isMutating } = useSWRMutation(
    "accept-invite",
    async (_key: string, { arg }: { arg: { token: string } }) => {
      const url = `${PROXY_PROJECTS}/invitations/accept`;
      return await apiPost<unknown, { token: string }>(url, {
        token: arg.token,
      });
    }
  );

  return {
    acceptInvite: trigger,
    isLoading: isMutating,
  };
}
