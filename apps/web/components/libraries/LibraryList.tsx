import React, { useMemo, useState } from "react";
import { Table, TableHead, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LibraryItemBase } from "@/types/library";
import { Edit, Trash2, Search } from "lucide-react";

interface LibraryListProps {
  items: LibraryItemBase[];
  onEdit: (item: LibraryItemBase) => void;
  onDelete: (id: string) => void;
}

export const LibraryList: React.FC<LibraryListProps> = ({ items, onEdit, onDelete }) => {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const lower = filter.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(lower) || i.id.includes(lower));
  }, [filter, items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search items…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Name</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Price</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.unit}</TableCell>
              <TableCell>{item.currency} {item.price.toLocaleString()}</TableCell>
              <TableCell className="text-right space-x-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default LibraryList;

