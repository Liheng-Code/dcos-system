"use client";

import { useEffect, useState } from "react";
import { deleteCoaAccount, listCoaAccounts } from "@/lib/account/account-service";
import { Loader2, Plus, Pencil, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CoaForm } from "./coa-form";

interface CoaNode {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  normal_balance: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  children: CoaNode[];
}

const TYPE_COLORS: Record<string, string> = {
  asset: "text-blue-600",
  liability: "text-amber-600",
  equity: "text-purple-600",
  income: "text-green-600",
  expense: "text-red-600",
};

const BALANCE_LABELS: Record<string, string> = {
  debit: "Dr",
  credit: "Cr",
};

export function CoaTree() {
  const [accounts, setAccounts] = useState<CoaNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingAccount, setEditingAccount] = useState<CoaNode | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    listCoaAccounts().then(({ data }) => {
      if (data) {
        const nodes = data as CoaNode[];
        const map = new Map(nodes.map(n => [n.id, { ...n, children: [] as CoaNode[] }]));
        const roots: CoaNode[] = [];
        for (const n of map.values()) {
          if (n.parent_id && map.has(n.parent_id)) {
            map.get(n.parent_id)!.children.push(n);
          } else {
            roots.push(n);
          }
        }
        setAccounts(roots);
      }
      setLoading(false);
    });
  }, []);

  const filterTree = (nodes: CoaNode[]): CoaNode[] => {
    if (!search) return nodes;
    return nodes
      .map(n => ({
        ...n,
        children: filterTree(n.children),
      }))
      .filter(n =>
        n.code.toLowerCase().includes(search.toLowerCase()) ||
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.children.length > 0
      );
  };

  function toggleNode(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account? Children will be unlinked.")) return;
    const { error } = await deleteCoaAccount(id);
    if (error) { toast.error(error.message); return; }
    toast.success("Account deleted");
    setAccounts(prev => removeNode(prev, id));
  }

  function removeNode(nodes: CoaNode[], id: string): CoaNode[] {
    return nodes.filter(n => {
      if (n.id === id) return false;
      n.children = removeNode(n.children, id);
      return true;
    });
  }

  function renderNode(node: CoaNode, depth: number) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isLeaf = !hasChildren;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors ${depth === 0 ? "font-semibold text-base mt-1" : ""}`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleNode(node.id)} className="text-muted-foreground">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{node.code}</span>
          <span className="flex-1 truncate">{node.name}</span>
          <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[node.type] ?? ""}`}>
            {node.type}
          </Badge>
          <span className="text-[10px] text-muted-foreground w-6 text-right">{BALANCE_LABELS[node.normal_balance] ?? ""}</span>
          {!node.is_active && (
            <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingAccount(node); setShowForm(true); }}>
            <Pencil className="h-3 w-3" />
          </Button>
          {isLeaf && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDelete(node.id)}>
              <span className="text-red-500 text-xs">×</span>
            </Button>
          )}
        </div>
        {isExpanded && hasChildren && node.children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  }

  const filtered = filterTree(accounts);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (showForm) {
    return (
      <CoaForm
        account={editingAccount}
        onSaved={() => { setShowForm(false); setEditingAccount(null); }}
        onCancel={() => { setShowForm(false); setEditingAccount(null); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditingAccount(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Account
        </Button>
      </div>

      <div className="rounded-lg border divide-y">
        <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 flex items-center gap-2">
          <span className="w-4" />
          <span className="w-16">Code</span>
          <span className="flex-1">Name</span>
          <span className="w-16">Type</span>
          <span className="w-6">Bal</span>
          <span className="w-16" />
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {search ? "No accounts match your search." : "No accounts yet. Add your first account."}
          </div>
        ) : (
          filtered.map(n => renderNode(n, 0))
        )}
      </div>
    </div>
  );
}
