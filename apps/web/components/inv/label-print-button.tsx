"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Printer, Tag } from "lucide-react"

// NOTE: no barcode/QR-code library (jsbarcode, qrcode, react-qr-code, etc.) is
// installed in this project yet — see package.json. Per instructions this
// component must not add a new npm dependency (pnpm cannot be run reliably in
// this environment). Until a real library is installed, this renders a
// print-friendly text label with a purely decorative bar pattern derived from
// the code — it is NOT a scannable Code-128/QR barcode. Track "install a real
// barcode/QR library" as a follow-up; swapping the placeholder <div> below for
// e.g. <Barcode value={data.code} /> is then a small, isolated change.

interface LabelData {
  code: string
  description: string
  uom: string
}

type LabelType = "item" | "bin" | "tool"

interface LabelPrintButtonProps {
  type: LabelType
  id: string
  label?: string
  variant?: "outline" | "ghost" | "default" | "secondary"
  size?: "sm" | "default" | "icon"
  className?: string
}

export function LabelPrintButton({
  type,
  id,
  label = "Print Label",
  variant = "outline",
  size = "sm",
  className,
}: LabelPrintButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<LabelData | null>(null)

  async function handleOpen() {
    setOpen(true)
    setLoading(true)
    setData(null)
    try {
      const res = await fetch(`/api/inv/labels/${type}/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load label data")
      setData(json.data as LabelData)
    } catch (err) {
      toast.error((err as Error).message)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={handleOpen} className={className}>
        <Tag className="h-3.5 w-3.5" />
        {size !== "icon" && <span className="ml-1.5">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Print Label</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <>
              {/* Print-only visibility rules: hide everything except the label card. */}
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  #inv-label-print-area, #inv-label-print-area * { visibility: visible; }
                  #inv-label-print-area {
                    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
                  }
                }
              `}</style>

              <div id="inv-label-print-area" className="flex justify-center py-2">
                <div className="w-64 rounded-md border-2 border-foreground/80 p-4 text-center font-mono">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{type} label</p>
                  <p className="mt-1 break-all text-lg font-bold tracking-tight">{data.code}</p>

                  {/* Decorative bar pattern — not a scannable barcode, see note above. */}
                  <div className="my-3 flex h-10 items-end justify-center gap-[1.5px]" aria-hidden="true">
                    {Array.from(data.code || data.description).map((ch, i) => (
                      <span
                        key={i}
                        className="inline-block bg-foreground"
                        style={{
                          width: (ch.charCodeAt(0) % 3) + 1,
                          height: `${40 + (ch.charCodeAt(0) % 40)}%`,
                        }}
                      />
                    ))}
                  </div>

                  <p className="text-sm font-semibold leading-tight">{data.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">UoM: {data.uom || "—"}</p>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
                <Button type="button" onClick={() => window.print()} className="gap-2">
                  <Printer className="h-4 w-4" />Print
                </Button>
              </DialogFooter>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No label data available.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
