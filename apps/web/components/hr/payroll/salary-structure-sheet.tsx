"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { X, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { getEmployeeBankAccountByEmployeeIdWithIsPrimary, insertEmployeeBankAccount, insertEmployeeSalaryStructures, listEmployeeSalaryStructuresByEmployeeIdWithEffectiveTo, listPayrollComponentTypes, updateEmployeeBankAccountById, updateEmployeeSalaryStructuresByEmployeeIdWithEffectiveTo } from "@/lib/hr/hr-queries";

interface ComponentType {
  id: string;
  code: string;
  name: string;
  category: string;
  is_system: boolean;
}

interface StructureLine {
  component_type_id: string;
  name: string;
  category: string;
  amount: string; // string for controlled input
}

interface BankAccount {
  id?: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  branch: string;
}

interface Props {
  employee: { id: string; full_name: string; department: string; job_title: string };
  onClose: () => void;
}

export function SalaryStructureSheet({ employee, onClose }: Props) {
  const [componentTypes, setComponentTypes] = useState<ComponentType[]>([]);
  const [lines, setLines] = useState<StructureLine[]>([]);
  const [bank, setBank] = useState<BankAccount>({ bank_name: "", account_number: "", account_name: "", branch: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      listPayrollComponentTypes(),
      listEmployeeSalaryStructuresByEmployeeIdWithEffectiveTo(employee.id),
      getEmployeeBankAccountByEmployeeIdWithIsPrimary(employee.id, "*"),
    ]).then(([typesRes, structRes, bankRes]) => {
      const types = (typesRes.data || []) as ComponentType[];
      setComponentTypes(types);

      // Build lines from existing structure, filtered to non-system earnings & deductions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing: StructureLine[] = ((structRes.data || []) as any[])
        .filter((r) => !r.payroll_component_types?.is_system)
        .map((r) => ({
          component_type_id: r.component_type_id,
          name: r.payroll_component_types?.name ?? "",
          category: r.payroll_component_types?.category ?? "earning",
          amount: String(r.amount),
        }));

      setLines(existing.length > 0 ? existing : []);

      if (bankRes.data) {
        setBank({
          id: (bankRes.data as BankAccount & { id: string }).id,
          bank_name: (bankRes.data as BankAccount).bank_name,
          account_number: (bankRes.data as BankAccount).account_number,
          account_name: (bankRes.data as BankAccount).account_name,
          branch: (bankRes.data as BankAccount).branch ?? "",
        });
      }
      setLoading(false);
    });
  }, [employee.id]);

  function addLine() {
    const first = componentTypes.find((c) => !c.is_system && !lines.some((l) => l.component_type_id === c.id));
    if (!first) return;
    setLines((prev) => [...prev, { component_type_id: first.id, name: first.name, category: first.category, amount: "0" }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof StructureLine, value: string) {
    setLines((prev) => {
      const next = [...prev];
      if (field === "component_type_id") {
        const ct = componentTypes.find((c) => c.id === value);
        next[idx] = { ...next[idx], component_type_id: value, name: ct?.name ?? "", category: ct?.category ?? "earning" };
      } else {
        next[idx] = { ...next[idx], [field]: value };
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Close all current active structures for this employee
    await updateEmployeeSalaryStructuresByEmployeeIdWithEffectiveTo({ effective_to: today }, employee.id);

    // 2. Insert new structure lines
    const inserts = lines
      .filter((l) => parseFloat(l.amount) > 0)
      .map((l) => ({
        employee_id: employee.id,
        component_type_id: l.component_type_id,
        amount: parseFloat(l.amount),
        effective_from: today,
        created_by: user?.id,
      }));

    if (inserts.length > 0) {
      const { error } = await insertEmployeeSalaryStructures(inserts);
      if (error) {
        toast.error("Failed to save salary structure");
        setSaving(false);
        return;
      }
    }

    // 3. Upsert bank account
    if (bank.bank_name && bank.account_number) {
      if (bank.id) {
        await updateEmployeeBankAccountById({
          bank_name: bank.bank_name,
          account_number: bank.account_number,
          account_name: bank.account_name,
          branch: bank.branch,
        }, bank.id);
      } else {
        await insertEmployeeBankAccount({
          employee_id: employee.id,
          bank_name: bank.bank_name,
          account_number: bank.account_number,
          account_name: bank.account_name,
          branch: bank.branch,
          is_primary: true,
        });
      }
    }

    toast.success("Salary structure saved");
    setSaving(false);
    onClose();
  }

  const availableTypes = componentTypes.filter((c) => !c.is_system);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Sheet panel */}
      <div className="w-full max-w-md bg-background flex flex-col shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-base font-semibold">{employee.full_name}</h3>
            <p className="text-xs text-muted-foreground capitalize">{employee.department} · {employee.job_title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Salary components */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">Salary Components</h4>
                <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1 h-7 text-xs">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No components yet. Click Add to start.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={line.component_type_id}
                        onChange={(e) => updateLine(idx, "component_type_id", e.target.value)}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {availableTypes.map((ct) => (
                          <option key={ct.id} value={ct.id}>{ct.name}</option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.amount}
                        onChange={(e) => updateLine(idx, "amount", e.target.value)}
                        className="w-28 text-right"
                        placeholder="0.00"
                      />
                      <button onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-red-500 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              {lines.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {[
                    { label: "Total Earnings", cat: "earning" },
                    { label: "Total Deductions", cat: "deduction" },
                  ].map(({ label, cat }) => {
                    const total = lines
                      .filter((l) => l.category === cat)
                      .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
                    return (
                      <div key={cat} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">${total.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bank account */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Bank Account</h4>
              <div className="space-y-2">
                <Input placeholder="Bank name" value={bank.bank_name} onChange={(e) => setBank((b) => ({ ...b, bank_name: e.target.value }))} />
                <Input placeholder="Account number" value={bank.account_number} onChange={(e) => setBank((b) => ({ ...b, account_number: e.target.value }))} />
                <Input placeholder="Account holder name" value={bank.account_name} onChange={(e) => setBank((b) => ({ ...b, account_name: e.target.value }))} />
                <Input placeholder="Branch (optional)" value={bank.branch} onChange={(e) => setBank((b) => ({ ...b, branch: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
