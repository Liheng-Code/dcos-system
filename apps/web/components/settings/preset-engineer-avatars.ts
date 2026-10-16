export interface PresetEngineerAvatar {
  id: string;
  label: string;
  discipline: string;
  gender: "male" | "female";
  dataUrl: string;
}

interface AvatarSpec {
  id: string;
  label: string;
  discipline: string;
  gender: "male" | "female";
  bgFrom: string;
  bgTo: string;
  skin: string;
  hairColor: string;
  helmetColor?: string;
  helmetStripe?: string;
  helmetBadgeColor?: string;
  outfitColor: string;
  vestColor?: string;
  tieOrScarfColor?: string;
  glasses?: boolean;
  badgeText: string;
  badgeBg: string;
}

function buildEngineerSvgDataUrl(s: AvatarSpec): string {
  const hairBack =
    s.gender === "female"
      ? `<path d="M52 86 C46 118, 48 152, 62 168 L194 168 C208 152, 210 118, 204 86 Z" fill="${s.hairColor}" />`
      : "";

  const hairFront =
    s.gender === "female"
      ? `<path d="M72 86 C78 64, 110 58, 128 62 C146 58, 178 64, 184 86 C172 78, 152 74, 128 76 C104 74, 84 78, 72 86 Z" fill="${s.hairColor}" />`
      : `<path d="M74 90 C74 62, 100 54, 128 54 C156 54, 182 62, 182 90 C172 76, 150 72, 128 72 C106 72, 84 76, 74 90 Z" fill="${s.hairColor}" />`;

  const helmet = s.helmetColor
    ? `
      <!-- Hard Hat Dome -->
      <path d="M68 84 C68 46, 94 28, 128 28 C162 28, 188 46, 188 84 Z" fill="${s.helmetColor}" />
      <!-- Hard Hat Center Ridge -->
      <path d="M116 29 L140 29 L144 82 L112 82 Z" fill="${s.helmetStripe || "#ffffff"}" opacity="0.35" />
      <!-- Hard Hat Emblem -->
      <circle cx="128" cy="58" r="11" fill="${s.helmetBadgeColor || "#2563eb"}" />
      <path d="M123 58 L133 58 M128 53 L128 63" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
      <!-- Hard Hat Brim -->
      <rect x="58" y="78" width="140" height="10" rx="5" fill="${s.helmetStripe || s.helmetColor}" />
    `
    : "";

  const eyewear = s.glasses
    ? `
      <rect x="88" y="102" width="32" height="20" rx="6" fill="none" stroke="#1e293b" stroke-width="3.5" />
      <rect x="136" y="102" width="32" height="20" rx="6" fill="none" stroke="#1e293b" stroke-width="3.5" />
      <line x1="120" y1="111" x2="136" y2="111" stroke="#1e293b" stroke-width="3" />
    `
    : "";

  const mouth =
    s.gender === "female"
      ? `<path d="M116 142 Q128 151 140 142" fill="none" stroke="#e11d48" stroke-width="3.5" stroke-linecap="round" />`
      : `<path d="M116 143 Q128 150 140 143" fill="none" stroke="#7c2d12" stroke-width="3" stroke-linecap="round" />`;

  const vest = s.vestColor
    ? `
      <!-- High-Vis Safety Vest -->
      <path d="M62 186 L102 178 L118 256 L50 256 Z" fill="${s.vestColor}" />
      <path d="M194 186 L154 178 L138 256 L206 256 Z" fill="${s.vestColor}" />
      <!-- Reflective Stripes -->
      <rect x="64" y="214" width="44" height="7" fill="#e2e8f0" opacity="0.9" />
      <rect x="148" y="214" width="44" height="7" fill="#e2e8f0" opacity="0.9" />
      <rect x="60" y="232" width="50" height="7" fill="#e2e8f0" opacity="0.9" />
      <rect x="146" y="232" width="50" height="7" fill="#e2e8f0" opacity="0.9" />
    `
    : "";

  const tieOrScarf = s.tieOrScarfColor
    ? `<polygon points="124,182 132,182 136,242 128,252 120,242" fill="${s.tieOrScarfColor}" />`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs>
      <linearGradient id="bg_${s.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${s.bgFrom}" />
        <stop offset="100%" stop-color="${s.bgTo}" />
      </linearGradient>
    </defs>
    <!-- Background -->
    <rect width="256" height="256" rx="128" fill="url(#bg_${s.id})" />
    ${hairBack}
    <!-- Neck -->
    <rect x="110" y="152" width="36" height="36" rx="10" fill="${s.skin}" />
    <!-- Torso / Jacket -->
    <path d="M44 256 C48 198, 78 176, 128 176 C178 176, 208 198, 212 256 Z" fill="${s.outfitColor}" />
    <!-- White Shirt Collar V -->
    <polygon points="104,176 152,176 128,216" fill="#ffffff" />
    ${tieOrScarf}
    ${vest}
    <!-- Ears -->
    <circle cx="74" cy="118" r="10" fill="${s.skin}" />
    <circle cx="182" cy="118" r="10" fill="${s.skin}" />
    <!-- Head -->
    <rect x="78" y="66" width="100" height="98" rx="46" fill="${s.skin}" />
    ${hairFront}
    <!-- Eyebrows -->
    <path d="M95 98 Q104 94 113 98" fill="none" stroke="${s.hairColor}" stroke-width="3" stroke-linecap="round" />
    <path d="M143 98 Q152 94 161 98" fill="none" stroke="${s.hairColor}" stroke-width="3" stroke-linecap="round" />
    <!-- Eyes -->
    <circle cx="104" cy="111" r="5" fill="#0f172a" />
    <circle cx="152" cy="111" r="5" fill="#0f172a" />
    <circle cx="106" cy="109" r="1.5" fill="#ffffff" />
    <circle cx="154" cy="109" r="1.5" fill="#ffffff" />
    ${eyewear}
    <!-- Nose -->
    <path d="M128 114 L125 128 L131 128" fill="none" stroke="#c28159" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Smile -->
    ${mouth}
    ${helmet}
    <!-- Discipline Pill Badge -->
    <rect x="158" y="208" width="68" height="28" rx="14" fill="${s.badgeBg}" stroke="#ffffff" stroke-width="2.5" />
    <text x="192" y="226" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="0.5">${s.badgeText}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AVATAR_SPECS: AvatarSpec[] = [
  {
    id: "civil-male",
    label: "Civil Engineer (M)",
    discipline: "Civil / Structural",
    gender: "male",
    bgFrom: "#dbeafe",
    bgTo: "#93c5fd",
    skin: "#f3c6a5",
    hairColor: "#1e293b",
    helmetColor: "#ffffff",
    helmetStripe: "#cbd5e1",
    helmetBadgeColor: "#2563eb",
    outfitColor: "#1e3a8a",
    vestColor: "#f97316",
    badgeText: "CIVIL",
    badgeBg: "#2563eb",
  },
  {
    id: "civil-female",
    label: "Civil Engineer (F)",
    discipline: "Civil / Structural",
    gender: "female",
    bgFrom: "#dbeafe",
    bgTo: "#93c5fd",
    skin: "#f7d3ba",
    hairColor: "#3b1d11",
    helmetColor: "#ffffff",
    helmetStripe: "#cbd5e1",
    helmetBadgeColor: "#2563eb",
    outfitColor: "#1e3a8a",
    vestColor: "#f97316",
    badgeText: "CIVIL",
    badgeBg: "#2563eb",
  },
  {
    id: "mep-male",
    label: "MEP Engineer (M)",
    discipline: "MEP",
    gender: "male",
    bgFrom: "#cffafe",
    bgTo: "#67e8f9",
    skin: "#eab692",
    hairColor: "#0f172a",
    helmetColor: "#facc15",
    helmetStripe: "#eab308",
    helmetBadgeColor: "#0284c7",
    outfitColor: "#0f172a",
    vestColor: "#0284c7",
    badgeText: "MEP",
    badgeBg: "#0284c7",
  },
  {
    id: "mep-female",
    label: "MEP Engineer (F)",
    discipline: "MEP",
    gender: "female",
    bgFrom: "#cffafe",
    bgTo: "#67e8f9",
    skin: "#f5cba7",
    hairColor: "#1e1b4b",
    helmetColor: "#facc15",
    helmetStripe: "#eab308",
    helmetBadgeColor: "#0284c7",
    outfitColor: "#0f172a",
    vestColor: "#0284c7",
    badgeText: "MEP",
    badgeBg: "#0284c7",
  },
  {
    id: "arch-male",
    label: "Architect (M)",
    discipline: "Architecture",
    gender: "male",
    bgFrom: "#ede9fe",
    bgTo: "#c4b5fd",
    skin: "#f3c6a5",
    hairColor: "#27272a",
    helmetColor: "#312e81",
    helmetStripe: "#4338ca",
    helmetBadgeColor: "#7c3aed",
    outfitColor: "#18181b",
    tieOrScarfColor: "#7c3aed",
    glasses: true,
    badgeText: "ARC",
    badgeBg: "#7c3aed",
  },
  {
    id: "arch-female",
    label: "Architect (F)",
    discipline: "Architecture",
    gender: "female",
    bgFrom: "#ede9fe",
    bgTo: "#c4b5fd",
    skin: "#f7d3ba",
    hairColor: "#451a03",
    helmetColor: "#312e81",
    helmetStripe: "#4338ca",
    helmetBadgeColor: "#7c3aed",
    outfitColor: "#18181b",
    tieOrScarfColor: "#ec4899",
    glasses: true,
    badgeText: "ARC",
    badgeBg: "#7c3aed",
  },
  {
    id: "qs-male",
    label: "Quantity Surveyor (M)",
    discipline: "QS / Commercial",
    gender: "male",
    bgFrom: "#d1fae5",
    bgTo: "#6ee7b7",
    skin: "#f1c29d",
    hairColor: "#1e293b",
    helmetColor: "#ffffff",
    helmetStripe: "#d1fae5",
    helmetBadgeColor: "#059669",
    outfitColor: "#064e3b",
    tieOrScarfColor: "#10b981",
    glasses: true,
    badgeText: "QS",
    badgeBg: "#059669",
  },
  {
    id: "qs-female",
    label: "Quantity Surveyor (F)",
    discipline: "QS / Commercial",
    gender: "female",
    bgFrom: "#d1fae5",
    bgTo: "#6ee7b7",
    skin: "#f7d3ba",
    hairColor: "#292524",
    helmetColor: "#ffffff",
    helmetStripe: "#d1fae5",
    helmetBadgeColor: "#059669",
    outfitColor: "#064e3b",
    tieOrScarfColor: "#10b981",
    glasses: true,
    badgeText: "QS",
    badgeBg: "#059669",
  },
  {
    id: "pm-male",
    label: "Project Manager (M)",
    discipline: "Project Management",
    gender: "male",
    bgFrom: "#e2e8f0",
    bgTo: "#94a3b8",
    skin: "#eab692",
    hairColor: "#0f172a",
    helmetColor: "#ffffff",
    helmetStripe: "#94a3b8",
    helmetBadgeColor: "#0f172a",
    outfitColor: "#0f172a",
    tieOrScarfColor: "#dc2626",
    badgeText: "PM",
    badgeBg: "#0f172a",
  },
  {
    id: "pm-female",
    label: "Project Manager (F)",
    discipline: "Project Management",
    gender: "female",
    bgFrom: "#e2e8f0",
    bgTo: "#94a3b8",
    skin: "#f7d3ba",
    hairColor: "#1c1917",
    helmetColor: "#ffffff",
    helmetStripe: "#94a3b8",
    helmetBadgeColor: "#0f172a",
    outfitColor: "#0f172a",
    tieOrScarfColor: "#2563eb",
    badgeText: "PM",
    badgeBg: "#0f172a",
  },
  {
    id: "hse-male",
    label: "HSE / QAQC (M)",
    discipline: "Safety / Quality",
    gender: "male",
    bgFrom: "#dcfce7",
    bgTo: "#86efac",
    skin: "#eab692",
    hairColor: "#1e293b",
    helmetColor: "#16a34a",
    helmetStripe: "#15803d",
    helmetBadgeColor: "#dc2626",
    outfitColor: "#14532d",
    vestColor: "#84cc16",
    badgeText: "HSE",
    badgeBg: "#15803d",
  },
  {
    id: "hse-female",
    label: "HSE / QAQC (F)",
    discipline: "Safety / Quality",
    gender: "female",
    bgFrom: "#dcfce7",
    bgTo: "#86efac",
    skin: "#f7d3ba",
    hairColor: "#3b1d11",
    helmetColor: "#16a34a",
    helmetStripe: "#15803d",
    helmetBadgeColor: "#dc2626",
    outfitColor: "#14532d",
    vestColor: "#84cc16",
    badgeText: "HSE",
    badgeBg: "#15803d",
  },
];

export const PRESET_ENGINEER_AVATARS: PresetEngineerAvatar[] = AVATAR_SPECS.map((s) => ({
  id: s.id,
  label: s.label,
  discipline: s.discipline,
  gender: s.gender,
  dataUrl: buildEngineerSvgDataUrl(s),
}));

