import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export interface LibraryCardProps {
  sector: string;
  itemCount: number;
  lastUpdated: string; // ISO date string
  href: string; // page link for the sector
}

export const LibraryCard: React.FC<LibraryCardProps> = ({ sector, itemCount, lastUpdated, href }) => (
  <Link href={href} legacyBehavior passHref>
    <a className="block">
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader className="p-4">
          <CardTitle className="flex items-center justify-between">
            {sector}
            <Badge variant="secondary">{itemCount}</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Updated {new Date(lastUpdated).toLocaleDateString()}
          </p>
        </CardHeader>
      </Card>
    </a>
  </Link>
);

export default LibraryCard;

