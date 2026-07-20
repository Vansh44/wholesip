import { requireSectionAccess } from "../lib/access";
import { getChannelState } from "@/app/actions/payment-provider-actions";
import { ChannelsClient } from "./channels-client";

export const metadata = { title: "Channels" };

export default async function ChannelsPage() {
  const access = await requireSectionAccess("channels", "view");
  const state = await getChannelState();
  return (
    <ChannelsClient
      initialState={state}
      canManage={access.can("channels", "manage")}
    />
  );
}
