import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DCOS Attendance",
    short_name: "DCOS Attendance",
    description: "Scan in and out at your site",
    start_url: "/dashboard/hr/attendance/checkin?source=pwa",
    scope: "/dashboard/hr/attendance/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#223d81",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
