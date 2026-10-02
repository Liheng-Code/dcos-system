"use client";

import { useState } from "react";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import { ChevronDown, ChevronRight, Copy, Hash, MapPin, Layers, Ruler, Palette, Tag } from "lucide-react";

export function ElementProperties() {
  const { elementProperties, selectedItems } = useBimViewer();
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["identity", "location", "psets", "quantities", "materials"]));

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  if (!elementProperties && selectedItems.size === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-8">
        Select an element to view properties
      </div>
    );
  }

  if (selectedItems.size > 1 && !elementProperties) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">
          {selectedItems.size} Elements Selected
        </h3>
        <p className="text-xs text-gray-400">
          Combined selection - pick a single element for detailed properties.
        </p>
      </div>
    );
  }

  if (!elementProperties) return null;

  const { globalId, ifcClass, name, tag, objectType, description, location, propertySets, quantities, materials } = elementProperties;

  const Section = ({ id, title, icon: Icon, children }: { id: string; title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) => (
    <div className="border-b border-gray-700 last:border-b-0">
      <button
        onClick={() => toggleSection(id)}
        className="flex items-center gap-2 w-full py-2 text-sm font-medium text-gray-200 hover:text-white"
      >
        {openSections.has(id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3.5 w-3.5" />
        {title}
      </button>
      {openSections.has(id) && <div className="pb-2">{children}</div>}
    </div>
  );

  const PropertyRow = ({ name: propName, value, unit }: { name: string; value: string; unit?: string }) => (
    <div className="flex items-start justify-between py-0.5 text-xs group">
      <span className="text-gray-400 mr-2 shrink-0">{propName}</span>
      <span className="text-gray-200 text-right">
        {value}{unit ? ` ${unit}` : ""}
      </span>
    </div>
  );

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-200">Element Properties</h3>
        <button
          onClick={() => copyToClipboard(globalId)}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
        >
          <Copy className="h-3 w-3" /> Copy ID
        </button>
      </div>

      <Section id="identity" title="Identity" icon={Hash}>
        <PropertyRow name="GlobalId" value={globalId} />
        <PropertyRow name="IFC Class" value={ifcClass} />
        <PropertyRow name="Name" value={name} />
        {tag && <PropertyRow name="Tag/Mark" value={tag} />}
        {objectType && <PropertyRow name="Object Type" value={objectType} />}
        {description && <PropertyRow name="Description" value={description} />}
      </Section>

      {location && (
        <Section id="location" title="Location" icon={MapPin}>
          <div className="text-xs text-gray-300">{location}</div>
        </Section>
      )}

      {propertySets.length > 0 && (
        <Section id="psets" title="Property Sets" icon={Layers}>
          {propertySets.map((ps) => (
            <div key={ps.name} className="mb-2">
              <p className="text-xs font-medium text-gray-400 mb-1">{ps.name}</p>
              {ps.properties.map((prop) => (
                <PropertyRow key={prop.name} name={prop.name} value={prop.value} unit={prop.unit} />
              ))}
            </div>
          ))}
        </Section>
      )}

      {quantities.length > 0 && (
        <Section id="quantities" title="Quantities" icon={Ruler}>
          {quantities.map((q) => (
            <PropertyRow key={q.name} name={q.name} value={q.value} unit={q.unit} />
          ))}
        </Section>
      )}

      {materials.length > 0 && (
        <Section id="materials" title="Material" icon={Palette}>
          {materials.map((m, i) => (
            <div key={i}>
              <PropertyRow name="Name" value={m.name} />
              {m.layers?.map((l, j) => (
                <PropertyRow key={j} name={l.name} value={`${l.thickness}`} unit="mm" />
              ))}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
