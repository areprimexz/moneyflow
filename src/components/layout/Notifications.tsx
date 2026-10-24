import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck } from "lucide-react";
import { getAsset } from "@shared/assets";
import { formatQty, formatRelative, formatUsd } from "@shared/format";
import { useTransactions } from "@/lib/queries";
import { TX_ICON, TX_LABEL } from "@/lib/txMeta";
import { useNow } from "@/lib/useNow";
import { Menu, MenuLabel } from "@/components/ui/menu";
import { DropdownMenu } from "radix-ui";

const KEY = "flux.notifications.seenAt";

function readSeen(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Notification centre: the most recent ledger events (every item is a real ledger entry). */
export function Notifications() {
  const { data } = useTransactions();
  const [seenAt, setSeenAt] = useState(readSeen);
  const navigate = useNavigate();
  const now = useNow(30_000);
  const recent = useMemo(() => (data ?? []).slice(0, 8), [data]);
  const unread = recent.filter((t) => t.createdAt > seenAt).length;
  const markRead = () => {
    const t = Date.now();
    setSeenAt(t);
    try {
      localStorage.setItem(KEY, String(t));
    } catch {
      /* ignore */
    }
  };
  return (
    <Menu
      className="w-[340px] max-w-[calc(100vw-16px)]"
      trigger={
        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-semibold text-accent-fg">{unread}</span>}
        </button>
      }
    >
      <div className="flex items-center justify-between pr-1">
        <MenuLabel>Ledger activity</MenuLabel>
        <button onClick={markRead} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-hover hover:text-fg">
          <CheckCheck className="h-3.5 w-3.5" /> Mark all read
        </button>
      </div>
      {recent.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No activity yet.</p>}
      {recent.map((t) => {
        const Icon = TX_ICON[t.type];
        const asset = getAsset(t.asset);
        return (
          <DropdownMenu.Item
            key={t.id}
            onSelect={() => navigate(`/transactions/${t.id}`)}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-hover"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated text-muted">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] text-fg">
                  {TX_LABEL[t.type]} {t.asset !== "USD" ? t.asset : ""}
                </span>
                {t.createdAt > seenAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
              </span>
              <span className="num block truncate text-xs text-muted">
                {t.quantity && asset ? `${formatQty(t.quantity, asset.qtyDecimals, { trim: true })} ${t.asset} · ` : ""}
                {formatUsd(t.net)} · {formatRelative(t.createdAt, now)}
              </span>
            </span>
          </DropdownMenu.Item>
        );
      })}
      <DropdownMenu.Separator className="my-1 h-px bg-line" />
      <DropdownMenu.Item onSelect={() => navigate("/transactions")} className="cursor-pointer rounded-lg px-2.5 py-2 text-center text-xs text-accent outline-none data-[highlighted]:bg-hover">
        View all transactions
      </DropdownMenu.Item>
    </Menu>
  );
}
